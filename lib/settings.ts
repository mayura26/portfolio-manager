import { db } from "@/lib/db";

const SINGLETON_ID = "singleton";

export async function getSettings() {
  const existing = await db.settings.findUnique({
    where: { id: SINGLETON_ID },
  });
  if (existing) return existing;

  return db.settings.create({
    data: { id: SINGLETON_ID },
  });
}

