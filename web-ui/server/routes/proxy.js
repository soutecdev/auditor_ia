import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import {
  getConversation,
  getMessages,
  saveMessage,
  updateTitle,
  countMessages,
  deleteMessage,
} from '../db.js';

const router = Router();

const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:8090';
const GATEWAY_TIMEOUT_MS = 60000; // 60s for long responses

const MODEL_MAP = {
  'sonia-local': 'sonia-qwen:9b',
  'sonia-gemini': 'Gemini-3.0-pro-preview',
};

// ── File extraction helpers ──

async function extractDocumentText(file) {
  if (!file || !file.data || !file.name) return null;

  // Strip data URL prefix to get pure base64
  const base64Data = file.data.includes('base64,')
    ? file.data.split('base64,')[1]
    : file.data;

  try {
    const res = await fetch(`${GATEWAY_URL}/v1/extract-text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: base64Data, filename: file.name }),
    });

    if (!res.ok) {
      console.error(`extract-text error ${res.status}:`, await res.text());
      return null;
    }

    return await res.json();
  } catch (err) {
    console.error('extract-text failed:', err.message);
    return null;
  }
}

function enrichContent(originalContent, file, extracted) {
  if (!extracted || !extracted.text) {
    if (extracted?.is_scanned) {
      return `[Documento adjunto: ${file.name} - PDF escaneado sin texto extra\u00edble]\n\n${originalContent}`;
    }
    return originalContent;
  }
  return `[Documento adjunto: ${file.name}]\n---\n${extracted.text}\n---\n\n${originalContent}`;
}

// ── Shared: pipe gateway SSE stream to client ──
async function pipeGatewayStream(gatewayRes, res, id, conversationModel) {
  let fullContent = '';
  const reader = gatewayRes.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const text = decoder.decode(value, { stream: true });
    buffer += text;

    const lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const payload = line.slice(6);

      if (payload === '[DONE]') continue;

      try {
        const data = JSON.parse(payload);
        // Suggestions: forward but don't accumulate in content
        if (data.type === 'suggestions') {
          res.write(line + '\n\n');
          continue;
        }
        const delta = data.choices?.[0]?.delta?.content || '';
        fullContent += delta;
      } catch {}

      res.write(line + '\n\n');
    }
  }

  // Save assistant message to SQLite
  const assistantMsgId = uuidv4();
  saveMessage(assistantMsgId, id, 'assistant', fullContent);

  return { assistantMsgId, fullContent };
}

// ── POST /api/chats/:id/messages — send message, proxy to gateway ──
router.post('/:id/messages', async (req, res) => {
  const { id } = req.params;
  const { content, images, file } = req.body;

  const trimmedContent = (content || '').trim();

  // Allow file-only messages (no text required if file is present)
  if (!trimmedContent && !file) {
    return res.status(400).json({ error: 'Mensaje vac\u00edo' });
  }

  // Validate conversation exists
  const conversation = getConversation(id);
  if (!conversation) {
    return res.status(404).json({ error: 'Conversaci\u00f3n no encontrada' });
  }

  // Extract text from document if present
  let enrichedContent = trimmedContent;
  let fileMeta = null;
  if (file && file.name) {
    fileMeta = JSON.stringify({ name: file.name, type: file.type, size: file.size });
    const extracted = await extractDocumentText(file);
    if (extracted) {
      enrichedContent = enrichContent(trimmedContent, file, extracted);
    }
  }

  // Save user message (enriched content for LLM context, file metadata for display)
  const userMsgId = uuidv4();
  const userImages = images && images.length > 0 ? images : null;
  saveMessage(userMsgId, id, 'user', enrichedContent, userImages, fileMeta);

  // Build messages array for the gateway (full conversation history)
  const history = getMessages(id);
  const openaiMessages = history.map((m) => {
    return { role: m.role, content: m.content };
  });

  // Handle images in the last user message
  if (images && images.length > 0) {
    const lastMsg = openaiMessages[openaiMessages.length - 1];
    lastMsg.content = [
      { type: 'text', text: typeof lastMsg.content === 'string' ? lastMsg.content : '' },
      ...images.map((img) => ({
        type: 'image_url',
        image_url: { url: img },
      })),
    ];
  }

  // Forward to gateway
  const modelId = MODEL_MAP[conversation.model] || MODEL_MAP['sonia-local'];

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GATEWAY_TIMEOUT_MS);

    const gatewayRes = await fetch(`${GATEWAY_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelId,
        messages: openaiMessages,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!gatewayRes.ok) {
      const errorBody = await gatewayRes.text();
      console.error(`Gateway error ${gatewayRes.status}:`, errorBody);
      return res.status(502).json({
        error: `Error del modelo (${gatewayRes.status})`,
        detail: errorBody,
      });
    }

    const data = await gatewayRes.json();
    const assistantContent = data.choices?.[0]?.message?.content || '';
    const suggestions = data.suggestions || [];

    if (!assistantContent) {
      return res.status(502).json({ error: 'Respuesta vac\u00eda del modelo' });
    }

    // Save assistant message
    const assistantMsgId = uuidv4();
    saveMessage(assistantMsgId, id, 'assistant', assistantContent);

    // Auto-title: set from first user message (first exchange = 2 messages: user + assistant)
    const msgCount = countMessages(id);
    if (msgCount <= 2) {
      const titleText = trimmedContent || file?.name || '';
      const autoTitle = titleText.slice(0, 50) + (titleText.length > 50 ? '...' : '');
      updateTitle(id, autoTitle);
    }

    // Return both messages (original content for display, not enriched)
    res.json({
      userMessage: {
        id: userMsgId,
        role: 'user',
        content: trimmedContent,
        images: userImages || undefined,
        file: file ? { name: file.name, type: file.type, size: file.size } : undefined,
        created_at: new Date().toISOString(),
      },
      assistantMessage: {
        id: assistantMsgId,
        role: 'assistant',
        content: assistantContent,
        created_at: new Date().toISOString(),
      },
      title: msgCount <= 2
        ? (trimmedContent || file?.name || '').slice(0, 50)
        : undefined,
      suggestions,
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      console.error('Gateway timeout after', GATEWAY_TIMEOUT_MS, 'ms');
      return res.status(504).json({ error: 'El modelo tard\u00f3 demasiado en responder' });
    }
    console.error('Gateway connection error:', err.message);
    return res.status(502).json({ error: 'No se pudo conectar al modelo' });
  }
});


// ── POST /api/chats/:id/messages/stream — SSE streaming ──
router.post('/:id/messages/stream', async (req, res) => {
  const { id } = req.params;
  const { content, images, file } = req.body;

  const trimmedContent = (content || '').trim();

  if (!trimmedContent && !file) {
    return res.status(400).json({ error: 'Mensaje vac\u00edo' });
  }

  const conversation = getConversation(id);
  if (!conversation) {
    return res.status(404).json({ error: 'Conversaci\u00f3n no encontrada' });
  }

  // Extract text from document if present
  let enrichedContent = trimmedContent;
  let fileMeta = null;
  if (file && file.name) {
    fileMeta = JSON.stringify({ name: file.name, type: file.type, size: file.size });
    const extracted = await extractDocumentText(file);
    if (extracted) {
      enrichedContent = enrichContent(trimmedContent, file, extracted);
    }
  }

  // Save user message
  const userMsgId = uuidv4();
  const userImages = images && images.length > 0 ? images : null;
  saveMessage(userMsgId, id, 'user', enrichedContent, userImages, fileMeta);

  // Build messages array for gateway
  const history = getMessages(id);
  const openaiMessages = history.map((m) => ({ role: m.role, content: m.content }));

  // Handle images in last message
  if (images && images.length > 0) {
    const lastMsg = openaiMessages[openaiMessages.length - 1];
    lastMsg.content = [
      { type: 'text', text: typeof lastMsg.content === 'string' ? lastMsg.content : '' },
      ...images.map((img) => ({
        type: 'image_url',
        image_url: { url: img },
      })),
    ];
  }

  const modelId = MODEL_MAP[conversation.model] || MODEL_MAP['sonia-local'];

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // Send user message confirmation (original content for display)
  const userEvent = {
    type: 'user_saved',
    userMessage: {
      id: userMsgId, role: 'user', content: trimmedContent,
      images: userImages || undefined,
      file: file ? { name: file.name, type: file.type, size: file.size } : undefined,
      created_at: new Date().toISOString(),
    },
  };
  res.write(`data: ${JSON.stringify(userEvent)}\n\n`);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);

    const gatewayRes = await fetch(
      `${GATEWAY_URL}/v1/chat/completions/stream`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelId, messages: openaiMessages }),
        signal: controller.signal,
      }
    );

    clearTimeout(timeout);

    if (!gatewayRes.ok) {
      const errorBody = await gatewayRes.text();
      console.error(`Gateway stream error ${gatewayRes.status}:`, errorBody);
      res.write(`data: ${JSON.stringify({ type: 'error', error: `Error del modelo (${gatewayRes.status})` })}\n\n`);
      res.end();
      return;
    }

    const { assistantMsgId, fullContent } = await pipeGatewayStream(gatewayRes, res, id);

    // Auto-title
    const msgCount = countMessages(id);
    let title;
    if (msgCount <= 2) {
      const titleText = trimmedContent || file?.name || '';
      title = titleText.slice(0, 50) + (titleText.length > 50 ? '...' : '');
      updateTitle(id, title);
    }

    // Send metadata event
    const metaEvent = {
      type: 'done',
      assistantMessage: {
        id: assistantMsgId, role: 'assistant',
        content: fullContent,
        created_at: new Date().toISOString(),
      },
      title,
    };
    res.write(`data: ${JSON.stringify(metaEvent)}\n\n`);
    res.end();
  } catch (err) {
    const errMsg = err.name === 'AbortError'
      ? 'El modelo tard\u00f3 demasiado en responder'
      : 'No se pudo conectar al modelo';
    console.error('Gateway stream error:', err.message);
    res.write(`data: ${JSON.stringify({ type: 'error', error: errMsg })}\n\n`);
    res.end();
  }
});


