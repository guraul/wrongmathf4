import { describe, expect, it } from "vitest";

import { parseArgs, UsageError } from "../src/cli/args.js";

describe("judge 参数解析", () => {
  it("只给图片（不带 --mask 时曾经会误删下标 0）", () => {
    expect(parseArgs(["a.jpg"])).toEqual({ image: "a.jpg" });
  });

  it("图片 + mask", () => {
    expect(parseArgs(["a.jpg", "--mask", "m.jpg"])).toEqual({ image: "a.jpg", maskPath: "m.jpg" });
  });

  it("replay + mask", () => {
    expect(parseArgs(["--replay", "p.json", "--mask", "m.jpg"])).toEqual({
      replay: "p.json",
      maskPath: "m.jpg",
    });
  });

  it("参数顺序无关", () => {
    expect(parseArgs(["--mask", "m.jpg", "a.jpg"])).toEqual({ image: "a.jpg", maskPath: "m.jpg" });
  });

  it("缺少取值时报错", () => {
    expect(() => parseArgs(["a.jpg", "--mask"])).toThrow(UsageError);
    expect(() => parseArgs(["--replay"])).toThrow(UsageError);
  });

  it("未知参数报错", () => {
    expect(() => parseArgs(["a.jpg", "--nope"])).toThrow(/未知参数/);
  });

  it("多给图片报错", () => {
    expect(() => parseArgs(["a.jpg", "b.jpg"])).toThrow(/只接受一个图片参数/);
  });

  it("什么都不给报错", () => {
    expect(() => parseArgs([])).toThrow(UsageError);
  });
});
