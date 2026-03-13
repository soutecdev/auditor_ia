export default function SuggestionsBar({ items, onSelect }) {
  if (!items || items.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 justify-center py-3 suggestion-fade-in">
      {items.map((text, i) => (
        <button
          key={i}
          onClick={() => onSelect(text)}
          className="px-4 py-1.5 text-sm rounded-full
            border border-teal-300 dark:border-teal-700
            text-teal-700 dark:text-teal-300
            bg-white dark:bg-dark-surface
            hover:bg-teal-50 dark:hover:bg-teal-900/30
            hover:border-teal-400 dark:hover:border-teal-500
            transition-colors duration-150 cursor-pointer
            shadow-sm hover:shadow"
          style={{ animationDelay: `${i * 80}ms` }}
        >
          {text}
        </button>
      ))}
    </div>
  );
}
