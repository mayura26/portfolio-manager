import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

const SINGLETON_ID = "singleton";

type SerializedSubscription = {
  endpoint?: unknown;
  keys?: {
    p256dh?: unknown;
    auth?: unknown;
  };
};

function parseSubscription(
  value: unknown,
): { endpoint: string; p256dh: string; auth: string } | { error: string } {
  const sub = value as SerializedSubscription;
  if (!sub || typeof sub !== "object") {
    return { error: "Subscription required" };
  }

  if (typeof sub.endpoint !== "string" || sub.endpoint.length === 0) {
    return { error: "Subscription endpoint required" };
  }

  if (
    !sub.keys ||
    typeof sub.keys.p256dh !== "string" ||
    typeof sub.keys.auth !== "string" ||
    sub.keys.p256dh.length === 0 ||
    sub.keys.auth.length === 0
  ) {
    return { error: "Subscription keys required" };
  }

  return {
    endpoint: sub.endpoint,
    p256dh: sub.keys.p256dh,
    auth: sub.keys.auth,
  };
}

async function readJson(request: NextRequest): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

export async function POST(request: NextRequest) {
  const parsed = parseSubscription(await readJson(request));
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  await db.$transaction([
    db.pushSubscription.upsert({
      where: { endpoint: parsed.endpoint },
      create: {
        endpoint: parsed.endpoint,
        p256dh: parsed.p256dh,
        auth: parsed.auth,
        userAgent: request.headers.get("user-agent"),
      },
      update: {
        p256dh: parsed.p256dh,
        auth: parsed.auth,
        userAgent: request.headers.get("user-agent"),
      },
    }),
    db.settings.upsert({
      where: { id: SINGLETON_ID },
      create: { id: SINGLETON_ID, pushEnabled: true },
      update: { pushEnabled: true },
    }),
  ]);

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const body = await readJson(request);
  const endpoint =
    body &&
    typeof body === "object" &&
    "endpoint" in body &&
    typeof body.endpoint === "string"
      ? body.endpoint
      : null;

  if (!endpoint) {
    return NextResponse.json(
      { error: "Subscription endpoint required" },
      { status: 400 },
    );
  }

  const remaining = await db.$transaction(async (tx) => {
    await tx.pushSubscription.deleteMany({ where: { endpoint } });
    const count = await tx.pushSubscription.count();
    await tx.settings.upsert({
      where: { id: SINGLETON_ID },
      create: { id: SINGLETON_ID, pushEnabled: count > 0 },
      update: { pushEnabled: count > 0 },
    });
    return count;
  });

  return NextResponse.json({ ok: true, remaining });
}
