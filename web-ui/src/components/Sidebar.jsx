import { useMemo } from 'react';
import SearchBar from './SearchBar.jsx';
import { t } from '../utils/i18n.js';

function groupByTime(conversations) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const weekAgo = new Date(today.getTime() - 7 * 86400000);

  const groups = { today: [], yesterday: [], week: [], older: [] };
  for (const c of conversations) {
    const d = new Date(c.updated_at);
    if (d >= today) groups.today.push(c);
    else if (d >= yesterday) groups.yesterday.push(c);
    else if (d >= weekAgo) groups.week.push(c);
    else groups.older.push(c);
  }
  return groups;
}

function formatTime(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return 'ahora';
  if (diff < 3600000) return `hace ${Math.floor(diff / 60000)}m`;
  if (diff < 86400000) return `hace ${Math.floor(diff / 3600000)}h`;
  return d.toLocaleDateString('es-VE', { month: 'short', day: 'numeric' });
}

function HighlightedSnippet({ snippet, query }) {
  if (!snippet || !query) return null;
  const lowerSnippet = snippet.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const idx = lowerSnippet.indexOf(lowerQuery);
  if (idx === -1) return <span className="text-navy-300/50">{snippet}</span>;

  const before = snippet.slice(0, idx);
  const match = snippet.slice(idx, idx + query.length);
  const after = snippet.slice(idx + query.length);

  return (
    <span className="text-navy-300/50">
      {before}<span className="text-teal-400 font-semibold">{match}</span>{after}
    </span>
  );
}

function ConversationItem({ conv, isActive, onSelect, onDelete }) {
  return (
    <button
      onClick={() => onSelect(conv.id)}
      className={`group w-full text-left px-3 py-2.5 rounded-lg transition-colors relative
        ${isActive
          ? 'bg-teal-400/10 border-l-2 border-teal-400 pl-2.5'
          : 'hover:bg-white/5 border-l-2 border-transparent'
        }`}
    >
      <p className="text-sm text-white/90 truncate pr-6">{conv.title}</p>
      {conv.snippet && (
        <p className="text-xs mt-0.5 truncate pr-6">
          <HighlightedSnippet snippet={conv.snippet} query={conv.snippetQuery} />
        </p>
      )}
      <p className="text-xs text-navy-300/60 mt-0.5">{formatTime(conv.updated_at)}</p>
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(conv.id); }}
        className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100
          p-1 rounded hover:bg-red-500/20 transition-all"
        title={t('sidebar.delete')}
      >
        <svg className="w-3.5 h-3.5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </button>
  );
}

function GroupSection({ label, conversations, activeId, onSelect, onDelete }) {
  if (conversations.length === 0) return null;
  return (
    <div className="mb-3">
      <p className="text-xs font-semibold text-navy-300/50 uppercase tracking-wider px-3 mb-1">{label}</p>
      <div className="space-y-0.5">
        {conversations.map((c) => (
          <ConversationItem
            key={c.id}
            conv={c}
            isActive={c.id === activeId}
            onSelect={onSelect}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  );
}

export default function Sidebar({ open, conversations, activeId, onSelect, onNewChat, onDelete, search, profile }) {
  const groups = useMemo(() => groupByTime(conversations), [conversations]);
  const displayList = search.isSearching ? search.results : null;

  return (
    <aside className={`sidebar-transition flex flex-col h-full z-30
      bg-navy-800 dark:bg-dark-deeper
      fixed md:relative inset-y-0 left-0
      ${open ? 'w-72 translate-x-0' : 'w-72 -translate-x-full md:w-0 md:overflow-hidden'}`}
    >
      {/* Header */}
      <div className="p-4 flex items-center gap-3">
        <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: '#2E2E38', border: '1.5px solid #FFE600' }}>
          <span style={{ color: '#FFE600', fontWeight: '700', fontSize: '16px', lineHeight: 1 }}>A</span>
        </div>
        <div className="min-w-0">
          <h1 className="text-white font-semibold text-sm leading-tight">AuditIA</h1>
          <p className="text-navy-300/60 text-xs truncate">EY Audit Intelligence</p>
        </div>
      </div>

      {/* New chat button */}
      <div className="px-3 mb-3">
        <button
          onClick={onNewChat}
          className="w-full py-2 rounded-lg text-sm font-medium text-teal-300
            border border-teal-400/30 hover:bg-teal-400/10 transition-colors"
        >
          {t('sidebar.newChat')}
        </button>
      </div>

      {/* Search */}
      <SearchBar
        query={search.query}
        onChange={search.setQuery}
        onClear={search.clearSearch}
      />

      {/* Conversations list */}
      <div className="flex-1 overflow-y-auto px-1">
        {displayList !== null ? (
          displayList.length === 0 ? (
            <p className="text-center text-navy-300/50 text-sm mt-8">{t('sidebar.noResults')}</p>
          ) : (
            <div className="space-y-0.5">
              {displayList.map((c) => (
                <ConversationItem
                  key={c.id}
                  conv={c}
                  isActive={c.id === activeId}
                  onSelect={onSelect}
                  onDelete={onDelete}
                />
              ))}
            </div>
          )
        ) : (
          <>
            <GroupSection label={t('sidebar.today')} conversations={groups.today} activeId={activeId} onSelect={onSelect} onDelete={onDelete} />
            <GroupSection label={t('sidebar.yesterday')} conversations={groups.yesterday} activeId={activeId} onSelect={onSelect} onDelete={onDelete} />
            <GroupSection label={t('sidebar.last7days')} conversations={groups.week} activeId={activeId} onSelect={onSelect} onDelete={onDelete} />
            <GroupSection label={t('sidebar.older')} conversations={groups.older} activeId={activeId} onSelect={onSelect} onDelete={onDelete} />
          </>
        )}
      </div>

      {/* Footer — dynamic profile */}
      <div className="p-3 border-t border-navy-700/50">
        <div className="flex items-center gap-2">
          {profile?.avatarType === 'image' && profile?.avatarImage ? (
            <img src={profile.avatarImage} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
          ) : (
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0"
              style={{ backgroundColor: profile?.avatarColor || '#FFE600', color: profile?.avatarColor ? 'white' : '#2E2E38' }}
            >
              {profile?.avatarInitials || 'ID'}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-white/80 text-xs font-medium truncate">{profile?.name || 'Innovaci\u00f3n y Desarrollo'}</p>
            <p className="text-navy-300/50 text-[10px] truncate">Jetson AGX Orin</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
