import { API_BASE } from './constants.js';

export async function fetchChats() {
  const res = await fetch(`${API_BASE}/chats`);
  if (!res.ok) throw new Error('Error cargando chats');
  return res.json();
}

export async function searchChats(query) {
  const res = await fetch(`${API_BASE}/chats/search?q=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error('Error buscando chats');
  return res.json();
}

export async function createChat(model = 'sonia-local') {
  const res = await fetch(`${API_BASE}/chats`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model }),
  });
  if (!res.ok) throw new Error('Error creando chat');
  return res.json();
}

export async function fetchChat(id) {
  const res = await fetch(`${API_BASE}/chats/${id}`);
  if (!res.ok) throw new Error('Error cargando chat');
  return res.json();
}

export async function updateChatTitle(id, title) {
  const res = await fetch(`${API_BASE}/chats/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  if (!res.ok) throw new Error('Error actualizando t\u00edtulo');
  return res.json();
}

export async function deleteChat(id) {
  const res = await fetch(`${API_BASE}/chats/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Error eliminando chat');
  return res.json();
}

export async function sendMessage(chatId, content, images = []) {
  const res = await fetch(`${API_BASE}/chats/${chatId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, images: images.length > 0 ? images : undefined }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Error enviando mensaje' }));
    throw new Error(err.error || 'Error enviando mensaje');
  }
  return res.json();
}

export async function fetchSettings() {
  const res = await fetch(`${API_BASE}/settings`);
  if (!res.ok) throw new Error('Error loading settings');
  return res.json();
}

export async function saveSettings(settings) {
  const res = await fetch(`${API_BASE}/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ settings }),
  });
  if (!res.ok) throw new Error('Error saving settings');
  return res.json();
}

export async function deleteAllHistory() {
  const res = await fetch(`${API_BASE}/settings/history`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Error deleting history');
  return res.json();
}

export async function regenerateStream(chatId, msgId, onChunk, onDone, onError) {
  const res = await fetch(`${API_BASE}/chats/${chatId}/messages/${msgId}/regenerate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Error regenerando respuesta' }));
    throw new Error(err.error || `Error ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const payload = line.slice(6);

      if (payload === '[DONE]') continue;

      try {
        const data = JSON.parse(payload);

        if (data.type === 'done') {
          onDone(data.assistantMessage);
        } else if (data.type === 'error') {
          onError(data.error);
        } else if (data.type === 'suggestions') {
          if (onSuggestions) onSuggestions(data.items);
        } else if (data.choices) {
          const delta = data.choices[0]?.delta?.content || '';
          fullText += delta;
          onChunk(fullText);
        }
      } catch (e) {
        // Ignore malformed SSE lines
      }
    }
  }
}

export async function sendMessageStream(chatId, content, images, file, onChunk, onUserSaved, onDone, onError, onSuggestions) {
  const body = { content };

  if (images && images.length > 0) {
    body.images = images;
  }

  if (file) {
    body.file = {
      name: file.name,
      type: file.type,
      size: file.size,
      mime: file.mime,
      data: file.dataUrl,
    };
  }

  const res = await fetch(`${API_BASE}/chats/${chatId}/messages/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Error enviando mensaje' }));
    throw new Error(err.error || `Error ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const payload = line.slice(6);

      if (payload === '[DONE]') continue;

      try {
        const data = JSON.parse(payload);

        if (data.type === 'user_saved') {
          onUserSaved(data.userMessage);
        } else if (data.type === 'done') {
          onDone(data.assistantMessage, data.title);
        } else if (data.type === 'error') {
          onError(data.error);
        } else if (data.choices) {
          const delta = data.choices[0]?.delta?.content || '';
          fullText += delta;
          onChunk(fullText);
        }
      } catch (e) {
        // Ignore malformed SSE lines
      }
    }
  }
}
