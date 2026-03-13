import { Router } from 'express';
import { getSettings, upsertSettings, deleteAllConversations } from '../db.js';

const router = Router();

// GET /api/settings — get user settings
router.get('/', (req, res) => {
  const data = getSettings('default');
  if (!data) {
    return res.json({ settings: {}, updated_at: null });
  }
  res.json(data);
});

// PUT /api/settings — save user settings
router.put('/', (req, res) => {
  const { settings } = req.body;
  if (!settings || typeof settings !== 'object') {
    return res.status(400).json({ error: 'Settings object required' });
  }
  upsertSettings('default', settings);
  const updated = getSettings('default');
  res.json(updated);
});

// DELETE /api/settings/history — clear all conversations and messages
router.delete('/history', (req, res) => {
  deleteAllConversations();
  res.json({ deleted: true });
});

export default router;
