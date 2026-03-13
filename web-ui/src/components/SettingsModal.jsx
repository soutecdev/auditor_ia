import { useState, useRef } from 'react';
import { t } from '../utils/i18n.js';
import MemoryPanel from './MemoryPanel.jsx';

const AVATAR_COLORS = [
  '#FFE600', '#00B4D8', '#0E1B35', '#5A7A8F', '#E74C3C',
  '#F39C12', '#2ECC71', '#9B59B6', '#1ABC9C', '#34495E',
];

const FONT_OPTIONS = [
  { id: 'default', labelKey: 'settings.chatFont.default', family: '"DM Sans", system-ui, sans-serif', sample: 'Aa' },
  { id: 'sans', labelKey: 'settings.chatFont.sans', family: 'system-ui, -apple-system, sans-serif', sample: 'Aa' },
  { id: 'system', labelKey: 'settings.chatFont.system', family: 'sans-serif', sample: 'Aa' },
  { id: 'dyslexic', labelKey: 'settings.chatFont.dyslexic', family: '"OpenDyslexic", "DM Sans", sans-serif', sample: 'Aa' },
];

const SECTIONS = [
  { id: 'theme', icon: '\uD83C\uDFA8', labelKey: 'settings.theme' },
  { id: 'profile', icon: '\uD83D\uDC64', labelKey: 'settings.profile' },
  { id: 'language', icon: '\uD83C\uDF10', labelKey: 'settings.language' },
  { id: 'chatFont', icon: '\uD83D\uDDA8\uFE0F', labelKey: 'settings.chatFont' },
  { id: 'notifications', icon: '\uD83D\uDD14', labelKey: 'settings.notifications' },
  { id: 'memory', icon: '\uD83E\uDDE0', labelKey: 'settings.memory' },
  { id: 'deleteHistory', icon: '\uD83D\uDDD1\uFE0F', labelKey: 'settings.deleteHistory' },
];

// --- Section Components ---

