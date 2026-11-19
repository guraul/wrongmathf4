"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { statusColor, statusText, styles } from "../lib/ui";

interface PageRecord {
  name: string;
  status: string;
  wrong: number;
}

interface BatchSummary {
  id: string;
  createdAt: string;
  status: string;
  pages: PageRecord[];
  wrong: unknown[];
}

export default function Home() {
  const [batches, setBatches] = useState<BatchSummary[]>([]);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");

  const refresh = useCallback(async () => {
    const res = await fetch("/api/batches", { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as { batches: BatchSummary[] };
    setBatches(data.batches);
  }, []);

  useEffect(() => {
    void refresh();
    // 有批次在跑就每秒刷新，全部结束后放慢
    const timer = setInterval(() => {
      void refresh();
    }, 3000);
    return () => clearInterval(timer);
  }, [refresh]);

  async function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = event.currentTarget.elements.namedItem("images") as HTMLInputElement | null;
    const files = input?.files;
    if (!files || files.length === 0) {
      setMessage("先选几张卷子照片");
      return;
    }

    setUploading(true);
    setMessage("");

    const form = new FormData();
    for (const file of Array.from(files)) form.append("images", file);

    try {
      const res = await fetch("/api/batches", { method: "POST", body: form });
      const data = (await res.json()) as { id?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? `上传失败 HTTP ${res.status}`);
      setMessage(`已提交，批次 ${data.id}。一页大约 5–9 分钟，可以先去做别的。`);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setUploading(false);
    }
  }

  return (
    <main style={styles.page}>
      <h1 style={styles.h1}>WrongMath</h1>
      <p style={styles.lead}>上传作业照片，自动挑出老师打了叉的题，生成可打印的重做卷。</p>

      <form onSubmit={upload} style={{ ...styles.card, ...styles.row }}>
        <input name="images" type="file" accept="image/*" multiple />
        <button type="submit" style={styles.button} disabled={uploading}>
          {uploading ? "上传中…" : "开始处理"}
        </button>
        <span style={styles.muted}>一次最多 5 张，同一批生成一份复刻卷</span>
      </form>

      {message !== "" && <p style={{ ...styles.muted, marginBottom: 20 }}>{message}</p>}

      <h2 style={{ fontSize: 17, margin: "28px 0 12px" }}>历史批次</h2>

      {batches.length === 0 && <p style={styles.muted}>还没有批次。</p>}

      {batches.map((batch) => (
        <div key={batch.id} style={styles.card}>
          <div style={{ ...styles.row, justifyContent: "space-between" }}>
            <div>
              <Link href={`/batches/${batch.id}`} style={{ color: "#111", fontWeight: 600 }}>
                {batch.id}
              </Link>
              <div style={{ ...styles.muted, marginTop: 4 }}>
                {batch.pages.length} 页 · {batch.wrong.length} 道错题 ·{" "}
                {new Date(batch.createdAt).toLocaleString("zh-CN")}
              </div>
            </div>
            <span style={{ color: statusColor[batch.status] ?? "#666", fontWeight: 600 }}>
              {statusText[batch.status] ?? batch.status}
            </span>
          </div>
        </div>
      ))}
    </main>
  );
}
