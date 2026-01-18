"""
WrongMath Web API - FastAPI 后端
提供文件上传、OCR 识别、保存导出功能
"""
import os
import sys
import uuid
import base64
import asyncio
import re
import logging
from pathlib import Path
from typing import Optional, List
from datetime import datetime
from logging.handlers import RotatingFileHandler
from pydantic import BaseModel

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from dotenv import load_dotenv

# 加载环境变量
load_dotenv(".env")

# 项目根目录
PROJECT_ROOT = Path(__file__).parent

# 添加 src 目录到路径
SRC_DIR = PROJECT_ROOT / "src"
sys.path.insert(0, str(SRC_DIR))

from services.file_processor import process_file, pdf_to_image_files
from services.ocr_service import create_ocr_service

# ============ 日志配置 ============

LOG_DIR = PROJECT_ROOT / "logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)

# 简单的文件日志函数
def log_to_file(level: str, message: str, data: Optional[dict] = None):
    """写入日志到文件"""
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    log_line = f"[{timestamp}] [{level}] {message}"
    if data:
        log_line += f" | {data}"
    log_line += "\n"
    
    log_file = LOG_DIR / "wrongmath.log"
    try:
        with open(log_file, "a", encoding="utf-8") as f:
            f.write(log_line)
    except Exception:
        pass  # 静默失败，避免日志写入失败影响主程序

def log_info(message: str, data: Optional[dict] = None):
    print(f"[INFO] {message}")
    log_to_file("INFO", message, data)

def log_error(message: str, data: Optional[dict] = None):
    print(f"[ERROR] {message}")
    log_to_file("ERROR", message, data)

def log_debug(message: str, data: Optional[dict] = None):
    print(f"[DEBUG] {message}")
    log_to_file("DEBUG", message, data)

app = FastAPI(
    title="WrongMath OCR API",
    description="数学题目 OCR 识别 Web API",
    version="1.0.0"
)

# CORS 配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 添加请求日志中间件
@app.middleware("http")
async def log_requests(request: Request, call_next):
    log_debug(f"Request: {request.method} {request.url}", {
        "headers": dict(request.headers),
        "query_params": dict(request.query_params)
    })
    response = await call_next(request)
    log_debug(f"Response: {response.status_code}")
    return response

# 上传文件存储目录
UPLOAD_DIR = PROJECT_ROOT / "frontend" / "uploads"
OUTPUT_DIR = PROJECT_ROOT / "frontend" / "output"
RESULTS_DIR = PROJECT_ROOT / "output"

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# ============ 数据模型 ============

class OCRRequest(BaseModel):
    """OCR 识别请求"""
    file_path: Optional[str] = None
    zoom: float = 1.0
    clean_numbers: bool = True

class OCRResponse(BaseModel):
    """OCR 识别响应"""
    success: bool
    file_path: str
    content: str
    pages_processed: int
    characters: int

class SaveRequest(BaseModel):
    """保存请求"""
    content: str
    filename: str


# ============ 辅助函数 ============

def clean_question_numbers(text: str) -> str:
    """清洗题号前缀"""
    lines = text.split('\n')
    cleaned_lines = []
    
    for line in lines:
        if not line.strip():
            cleaned_lines.append(line)
            continue
        
        # 去除 "第X题"
        line = re.sub(r'^第\d+题\s*', '', line)
        # 去除 "XX."
        line = re.sub(r'^\s*\d+\.\s*', '', line)
        # 去除 "XX" standalone
        line = re.sub(r'^\s*\d+\s+', '', line)
        # 去除中文空格
        line = re.sub(r'^[\s　]+?\d+\s+', '', line)
        
        cleaned_lines.append(line)
    
    result = '\n'.join(cleaned_lines)
    result = re.sub(r'\n{3,}', '\n\n', result)
    
    return result.strip()

# ============ API 端点 ============

@app.get("/")
async def root():
    """API 根路径"""
    return {
        "name": "WrongMath OCR API",
        "version": "1.0.0",
        "status": "running"
    }


@app.post("/api/upload")
async def upload_file(request: Request):
    """
    上传文件
    
    支持两种方式：
    1. multipart/form-data (常规方式) - field name: file
    2. 原始二进制 + X-File-Name header (Safari 兼容)
    """
    try:
        content_type = request.headers.get('Content-Type', '')
        
        # 生成唯一文件名
        file_id = str(uuid.uuid4())[:8]
        
        # 从 header 获取文件名（Safari 上传方式）
        header_filename = request.headers.get('X-File-Name')
        
        # 读取原始 body
        content = await request.body()
        
        # 检查是否是 multipart
        if 'multipart/form-data' in content_type and not header_filename:
            # 使用临时解析 - 简化的方式
            # 实际应该使用 UploadFile，但这里我们用 filename 参数
            return {"message": "Use multipart with 'file' field"}
        
        if header_filename:
            # Safari 原始二进制上传
            original_name = header_filename
        else:
            # 没有文件名，尝试从 Content-Disposition 获取
            content_disposition = request.headers.get('Content-Disposition', '')
            if 'filename=' in content_disposition:
                import re
                match = re.search(r'filename="?([^";\n]+)"?', content_disposition)
                original_name = match.group(1) if match else f'file_{file_id}'
            else:
                original_name = f'file_{file_id}'
        
        ext = Path(original_name).suffix.lower()
        log_info(f"上传文件: {original_name}, 扩展名: {ext}, 大小: {len(content)} 字节")
        
        # 验证文件类型
        if ext not in {".pdf", ".jpg", ".jpeg", ".png"}:
            log_error(f"不支持的文件格式: {ext}")
            raise HTTPException(status_code=400, detail=f"不支持的文件格式: {ext}")
        
        # 保存文件
        filename = f"{file_id}_{original_name}"
        file_path = UPLOAD_DIR / filename
        
        with open(file_path, "wb") as f:
            f.write(content)
        
        log_info(f"文件上传成功: {file_path}")
        
        return {
            "success": True,
            "file_id": file_id,
            "filename": original_name,
            "file_path": str(file_path),
            "file_size": len(content)
        }
        
    except Exception as e:
        log_error(f"文件上传失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/recognize")
