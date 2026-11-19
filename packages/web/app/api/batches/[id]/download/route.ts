import { readFile } from "node:fs/promises";

import { NextResponse } from "next/server";

import { worksheetPath } from "../../../../../lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  if (!/^[\w-]{1,64}$/.test(params.id)) {
    return NextResponse.json({ error: "非法批次 id" }, { status: 400 });
  }

  try {
    const html = await readFile(worksheetPath(params.id), "utf8");
    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename="wrongmath-${params.id}.html"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "还没有生成复刻卷" }, { status: 404 });
  }
}
