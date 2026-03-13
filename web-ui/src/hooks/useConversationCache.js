import { useRef, useCallback } from 'react';

const DB_NAME = 'sonia-cache';
const DB_VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('conversations')) {
        const convStore = db.createObjectStore('conversations', { keyPath: 'id' });
        convStore.createIndex('updated_at', 'updated_at');
      }
      if (!db.objectStoreNames.contains('messages')) {
        const msgStore = db.createObjectStore('messages', { keyPath: 'id' });
        msgStore.createIndex('conversation_id', 'conversation_id');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(db, stores, mode = 'readonly') {
  const transaction = db.transaction(stores, mode);
  const result = stores.length === 1
    ? transaction.objectStore(stores[0])
    : stores.map((s) => transaction.objectStore(s));
  return { store: result, transaction };
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txComplete(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export function useConversationCache() {
  const dbRef = useRef(null);

  const getDB = useCallback(async () => {
    if (!dbRef.current) {
      dbRef.current = await openDB();
    }
    return dbRef.current;
  }, []);

  // Load all conversations from IndexedDB (instant)
  const loadFromCache = useCallback(async () => {
    try {
      const db = await getDB();
      const { store } = tx(db, ['conversations']);
      const all = await reqToPromise(store.getAll());
      // Sort by updated_at DESC
      all.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
      return all;
    } catch {
      return [];
    }
  }, [getDB]);

  // Bulk write conversations + messages from server into IndexedDB
  const syncWithServer = useCallback(async (conversations, fetchMessagesForConv) => {
    try {
      const db = await getDB();

      // Write conversations
      const { store: convStore, transaction: convTx } = tx(db, ['conversations'], 'readwrite');
      for (const c of conversations) {
        convStore.put(c);
      }
      await txComplete(convTx);

      // Fetch and write messages for each conversation
      for (const c of conversations) {
        try {
          const chatData = await fetchMessagesForConv(c.id);
          if (chatData.messages && chatData.messages.length > 0) {
            const { store: msgStore, transaction: msgTx } = tx(db, ['messages'], 'readwrite');
            for (const m of chatData.messages) {
              msgStore.put({ ...m, conversation_id: c.id });
            }
            await txComplete(msgTx);
          }
        } catch {
          // Skip individual conversation failures
        }
      }
    } catch {
      // IndexedDB sync failed silently
    }
  }, [getDB]);

  // Cache a single conversation
  const cacheConversation = useCallback(async (conv) => {
    try {
      const db = await getDB();
      const { store, transaction } = tx(db, ['conversations'], 'readwrite');
      store.put(conv);
      await txComplete(transaction);
    } catch {
      // silent
    }
  }, [getDB]);

  // Cache a single message
  const cacheMessage = useCallback(async (msg, conversationId) => {
    try {
      const db = await getDB();
      const { store, transaction } = tx(db, ['messages'], 'readwrite');
      store.put({ ...msg, conversation_id: conversationId });
      await txComplete(transaction);
    } catch {
      // silent
    }
  }, [getDB]);

  // Delete conversation and its messages from cache
  const deleteFromCache = useCallback(async (convId) => {
    try {
      const db = await getDB();

      // Delete messages
      const { store: msgStore, transaction: msgTx } = tx(db, ['messages'], 'readwrite');
      const idx = msgStore.index('conversation_id');
      const msgs = await reqToPromise(idx.getAll(convId));
      for (const m of msgs) {
        msgStore.delete(m.id);
      }
      await txComplete(msgTx);

      // Delete conversation
      const { store: convStore, transaction: convTx } = tx(db, ['conversations'], 'readwrite');
      convStore.delete(convId);
      await txComplete(convTx);
    } catch {
      // silent
    }
  }, [getDB]);

  // Search locally in IndexedDB — returns conversations with snippets
  const searchCache = useCallback(async (query) => {
    if (!query || !query.trim()) return null;
    const q = query.trim().toLowerCase();

    try {
      const db = await getDB();

      // Get all conversations
      const { store: convStore } = tx(db, ['conversations']);
      const allConvs = await reqToPromise(convStore.getAll());

      // Get all messages
      const { store: msgStore } = tx(db, ['messages']);
      const allMsgs = await reqToPromise(msgStore.getAll());

      // Index messages by conversation_id
      const msgsByConv = {};
      for (const m of allMsgs) {
        if (!msgsByConv[m.conversation_id]) msgsByConv[m.conversation_id] = [];
        msgsByConv[m.conversation_id].push(m);
      }

      const results = [];

      for (const conv of allConvs) {
        const titleMatch = conv.title && conv.title.toLowerCase().includes(q);
        let snippet = null;
        let snippetMatchIndex = -1;

        // Search in messages
        const msgs = msgsByConv[conv.id] || [];
        for (const m of msgs) {
          if (!m.content) continue;
          const idx = m.content.toLowerCase().indexOf(q);
          if (idx !== -1) {
            // Extract snippet: ~30 chars before and after the match
            const start = Math.max(0, idx - 30);
            const end = Math.min(m.content.length, idx + q.length + 30);
            const prefix = start > 0 ? '...' : '';
            const suffix = end < m.content.length ? '...' : '';
            snippet = prefix + m.content.slice(start, end) + suffix;
            snippetMatchIndex = idx - start + prefix.length;
            break; // Take first match
          }
        }

        if (titleMatch || snippet) {
          results.push({
            ...conv,
            snippet,
            snippetQuery: query.trim(),
            snippetMatchIndex,
          });
        }
      }

      // Sort by updated_at DESC
      results.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
      return results;
    } catch {
      return [];
    }
  }, [getDB]);

  // Clear all data from IndexedDB (for delete history)
  const clearAll = useCallback(async () => {
    try {
      const db = await getDB();
      const { store: convStore, transaction: convTx } = tx(db, ['conversations'], 'readwrite');
      convStore.clear();
      await txComplete(convTx);
      const { store: msgStore, transaction: msgTx } = tx(db, ['messages'], 'readwrite');
      msgStore.clear();
      await txComplete(msgTx);
    } catch {
      // silent
    }
  }, [getDB]);

  return {
    loadFromCache,
    syncWithServer,
    cacheConversation,
    cacheMessage,
    deleteFromCache,
    searchCache,
    clearAll,
  };
}
