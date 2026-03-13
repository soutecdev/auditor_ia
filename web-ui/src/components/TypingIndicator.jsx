export default function TypingIndicator() {
  return (
    <div className="flex items-center gap-1.5 px-4 py-3 mr-auto
      bg-white dark:bg-dark-surface rounded-bubble-assistant
      border border-navy-100 dark:border-dark-border
      max-w-[80px] fade-in"
    >
      <span className="bounce-dot w-2 h-2 rounded-full bg-teal-400" style={{ animationDelay: '0ms' }} />
      <span className="bounce-dot w-2 h-2 rounded-full bg-teal-400" style={{ animationDelay: '150ms' }} />
      <span className="bounce-dot w-2 h-2 rounded-full bg-teal-400" style={{ animationDelay: '300ms' }} />
    </div>
  );
}
