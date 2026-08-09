import assert from "node:assert/strict";
import {
  buildNotificationBatches,
  IMPORTANT_NOTIFICATION_PRIORITY,
  type NotificationBatchCandidate,
} from "@/lib/notification-batching";

function candidate(
  overrides: Partial<NotificationBatchCandidate>,
): NotificationBatchCandidate {
  return {
    type: "PRICE_ALERT",
    groupKey: "portfolio:p1:PRICE_ALERT",
    title: "AAPL crossed above target",
    message: "AAPL is above target.",
    priority: 2,
    itemLabel: "AAPL: above target",
    batchLabelSingular: "price alert triggered",
    batchLabelPlural: "price alerts triggered",
    ...overrides,
  };
}

const samePortfolio = buildNotificationBatches(
  [
    candidate({ alertId: "a1", itemLabel: "AAPL: above target" }),
    candidate({
      alertId: "a2",
      title: "MSFT fell below target",
      message: "MSFT is below target.",
      itemLabel: "MSFT: below target",
    }),
  ],
  { minPriority: IMPORTANT_NOTIFICATION_PRIORITY, fallbackUrl: "/reviews" },
);

assert.equal(samePortfolio.length, 1);
assert.equal(samePortfolio[0].title, "2 price alerts triggered");
assert.equal(
  samePortfolio[0].message,
  "AAPL: above target; MSFT: below target",
);
assert.equal(samePortfolio[0].url, "/reviews");
assert.deepEqual(samePortfolio[0].metadata?.kind, "batch");
assert.deepEqual(samePortfolio[0].metadata?.itemCount, 2);

const differentGroups = buildNotificationBatches(
  [
    candidate({ groupKey: "portfolio:p1:PRICE_ALERT" }),
    candidate({ groupKey: "portfolio:p2:PRICE_ALERT", title: "MSFT alert" }),
    candidate({
      type: "FORECAST_DEVIATION",
      groupKey: "portfolio:p1:FORECAST_DEVIATION",
      title: "NVDA drifted from forecast",
      batchLabelSingular: "forecast alert triggered",
      batchLabelPlural: "forecast alerts triggered",
    }),
  ],
  { minPriority: IMPORTANT_NOTIFICATION_PRIORITY },
);

assert.equal(differentGroups.length, 3);

const suppressed = buildNotificationBatches(
  [
    candidate({
      type: "REVIEW_DUE",
      groupKey: "portfolio:p1:REVIEW_DUE",
      priority: 0,
      batchLabelSingular: "review due",
      batchLabelPlural: "reviews due",
    }),
    candidate({
      type: "ALLOCATION_DRIFT",
      groupKey: "portfolio:p1:ALLOCATION_DRIFT",
      priority: 1,
      batchLabelSingular: "allocation drift triggered",
      batchLabelPlural: "allocation drifts triggered",
    }),
  ],
  { minPriority: IMPORTANT_NOTIFICATION_PRIORITY },
);

assert.equal(suppressed.length, 0);

const single = buildNotificationBatches(
  [
    candidate({
      alertId: "alert-single",
      metadata: { price: "101" },
      url: "/stocks/AAPL",
    }),
  ],
  { minPriority: IMPORTANT_NOTIFICATION_PRIORITY },
);

assert.equal(single.length, 1);
assert.equal(single[0].title, "AAPL crossed above target");
assert.equal(single[0].message, "AAPL is above target.");
assert.equal(single[0].alertId, "alert-single");
assert.deepEqual(single[0].metadata, { price: "101" });
assert.equal(single[0].url, "/stocks/AAPL");

const autoWatcher = buildNotificationBatches([
  candidate({
    type: "AUTO_WATCHER",
    groupKey: "autowatcher:milestone",
    title: "NVDA crossed +30% to the upside",
    itemLabel: "NVDA crossed +30% to the upside (+A$500.00 gain)",
    batchLabelSingular: "AutoWatcher milestone crossed",
    batchLabelPlural: "AutoWatcher milestones crossed",
  }),
  candidate({
    type: "AUTO_WATCHER",
    groupKey: "autowatcher:milestone",
    title: "CRM crossed -20% to the downside",
    itemLabel: "CRM crossed -20% to the downside (-A$200.00 loss)",
    batchLabelSingular: "AutoWatcher milestone crossed",
    batchLabelPlural: "AutoWatcher milestones crossed",
  }),
  candidate({
    type: "AUTO_WATCHER",
    groupKey: "autowatcher:daily:immediate",
    title: "TSLA: headline",
    itemLabel: "TSLA: headline",
    batchLabelSingular: "AutoWatcher daily summary",
    batchLabelPlural: "AutoWatcher daily summaries",
  }),
  candidate({
    type: "AUTO_WATCHER",
    groupKey: "autowatcher:daily:immediate",
    title: "META: headline",
    itemLabel: "META: headline",
    batchLabelSingular: "AutoWatcher daily summary",
    batchLabelPlural: "AutoWatcher daily summaries",
  }),
]);

assert.equal(autoWatcher.length, 2);
assert.equal(autoWatcher[0].title, "2 AutoWatcher milestones crossed");
assert.equal(autoWatcher[1].title, "2 AutoWatcher daily summaries");

const achievements = buildNotificationBatches([
  candidate({
    type: "ACHIEVEMENT",
    groupKey: "achievements",
    title: "New all-time high!",
    itemLabel: "All-time high: $100.00",
    batchLabelSingular: "achievement unlocked",
    batchLabelPlural: "achievements unlocked",
  }),
  candidate({
    type: "ACHIEVEMENT",
    groupKey: "achievements",
    title: "New best trading day!",
    itemLabel: "Best daily gain: +$10.00",
    batchLabelSingular: "achievement unlocked",
    batchLabelPlural: "achievements unlocked",
  }),
]);

assert.equal(achievements.length, 1);
assert.equal(achievements[0].title, "2 achievements unlocked");
assert.equal(achievements[0].metadata?.itemCount, 2);

console.log("Notification batching tests passed");
