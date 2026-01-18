'use client';

import { useState } from 'react';
import FileUpload from '../components/FileUpload';
import OCRControl from '../components/OCRControl';
import ResultPreview from '../components/ResultPreview';
import HistoryList from '../components/HistoryList';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export default function Home() {
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [isRecognizing, setIsRecognizing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState('');
  const [currentResult, setCurrentResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [toast, setToast] = useState(null);

  const showToast = (message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleFilesAdded = (files) => {
    const validFiles = files.filter(file => {
      const ext = '.' + file.name.split('.').pop().toLowerCase();
      return ['.pdf', '.jpg', '.jpeg', '.png'].includes(ext);
    });

    if (validFiles.length === 0) {
      showToast('不支持的文件格式', 'error');
      return;
    }

    const filesWithSize = validFiles.map(file => ({
      ...file,
      size: file.size,
      id: Math.random().toString(36).substr(2, 9)
    }));

    setUploadedFiles(prev => [...prev, ...filesWithSize]);
    showToast(`已添加 ${filesWithSize.length} 个文件`, 'success');
  };

  const removeFile = (id) => {
    setUploadedFiles(prev => prev.filter(f => f.id !== id));
  };

  const startRecognition = async () => {
    if (uploadedFiles.length === 0) {
      showToast('请先上传文件', 'error');
      return;
    }

    setIsRecognizing(true);
    setProgress(0);
    setProgressText('准备识别...');

    try {
      for (let i = 0; i < uploadedFiles.length; i++) {
        const file = uploadedFiles[i];
        const fileProgress = ((i + 1) / uploadedFiles.length) * 100;
        
        setProgressText(`处理 ${i + 1}/${uploadedFiles.length}: ${file.name}`);
        setProgress(fileProgress * 0.8);

        // 1. 上传文件
        const formData = new FormData();
        formData.append('file', file);

        const uploadResponse = await fetch(`${API_BASE}/api/upload`, {
          method: 'POST',
          body: formData,
        });

        if (!uploadResponse.ok) {
          throw new Error('上传失败');
        }

        const uploadResult = await uploadResponse.json();
        setProgress(fileProgress * 0.8 + 10);

        // 2. OCR 识别
        setProgressText(`识别中: ${file.name}`);

        const ocrResponse = await fetch(`${API_BASE}/api/recognize`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            file_path: uploadResult.file_path,
            clean_numbers: true,
          }),
        });

        if (!ocrResponse.ok) {
          throw new Error('识别失败');
        }

        const ocrResult = await ocrResponse.json();
        
        setCurrentResult(ocrResult);
        setHistory(prev => [{
          ...ocrResult,
          filename: file.name,
          time: new Date().toLocaleString('zh-CN'),
        }, ...prev.slice(0, 9)]);
      }

      setProgress(100);
      setProgressText('识别完成！');
      showToast('识别完成', 'success');

    } catch (error) {
      console.error('识别失败:', error);
      showToast(`识别失败: ${error.message}`, 'error');
    } finally {
      setIsRecognizing(false);
      setTimeout(() => {
        setProgress(0);
        setProgressText('');
      }, 2000);
    }
  };

  const copyToClipboard = async () => {
    if (!currentResult?.content) return;
    
    try {
      await navigator.clipboard.writeText(currentResult.content);
      showToast('已复制到剪贴板', 'success');
    } catch {
      showToast('复制失败', 'error');
    }
  };

  const saveResult = async () => {
    if (!currentResult?.content) return;

    try {
      const filename = `wrongmath_${Date.now()}.md`;
      const response = await fetch(`${API_BASE}/api/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: currentResult.content,
          filename,
        }),
      });

      if (!response.ok) throw new Error('保存失败');

      const result = await response.json();
      showToast(`已保存: ${filename}`, 'success');
      
      // 打开下载链接
      window.open(result.download_url, '_blank');
    } catch (error) {
      showToast(`保存失败: ${error.message}`, 'error');
    }
  };

  const clearResult = () => {
    setCurrentResult(null);
    setUploadedFiles([]);
  };

  return (
    <main className="container mx-auto px-4 py-8 max-w-4xl">
      {/* Toast Notification */}
      {toast && (
        <div className={`toast ${toast.type === 'success' ? 'success' : toast.type === 'error' ? 'error' : ''}`}>
          {toast.message}
        </div>
      )}

      {/* Header */}
      <header className="text-center mb-8">
        <h1 className="text-4xl font-bold text-white mb-2">📐 WrongMath</h1>
        <p className="text-white/80 text-lg">数学题目 OCR 识别工具</p>
      </header>

      {/* File Upload */}
      <section className="bg-white rounded-2xl shadow-xl p-6 mb-6">
        <FileUpload 
          onFilesAdded={handleFilesAdded}
          uploadedFiles={uploadedFiles}
          onRemoveFile={removeFile}
        />
      </section>

      {/* OCR Control */}
      {uploadedFiles.length > 0 && (
        <section className="bg-white rounded-2xl shadow-xl p-6 mb-6">
          <OCRControl
            isRecognizing={isRecognizing}
            onStartRecognition={startRecognition}
          />
        </section>
      )}

      {/* Progress */}
      {isRecognizing && (
        <section className="bg-indigo-50 rounded-xl p-4 mb-6">
          <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
            <div 
              className="bg-gradient-to-r from-purple-500 to-indigo-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-center text-gray-600">{progressText}</p>
        </section>
      )}

      {/* Result Preview */}
      {currentResult && (
        <section className="bg-white rounded-2xl shadow-xl p-6 mb-6">
          <ResultPreview
            result={currentResult}
            onCopy={copyToClipboard}
            onSave={saveResult}
            onClear={clearResult}
          />
        </section>
      )}

      {/* History */}
      <section className="bg-white rounded-2xl shadow-xl p-6">
        <h2 className="text-xl font-semibold text-gray-800 mb-4">历史记录</h2>
        <HistoryList 
          history={history} 
          onLoadItem={(item) => setCurrentResult(item)}
        />
      </section>
    </main>
  );
}
