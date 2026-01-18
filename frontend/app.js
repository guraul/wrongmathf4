/**
 * WrongMath Frontend - JavaScript
 */

// API 基础地址
const API_BASE = 'http://localhost:8000';

// 状态管理
let uploadedFiles = [];
let currentResult = null;
let historyResults = [];

// DOM 元素
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const fileListSection = document.getElementById('file-list-section');
const fileList = document.getElementById('file-list');
const recognizeBtn = document.getElementById('recognize-btn');
const progressSection = document.getElementById('progress-section');
const progressFill = document.getElementById('progress-fill');
const progressText = document.getElementById('progress-text');
const resultSection = document.getElementById('result-section');
const resultPreview = document.getElementById('result-preview');
const resultStats = document.getElementById('result-stats');
const copyBtn = document.getElementById('copy-btn');
const saveBtn = document.getElementById('save-btn');
const clearBtn = document.getElementById('clear-btn');
const historyList = document.getElementById('history-list');

// ============ 初始化 ============

document.addEventListener('DOMContentLoaded', () => {
    initEventListeners();
    loadHistory();
});

// ============ 事件监听 ============

function initEventListeners() {
    // 拖拽上传
    dropZone.addEventListener('dragover', handleDragOver);
    dropZone.addEventListener('dragleave', handleDragLeave);
    dropZone.addEventListener('drop', handleDrop);
    dropZone.addEventListener('click', () => fileInput.click());
    
    // 文件选择
    fileInput.addEventListener('change', handleFileSelect);
    
    // 按钮事件
    recognizeBtn.addEventListener('click', startRecognition);
    copyBtn.addEventListener('click', copyResult);
    saveBtn.addEventListener('click', saveResult);
    clearBtn.addEventListener('click', clearResult);
}

// ============ 拖拽处理 ============

function handleDragOver(e) {
    e.preventDefault();
    dropZone.classList.add('drag-over');
}

function handleDragLeave(e) {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
}

function handleDrop(e) {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    
    const files = Array.from(e.dataTransfer.files);
    addFiles(files);
}

function handleFileSelect(e) {
    const files = Array.from(e.target.files);
    addFiles(files);
    fileInput.value = '';
}

// ============ 文件处理 ============

function addFiles(files) {
    const validFiles = files.filter(file => {
        const ext = '.' + file.name.split('.').pop().toLowerCase();
        return ['.pdf', '.jpg', '.jpeg', '.png'].includes(ext);
    });
    
    if (validFiles.length === 0) {
        showToast('不支持的文件格式', 'error');
        return;
    }
    
    validFiles.forEach(file => {
        if (file.size > 10 * 1024 * 1024) {
            showToast(`文件过大: ${file.name} (最大 10MB)`, 'error');
            return;
        }
        
        uploadedFiles.push(file);
    });
    
    renderFileList();
}

function removeFile(index) {
    uploadedFiles.splice(index, 1);
    renderFileList();
}

function renderFileList() {
    if (uploadedFiles.length === 0) {
        fileListSection.classList.add('hidden');
        return;
    }
    
    fileListSection.classList.remove('hidden');
    fileList.innerHTML = uploadedFiles.map((file, index) => `
        <div class="file-item">
            <div class="file-info">
                <span class="file-icon">${getFileIcon(file.name)}</span>
                <div>
                    <div class="file-name">${file.name}</div>
                    <div class="file-size">${formatFileSize(file.size)}</div>
                </div>
            </div>
            <button class="remove-btn" onclick="removeFile(${index})">✕</button>
        </div>
    `).join('');
}

