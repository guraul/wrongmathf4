import './globals.css';

export const metadata = {
  title: 'WrongMath - 数学题目 OCR',
  description: '数学题目 OCR 识别工具',
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
