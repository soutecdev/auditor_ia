export default function ThemeToggle({ theme, onToggle }) {
  return (
    <button
      onClick={onToggle}
      className="p-2 rounded-lg hover:bg-navy-100 dark:hover:bg-dark-surface transition-colors"
      title={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
    >
      <span className="text-lg transition-transform duration-300 inline-block">
        {theme === 'dark' ? '\u2600\uFE0F' : '\uD83C\uDF19'}
      </span>
    </button>
  );
}