function getFileIcon(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    if (ext === 'pdf') return '📄';
    if (['jpg', 'jpeg', 'png'].includes(ext)) return '🖼️';
    return '📁';
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// ============ OCR 识别 ============

async function startRecognition() {
    if (uploadedFiles.length === 0) {
        showToast('请先上传文件', 'error');
        return;
    }
    
    // 禁用按钮
    recognizeBtn.disabled = true;
    recognizeBtn.textContent = '识别中...';
    
    // 显示进度
    progressSection.classList.remove('hidden');
    progressFill.style.width = '0%';
    progressText.textContent = '准备上传文件...';
    
    try {
        for (let i = 0; i < uploadedFiles.length; i++) {
            const file = uploadedFiles[i];
            const progress = ((i + 1) / uploadedFiles.length) * 100;
            
            progressText.textContent = `处理 ${i + 1}/${uploadedFiles.length}: ${file.name}`;
            progressFill.style.width = `${progress * 0.8}%`; // 80% 用于处理
            
            // 1. 上传文件
            const uploadResult = await uploadFile(file);
            
            progressText.textContent = `识别中: ${file.name}`;
            progressFill.style.width = `${progress * 0.8 + 10}%`;
            
            // 2. OCR 识别
            const ocrResult = await recognizeFile(uploadResult.file_path);
            
            // 保存结果
            currentResult = ocrResult;
            addToHistory(ocrResult);
            
            // 显示结果
            displayResult(ocrResult);
        }
        
        progressFill.style.width = '100%';
        progressText.textContent = '识别完成！';
        showToast('识别完成', 'success');
        
    } catch (error) {
        console.error('识别失败:', error);
        showToast('识别失败: ' + error.message, 'error');
    } finally {
        recognizeBtn.disabled = false;
        recognizeBtn.textContent = '开始识别';
        
        setTimeout(() => {
            progressSection.classList.add('hidden');
        }, 2000);
    }
}

async function uploadFile(file) {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await fetch(`${API_BASE}/api/upload`, {
        method: 'POST',
        body: formData
    });
    
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || '上传失败');
    }
    
    return await response.json();
}

async function recognizeFile(filePath) {
    const cleanNumbers = document.getElementById('clean-numbers').checked;
    
    const response = await fetch(`${API_BASE}/api/recognize`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            file_path: filePath,
            clean_numbers: cleanNumbers
        })
    });
    
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || '识别失败');
    }
    
    return await response.json();
}

// ============ 结果展示 ============

function displayResult(result) {
    resultSection.classList.remove('hidden');
    
    // 渲染 Markdown 内容
    resultPreview.textContent = result.content;
    
    // 显示统计信息
    resultStats.textContent = `共 ${result.pages_processed} 页，${result.characters} 字符`;
}

function copyResult() {
    if (!currentResult) return;
    
    navigator.clipboard.writeText(currentResult.content)
        .then(() => showToast('已复制到剪贴板', 'success'))
        .catch(() => showToast('复制失败', 'error'));
}

async function saveResult() {
    if (!currentResult) return;
    
    const filename = `wrongmath_${Date.now()}.md`;
    
    const response = await fetch(`${API_BASE}/api/save`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            content: currentResult.content,
            filename: filename
        })
    });
    
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || '保存失败');
    }
    
    const result = await response.json();
    showToast(`已保存: ${filename}`, 'success');
    
    // 下载文件
    window.open(result.download_url, '_blank');
}

function clearResult() {
    currentResult = null;
    uploadedFiles = [];
    resultSection.classList.add('hidden');
    fileListSection.classList.add('hidden');
    fileList.innerHTML = '';
}

// ============ 历史记录 ============

function addToHistory(result) {
    const historyItem = {
        filename: result.file_path.split('/').pop(),
        time: new Date().toLocaleString('zh-CN'),
        content: result.content,
        chars: result.characters
    };
    
    historyResults.unshift(historyItem);
    
    // 只保留最近 10 条
    if (historyResults.length > 10) {
        historyResults.pop();
    }
    
    saveHistory();
    renderHistory();
}

function loadHistory() {
    const saved = localStorage.getItem('wrongmath_history');
    if (saved) {
        historyResults = JSON.parse(saved);
        renderHistory();
    }
}

function saveHistory() {
    localStorage.setItem('wrongmath_history', JSON.stringify(historyResults));
}

function renderHistory() {
    if (historyResults.length === 0) {
        historyList.innerHTML = '<p style="color: #999; text-align: center;">暂无历史记录</p>';
        return;
    }
    
    historyList.innerHTML = historyResults.map((item, index) => `
        <div class="history-item" onclick="loadHistoryItem(${index})">
            <span class="filename">${item.filename}</span>
            <span class="time">${item.time} (${item.chars} 字符)</span>
        </div>
    `).join('');
}

function loadHistoryItem(index) {
    const item = historyResults[index];
    currentResult = {
        content: item.content,
        pages_processed: 1,
        characters: item.chars
    };
    displayResult(currentResult);
    window.scrollTo({ top: resultSection.offsetTop - 20, behavior: 'smooth' });
}

// ============ Toast 通知 ============

function showToast(message, type = 'info') {
    // 移除现有 toast
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    // 显示
    setTimeout(() => toast.classList.add('show'), 10);
    
    // 隐藏
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ============ 全局函数 ============

// 使 HTML 中引用的函数全局可用
window.removeFile = removeFile;
window.loadHistoryItem = loadHistoryItem;
