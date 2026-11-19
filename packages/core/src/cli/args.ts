/**
 * judge 命令的参数解析。
 *
 * 抽成纯函数是为了能测：第一版用 indexOf + filter，flag 不存在时 -1 会把
 * 正常参数一起过滤掉（`i !== -1 + 1` 恰好命中下标 0），带 --mask 时正常、
 * 不带时静默失效——只跑 happy path 根本发现不了。
 */

export interface JudgeArgs {
  /** --replay 的模型回包文件 */
  replay?: string;
  /** 待判定的图片 */
  image?: string;
  /** 红笔掩膜用的图片 */
  maskPath?: string;
}

export class UsageError extends Error {}

export function parseArgs(argv: string[]): JudgeArgs {
  const result: JudgeArgs = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === undefined) break;

    if (arg === "--replay" || arg === "--mask") {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--") || value === "") {
        throw new UsageError(`${arg} 后面缺少取值`);
      }

      const key = arg === "--replay" ? "replay" : "maskPath";
      if (result[key] !== undefined) throw new UsageError(`${arg} 给了两次`);
      result[key] = value;
      i += 1;
      continue;
    }

    if (arg.startsWith("--")) throw new UsageError(`未知参数 ${arg}`);
    if (arg === "") throw new UsageError("图片路径不能为空");
    if (result.image !== undefined) throw new UsageError(`只接受一个图片参数，多出：${arg}`);
    result.image = arg;
  }

  if (result.replay === undefined && result.image === undefined) {
    throw new UsageError("需要给出图片路径，或用 --replay 指定回包文件");
  }

  return result;
}
