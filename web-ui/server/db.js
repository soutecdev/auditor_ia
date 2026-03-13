import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'sonia.db');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new Database(DB_PATH);

// Performance pragmas
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT 'Nueva conversaci\u00f3n',
    model TEXT NOT NULL DEFAULT 'sonia-local',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    images TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id);
  CREATE INDEX IF NOT EXISTS idx_conv_updated ON conversations(updated_at DESC);

  CREATE TABLE IF NOT EXISTS user_settings (
    user_id TEXT PRIMARY KEY,
    settings TEXT NOT NULL DEFAULT '{}',
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS user_memories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL DEFAULT 'default',
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    source_chat_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_memories_user ON user_memories(user_id);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_memories_key ON user_memories(user_id, key);
`);

// Migration: add file column if not exists
try {
  db.exec('ALTER TABLE messages ADD COLUMN file TEXT');
} catch (e) {
  // Column already exists
}

// Prepared statements
const stmts = {
  listConversations: db.prepare(
    'SELECT id, title, model, created_at, updated_at FROM conversations ORDER BY updated_at DESC'
  ),
  getConversation: db.prepare(
    'SELECT id, title, model, created_at, updated_at FROM conversations WHERE id = ?'
  ),
  createConversation: db.prepare(
    'INSERT INTO conversations (id, title, model) VALUES (?, ?, ?)'
  ),
  updateTitle: db.prepare(
    'UPDATE conversations SET title = ?, updated_at = datetime(\'now\') WHERE id = ?'
  ),
  updateTimestamp: db.prepare(
    'UPDATE conversations SET updated_at = datetime(\'now\') WHERE id = ?'
  ),
  deleteConversation: db.prepare(
    'DELETE FROM conversations WHERE id = ?'
  ),
  getMessages: db.prepare(
    'SELECT id, role, content, images, file, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at ASC'
  ),
  saveMessage: db.prepare(
    'INSERT INTO messages (id, conversation_id, role, content, images, file) VALUES (?, ?, ?, ?, ?, ?)'
  ),
  searchConversations: db.prepare(`
    SELECT DISTINCT c.id, c.title, c.model, c.created_at, c.updated_at
    FROM conversations c
    LEFT JOIN messages m ON m.conversation_id = c.id
    WHERE c.title LIKE ? OR m.content LIKE ?
    ORDER BY c.updated_at DESC
  `),
  countMessages: db.prepare(
    'SELECT COUNT(*) as count FROM messages WHERE conversation_id = ?'
  ),
  getSettings: db.prepare(
    'SELECT settings, updated_at FROM user_settings WHERE user_id = ?'
  ),
  upsertSettings: db.prepare(`
    INSERT INTO user_settings (user_id, settings, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET
      settings = excluded.settings,
      updated_at = datetime('now')
  `),
  deleteAllConversations: db.prepare('DELETE FROM conversations'),
  listMemories: db.prepare(
    'SELECT id, user_id, key, value, source_chat_id, created_at FROM user_memories WHERE user_id = ? ORDER BY created_at DESC'
  ),
  addMemory: db.prepare(
    `INSERT INTO user_memories (user_id, key, value, source_chat_id)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, key) DO UPDATE SET
       value = excluded.value,
       source_chat_id = excluded.source_chat_id,
       created_at = datetime('now')`
  ),
  deleteMemory: db.prepare(
    'DELETE FROM user_memories WHERE id = ? AND user_id = ?'
  ),
  findMemoryByKey: db.prepare(
    'SELECT id, key, value FROM user_memories WHERE user_id = ? AND key = ?'
  ),
  clearMemories: db.prepare(
    'DELETE FROM user_memories WHERE user_id = ?'
  ),
  deleteMessage: db.prepare(
    'DELETE FROM messages WHERE id = ?'
  ),
};

export function listConversations() {
  return stmts.listConversations.all();
}

export function getConversation(id) {
  return stmts.getConversation.get(id);
}

export function createConversation(id, title, model) {
  stmts.createConversation.run(id, title, model);
  return stmts.getConversation.get(id);
}

export function updateTitle(id, title) {
  stmts.updateTitle.run(title, id);
}

export function touchConversation(id) {
  stmts.updateTimestamp.run(id);
}

export function deleteConversation(id) {
  stmts.deleteConversation.run(id);
}

export function getMessages(conversationId) {
  return stmts.getMessages.all(conversationId);
}

export function saveMessage(id, conversationId, role, content, images = null, file = null) {
  const imagesJson = images && images.length > 0 ? JSON.stringify(images) : null;
  stmts.saveMessage.run(id, conversationId, role, content, imagesJson, file);
  stmts.updateTimestamp.run(conversationId);
}

export function getMessagesWithImages(conversationId) {
  const msgs = stmts.getMessages.all(conversationId);
  return msgs.map((m) => ({
    ...m,
    images: m.images ? JSON.parse(m.images) : undefined,
    file: m.file ? JSON.parse(m.file) : undefined,
  }));
}

export function searchConversations(query) {
  const pattern = `%${query}%`;
  return stmts.searchConversations.all(pattern, pattern);
}

export function countMessages(conversationId) {
  return stmts.countMessages.get(conversationId).count;
}

export function getSettings(userId = 'default') {
  const row = stmts.getSettings.get(userId);
  return row ? { settings: JSON.parse(row.settings), updated_at: row.updated_at } : null;
}

export function upsertSettings(userId = 'default', settings) {
  stmts.upsertSettings.run(userId, JSON.stringify(settings));
}

export function deleteAllConversations() {
  stmts.deleteAllConversations.run();
}

export function listMemories(userId = 'default') {
  return stmts.listMemories.all(userId);
}

export function addMemory(key, value, sourceChatId = null, userId = 'default') {
  stmts.addMemory.run(userId, key, value, sourceChatId);
  return stmts.findMemoryByKey.get(userId, key);
}

export function deleteMemory(id, userId = 'default') {
  return stmts.deleteMemory.run(id, userId);
}

export function clearMemories(userId = 'default') {
  return stmts.clearMemories.run(userId);
}

export function deleteMessage(id) {
  return stmts.deleteMessage.run(id);
}

export default db;
