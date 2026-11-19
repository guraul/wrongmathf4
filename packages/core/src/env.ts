import { existsSync } from "node:fs";

/**
 * 读 .env 到 process.env。用 Node 自带的 process.loadEnvFile，不引第三方依赖。
 * 文件不存在就静默跳过——CI 里靠真实环境变量，本地靠 .env。
 */
export function loadEnv(path = ".env"): void {
  if (!existsSync(path)) return;
  process.loadEnvFile(path);
}
