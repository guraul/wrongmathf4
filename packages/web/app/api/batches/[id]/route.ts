import { NextResponse } from "next/server";

import { getBatch } from "../../../../lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const batch = await getBatch(params.id);
  if (batch === null) return NextResponse.json({ error: "批次不存在" }, { status: 404 });

  return NextResponse.json({ batch });
}
