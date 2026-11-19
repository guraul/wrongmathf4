import { NextResponse } from "next/server";

import { assertBatchId, getBatch } from "../../../../lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  if (!/^[\w-]{1,64}$/.test(params.id)) {
    return NextResponse.json({ error: "非法批次 id" }, { status: 400 });
  }

  const batch = await getBatch(params.id);
  if (batch === null) return NextResponse.json({ error: "批次不存在" }, { status: 404 });

  return NextResponse.json({ batch });
}
