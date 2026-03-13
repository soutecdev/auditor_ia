import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import chatsRouter from './routes/chats.js';
import proxyRouter from './routes/proxy.js';
import settingsRouter from './routes/settings.js';
import memoryRouter from './routes/memory.js';
import { extractAndSaveMemories } from './memoryExtractor.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '15mb' })); // 15mb for base64 images

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'sonia-web-ui' });
});

// API routes
app.use('/api/chats', chatsRouter);

// Auto-extract memories from user messages (before proxy handles them)
app.use('/api/chats', (req, res, next) => {
  if (req.method === 'POST' && req.body && req.body.content &&
      /^\/[^\/]+\/messages/.test(req.url)) {
    const userContent = req.body.content;
    const chatId = req.url.split('/')[1];
    res.on('finish', () => {
      if (res.statusCode < 400) {
        try {
          const count = extractAndSaveMemories(userContent, chatId);
          if (count > 0) console.log(`[memory] Extracted ${count} memory(s) from chat ${chatId}`);
        } catch (e) {
          // Non-critical — don't break the response
        }
      }
    });
  }
  next();
});

app.use('/api/chats', proxyRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/memory', memoryRouter);

// Proxy /exports to gateway for file downloads
const GATEWAY_URL_EXPORT = process.env.GATEWAY_URL || 'http://localhost:8090';
app.get('/exports/:filename', async (req, res) => {
  try {
    const response = await fetch(
      `${GATEWAY_URL_EXPORT}/exports/${req.params.filename}`
    );
    if (!response.ok) {
      return res.status(response.status).json({ error: 'File not found' });
    }
    const ext = req.params.filename.endsWith('.xlsx')
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : 'text/csv';
    res.setHeader('Content-Type', ext);
    res.setHeader('Content-Disposition',
      `attachment; filename="${req.params.filename}"`);
    const { Readable } = await import('stream');
    Readable.fromWeb(response.body).pipe(res);
  } catch (err) {
    console.error('Export proxy error:', err.message);
    res.status(502).json({ error: 'Could not fetch export file' });
  }
});

// In production, serve Vite build
if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(__dirname, '..', 'dist');
  app.use(express.static(distPath));
  // SPA fallback: any non-API route serves index.html
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`AuditIA Web UI running on http://0.0.0.0:${PORT}`);
});
