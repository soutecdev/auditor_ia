import { t } from '../utils/i18n.js';
import ModelSelector from './ModelSelector.jsx';
import ThemeToggle from './ThemeToggle.jsx';
import SettingsButton from './SettingsButton.jsx';

export default function TopBar({ sidebarOpen, onToggleSidebar, selectedModel, onSelectModel, theme, onToggleTheme, onOpenSettings }) {
  return (
    <header className="h-14 flex items-center justify-between px-4
      bg-white dark:bg-dark-surface border-b border-navy-100 dark:border-dark-border">
      {/* Left: hamburger */}
      <button
        onClick={onToggleSidebar}
        className="p-2 rounded-lg hover:bg-navy-50 dark:hover:bg-dark-bg transition-colors"
        title={sidebarOpen ? t('topbar.closeSidebar') : t('topbar.openSidebar')}
      >
        <svg className="w-5 h-5 text-navy-400 dark:text-dark-text" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Center: model selector */}
      <ModelSelector selectedModel={selectedModel} onSelect={onSelectModel} />

      {/* Right: theme toggle + settings */}
      <div className="flex items-center gap-1">
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        <SettingsButton onClick={onOpenSettings} />
      </div>
    </header>
  );
}
