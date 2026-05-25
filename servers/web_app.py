import io
import os
from pathlib import Path
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.responses import HTMLResponse, FileResponse
import weasyprint

app = FastAPI(title="WrongMath Web UI", version="1.0.0")

OUTPUT_DIR = Path("output")


@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.post("/api/task")
async def create_task(file: UploadFile = File(...)):
    input_dir = Path("input")
    input_dir.mkdir(exist_ok=True)
    file_path = input_dir / file.filename
    content = await file.read()
    file_path.write_bytes(content)
    return {"file_path": str(file_path), "filename": file.filename, "size": len(content)}


@app.get("/api/output")
async def list_output():
    if not OUTPUT_DIR.exists():
        return {"subjects": []}
    subjects = {}
    for d in sorted(OUTPUT_DIR.iterdir()):
        if d.is_dir():
            files = sorted(f.name for f in d.iterdir() if f.suffix == ".md")
            if files:
                subjects[d.name] = files
    return {"subjects": subjects}


@app.get("/api/output/{subject}/{filename}")
async def get_output(subject: str, filename: str):
    file_path = OUTPUT_DIR / subject / filename
    if not file_path.exists():
        return {"error": "File not found"}, 404
    content = file_path.read_text(encoding="utf-8")
    return {"content": content, "filename": filename}


@app.get("/api/output/{subject}/{filename}/download")
async def download_output(subject: str, filename: str):
    file_path = OUTPUT_DIR / subject / filename
    if not file_path.exists():
        return {"error": "File not found"}, 404
    return FileResponse(str(file_path), filename=filename, media_type="text/markdown")


@app.post("/api/merge")
async def merge_to_pdf(files: list[str] = Form(...)):
    content = []
    for f in files:
        fp = OUTPUT_DIR / f
        if fp.exists():
            content.append(fp.read_text(encoding="utf-8"))
    if not content:
        return {"error": "No valid files"}, 400

    html_parts = []
    for c in content:
        html_parts.append(f"<div style='page-break-after: always;'><pre>{c}</pre></div>")
    html_content = "<html><body>" + "".join(html_parts) + "</body></html>"

    pdf_bytes = weasyprint.HTML(string=html_content).write_pdf()
    return FileResponse(
        io.BytesIO(pdf_bytes),
        filename="merged.pdf",
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=merged.pdf"},
    )


@app.get("/", response_class=HTMLResponse)
async def web_ui():
    return """<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>WrongMath</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, sans-serif; max-width: 900px; margin: 0 auto; padding: 20px; background: #f8f9fa; }
        h1 { border-bottom: 2px solid #dee2e6; padding-bottom: 10px; margin-bottom: 20px; }
        .subject { background: white; border-radius: 8px; padding: 16px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        .subject h2 { color: #495057; margin-bottom: 8px; }
        .file { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #eee; }
        .file:last-child { border-bottom: none; }
        .file a { color: #228be6; text-decoration: none; }
        .file a:hover { text-decoration: underline; }
        .btn { display: inline-block; padding: 4px 12px; border-radius: 4px; font-size: 13px; cursor: pointer; border: none; }
        .btn-primary { background: #228be6; color: white; }
        .btn-primary:hover { background: #1971c2; }
        .btn-primary:disabled { background: #adb5bd; cursor: not-allowed; }
        .upload-zone { border: 2px dashed #dee2e6; border-radius: 8px; padding: 40px; text-align: center; margin-bottom: 20px; background: white; cursor: pointer; }
        .upload-zone:hover { border-color: #228be6; }
        .toast { position: fixed; bottom: 20px; right: 20px; background: #40c057; color: white; padding: 12px 20px; border-radius: 6px; display: none; z-index: 1000; }
        #merge-bar { position: sticky; bottom: 0; background: white; border-top: 2px solid #dee2e6; padding: 12px; display: flex; gap: 10px; align-items: center; }
        .file-checkbox { margin-right: 8px; }
    </style>
</head>
<body>
    <h1>WrongMath</h1>

    <div class="upload-zone" id="dropzone" onclick="document.getElementById('fileInput').click()">
        <p style="font-size: 18px; color: #868e96;">拖拽图片到此处或点击上传</p>
        <input type="file" id="fileInput" accept="image/*,.pdf" style="display:none" multiple>
    </div>

    <div id="subjects"></div>

    <div id="merge-bar">
        <input type="checkbox" id="selectAll">
        <label for="selectAll">全选</label>
        <button id="mergeBtn" class="btn btn-primary" disabled>合并为 PDF</button>    </div>

    <div id="toast" class="toast"></div>

    <script>
        let selectedFiles = [];

        async function refresh() {
            const res = await fetch('/api/output');
            const data = await res.json();
            const container = document.getElementById('subjects');
            container.innerHTML = '';
            for (const [subject, files] of Object.entries(data.subjects || {})) {
                const div = document.createElement('div');
                div.className = 'subject';
                div.innerHTML = '<h2>' + subject + '</h2>' +
                    files.map(f => '<div class="file">' +
                        '<input type="checkbox" class="file-checkbox" data-path="' + subject + '/' + f + '" onchange="updateMergeBtn()"> ' +
                        '<a href="/api/output/' + subject + '/' + f + '" target="_blank">' + f + '</a>' +
                        ' <a href="/api/output/' + subject + '/' + f + '/download" class="btn btn-primary">下载</a></div>'
                    ).join('');
                container.appendChild(div);
            }
        }

        function updateMergeBtn() {
            selectedFiles = [...document.querySelectorAll('.file-checkbox:checked')].map(cb => cb.dataset.path);
            document.getElementById('mergeBtn').disabled = selectedFiles.length === 0;
        }

        document.getElementById('selectAll').onchange = function() {
            document.querySelectorAll('.file-checkbox').forEach(cb => cb.checked = this.checked);
            updateMergeBtn();
        };

        document.getElementById('mergeBtn').onclick = async () => {
            const form = new FormData();
            selectedFiles.forEach(f => form.append('files', f));
            const res = await fetch('/api/merge', { method: 'POST', body: form });
            if (res.ok) {
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'merged.pdf';
                a.click();
                URL.revokeObjectURL(url);
                showToast('PDF 已生成');
            } else {
                showToast('合并失败');
            }
        };

        async function uploadFile(file) {
            const form = new FormData();
            form.append('file', file);
            const res = await fetch('/api/task', { method: 'POST', body: form });
            await res.json();
            showToast(file.name + ' 已上传');
        }

        function showToast(msg) {
            const el = document.getElementById('toast');
            el.textContent = msg;
            el.style.display = 'block';
            setTimeout(() => el.style.display = 'none', 3000);
        }

        document.getElementById('fileInput').onchange = async (e) => {
            for (const file of e.target.files) await uploadFile(file);
            refresh();
        };

        document.getElementById('dropzone').ondragover = (e) => e.preventDefault();
        document.getElementById('dropzone').ondrop = async (e) => {
            e.preventDefault();
            for (const file of e.dataTransfer.files) await uploadFile(file);
            refresh();
        };

        refresh();
    </script>
</body>
</html>"""
