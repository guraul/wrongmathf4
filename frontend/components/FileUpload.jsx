'use client';

import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import logger from '../utils/logger';

export default function FileUpload({ onFilesAdded, uploadedFiles, onRemoveFile }) {
  const onDrop = useCallback((acceptedFiles) => {
    logger.info('Files dropped', { count: acceptedFiles.length });
    acceptedFiles.forEach((f, i) => {
      logger.debug(`File ${i}`, { 
        name: f?.name, 
        size: f?.size, 
        type: f?.type,
        constructor: f?.constructor?.name,
        isFile: f instanceof File,
        isBlob: f instanceof Blob
      });
    });
    onFilesAdded(acceptedFiles);
  }, [onFilesAdded]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'application/pdf': ['.pdf']
    },
    multiple: true
  });

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getFileIcon = (filename) => {
    if (!filename || !filename.includes('.')) return '📁';
    const ext = filename.split('.').pop().toLowerCase();
    if (ext === 'pdf') return '📄';
    if (['jpg', 'jpeg', 'png'].includes(ext)) return '🖼️';
    return '📁';
  };

  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-800 mb-4 pb-2 border-b">
        上传文件
      </h2>
      
      {/* Drop Zone */}
      <div
        {...getRootProps()}
        className={`drop-zone ${isDragActive ? 'drag-over' : ''}`}
      >
        <input {...getInputProps()} />
        <div className="text-6xl mb-4">📁</div>
        <p className="text-lg text-gray-600">
          {isDragActive 
            ? '释放文件...' 
            : <>拖拽文件到此处，或 <span className="text-purple-500 underline">点击选择</span></>
          }
        </p>
        <p className="text-sm text-gray-400 mt-2">
          支持 PDF、JPG、PNG（最大 10MB）
        </p>
      </div>

      {/* File List */}
      {uploadedFiles.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-medium text-gray-600 mb-2">
            待识别文件 ({uploadedFiles.length})
          </h3>
          <div className="space-y-2">
            {uploadedFiles.map((file) => (
              <div
                key={file.id || file.file.path || file.name}
                className="flex items-center justify-between bg-gray-50 rounded-lg p-3"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{getFileIcon(file.name)}</span>
                  <div>
                    <p className="font-medium text-gray-700">{file.name}</p>
                    <p className="text-sm text-gray-400">{formatFileSize(file.file.size)}</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    logger.info('File removed', { name: file.name });
                    onRemoveFile(file.id);
                  }}
                  className="text-gray-400 hover:text-red-500 p-2 rounded-lg hover:bg-red-50 transition-colors"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
