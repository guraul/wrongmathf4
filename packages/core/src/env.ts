import { existsSync } from "node:fs";

/**
 * 读 .env 到 process.env。用 Node 自带的 process.loadEnvFile，不引第三方依赖。
 * 文件不存在就静默跳过——CI 里靠真实环境变量，本地靠 .env。
 */
export function loadEnv(path = ".env"): void {
  if (!existsSync(path)) return;
  try {
    process.loadEnvFile(path);
  } catch (error) {
    // 格式坏掉不该让整条命令崩在启动阶段：提示一行，继续用已有环境变量
    console.warn(`[warn] 读取 ${path} 失败，已忽略：${(error as Error).message}`);
  }
}
