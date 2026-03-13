import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { t } from '../utils/i18n.js';

function extractSources(content) {
  // Match various source formats the gateway may produce
  const match = content.match(
    /\n\n?(?:\uD83D\uDCCE\s*)?(?:Fuentes|Sources|Fuente):\s*\n?([\s\S]+)$/i
  );
  if (!match) return { text: content, sources: null };
  return {
    text: content.slice(0, match.index),
    sources: match[1]
      .trim()
      .split('\n')
      .map((s) => s.replace(/^[-\u2022*]\s*/, '').trim())
      .filter(Boolean),
  };
}

// Convert [filename.ext] into markdown links with cite: prefix
// so ReactMarkdown renders them as <a> tags we can intercept
function processCitations(text) {
  if (!text) return text;
  return text.replace(
    /(?<!\()\[([^\]]+\.(?:pdf|docx|xlsx|csv|txt|pptx|html|htm|md))\]/gi,
    (match, filename) => `[${filename}](cite:${filename})`
  );
}

// Strip [Documento adjunto: ...] block from enriched content for display
function stripDocumentBlock(content) {
  if (!content) return content;
  // Full extraction block: [Documento adjunto: name]\n---\n...text...\n---\n\ncontent
  const match = content.match(/^\[Documento adjunto:[^\]]*\]\n---\n[\s\S]*?\n---\n\n?([\s\S]*)$/);
  if (match) return match[1];
  // Scanned PDF variant: [Documento adjunto: name - PDF escaneado...]\n\ncontent
  const scanMatch = content.match(/^\[Documento adjunto:[^\]]*\]\n\n?([\s\S]*)$/);
  if (scanMatch) return scanMatch[1];
  return content;
}

const FILE_TYPE_COLORS = {
  pdf: 'bg-red-500/20 text-red-200',
  docx: 'bg-blue-500/20 text-blue-200',
  xlsx: 'bg-green-500/20 text-green-200',
  csv: 'bg-green-500/20 text-green-200',
  txt: 'bg-white/20 text-white/80',
  pptx: 'bg-orange-500/20 text-orange-200',
  html: 'bg-purple-500/20 text-purple-200',
  htm: 'bg-purple-500/20 text-purple-200',
  md: 'bg-white/20 text-white/80',
};

const FILE_LABELS = {
  pdf: 'PDF', docx: 'Word', xlsx: 'Excel',
  csv: 'CSV', txt: 'Texto', pptx: 'PowerPoint',
  html: 'HTML', htm: 'HTML', md: 'Markdown',
};

