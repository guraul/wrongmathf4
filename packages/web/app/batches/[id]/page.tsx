"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { statusColor, statusText, styles } from "../../../lib/ui";

interface Question {
  originalNo: string;
  stem: string;
  confidence: number;
  evidence: Record<string, unknown>;
}

interface Batch {
  id: string;
  status: string;
  createdAt: string;
  pages: Array<{ name: string; status: string; wrong: number; questions: number; error?: string }>;
  wrong: Question[];
  log: string[];
  error?: string;
}

export default function BatchPage({ params }: { params: { id: string } }) {
  const [batch, setBatch] = useState<Batch | null>(null);
  const [missing, setMissing] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/batches/${params.id}`, { cache: "no-store" });
    if (res.status === 404) {
      setMissing(true);
      return;
    }
    const data = (await res.json()) as { batch: Batch };
    setBatch(data.batch);
  }, [params.id]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      void refresh();
    }, 3000);
    return () => clearInterval(timer);
  }, [refresh]);

  if (missing) {
    return (
      <main style={styles.page}>
        <p>批次 {params.id} 不存在。</p>
        <Link href="/" style={styles.ghost}>
          返回
        </Link>
      </main>
    );
  }

  if (batch === null) {
    return (
      <main style={styles.page}>
        <p style={styles.muted}>加载中…</p>
      </main>
    );
  }

  const running = batch.status === "queued" || batch.status === "processing";

  return (
    <main style={styles.page}>
      <Link href="/" style={{ ...styles.muted, textDecoration: "none" }}>
        ← 返回
      </Link>

      <h1 style={{ ...styles.h1, marginTop: 12 }}>{batch.id}</h1>
      <p style={styles.lead}>
        <span style={{ color: statusColor[batch.status] ?? "#666", fontWeight: 600 }}>
          {statusText[batch.status] ?? batch.status}
        </span>
        {" · "}
        {batch.pages.length} 页 · {batch.wrong.length} 道错题
        {running && " · 处理中，可关闭页面，稍后回来"}
      </p>

      {batch.status === "done" && (
        <p>
          <a href={`/api/batches/${batch.id}/download`} style={styles.button}>
            下载复刻卷（HTML）
          </a>
        </p>
      )}

      {batch.error !== undefined && (
        <p style={{ color: "#b3261e", marginBottom: 16 }}>失败原因：{batch.error}</p>
      )}

      <h2 style={{ fontSize: 16, margin: "24px 0 10px" }}>逐页进度</h2>
      <div style={styles.card}>
        {batch.pages.map((page, index) => (
          <div key={`${page.name}-${index}`} style={{ ...styles.row, justifyContent: "space-between" }}>
            <span>
              {index + 1}. {page.name}
            </span>
            <span style={{ ...styles.muted, color: statusColor[page.status] ?? "#666" }}>
              {statusText[page.status] ?? page.status}
              {page.status === "done" && ` · ${page.questions} 题 · ${page.wrong} 道错题`}
              {page.error !== undefined && ` · ${page.error}`}
            </span>
          </div>
        ))}
      </div>

      {batch.wrong.length > 0 && (
        <>
          <h2 style={{ fontSize: 16, margin: "24px 0 10px" }}>错题清单</h2>
          <div style={styles.card}>
            {batch.wrong.map((q, index) => (
              <div key={`${q.originalNo}-${index}`} style={{ marginBottom: 12 }}>
                <div style={{ fontWeight: 600 }}>
                  {q.originalNo}
                  <span style={{ ...styles.muted, fontWeight: 400, marginLeft: 8 }}>
                    置信 {q.confidence} · {String(q.evidence.reason ?? "")}
                  </span>
                </div>
                <div style={{ ...styles.muted, marginTop: 2 }}>{q.stem}</div>
              </div>
            ))}
          </div>
        </>
      )}

      <h2 style={{ fontSize: 16, margin: "24px 0 10px" }}>处理日志</h2>
      <div style={styles.log}>{batch.log.join("\n")}</div>
    </main>
  );
}
