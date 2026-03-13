import { useState, useEffect, useCallback } from 'react';
import { API_BASE } from '../utils/constants.js';

export function useMemory() {
  const [memories, setMemories] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchMemories = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/memory`);
      if (res.ok) {
        const data = await res.json();
        setMemories(data);
      }
    } catch (err) {
      console.error('Failed to fetch memories:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMemories();
  }, [fetchMemories]);

  const addMemory = useCallback(async (key, value) => {
    try {
      const res = await fetch(`${API_BASE}/memory`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value }),
      });
      if (res.ok) {
        await fetchMemories();
        return true;
      }
    } catch (err) {
      console.error('Failed to add memory:', err);
    }
    return false;
  }, [fetchMemories]);

  const deleteMemory = useCallback(async (id) => {
    try {
      const res = await fetch(`${API_BASE}/memory/${id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setMemories((prev) => prev.filter((m) => m.id !== id));
        return true;
      }
    } catch (err) {
      console.error('Failed to delete memory:', err);
    }
    return false;
  }, []);

  return { memories, loading, addMemory, deleteMemory, refresh: fetchMemories };
}