async def recognize_file(request: OCRRequest):
    """
    OCR 识别
    
    对上传的文件进行 OCR 识别，提取数学题目
    """
    try:
        if not request.file_path or not os.path.exists(request.file_path):
            raise HTTPException(status_code=400, detail="文件不存在")
        
        file_path = request.file_path
        log_info(f"开始 OCR 识别: {file_path}")
        
        # 处理文件（PDF 转图片，或直接使用图片）
        base64_images, num_pages = process_file(file_path)
        
        if not base64_images:
            raise HTTPException(status_code=400, detail="无法提取图片")
        
        # 调用 OCR 服务
        ocr_service = await create_ocr_service()
        recognized_text = await ocr_service.recognize_text(base64_images)
        
        if not recognized_text or not recognized_text.strip():
            raise HTTPException(status_code=500, detail="OCR 返回空结果")
        
        # 清洗题号（如果需要）
        if request.clean_numbers:
            recognized_text = clean_question_numbers(recognized_text)
        
        # 保存结果到 output 目录
        filename = Path(file_path).stem + ".md"
        output_path = RESULTS_DIR / filename
        
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(recognized_text)
        
        log_info(f"OCR 完成: {num_pages} 页, {len(recognized_text)} 字符")
        
        return {
            "success": True,
            "file_path": file_path,
            "content": recognized_text,
            "pages_processed": num_pages,
            "characters": len(recognized_text),
            "output_path": str(output_path)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        log_error(f"OCR 识别失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/save")
async def save_result(request: SaveRequest):
    """
    保存识别结果
    
    将内容保存为 Markdown 文件
    """
    try:
        # 验证文件名
        if not request.filename.endswith(".md"):
            request.filename += ".md"
        
        # 保存文件
        output_path = OUTPUT_DIR / request.filename
        
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(request.content)
        
        log_info(f"结果已保存: {output_path}")
        
        return {
            "success": True,
            "file_path": str(output_path),
            "download_url": f"/api/download/{request.filename}"
        }
        
    except Exception as e:
        log_error(f"保存失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/download/{filename}")
async def download_file(filename: str):
    """
    下载文件
    """
    file_path = OUTPUT_DIR / filename
    
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="文件不存在")
    
    return FileResponse(
        path=str(file_path),
        filename=filename,
        media_type="text/markdown"
    )


@app.get("/api/outputs")
async def list_outputs():
    """
    列出所有输出文件
    """
    log_info("Listing outputs")
    outputs = []
    for f in RESULTS_DIR.glob("*.md"):
        # 读取文件内容计算字符数
        try:
            with open(f, "r", encoding="utf-8") as file:
                content = file.read()
                characters = len(content)
        except Exception:
            characters = 0
        
        outputs.append({
            "filename": f.name,
            "file_path": str(f),
            "time": datetime.fromtimestamp(f.stat().st_mtime).isoformat(),
            "characters": characters
        })
    
    return {
        "success": True,
        "outputs": outputs
    }


@app.delete("/api/upload/{file_id}")
async def delete_uploaded_file(file_id: str):
    """
    删除上传的临时文件
    """
    try:
        for f in UPLOAD_DIR.glob(f"{file_id}_*"):
            f.unlink()
        
        return {"success": True, "message": "文件已删除"}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class FrontendLogRequest(BaseModel):
    """前端日志请求"""
    level: str
    message: str
    data: Optional[dict] = None
    sessionId: str
    timestamp: str
    userAgent: Optional[str] = None


@app.post("/api/logs")
async def receive_frontend_log(request: FrontendLogRequest):
    """
    接收前端日志并写入文件
    """
    try:
        log_line = (
            f"[{request.timestamp}] [{request.level.upper()}] [frontend:{request.sessionId}] "
            f"{request.message}"
        )
        if request.data:
            log_line += f"\n  Data: {request.data}"
        if request.userAgent:
            log_line += f"\n  UserAgent: {request.userAgent[:100]}"
        log_line += "\n"
        
        # 写入前端日志文件
        frontend_log_file = LOG_DIR / "frontend.log"
        with open(frontend_log_file, "a", encoding="utf-8") as f:
            f.write(log_line)
        
        return {"success": True}
        
    except Exception as e:
        log_error(f"Failed to write frontend log: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/logs")
async def list_logs():
    """
    列出日志文件
    """
    logs = []
    for f in LOG_DIR.glob("*.log"):
        logs.append({
            "name": f.name,
            "path": str(f),
            "size": f.stat().st_size,
            "modified": datetime.fromtimestamp(f.stat().st_mtime).isoformat()
        })
    
    return {
        "success": True,
        "logs": logs
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
