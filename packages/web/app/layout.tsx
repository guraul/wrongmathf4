import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "WrongMath",
  description: "把作业照片变成可打印的错题卷",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body style={{ fontFamily: "system-ui, -apple-system, sans-serif", margin: 0 }}>{children}</body>
    </html>
  );
}
