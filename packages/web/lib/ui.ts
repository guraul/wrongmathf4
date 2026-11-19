/** 页面共用的样式常量：只有一个前端包，内联对象足够，不引 UI 库 */
export const styles = {
  page: { maxWidth: 860, margin: "0 auto", padding: "40px 24px 80px", lineHeight: 1.7, color: "#111" } as const,
  h1: { fontSize: 26, margin: "0 0 6px" } as const,
  lead: { color: "#666", margin: "0 0 28px" } as const,
  card: { border: "1px solid #e6e6e3", borderRadius: 10, padding: "18px 20px", marginBottom: 16 } as const,
  row: { display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" } as const,
  button: {
    padding: "9px 18px",
    borderRadius: 8,
    border: "1px solid #111",
    background: "#111",
    color: "#fff",
    fontSize: 14,
    cursor: "pointer",
    textDecoration: "none",
    display: "inline-block",
  } as const,
  ghost: {
    padding: "7px 14px",
    borderRadius: 8,
    border: "1px solid #ccc",
    background: "#fff",
    color: "#111",
    fontSize: 13,
    cursor: "pointer",
    textDecoration: "none",
    display: "inline-block",
  } as const,
  muted: { color: "#888", fontSize: 13 } as const,
  log: {
    background: "#fafaf8",
    border: "1px solid #eee",
    borderRadius: 8,
    padding: "12px 14px",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: 12,
    lineHeight: 1.7,
    maxHeight: 260,
    overflow: "auto",
    whiteSpace: "pre-wrap" as const,
  } as const,
};

export const statusText: Record<string, string> = {
  queued: "排队中",
  processing: "处理中",
  done: "已完成",
  failed: "失败",
};

export const statusColor: Record<string, string> = {
  queued: "#8a6d3b",
  processing: "#1b6ac9",
  done: "#1d7a46",
  failed: "#b3261e",
};
