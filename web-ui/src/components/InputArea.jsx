import { useState, useRef, useCallback, useEffect } from 'react';
import { t } from '../utils/i18n.js';

const DOCUMENT_EXTENSIONS = ['.pdf', '.docx', '.xlsx', '.csv', '.txt', '.pptx', '.html', '.htm', '.md'];
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const FILE_TYPE_COLORS = {
  pdf: 'text-red-500',
  docx: 'text-blue-500',
  xlsx: 'text-green-600',
  csv: 'text-green-600',
  txt: 'text-navy-400 dark:text-dark-muted',
  pptx: 'text-orange-500',
  html: 'text-purple-500',
  htm: 'text-purple-500',
  md: 'text-navy-400 dark:text-dark-muted',
};

function getFileType(filename) {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  return ext;
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function DocumentIcon({ type }) {
  const color = FILE_TYPE_COLORS[type] || 'text-navy-400 dark:text-dark-muted';
  return (
    <svg className={`w-4 h-4 flex-shrink-0 ${color}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
    </svg>
  );
}

export default function InputArea({ onSend, isLoading, droppedFile }) {
  const [text, setText] = useState('');
  const [images, setImages] = useState([]);
  const [file, setFile] = useState(null);
  const [fileError, setFileError] = useState(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);

  // Handle files dropped from ChatArea drag & drop
  useEffect(() => {
    if (droppedFile) {
      processFile(droppedFile);
    }
  }, [droppedFile]);

  const processFile = useCallback((rawFile) => {
    setFileError(null);

    // Check size
    if (rawFile.size > MAX_FILE_SIZE) {
      setFileError(t('input.fileTooLarge'));
      return;
    }

    const isImage = IMAGE_TYPES.includes(rawFile.type);
    const ext = '.' + (rawFile.name.split('.').pop()?.toLowerCase() || '');
    const isDocument = DOCUMENT_EXTENSIONS.includes(ext);

    if (!isImage && !isDocument) {
      setFileError(t('input.unsupportedType'));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (isImage) {
        setImages((prev) => [...prev, reader.result]);
      } else {
        setFile({
          name: rawFile.name,
          type: getFileType(rawFile.name),
          size: rawFile.size,
          mime: rawFile.type,
          dataUrl: reader.result,
        });
      }
    };
    reader.readAsDataURL(rawFile);
  }, []);

  const handleFileSelect = useCallback((e) => {
    const files = Array.from(e.target.files);
    for (const f of files) {
      processFile(f);
    }
    e.target.value = '';
  }, [processFile]);

  const handleSend = useCallback(() => {
    if (!text.trim() && images.length === 0 && !file) return;
    if (isLoading) return;
    onSend(text, images, file || undefined);
    setText('');
    setImages([]);
    setFile(null);
    setFileError(null);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [text, images, file, isLoading, onSend]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e) => {
    setText(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  };

  const removeImage = (index) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="border-t border-navy-100 dark:border-dark-border bg-white dark:bg-dark-surface px-2 py-2 sm:px-4 sm:py-3">
      <div className="max-w-3xl mx-auto">
        {/* Image previews */}
        {images.length > 0 && (
          <div className="flex gap-2 mb-2 flex-wrap">
            {images.map((img, i) => (
              <div key={i} className="relative group">
                <img src={img} alt="" className="w-16 h-16 object-cover rounded-lg border border-navy-100 dark:border-dark-border" />
                <button
                  onClick={() => removeImage(i)}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full
                    flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  &times;
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Document file preview chip */}
        {file && (
          <div className="flex items-center gap-2 mb-2 px-3 py-1.5 rounded-lg
            bg-navy-50 dark:bg-dark-bg border border-navy-100 dark:border-dark-border
            max-w-xs">
            <DocumentIcon type={file.type} />
            <span className="text-sm text-navy-700 dark:text-dark-text truncate max-w-[180px]">{file.name}</span>
            <span className="text-xs text-navy-400 dark:text-dark-muted flex-shrink-0">{formatSize(file.size)}</span>
            <button
              onClick={() => setFile(null)}
              className="ml-auto w-5 h-5 flex items-center justify-center rounded-full
                text-navy-400 dark:text-dark-muted hover:bg-navy-100 dark:hover:bg-dark-border
                hover:text-red-500 transition-colors flex-shrink-0"
            >
              &times;
            </button>
          </div>
        )}

        {/* File error */}
        {fileError && (
          <p className="text-xs text-red-500 mb-2">{fileError}</p>
        )}

        {/* Input row */}
        <div className="flex items-end gap-2">
          {/* Attach file */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-2 rounded-lg text-navy-400 dark:text-dark-muted
              hover:bg-navy-50 dark:hover:bg-dark-bg transition-colors flex-shrink-0"
            title={t('input.attachFile')}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,.pdf,.docx,.xlsx,.csv,.txt,.pptx,.html,.htm,.md"
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder={t('input.placeholder')}
            rows={1}
            disabled={isLoading}
            className="flex-1 resize-none px-4 py-2.5 rounded-xl text-sm
              bg-navy-50 dark:bg-dark-bg
              text-navy-800 dark:text-dark-text
              placeholder-navy-300 dark:placeholder-dark-muted
              border border-navy-100 dark:border-dark-border
              focus:outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-400/20
              disabled:opacity-50 transition-all"
            style={{ minHeight: '44px', maxHeight: '120px' }}
          />

          {/* Send button */}
          <button
            onClick={handleSend}
            disabled={isLoading || (!text.trim() && images.length === 0 && !file)}
            className="p-2.5 rounded-xl flex-shrink-0
              bg-gradient-to-br from-teal-600 to-teal-400
              text-white shadow-sm
              hover:shadow-md hover:from-teal-500 hover:to-teal-300
              disabled:opacity-40 disabled:cursor-not-allowed
              transition-all"
            title={t('input.send')}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
            </svg>
          </button>
        </div>

        {/* Disclaimer */}
        <p className="text-center text-[11px] text-navy-300 dark:text-dark-muted mt-2">
          {t('input.disclaimer')}
        </p>
      </div>
    </div>
  );
}