function ThemeSection({ settings, onUpdate }) {
  const options = [
    { value: 'light', labelKey: 'settings.theme.light', icon: '\u2600\uFE0F' },
    { value: 'dark', labelKey: 'settings.theme.dark', icon: '\uD83C\uDF19' },
    { value: 'system', labelKey: 'settings.theme.system', icon: '\uD83D\uDCBB' },
  ];

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-navy-800 dark:text-dark-text">{t('settings.theme')}</h3>
      <div className="grid grid-cols-3 gap-3">
        {options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onUpdate({ theme: opt.value })}
            className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all
              ${settings.theme === opt.value
                ? 'border-teal-400 bg-teal-50 dark:bg-teal-900/20'
                : 'border-navy-100 dark:border-dark-border hover:border-navy-200 dark:hover:border-dark-muted'
              }`}
          >
            <span className="text-2xl">{opt.icon}</span>
            <span className="text-xs font-medium text-navy-600 dark:text-dark-text">{t(opt.labelKey)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ProfileSection({ settings, onUpdate }) {
  const fileRef = useRef(null);
  const profile = settings.profile;

  const handleNameChange = (e) => {
    const name = e.target.value.slice(0, 50);
    onUpdate({ profile: { ...profile, name } });
  };

  const handleColorSelect = (color) => {
    onUpdate({ profile: { ...profile, avatarColor: color, avatarType: 'initials', avatarImage: null } });
  };

  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 512 * 1024) {
      alert(t('settings.profile.maxSize'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      onUpdate({ profile: { ...profile, avatarType: 'image', avatarImage: reader.result } });
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = () => {
    onUpdate({ profile: { ...profile, avatarType: 'initials', avatarImage: null } });
  };

  return (
    <div className="space-y-5">
      <h3 className="text-sm font-semibold text-navy-800 dark:text-dark-text">{t('settings.profile')}</h3>

      {/* Name */}
      <div>
        <label className="block text-xs font-medium text-navy-500 dark:text-dark-muted mb-1.5">
          {t('settings.profile.name')}
        </label>
        <input
          type="text"
          value={profile.name}
          onChange={handleNameChange}
          placeholder={t('settings.profile.namePlaceholder')}
          className="w-full px-3 py-2 rounded-lg border border-navy-200 dark:border-dark-border
            bg-white dark:bg-dark-surface text-navy-800 dark:text-dark-text text-sm
            focus:outline-none focus:border-teal-400 focus:ring-1 focus:ring-teal-400/30"
        />
      </div>

      {/* Avatar preview */}
      <div>
        <label className="block text-xs font-medium text-navy-500 dark:text-dark-muted mb-2">
          {t('settings.profile.avatar')}
        </label>
        <div className="flex items-center gap-4">
          {profile.avatarType === 'image' && profile.avatarImage ? (
            <img src={profile.avatarImage} alt="" className="w-14 h-14 rounded-full object-cover border-2 border-teal-400" />
          ) : (
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center text-white text-lg font-bold border-2 border-teal-400"
              style={{ backgroundColor: profile.avatarColor }}
            >
              {profile.avatarInitials}
            </div>
          )}
          <div className="flex flex-col gap-2">
            <button
              onClick={() => fileRef.current?.click()}
              className="text-xs text-teal-500 hover:text-teal-400 font-medium"
            >
              {t('settings.profile.upload')}
            </button>
            {profile.avatarType === 'image' && (
              <button
                onClick={handleRemoveImage}
                className="text-xs text-red-400 hover:text-red-300 font-medium"
              >
                {t('settings.profile.remove')}
              </button>
            )}
            <span className="text-[10px] text-navy-400 dark:text-dark-muted">{t('settings.profile.maxSize')}</span>
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
        </div>
      </div>

      {/* Color picker */}
      <div>
        <label className="block text-xs font-medium text-navy-500 dark:text-dark-muted mb-2">
          {t('settings.profile.initials')}
        </label>
        <div className="flex flex-wrap gap-2">
          {AVATAR_COLORS.map((color) => (
            <button
              key={color}
              onClick={() => handleColorSelect(color)}
              className={`w-8 h-8 rounded-full transition-all ${
                profile.avatarColor === color && profile.avatarType === 'initials'
                  ? 'ring-2 ring-teal-400 ring-offset-2 dark:ring-offset-dark-bg scale-110'
                  : 'hover:scale-110'
              }`}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function LanguageSection({ settings, onUpdate }) {
  const options = [
    { value: 'es', label: 'Espa\u00f1ol', flag: '\uD83C\uDDEA\uD83C\uDDF8' },
    { value: 'en', label: 'English', flag: '\uD83C\uDDFA\uD83C\uDDF8' },
  ];

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-navy-800 dark:text-dark-text">{t('settings.language')}</h3>
      <div className="grid grid-cols-2 gap-3">
        {options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onUpdate({ locale: opt.value })}
            className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all
              ${settings.locale === opt.value
                ? 'border-teal-400 bg-teal-50 dark:bg-teal-900/20'
                : 'border-navy-100 dark:border-dark-border hover:border-navy-200 dark:hover:border-dark-muted'
              }`}
          >
            <span className="text-2xl">{opt.flag}</span>
            <span className="text-sm font-medium text-navy-600 dark:text-dark-text">{opt.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ChatFontSection({ settings, onUpdate }) {
  const previewText = settings.locale === 'en'
    ? 'The quick brown fox jumps over the lazy dog.'
    : 'El veloz murci\u00e9lago hind\u00fa com\u00eda feliz cardillo y kiwi.';

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-navy-800 dark:text-dark-text">{t('settings.chatFont')}</h3>
      <div className="space-y-2">
        {FONT_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            onClick={() => onUpdate({ chatFont: opt.id })}
            className={`w-full text-left p-3 rounded-xl border-2 transition-all
              ${settings.chatFont === opt.id
                ? 'border-teal-400 bg-teal-50 dark:bg-teal-900/20'
                : 'border-navy-100 dark:border-dark-border hover:border-navy-200 dark:hover:border-dark-muted'
              }`}
          >
            <div className="flex items-center gap-3">
              <span
                className="text-xl font-bold text-teal-500 w-8"
                style={{ fontFamily: opt.family }}
              >
                {opt.sample}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-navy-700 dark:text-dark-text">{t(opt.labelKey)}</p>
                <p
                  className="text-xs text-navy-400 dark:text-dark-muted truncate mt-0.5"
                  style={{ fontFamily: opt.family }}
                >
                  {previewText}
                </p>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function NotificationsSection({ settings, onUpdate }) {
  const [permState, setPermState] = useState(() =>
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );

  const handleToggle = async () => {
    if (settings.notifications) {
      onUpdate({ notifications: false });
      return;
    }
    // Request permission
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      const result = await Notification.requestPermission();
      setPermState(result);
      if (result === 'granted') {
        onUpdate({ notifications: true });
      }
    } else if (permState === 'granted') {
      onUpdate({ notifications: true });
    }
  };

  const isDenied = permState === 'denied';

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-navy-800 dark:text-dark-text">{t('settings.notifications')}</h3>
      <div className="flex items-center justify-between p-4 rounded-xl border border-navy-100 dark:border-dark-border">
        <div className="min-w-0 mr-3">
          <p className="text-sm text-navy-700 dark:text-dark-text">{t('settings.notifications.enable')}</p>
          <p className="text-xs text-navy-400 dark:text-dark-muted mt-0.5">
            {isDenied ? t('settings.notifications.denied') : t('settings.notifications.description')}
          </p>
        </div>
        <button
          onClick={handleToggle}
          disabled={isDenied}
          className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0
            ${isDenied ? 'bg-navy-200 dark:bg-dark-border cursor-not-allowed opacity-50' :
              settings.notifications ? 'bg-teal-500' : 'bg-navy-300 dark:bg-dark-border'}`}
        >
          <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform
            ${settings.notifications ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
        </button>
      </div>
    </div>
  );
}

function DeleteHistorySection({ onDeleteHistory }) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await onDeleteHistory();
    } finally {
      setDeleting(false);
      setConfirming(false);
    }
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-navy-800 dark:text-dark-text">{t('settings.deleteHistory')}</h3>
      <div className="p-4 rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50/50 dark:bg-red-900/10">
        {!confirming ? (
          <button
            onClick={() => setConfirming(true)}
            className="w-full py-2.5 rounded-lg bg-red-500 hover:bg-red-600 text-white text-sm font-medium transition-colors"
          >
            {t('settings.deleteHistory.button')}
          </button>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-red-600 dark:text-red-400 font-medium text-center">
              {t('settings.deleteHistory.confirm')}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirming(false)}
                disabled={deleting}
                className="flex-1 py-2 rounded-lg border border-navy-200 dark:border-dark-border
                  text-navy-600 dark:text-dark-text text-sm hover:bg-navy-50 dark:hover:bg-dark-surface transition-colors"
              >
                {t('settings.deleteHistory.cancel')}
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors
                  disabled:opacity-50"
              >
                {deleting ? '...' : t('settings.deleteHistory.confirmButton')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// --- Main Modal ---

export default function SettingsModal({ settings, onUpdate, onClose, onDeleteHistory }) {
  const [activeSection, setActiveSection] = useState('theme');

  const renderSection = () => {
    switch (activeSection) {
      case 'theme': return <ThemeSection settings={settings} onUpdate={onUpdate} />;
      case 'profile': return <ProfileSection settings={settings} onUpdate={onUpdate} />;
      case 'language': return <LanguageSection settings={settings} onUpdate={onUpdate} />;
      case 'chatFont': return <ChatFontSection settings={settings} onUpdate={onUpdate} />;
      case 'notifications': return <NotificationsSection settings={settings} onUpdate={onUpdate} />;
      case 'memory': return <MemoryPanel />;
      case 'deleteHistory': return <DeleteHistorySection onDeleteHistory={onDeleteHistory} />;
      default: return null;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" />

      {/* Modal */}
      <div
        className="relative w-full max-w-2xl max-h-[85vh] bg-white dark:bg-dark-bg
          rounded-2xl shadow-2xl overflow-hidden flex fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left sidebar with section tabs */}
        <div className="w-48 flex-shrink-0 bg-navy-50 dark:bg-dark-deeper border-r border-navy-100 dark:border-dark-border
          flex flex-col py-4">
          <h2 className="px-4 pb-3 text-base font-bold text-navy-800 dark:text-dark-text">
            {t('settings.title')}
          </h2>
          <nav className="flex-1 space-y-0.5 px-2">
            {SECTIONS.map((sec) => (
              <button
                key={sec.id}
                onClick={() => setActiveSection(sec.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-sm transition-colors
                  ${activeSection === sec.id
                    ? 'bg-teal-50 dark:bg-teal-900/20 text-teal-600 dark:text-teal-300 font-medium border-l-2 border-teal-400'
                    : 'text-navy-600 dark:text-dark-muted hover:bg-navy-100 dark:hover:bg-dark-surface border-l-2 border-transparent'
                  }`}
              >
                <span className="text-base">{sec.icon}</span>
                <span>{t(sec.labelKey)}</span>
              </button>
            ))}
          </nav>
        </div>

        {/* Right content */}
        <div className="flex-1 p-6 overflow-y-auto">
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-3 right-3 p-1.5 rounded-lg text-navy-400 dark:text-dark-muted
              hover:bg-navy-100 dark:hover:bg-dark-surface transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {renderSection()}
        </div>
      </div>
    </div>
  );
}
