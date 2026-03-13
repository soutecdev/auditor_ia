import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchSettings, saveSettings as saveSettingsAPI } from '../utils/api.js';
import { setLocale } from '../utils/i18n.js';

const LS_KEY = 'sonia-settings';
const LEGACY_THEME_KEY = 'sonia-theme';

const DEFAULT_SETTINGS = {
  theme: 'system',
  locale: 'es',
  chatFont: 'default',
  notifications: false,
  profile: {
    name: 'Innovaci\u00f3n y Desarrollo',
    avatarType: 'initials',
    avatarInitials: 'ID',
    avatarColor: '#FFE600',
    avatarImage: null,
  },
};

function deriveInitials(name) {
  if (!name) return 'SA';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return parts[0].slice(0, 2).toUpperCase();
}

function deepMerge(defaults, overrides) {
  const result = { ...defaults };
  for (const key of Object.keys(overrides)) {
    if (
      overrides[key] &&
      typeof overrides[key] === 'object' &&
      !Array.isArray(overrides[key]) &&
      defaults[key] &&
      typeof defaults[key] === 'object'
    ) {
      result[key] = { ...defaults[key], ...overrides[key] };
    } else {
      result[key] = overrides[key];
    }
  }
  return result;
}

export function useSettings() {
  const [settings, setSettings] = useState(() => {
    try {
      // Migrate legacy theme key
      const legacyTheme = localStorage.getItem(LEGACY_THEME_KEY);
      const cached = localStorage.getItem(LS_KEY);

      if (cached) {
        const parsed = deepMerge(DEFAULT_SETTINGS, JSON.parse(cached));
        setLocale(parsed.locale || 'es');
        return parsed;
      }

      if (legacyTheme) {
        const migrated = { ...DEFAULT_SETTINGS, theme: legacyTheme };
        localStorage.setItem(LS_KEY, JSON.stringify(migrated));
        localStorage.removeItem(LEGACY_THEME_KEY);
        setLocale(migrated.locale);
        return migrated;
      }
    } catch { /* ignore parse errors */ }
    return DEFAULT_SETTINGS;
  });

  const saveTimeoutRef = useRef(null);

  // Sync from server on mount
  useEffect(() => {
    (async () => {
      try {
        const data = await fetchSettings();
        if (data.settings && Object.keys(data.settings).length > 0) {
          const merged = deepMerge(DEFAULT_SETTINGS, data.settings);
          setSettings(merged);
          localStorage.setItem(LS_KEY, JSON.stringify(merged));
          setLocale(merged.locale);
        }
      } catch {
        // Offline — localStorage data is already showing
      }
    })();
  }, []);

  const updateSettings = useCallback((partial) => {
    setSettings((prev) => {
      const next = deepMerge(prev, partial);

      // Auto-derive initials when name changes
      if (partial.profile && partial.profile.name !== undefined) {
        next.profile.avatarInitials = deriveInitials(next.profile.name);
      }

      // Sync locale
      if (next.locale !== prev.locale) {
        setLocale(next.locale);
      }

      // Persist to localStorage immediately
      localStorage.setItem(LS_KEY, JSON.stringify(next));

      // Debounced save to server (500ms)
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        saveSettingsAPI(next).catch(() => {});
      }, 500);

      return next;
    });
  }, []);

  return { settings, updateSettings };
}
