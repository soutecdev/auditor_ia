import { useState, useCallback, useEffect } from 'react';
import { fetchChats, fetchChat, createChat, sendMessage, sendMessageStream, regenerateStream, deleteChat, updateChatTitle } from '../utils/api.js';

export function useChat(selectedModel, cache, notificationsEnabled = false) {
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isNewChat, setIsNewChat] = useState(true);
  const [suggestions, setSuggestions] = useState([]);

  // On mount: load from IndexedDB first (instant), then sync with server
  useEffect(() => {
    (async () => {
      // 1. Load from cache (instant)
      const cached = await cache.loadFromCache();
      if (cached.length > 0) {
        setConversations(cached);
      }

      // 2. Sync with server in parallel
      try {
        const serverData = await fetchChats();
        setConversations(serverData);
        // Sync into IndexedDB (background, don't await fully)
        cache.syncWithServer(serverData, fetchChat);
      } catch {
        // Offline — cached data is already showing
      }
    })();
  }, []);

  // Load messages when active conversation changes
  useEffect(() => {
    if (activeId) {
      loadMessages(activeId);
    } else {
      setMessages([]);
    }
  }, [activeId]);

  const loadMessages = useCallback(async (id) => {
    try {
      const data = await fetchChat(id);
      setMessages(data.messages || []);
      setIsNewChat((data.messages || []).length === 0);
    } catch {
      console.error('Error loading messages');
    }
  }, []);

  const startNewChat = useCallback(async () => {
    try {
      const chat = await createChat(selectedModel);
      setConversations((prev) => [chat, ...prev]);
      setActiveId(chat.id);
      setMessages([]);
      setError(null);
      setIsNewChat(true);
      // Cache the new conversation
      cache.cacheConversation(chat);
      return chat;
    } catch {
      console.error('Error creating chat');
    }
  }, [selectedModel, cache]);

  const send = useCallback(async (content, images = [], file = undefined) => {
    if ((!content.trim() && !file) || isLoading) return;
    setError(null);
    setSuggestions([]);

    // Create chat if none active
    let chatId = activeId;
    if (!chatId) {
      const chat = await startNewChat();
      if (!chat) return;
      chatId = chat.id;
    }

    // Optimistic: add user message + empty streaming assistant message
    const tempUserMsg = {
      id: 'temp-user-' + Date.now(),
      role: 'user',
      content: content.trim(),
      images: images.length > 0 ? images : undefined,
      file: file ? { name: file.name, type: file.type, size: file.size } : undefined,
      created_at: new Date().toISOString(),
    };
    const streamingMsgId = 'streaming-' + Date.now();
    const streamingMsg = {
      id: streamingMsgId,
      role: 'assistant',
      content: '',
      streaming: true,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg, streamingMsg]);
    setIsLoading(true);

    try {
      await sendMessageStream(
        chatId, content.trim(), images, file,
        // onChunk: update streaming message content
        (fullText) => {
          setMessages((prev) => {
            const updated = [...prev];
            const idx = updated.findIndex((m) => m.id === streamingMsgId);
            if (idx !== -1) {
              updated[idx] = { ...updated[idx], content: fullText };
            }
            return updated;
          });
        },
        // onUserSaved: replace temp user msg with real one from server
        (realUserMsg) => {
          setMessages((prev) => prev.map((m) =>
            m.id === tempUserMsg.id ? realUserMsg : m
          ));
        },
        // onDone: replace streaming msg with final, update cache + title
        (assistantMsg, title) => {
          setMessages((prev) => prev.map((m) =>
            m.id === streamingMsgId ? assistantMsg : m
          ));
          // Write-through: cache both messages in IndexedDB
          cache.cacheMessage(assistantMsg, chatId);

          // Update conversation in state + cache
          const updatedConv = {
            id: chatId,
            title: title || conversations.find((c) => c.id === chatId)?.title || '',
            model: selectedModel,
            updated_at: new Date().toISOString(),
            created_at: conversations.find((c) => c.id === chatId)?.created_at || new Date().toISOString(),
          };
          setConversations((prev) =>
            prev.map((c) => (c.id === chatId ? updatedConv : c))
          );
          cache.cacheConversation(updatedConv);

          // Browser notification if enabled and tab not visible
          if (document.hidden && notificationsEnabled && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            new Notification('AuditIA', {
              body: assistantMsg.content.slice(0, 100),
              icon: '/favicon.svg',
            });
          }
        },
        // onError
        (errMsg) => { setError(errMsg); },
        // onSuggestions
        (items) => { setSuggestions(items || []); }
      );
    } catch (err) {
      setError(err.message);
      // Remove temp messages on error
      setMessages((prev) => prev.filter((m) =>
        m.id !== tempUserMsg.id && m.id !== streamingMsgId
      ));
    } finally {
      setIsLoading(false);
    }
  }, [activeId, isLoading, startNewChat, conversations, selectedModel, cache, notificationsEnabled]);

  const regenerate = useCallback(async (assistantMsgId) => {
    if (isLoading || !activeId) return;

    // Replace the assistant message with a streaming placeholder
    const streamingMsgId = 'regen-' + Date.now();
    setMessages((prev) => prev.map((m) =>
      m.id === assistantMsgId
        ? { id: streamingMsgId, role: 'assistant', content: '', streaming: true, created_at: new Date().toISOString() }
        : m
    ));
    setIsLoading(true);
    setError(null);

    try {
      await regenerateStream(
        activeId, assistantMsgId,
        // onChunk
        (fullText) => {
          setMessages((prev) => {
            const updated = [...prev];
            const idx = updated.findIndex((m) => m.id === streamingMsgId);
            if (idx !== -1) {
              updated[idx] = { ...updated[idx], content: fullText };
            }
            return updated;
          });
        },
        // onDone
        (assistantMsg) => {
          setMessages((prev) => prev.map((m) =>
            m.id === streamingMsgId ? assistantMsg : m
          ));
          cache.cacheMessage(assistantMsg, activeId);
        },
        // onError
        (errMsg) => { setError(errMsg); }
      );
    } catch (err) {
      setError(err.message);
      // Restore a placeholder on error
      setMessages((prev) => prev.map((m) =>
        m.id === streamingMsgId
          ? { ...m, content: 'Error al regenerar respuesta', streaming: false }
          : m
      ));
    } finally {
      setIsLoading(false);
    }
  }, [activeId, isLoading, cache]);

  const removeChat = useCallback(async (id) => {
    try {
      await deleteChat(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeId === id) {
        setActiveId(null);
        setMessages([]);
      }
      // Remove from cache
      cache.deleteFromCache(id);
    } catch {
      console.error('Error deleting chat');
    }
  }, [activeId, cache]);

  const renameChat = useCallback(async (id, title) => {
    try {
      await updateChatTitle(id, title);
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...c, title } : c))
      );
      // Update cache
      const conv = conversations.find((c) => c.id === id);
      if (conv) cache.cacheConversation({ ...conv, title });
    } catch {
      console.error('Error renaming chat');
    }
  }, [conversations, cache]);

  const selectChat = useCallback((id) => {
    setActiveId(id);
    setError(null);
  }, []);

  const resetAll = useCallback(() => {
    setConversations([]);
    setActiveId(null);
    setMessages([]);
    setError(null);
    setIsNewChat(true);
  }, []);

  return {
    conversations,
    activeId,
    messages,
    isLoading,
    error,
    isNewChat,
    send,
    suggestions,
    regenerate,
    startNewChat,
    selectChat,
    removeChat,
    renameChat,
    resetAll,
  };
}
