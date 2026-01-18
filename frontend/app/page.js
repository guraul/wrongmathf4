'use client';

import { useState } from 'react';
import FileUpload from '../components/FileUpload';
import OCRControl from '../components/OCRControl';
import ResultPreview from '../components/ResultPreview';
import HistoryList from '../components/HistoryList';
import logger from '../utils/logger';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

logger.configure({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  apiEndpoint: API_BASE
});

logger.info('Frontend initialized', { apiBase: API_BASE });

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
    logger.info('Files added', { count: files.length });
    
    const validFiles = files.filter(file => {
      const fileName = file.name || `file_${Date.now()}`;
      logger.debug('Checking file', { 
        name: fileName, 
        size: file?.size, 
        type: file?.type,
        originalName: file.name
      });
      
      const ext = fileName.includes('.') ? '.' + fileName.split('.').pop().toLowerCase() : '';
      return ['.pdf', '.jpg', '.jpeg', '.png'].includes(ext);
    });

    if (validFiles.length === 0) {
      logger.warn('No valid files selected');
      showToast('不支持的文件格式', 'error');
      return;
    }

    const filesWithSize = validFiles.map(file => {
      const fileName = file.name || `file_${Date.now()}`;
      return {
        id: Math.random().toString(36).substr(2, 9),
        name: fileName,
        file
      };
    });

    setUploadedFiles(prev => [...prev, ...filesWithSize]);
    logger.info('Valid files processed', { count: filesWithSize.length, files: filesWithSize.map(f => f.name) });
    showToast(`已添加 ${filesWithSize.length} 个文件`, 'success');
  };

  const removeFile = (id) => {
    setUploadedFiles(prev => prev.filter(f => f.id !== id));
  };

  const startRecognition = async () => {
    if (uploadedFiles.length === 0) {
      logger.warn('No files to recognize');
      showToast('请先上传文件', 'error');
      return;
    }

    logger.info('Starting recognition', { fileCount: uploadedFiles.length });
    setIsRecognizing(true);
    setProgress(0);
    setProgressText('准备识别...');

    try {
      for (let i = 0; i < uploadedFiles.length; i++) {
        const file = uploadedFiles[i];
        const fileProgress = ((i + 1) / uploadedFiles.length) * 100;
        
        setProgressText(`处理 ${i + 1}/${uploadedFiles.length}: ${file.name}`);
        setProgress(fileProgress * 0.8);
        logger.info('Processing file', { index: i + 1, filename: file.name, size: file.file.size });

        const fileData = file.file;
        logger.debug('File processing', {
          isFile: fileData instanceof File,
          isBlob: fileData instanceof Blob,
          name: fileData.name,
          size: fileData.size,
          type: fileData.type,
          constructor: fileData.constructor?.name
        });

        const arrayBuffer = await fileData.arrayBuffer();

        logger.debug('File read as ArrayBuffer', { size: arrayBuffer.byteLength, first20Bytes: new Uint8Array(arrayBuffer).slice(0, 20) });

        const uploadResponse = await fetch(`${API_BASE}/api/upload`, {
          method: 'POST',
          body: arrayBuffer,
          headers: {
            'Content-Type': fileData.type || 'application/octet-stream',
            'X-File-Name': fileData.name || 'file',
          },
        });
        
        if (!uploadResponse.ok) {
          logger.error('Upload failed', { status: uploadResponse.status });
          throw new Error('上传失败');
        }

        const uploadResult = await uploadResponse.json();
        logger.info('File uploaded', { fileId: uploadResult.file_id, filePath: uploadResult.file_path });
        setProgress(fileProgress * 0.8 + 10);

        setProgressText(`识别中: ${file.name}`);
        logger.info('Starting OCR', { filePath: uploadResult.file_path });

        const ocrResponse = await fetch(`${API_BASE}/api/recognize`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            file_path: uploadResult.file_path,
            clean_numbers: true,
          }),
        });

        if (!ocrResponse.ok) {
          logger.error('OCR failed', { status: ocrResponse.status });
          throw new Error('识别失败');
        }

        const ocrResult = await ocrResponse.json();
        logger.info('OCR completed', { pages: ocrResult.pages_processed, characters: ocrResult.characters });
        
        setCurrentResult(ocrResult);
        setHistory(prev => [{
          ...ocrResult,
          filename: file.name,
          time: new Date().toLocaleString('zh-CN'),
        }, ...prev.slice(0, 9)]);
      }

      setProgress(100);
      setProgressText('识别完成！');
      logger.info('Recognition completed successfully');
      showToast('识别完成', 'success');

    } catch (error) {
      logger.error('Recognition failed', { message: error.message, stack: error.stack });
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
      logger.info('Content copied to clipboard');
      showToast('已复制到剪贴板', 'success');
    } catch {
      logger.error('Failed to copy to clipboard');
      showToast('复制失败', 'error');
    }
  };

  const saveResult = async () => {
    if (!currentResult?.content) return;

    try {
      const filename = `wrongmath_${Date.now()}.md`;
      logger.info('Saving result', { filename });
      
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
      logger.info('Result saved', { filepath: result.file_path });
      showToast(`已保存: ${filename}`, 'success');
      
      window.open(result.download_url, '_blank');
    } catch (error) {
      logger.error('Save failed', { message: error.message });
      showToast(`保存失败: ${error.message}`, 'error');
    }
  };

  const clearResult = () => {
    setCurrentResult(null);
    setUploadedFiles([]);
  };

  return (
    <main className="container mx-auto px-4 py-8 max-w-4xl">
      {toast && (
        <div className={`toast ${toast.type === 'success' ? 'success' : toast.type === 'error' ? 'error' : ''}`}>
          {toast.message}
        </div>
      )}

      <header className="text-center mb-8">
        <h1 className="text-4xl font-bold text-white mb-2">📐 WrongMath</h1>
        <p className="text-white/80 text-lg">数学题目 OCR 识别工具</p>
      </header>

      <section className="bg-white rounded-2xl shadow-xl p-6 mb-6">
        <FileUpload 
          onFilesAdded={handleFilesAdded}
          uploadedFiles={uploadedFiles}
          onRemoveFile={removeFile}
        />
      </section>

      {uploadedFiles.length > 0 && (
        <section className="bg-white rounded-2xl shadow-xl p-6 mb-6">
          <OCRControl
            isRecognizing={isRecognizing}
            onStartRecognition={startRecognition}
          />
        </section>
      )}

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
