import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import {
  listConversations,
  getConversation,
  createConversation,
  updateTitle,
  deleteConversation,
  getMessagesWithImages,
  searchConversations,
} from '../db.js';

const router = Router();

// GET /api/chats — list all conversations
router.get('/', (req, res) => {
  const conversations = listConversations();
  res.json(conversations);
});

// GET /api/chats/search?q=texto — search conversations
router.get('/search', (req, res) => {
  const { q } = req.query;
  if (!q || !q.trim()) {
    return res.json([]);
  }
  const results = searchConversations(q.trim());
  res.json(results);
});

// POST /api/chats — create new conversation
router.post('/', (req, res) => {
  const { model = 'sonia-local' } = req.body;
  const id = uuidv4();
  const title = 'Nueva conversaci\u00f3n';
  const conversation = createConversation(id, title, model);
  res.status(201).json(conversation);
});

// GET /api/chats/:id — get conversation with messages
router.get('/:id', (req, res) => {
  const conversation = getConversation(req.params.id);
  if (!conversation) {
    return res.status(404).json({ error: 'Conversaci\u00f3n no encontrada' });
  }
  const messages = getMessagesWithImages(req.params.id);
  res.json({ ...conversation, messages });
});

// PUT /api/chats/:id — update title
router.put('/:id', (req, res) => {
  const conversation = getConversation(req.params.id);
  if (!conversation) {
    return res.status(404).json({ error: 'Conversaci\u00f3n no encontrada' });
  }
  const { title } = req.body;
  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'T\u00edtulo requerido' });
  }
  updateTitle(req.params.id, title.trim());
  res.json({ ...conversation, title: title.trim() });
});

// DELETE /api/chats/:id — delete conversation and messages
router.delete('/:id', (req, res) => {
  const conversation = getConversation(req.params.id);
  if (!conversation) {
    return res.status(404).json({ error: 'Conversaci\u00f3n no encontrada' });
  }
  deleteConversation(req.params.id);
  res.json({ deleted: true });
});

export default router;
