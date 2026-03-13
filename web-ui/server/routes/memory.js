import { Router } from 'express';
import { listMemories, addMemory, deleteMemory } from '../db.js';

const router = Router();

// GET /api/memory — list all memories
router.get('/', (req, res) => {
  const memories = listMemories();
  res.json(memories);
});

// POST /api/memory — add or update a memory
router.post('/', (req, res) => {
  const { key, value, source_chat_id } = req.body;
  if (!key || !key.trim() || !value || !value.trim()) {
    return res.status(400).json({ error: 'key and value are required' });
  }
  const memory = addMemory(key.trim(), value.trim(), source_chat_id || null);
  res.status(201).json(memory);
});

// DELETE /api/memory/:id — delete a memory
router.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    return res.status(400).json({ error: 'Invalid id' });
  }
  const result = deleteMemory(id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Memory not found' });
  }
  res.json({ deleted: true });
});

export default router;
