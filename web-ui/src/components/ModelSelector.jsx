import { MODELS } from '../utils/constants.js';
import { t } from '../utils/i18n.js';

export default function ModelSelector({ selectedModel, onSelect }) {
  return (
    <div className="relative">
      <select
        value={selectedModel}
        onChange={(e) => onSelect(e.target.value)}
        className="appearance-none bg-white dark:bg-dark-surface border border-navy-100 dark:border-dark-border
          rounded-lg px-3 py-1.5 pr-8 text-sm font-medium text-navy-800 dark:text-dark-text
          hover:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-400/30
          cursor-pointer transition-colors"
      >
        {MODELS.map((m) => (
          <option key={m.id} value={m.id}>
            {m.nameKey ? t(m.nameKey) : m.name}
          </option>
        ))}
      </select>
      <svg
        className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-navy-400 pointer-events-none"
        fill="none" stroke="currentColor" viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    </div>
  );
}
