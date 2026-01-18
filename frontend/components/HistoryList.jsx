'use client';

export default function HistoryList({ history, onLoadItem }) {
  if (history.length === 0) {
    return (
      <p className="text-center text-gray-400 py-4">
        暂无历史记录
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {history.map((item, index) => (
        <div
          key={index}
          onClick={() => onLoadItem(item)}
          className="flex items-center justify-between p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-purple-50 transition-colors"
        >
          <div>
            <p className="font-medium text-gray-700">{item.filename || item.file_path?.split('/').pop()}</p>
            <p className="text-sm text-gray-400">{item.time}</p>
          </div>
          <div className="text-sm text-gray-400">
            {item.characters} 字符
          </div>
        </div>
      ))}
    </div>
  );
}
