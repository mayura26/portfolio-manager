-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- Migrate the previous singleton subscription, when present.
INSERT INTO "PushSubscription" ("id", "endpoint", "p256dh", "auth", "createdAt", "updatedAt")
SELECT
    CONCAT('legacy_', MD5("pushSubscription"->>'endpoint')),
    "pushSubscription"->>'endpoint',
    "pushSubscription"#>>'{keys,p256dh}',
    "pushSubscription"#>>'{keys,auth}',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "Settings"
WHERE
    "pushSubscription" IS NOT NULL
    AND "pushSubscription"->>'endpoint' IS NOT NULL
    AND "pushSubscription"#>>'{keys,p256dh}' IS NOT NULL
    AND "pushSubscription"#>>'{keys,auth}' IS NOT NULL
ON CONFLICT ("endpoint") DO NOTHING;
