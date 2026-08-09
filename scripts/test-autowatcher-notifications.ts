import assert from "node:assert/strict";
import Decimal from "decimal.js";
import {
  formatAutoWatcherCrossingLabel,
  formatAutoWatcherMilestoneMessage,
  formatAutoWatcherPositionLabel,
} from "@/lib/autowatcher-format";

const negative = formatAutoWatcherMilestoneMessage({
  symbol: "CRM",
  pnlPct: new Decimal("-22.8"),
  unrealizedPnL: new Decimal("-1234.56"),
  pnlCurrency: "AUD",
  avgCost: new Decimal("197.66"),
  currentPrice: new Decimal("152.56"),
  instrumentCurrency: "USD",
});

assert.match(negative, /CRM is down 22\.8% vs cost basis/);
assert.match(negative, /Position: -A\$1,234\.56 loss/);
assert.match(negative, /Avg cost \$197\.66, current \$152\.56/);
assert.doesNotMatch(negative, /prev band/i);
assert.equal(
  formatAutoWatcherCrossingLabel("CRM", "-20%", "downside"),
  "CRM crossed -20% to the downside",
);
assert.equal(
  formatAutoWatcherPositionLabel(new Decimal("-1234.56"), "AUD"),
  "-A$1,234.56 loss",
);

const positive = formatAutoWatcherMilestoneMessage({
  symbol: "NVDA",
  pnlPct: new Decimal("31.2"),
  unrealizedPnL: new Decimal("9876.54"),
  pnlCurrency: "AUD",
  avgCost: new Decimal("100"),
  currentPrice: new Decimal("131.2"),
  instrumentCurrency: "USD",
});

assert.match(positive, /NVDA is up 31\.2% vs cost basis/);
assert.match(positive, /Position: \+A\$9,876\.54 gain/);
assert.match(positive, /Avg cost \$100\.00, current \$131\.20/);
assert.equal(
  formatAutoWatcherCrossingLabel("NVDA", "+30%", "upside"),
  "NVDA crossed +30% to the upside",
);
assert.equal(
  formatAutoWatcherPositionLabel(new Decimal("9876.54"), "AUD"),
  "+A$9,876.54 gain",
);

console.log("AutoWatcher notification formatting tests passed");
process.exit(0);