// ── POST /api/chats/:id/messages/:msgId/regenerate — regenerate assistant response ──
router.post('/:id/messages/:msgId/regenerate', async (req, res) => {
  const { id, msgId } = req.params;

  const conversation = getConversation(id);
  if (!conversation) {
    return res.status(404).json({ error: 'Conversaci\u00f3n no encontrada' });
  }

  // Delete the old assistant message
  deleteMessage(msgId);

  // Build messages array from remaining history
  const history = getMessages(id);
  const openaiMessages = history.map((m) => ({ role: m.role, content: m.content }));

  // Re-attach images from last user message if present
  const lastUserMsg = [...history].reverse().find((m) => m.role === 'user');
  if (lastUserMsg && lastUserMsg.images) {
    const imgs = JSON.parse(lastUserMsg.images);
    if (imgs.length > 0) {
      const lastMsg = openaiMessages[openaiMessages.length - 1];
      lastMsg.content = [
        { type: 'text', text: typeof lastMsg.content === 'string' ? lastMsg.content : '' },
        ...imgs.map((img) => ({
          type: 'image_url',
          image_url: { url: img },
        })),
      ];
    }
  }

  const modelId = MODEL_MAP[conversation.model] || MODEL_MAP['sonia-local'];

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);

    const gatewayRes = await fetch(
      `${GATEWAY_URL}/v1/chat/completions/stream`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelId, messages: openaiMessages }),
        signal: controller.signal,
      }
    );

    clearTimeout(timeout);

    if (!gatewayRes.ok) {
      const errorBody = await gatewayRes.text();
      console.error(`Gateway regenerate error ${gatewayRes.status}:`, errorBody);
      res.write(`data: ${JSON.stringify({ type: 'error', error: `Error del modelo (${gatewayRes.status})` })}\n\n`);
      res.end();
      return;
    }

    const { assistantMsgId, fullContent } = await pipeGatewayStream(gatewayRes, res, id);

    // Send done event with the new assistant message
    const metaEvent = {
      type: 'done',
      assistantMessage: {
        id: assistantMsgId, role: 'assistant',
        content: fullContent,
        created_at: new Date().toISOString(),
      },
    };
    res.write(`data: ${JSON.stringify(metaEvent)}\n\n`);
    res.end();
  } catch (err) {
    const errMsg = err.name === 'AbortError'
      ? 'El modelo tard\u00f3 demasiado en responder'
      : 'No se pudo conectar al modelo';
    console.error('Gateway regenerate error:', err.message);
    res.write(`data: ${JSON.stringify({ type: 'error', error: errMsg })}\n\n`);
    res.end();
  }
});

export default router;
