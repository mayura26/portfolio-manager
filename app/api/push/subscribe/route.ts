import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

const SINGLETON_ID = "singleton";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object" || !("endpoint" in body)) {
    return NextResponse.json(
      { error: "Subscription required" },
      { status: 400 },
    );
  }

  await db.settings.upsert({
    where: { id: SINGLETON_ID },
    create: {
      id: SINGLETON_ID,
      pushEnabled: true,
      pushSubscription: body as object,
    },
    update: {
      pushEnabled: true,
      pushSubscription: body as object,
    },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  await db.settings.upsert({
    where: { id: SINGLETON_ID },
    create: { id: SINGLETON_ID, pushEnabled: false },
    update: { pushEnabled: false, pushSubscription: undefined },
  });
  return NextResponse.json({ ok: true });
}
