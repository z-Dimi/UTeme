import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { isProviderKey } from "@/server/adapters";
import { ingestWebhook } from "@/server/webhooks/ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 1_000_000;
const idSchema = z.string().uuid();

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ provider: string; integrationId: string }> },
) {
  const { provider, integrationId } = await ctx.params;
  if (!isProviderKey(provider) || !idSchema.safeParse(integrationId).success) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Raw text, byte for byte: HMAC verification depends on it.
  const rawBody = await request.text();
  if (rawBody.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  }

  const { status, body } = await ingestWebhook({
    provider,
    integrationId,
    rawBody,
    headers: request.headers,
  });
  return NextResponse.json(body, { status });
}
