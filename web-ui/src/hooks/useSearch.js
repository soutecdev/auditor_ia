import { useState, useEffect, useCallback } from 'react';

export function useSearch(searchCacheFn) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);

  useEffect(() => {
    if (!query.trim()) {
      setResults(null);
      return;
    }
    // Debounce 150ms — IndexedDB is fast, keep it snappy
    const timer = setTimeout(async () => {
      if (searchCacheFn) {
        const data = await searchCacheFn(query);
        setResults(data || []);
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [query, searchCacheFn]);

  const clearSearch = useCallback(() => {
    setQuery('');
    setResults(null);
  }, []);

  return { query, setQuery, results, clearSearch, isSearching: query.trim().length > 0 };
}
