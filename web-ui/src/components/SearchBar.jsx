import { t } from '../utils/i18n.js';

export default function SearchBar({ query, onChange, onClear }) {
  return (
    <div className="relative px-3 mb-2">
      <svg
        className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-navy-300"
        fill="none" stroke="currentColor" viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      <input
        type="text"
        value={query}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t('sidebar.searchPlaceholder')}
        className="w-full pl-8 pr-8 py-2 text-sm rounded-lg
          bg-navy-700/50 dark:bg-dark-deeper/50
          text-white placeholder-navy-300/60
          border border-navy-600/30
          focus:outline-none focus:border-teal-400/50
          transition-colors"
      />
      {query && (
        <button
          onClick={onClear}
          className="absolute right-5 top-1/2 -translate-y-1/2 text-navy-300 hover:text-white transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}