function FileChip({ file }) {
  const colorClass = FILE_TYPE_COLORS[file.type] || 'bg-white/20 text-white/80';
  const label = FILE_LABELS[file.type] || file.type?.toUpperCase() || '';

  return (
    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg
      border border-white/30 text-xs mb-1.5 ${colorClass}`}>
      <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
      <span className="truncate max-w-[180px]">{file.name}</span>
      <span className="opacity-60">{label}</span>
    </div>
  );
}

function ImageLightbox({ src, onClose }) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 cursor-pointer"
      onClick={onClose}
    >
      <img
        src={src}
        alt=""
        className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-white/80 hover:text-white text-2xl font-bold"
      >
        &times;
      </button>
    </div>
  );
}

function MessageImages({ images }) {
  const [lightboxSrc, setLightboxSrc] = useState(null);

  if (!images || images.length === 0) return null;

  return (
    <>
      <div className="flex flex-wrap gap-2 mt-2">
        {images.map((src, i) => (
          <img
            key={i}
            src={src}
            alt=""
            onClick={() => setLightboxSrc(src)}
            className="max-w-[300px] max-h-[200px] object-cover rounded-lg
              cursor-pointer hover:opacity-90 transition-opacity border border-white/20"
          />
        ))}
      </div>
      {lightboxSrc && (
        <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
      )}
    </>
  );
}

function UserAvatar({ profile }) {
  if (profile?.avatarType === 'image' && profile?.avatarImage) {
    return <img src={profile.avatarImage} alt="" className="flex-shrink-0 w-8 h-8 rounded-full object-cover" />;
  }
  return (
    <div
      className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold"
      style={{ backgroundColor: profile?.avatarColor || '#FFE600', color: profile?.avatarColor ? 'white' : '#2E2E38' }}
    >
      {profile?.avatarInitials || 'ID'}
    </div>
  );
}

function AssistantAvatar() {
  return (
    <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm"
      style={{ backgroundColor: '#2E2E38', border: '1.5px solid #FFE600' }}>
      <span style={{ color: '#FFE600' }}>A</span>
    </div>
  );
}

function CopyIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  );
}

function CheckIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );
}

function RefreshIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  );
}

export default function MessageBubble({ message, profile, isLastAssistant, onRegenerate }) {
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (isUser) {
    const displayContent = stripDocumentBlock(message.content);

    return (
      <div className="flex items-end gap-2 justify-end fade-in">
        <div className="max-w-[75%] px-4 py-3 rounded-bubble-user shadow-sm user-bubble">
          {message.file && <FileChip file={message.file} />}
          {displayContent && (
            <p className="text-sm whitespace-pre-wrap break-words">{displayContent}</p>
          )}
          <MessageImages images={message.images} />
        </div>
        <UserAvatar profile={profile} />
      </div>
    );
  }

  const { text, sources } = extractSources(message.content);
  const isWebSearch = text.includes('\uD83C\uDF10');

  return (
    <div className="flex items-start gap-2 fade-in group">
      <AssistantAvatar />
      <div className="max-w-[75%]">
        <div className="dark:bg-dark-surface
          border border-navy-200 dark:border-dark-border
          text-navy-800 dark:text-dark-text
          rounded-bubble-assistant shadow-sm overflow-hidden"
          style={{ backgroundColor: "var(--assistant-bg)" }}>
          <div className="px-4 py-3">
            {isWebSearch && (
              <span className="inline-flex items-center gap-1 text-xs
                bg-blue-500/10 text-blue-600 dark:text-blue-400
                px-2 py-0.5 rounded-full mb-2">
                {'\uD83C\uDF10'} {t('chat.webSearch')}
              </span>
            )}
            <div className={`prose prose-sm dark:prose-invert max-w-none
              prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1
              prose-code:text-teal-600 dark:prose-code:text-teal-300
              prose-pre:bg-navy-50 dark:prose-pre:bg-dark-deeper prose-pre:rounded-lg
              ${message.streaming ? 'streaming-cursor' : ''}`}>
              <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    a: ({href, children}) => {
                      if (href && href.startsWith('cite:')) {
                        return <span className="citation">{children}</span>;
                      }
                      if (href && href.startsWith('/exports/')) {
                        return (
                          <a href={href} download
                            className="inline-flex items-center gap-2 px-3 py-1.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 text-sm font-medium no-underline mt-2"
                          >
                            {'\u2B07\uFE0F'} {children}
                          </a>
                        );
                      }
                      return <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>;
                    }
                  }}
                >{processCitations(text) || (message.streaming ? '\u00A0' : '')}</ReactMarkdown>
            </div>
          </div>
          {sources && (
            <div className="px-4 py-2.5 bg-navy-50/60 dark:bg-dark-deeper/60
              border-t border-navy-100 dark:border-dark-border">
              <p className="text-xs font-semibold text-navy-400 dark:text-dark-muted mb-1.5 flex items-center gap-1">
                <span>{'\uD83D\uDCCE'}</span> {t('chat.sources')}
              </p>
              <ul className="text-xs text-navy-500 dark:text-navy-300 space-y-1">
                {sources.map((s, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <span className="text-teal-500 mt-0.5 flex-shrink-0">{'\u2022'}</span>
                    <span className="break-all">
                      <ReactMarkdown components={{
                        a: ({href, children}) =>
                          <a href={href} target="_blank" rel="noopener noreferrer"
                            className="text-teal-600 dark:text-teal-400 hover:underline">{children}</a>,
                        p: ({children}) => <>{children}</>
                      }}>{s}</ReactMarkdown>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        {/* Action buttons — visible on hover */}
        {!message.streaming && (
          <div className="opacity-0 group-hover:opacity-100 transition-opacity
            flex gap-1.5 mt-1 ml-1">
            {isLastAssistant && onRegenerate && (
              <button
                onClick={() => onRegenerate(message.id)}
                className="p-1 rounded transition-colors"
                title="Regenerar"
              >
                <RefreshIcon className="w-4 h-4 text-navy-400 hover:text-navy-600 dark:text-dark-muted dark:hover:text-dark-text" />
              </button>
            )}
            <button
              onClick={handleCopy}
              className="p-1 rounded transition-colors"
              title="Copiar"
            >
              {copied
                ? <CheckIcon className="w-4 h-4 text-green-500" />
                : <CopyIcon className="w-4 h-4 text-navy-400 hover:text-navy-600 dark:text-dark-muted dark:hover:text-dark-text" />
              }
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
