import { useEffect, useRef, useState, useMemo } from 'react';
import MessageBubble from './MessageBubble.jsx';
import TypingIndicator from './TypingIndicator.jsx';
import SuggestionsBar from './SuggestionsBar.jsx';
import { t } from '../utils/i18n.js';

const WELCOME_MESSAGE = {
  id: 'welcome',
  role: 'assistant',
  content: '\u00a1Hola! Soy AuditIA, tu asistente de auditor\u00eda financiera. \uD83D\uDD12 Toda tu conversaci\u00f3n se procesa localmente \u2014 ning\u00fan dato sale de la red a menos que lo autorices expl\u00edcitamente.\n\nPuedo ayudarte con normas ISA, NIIF, COSO, PCAOB y SOX, redactar hallazgos, analizar ciclos de auditor\u00eda y m\u00e1s.\n\nEscribe `autorizar` para habilitar consultas a Gemini.\n\n\u00bfEn qu\u00e9 puedo ayudarte hoy?',
  created_at: new Date(0).toISOString(),
};

export default function ChatArea({ messages, isLoading, error, chatFont, profile, isNewChat, onFileDrop, onRegenerate, suggestions, onSuggestionClick }) {
  const scrollRef = useRef(null);
  const isNearBottom = useRef(true);
  const dragCounter = useRef(0);
  const [isDragging, setIsDragging] = useState(false);

  const displayMessages = useMemo(() => {
    if (isNewChat) {
      return [WELCOME_MESSAGE, ...messages];
    }
    return messages;
  }, [messages, isNewChat]);

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    isNearBottom.current = scrollHeight - scrollTop - clientHeight < 100;
  };

  useEffect(() => {
    if (isNearBottom.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [displayMessages, isLoading]);

  // Drag & drop handlers
  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (dragCounter.current === 1) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setIsDragging(false);

    const files = e.dataTransfer?.files;
    if (files && files.length > 0 && onFileDrop) {
      onFileDrop(files[0]);
    }
  };

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className="flex-1 overflow-y-auto px-4 py-6 relative"
    >
      <div className={`max-w-3xl mx-auto space-y-4 chat-font-${chatFont || 'default'}`}>
        {(() => {
          const lastAsstIdx = displayMessages.reduce((acc, m, i) =>
            m.role === 'assistant' && !m.streaming && m.id !== 'welcome' ? i : acc, -1);
          return displayMessages.map((msg, idx) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              profile={profile}
              isLastAssistant={idx === lastAsstIdx}
              onRegenerate={onRegenerate}
            />
          ));
        })()}
        {!isLoading && suggestions && suggestions.length > 0 && (
          <SuggestionsBar items={suggestions} onSelect={onSuggestionClick} />
        )}
        {isLoading && <TypingIndicator />}
        {error && (
          <div className="flex justify-center fade-in">
            <p className="text-sm text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/20
              px-4 py-2 rounded-lg border border-red-200 dark:border-red-800">
              {error}
            </p>
          </div>
        )}
      </div>

      {/* Drop overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-40 flex items-center justify-center
          bg-teal-600/20 dark:bg-teal-400/10 backdrop-blur-sm
          border-2 border-dashed border-teal-500 dark:border-teal-400
          rounded-lg drop-overlay-fade-in">
          <div className="flex flex-col items-center gap-2 text-teal-700 dark:text-teal-300">
            <svg className="w-12 h-12 drop-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="text-lg font-semibold">{t('chat.dropFile')}</p>
          </div>
        </div>
      )}
    </div>
  );
}
