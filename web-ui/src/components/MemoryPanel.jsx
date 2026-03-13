import { useState } from 'react';
import { useMemory } from '../hooks/useMemory.js';
import { t } from '../utils/i18n.js';

const KEY_LABELS = {
  nombre_usuario: { es: 'Nombre', en: 'Name' },
  empresa_usuario: { es: 'Empresa', en: 'Company' },
  cliente_frecuente: { es: 'Cliente frecuente', en: 'Frequent client' },
  area_usuario: { es: '\u00c1rea / Departamento', en: 'Area / Department' },
  cargo_usuario: { es: 'Cargo', en: 'Role' },
  formato_preferido: { es: 'Formato preferido', en: 'Preferred format' },
  proyecto_actual: { es: 'Proyecto actual', en: 'Current project' },
  email_usuario: { es: 'Email', en: 'Email' },
  idioma_preferido: { es: 'Idioma preferido', en: 'Preferred language' },
};

function getKeyLabel(key) {
  const entry = KEY_LABELS[key];
  if (entry) return entry.es;
  // For custom keys, just capitalize
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export default function MemoryPanel() {
  const { memories, loading, addMemory, deleteMemory } = useMemory();
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newKey.trim() || !newValue.trim()) return;
    setAdding(true);
    const ok = await addMemory(newKey.trim(), newValue.trim());
    if (ok) {
      setNewKey('');
      setNewValue('');
    }
    setAdding(false);
  };

  const handleDelete = async (id) => {
    setDeletingId(id);
    await deleteMemory(id);
    setDeletingId(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="w-5 h-5 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-navy-800 dark:text-dark-text">
          {t('settings.memory')}
        </h3>
        <p className="text-xs text-navy-400 dark:text-dark-muted mt-1">
          {t('settings.memory.description')}
        </p>
      </div>

      {/* Memory list */}
      {memories.length === 0 ? (
        <div className="text-center py-6 text-sm text-navy-400 dark:text-dark-muted">
          {t('settings.memory.empty')}
        </div>
      ) : (
        <div className="space-y-2">
          {memories.map((mem) => (
            <div
              key={mem.id}
              className="flex items-start gap-3 p-3 rounded-xl border border-navy-100 dark:border-dark-border
                bg-white dark:bg-dark-surface group"
            >
              <div className="flex-1 min-w-0">
                <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wide
                  bg-teal-50 dark:bg-teal-900/30 text-teal-600 dark:text-teal-300 mb-1">
                  {getKeyLabel(mem.key)}
                </span>
                <p className="text-sm text-navy-700 dark:text-dark-text break-words">
                  {mem.value}
                </p>
              </div>
              <button
                onClick={() => handleDelete(mem.id)}
                disabled={deletingId === mem.id}
                className="flex-shrink-0 p-1.5 rounded-lg text-navy-300 dark:text-dark-muted
                  hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20
                  opacity-0 group-hover:opacity-100 transition-all
                  disabled:opacity-50"
                title={t('settings.memory.delete')}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round"
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add form */}
      <form onSubmit={handleAdd} className="p-4 rounded-xl border border-navy-100 dark:border-dark-border
        bg-navy-50/50 dark:bg-dark-deeper space-y-3">
        <p className="text-xs font-medium text-navy-500 dark:text-dark-muted">
          {t('settings.memory.addTitle')}
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            placeholder={t('settings.memory.keyPlaceholder')}
            className="flex-1 px-3 py-2 rounded-lg border border-navy-200 dark:border-dark-border
              bg-white dark:bg-dark-surface text-navy-800 dark:text-dark-text text-sm
              focus:outline-none focus:border-teal-400 focus:ring-1 focus:ring-teal-400/30"
          />
          <input
            type="text"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            placeholder={t('settings.memory.valuePlaceholder')}
            className="flex-[2] px-3 py-2 rounded-lg border border-navy-200 dark:border-dark-border
              bg-white dark:bg-dark-surface text-navy-800 dark:text-dark-text text-sm
              focus:outline-none focus:border-teal-400 focus:ring-1 focus:ring-teal-400/30"
          />
        </div>
        <button
          type="submit"
          disabled={adding || !newKey.trim() || !newValue.trim()}
          className="w-full py-2 rounded-lg bg-teal-500 hover:bg-teal-600 text-white text-sm font-medium
            transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {adding ? '...' : t('settings.memory.addButton')}
        </button>
      </form>
    </div>
  );
}
