import { useState, useEffect, useCallback } from 'react';

export function useTheme(preference = 'system') {
  const resolveTheme = useCallback((pref) => {
    if (pref === 'system') {
      if (typeof window === 'undefined') return 'light';
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return pref;
  }, []);

  const [resolvedTheme, setResolvedTheme] = useState(() => resolveTheme(preference));

  // Re-resolve when preference changes
  useEffect(() => {
    setResolvedTheme(resolveTheme(preference));
  }, [preference, resolveTheme]);

  // Listen for OS theme changes when in "system" mode
  useEffect(() => {
    if (preference !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e) => setResolvedTheme(e.matches ? 'dark' : 'light');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [preference]);

  // Apply to DOM
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', resolvedTheme === 'dark');
    document.body.style.backgroundColor = resolvedTheme === 'dark' ? '#0A1628' : '#F0F7FA';
  }, [resolvedTheme]);

  // Quick toggle returns the opposite of current resolved theme
  const toggleTheme = useCallback(() => {
    return resolvedTheme === 'dark' ? 'light' : 'dark';
  }, [resolvedTheme]);

  return { theme: resolvedTheme, toggleTheme };
}
