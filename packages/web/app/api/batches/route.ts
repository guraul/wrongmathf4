import { NextResponse } from "next/server";

import { createBatch, listBatches } from "../../../lib/store";
import { enqueue } from "../../../lib/worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const batches = await listBatches();
  return NextResponse.json({ batches });
}

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "请求不是 multipart/form-data" }, { status: 400 });
  }

  const files = form.getAll("images").filter((f): f is File => f instanceof File);

  if (files.length === 0) {
    return NextResponse.json({ error: "没有收到图片" }, { status: 400 });
  }

  const images = await Promise.all(
    files.map(async (file) => ({ name: file.name, buffer: Buffer.from(await file.arrayBuffer()) })),
  );

  const batch = await createBatch(images);
  enqueue(batch.id);

  return NextResponse.json({ id: batch.id }, { status: 201 });
}
