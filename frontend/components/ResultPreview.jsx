'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

export default function ResultPreview({ result, onCopy, onSave, onClear }) {
  const [content, setContent] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const textareaRef = useRef(null);

  useEffect(() => {
    if (result?.content) {
      const formattedContent = formatContent(result.content);
      setContent(formattedContent);
    }
  }, [result?.content]);

  const formatContent = useCallback((rawContent) => {
    let formatted = rawContent.replace(/(\d+\.\s)/g, '\n$1');
    formatted = formatted.replace(/\n\s*\n/g, '\n\n');
    formatted = formatted.trim();
    return formatted;
  }, []);

  const renderMath = useCallback((text) => {
    if (!text) return null;

    const parts = [];
    let i = 0;
    const len = text.length;

    while (i < len) {
      let matched = false;

      if (i + 1 < len && text[i] === '\\') {
        const nextChar = text[i + 1];

        if (nextChar === '[') {
          const endIndex = text.indexOf('\\]', i + 2);
          if (endIndex !== -1) {
            const mathContent = text.slice(i + 2, endIndex);
            parts.push({
              type: 'math',
              content: mathContent,
              displayMode: true,
              start: i,
              end: endIndex + 2
            });
            i = endIndex + 2;
            matched = true;
          }
        } else if (nextChar === '(') {
          const endIndex = text.indexOf('\\)', i + 2);
          if (endIndex !== -1) {
            const mathContent = text.slice(i + 2, endIndex);
            parts.push({
              type: 'math',
              content: mathContent,
              displayMode: false,
              start: i,
              end: endIndex + 2

            });
            i = endIndex + 2;
            matched = true;
          }
        }
      }

      if (!matched) {
        if (text[i] === '$') {
          const isDouble = i + 1 < len && text[i + 1] === '$';
          const endMarker = isDouble ? '$$' : '$';
          const endIndex = text.indexOf(endMarker, i + (isDouble ? 2 : 1));

          if (endIndex !== -1) {
            const mathContent = text.slice(i + (isDouble ? 2 : 1), endIndex);
            parts.push({
              type: 'math',
              content: mathContent,
              displayMode: isDouble,
              start: i,
              end: endIndex + endMarker.length
            });
            i = endIndex + endMarker.length;
            matched = true;
          }
        }
      }

      if (!matched) {
        const nextMathStart = findNextMathStart(text, i + 1);
        if (nextMathStart === -1) {
          parts.push({ type: 'text', content: text.slice(i) });
          break;
        } else if (nextMathStart > i) {
          parts.push({ type: 'text', content: text.slice(i, nextMathStart) });
          i = nextMathStart;
        } else {
          parts.push({ type: 'text', content: text[i] });
          i++;
        }
      }
    }

    return parts.map((part, idx) => {
      if (part.type === 'math') {
        try {
          const renderedHtml = katex.renderToString(part.content, {
            displayMode: part.displayMode,
            throwOnError: false
          });

          return part.displayMode ? (
            <div key={idx} className="my-4">
              <span dangerouslySetInnerHTML={{ __html: renderedHtml }} />
            </div>
          ) : (
            <span key={idx} dangerouslySetInnerHTML={{ __html: renderedHtml }} />
          );
        } catch (error) {
          console.error('KaTeX rendering error:', error, 'content:', part.content);
          const original = text.slice(part.start, part.end);
          return (
            <span key={idx} className="text-red-500 font-mono bg-red-50 px-1 rounded">
              {original}
            </span>
          );
        }
      }

      return <span key={idx}>{part.content}</span>;
    });
  }, []);

  const findNextMathStart = (text, startIndex) => {
    let minIndex = -1;
    const len = text.length;

    for (let i = startIndex; i < len; i++) {
      if (text[i] === '\\') {
        if (i + 1 < len && (text[i + 1] === '[' || text[i + 1] === '(')) {
          minIndex = i;
          break;
        }
      } else if (text[i] === '$') {
        if (minIndex === -1) {
          minIndex = i;
        }
        break;
      }
    }

    return minIndex;
  };

  const handleEditToggle = useCallback(() => {
    setIsEditing(!isEditing);
    if (!isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.scrollTop = 0;
    }
  }, [isEditing]);

  const handleContentChange = useCallback((e) => {
    setContent(e.target.value);
  }, []);

  const handleCopy = useCallback(() => {
    onCopy();
  }, [onCopy]);

  const handleSave = useCallback(() => {
    onSave(content);
  }, [content, onSave]);

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4 pb-2 border-b">
        <h2 className="text-xl font-semibold text-gray-800">识别结果</h2>
        
        <div className="flex gap-2">
          <button
            onClick={handleEditToggle}
            className="btn-secondary text-sm"
          >
            {isEditing ? '预览' : '编辑'}
          </button>
          <button
            onClick={handleCopy}
            className="btn-secondary text-sm"
          >
            复制内容
          </button>
          <button
            onClick={handleSave}
            className="btn-secondary text-sm"
          >
            保存文件
          </button>
          <button
            onClick={onClear}
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors text-sm"
          >
            清除结果
          </button>
        </div>
      </div>

      {isEditing ? (
        <textarea
          ref={textareaRef}
          value={content}
          onChange={handleContentChange}
          className="w-full min-h-[300px] p-4 border border-gray-300 rounded-lg resize-vertical focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent font-mono text-sm leading-relaxed"
          placeholder="在此编辑识别结果..."
        />
      ) : (
        <div className="result-preview">
          <div className="math-content whitespace-pre-wrap">
            {renderMath(content)}
          </div>
        </div>
      )}

      <div className="mt-3 text-right text-sm text-gray-400">
        {result.pages_processed} 页 · {result.characters} 字符
      </div>
    </div>
  );
}
