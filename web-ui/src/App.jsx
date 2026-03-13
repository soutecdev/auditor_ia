import { useState, useCallback } from 'react';
import { useTheme } from './hooks/useTheme.js';
import { useSettings } from './hooks/useSettings.js';
import { useConversationCache } from './hooks/useConversationCache.js';
import { useChat } from './hooks/useChat.js';
import { useSearch } from './hooks/useSearch.js';
import { deleteAllHistory } from './utils/api.js';
import Sidebar from './components/Sidebar.jsx';
import TopBar from './components/TopBar.jsx';
import ChatArea from './components/ChatArea.jsx';
import InputArea from './components/InputArea.jsx';
import SettingsModal from './components/SettingsModal.jsx';

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 768);
  const [selectedModel, setSelectedModel] = useState('sonia-local');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [droppedFile, setDroppedFile] = useState(null);

  const { settings, updateSettings } = useSettings();
  const { theme, toggleTheme } = useTheme(settings.theme);
  const cache = useConversationCache();
  const search = useSearch(cache.searchCache);

  const {
    conversations,
    activeId,
    messages,
    isLoading,
    error,
    isNewChat,
    send,
    suggestions,
    regenerate,
    startNewChat,
    selectChat,
    removeChat,
    resetAll,
  } = useChat(selectedModel, cache, settings.notifications);

  const handleQuickToggleTheme = () => {
    const nextTheme = toggleTheme();
    updateSettings({ theme: nextTheme });
  };

  const handleDeleteHistory = useCallback(async () => {
    await deleteAllHistory();
    await cache.clearAll();
    resetAll();
  }, [cache, resetAll]);

  const handleFileDrop = useCallback((file) => {
    // Use a new object reference each time so useEffect in InputArea fires
    setDroppedFile(file);
  }, []);

  return (
    <div key={settings.locale} className="flex h-screen overflow-hidden bg-navy-50 dark:bg-dark-bg">
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <Sidebar
        open={sidebarOpen}
        conversations={conversations}
        activeId={activeId}
        onSelect={(id) => { selectChat(id); if (window.innerWidth < 768) setSidebarOpen(false); }}
        onNewChat={startNewChat}
        onDelete={removeChat}
        search={search}
        profile={settings.profile}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <TopBar
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen((o) => !o)}
          selectedModel={selectedModel}
          onSelectModel={setSelectedModel}
          theme={theme}
          onToggleTheme={handleQuickToggleTheme}
          onOpenSettings={() => setSettingsOpen(true)}
        />

        <ChatArea
          messages={messages}
          isLoading={isLoading}
          error={error}
          chatFont={settings.chatFont}
          profile={settings.profile}
          isNewChat={isNewChat}
          onFileDrop={handleFileDrop}
          onRegenerate={regenerate}
          suggestions={suggestions}
          onSuggestionClick={(text) => send(text)}
        />

        <InputArea
          onSend={send}
          isLoading={isLoading}
          droppedFile={droppedFile}
        />
      </div>

      {settingsOpen && (
        <SettingsModal
          settings={settings}
          onUpdate={updateSettings}
          onClose={() => setSettingsOpen(false)}
          onDeleteHistory={handleDeleteHistory}
        />
      )}
    </div>
  );
}
