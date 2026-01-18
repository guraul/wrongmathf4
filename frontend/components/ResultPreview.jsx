'use client';

export default function ResultPreview({ result, onCopy, onSave, onClear }) {
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
            onClick={onCopy}
            className="btn-secondary text-sm"
          >
            复制内容
          </button>
          <button
            onClick={onSave}
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

      <div className="result-preview">
        {result.content}
      </div>

      <div className="mt-3 text-right text-sm text-gray-400">
        {result.pages_processed} 页 · {result.characters} 字符
      </div>
    </div>
  );
}
