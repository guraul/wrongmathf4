'use client';

export default function OCRControl({ isRecognizing, onStartRecognition }) {
  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-800 mb-4 pb-2 border-b">
        OCR 设置
      </h2>
      
      <div className="flex flex-wrap gap-6 mb-6">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            defaultChecked
            className="w-5 h-5 text-purple-500 rounded focus:ring-purple-500"
          />
          <span className="text-gray-700">自动清除题号前缀</span>
        </label>
      </div>

      <button
        onClick={onStartRecognition}
        disabled={isRecognizing}
        className="btn-primary w-full sm:w-auto disabled:opacity-50"
      >
        {isRecognizing ? '识别中...' : '开始识别'}
      </button>
    </div>
  );
}
