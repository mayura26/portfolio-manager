import assert from "node:assert/strict";
import "dotenv/config";
import Decimal from "decimal.js";
import { computeMarketDayRecords } from "@/lib/stats";

const usdFx = async () => new Decimal(1);

function date(day: string) {
  return new Date(`${day}T00:00:00.000Z`);
}

function trade(
  instrumentId: string,
  symbol: string,
  day: string,
  quantity: string,
) {
  return {
    date: date(day),
    instrumentId,
    type: "BUY" as const,
    quantity: { toString: () => quantity },
    instrument: {
      id: instrumentId,
      symbol,
      name: `${symbol} Corp`,
      currency: "USD",
    },
  };
}

function price(instrumentId: string, day: string, close: string) {
  return {
    instrumentId,
    date: date(day),
    close: { toString: () => close },
  };
}

function split(
  instrumentId: string,
  day: string,
  numerator: string,
  denominator: string,
) {
  return {
    instrumentId,
    exDate: date(day),
    numerator,
    denominator,
  };
}

async function main() {
  {
    const records = await computeMarketDayRecords({
      baseCurrency: "USD",
      fxOn: usdFx,
      trades: [trade("aaa", "AAA", "2026-01-02", "10")],
      prices: [
        price("aaa", "2026-01-01", "100"),
        price("aaa", "2026-01-02", "150"),
      ],
    });

    assert.equal(records.bestDay, null);
    assert.equal(records.worstDay, null);
  }

  {
    const records = await computeMarketDayRecords({
      baseCurrency: "USD",
      fxOn: usdFx,
      trades: [
        trade("aaa", "AAA", "2026-01-01", "10"),
        trade("bbb", "BBB", "2026-01-01", "5"),
      ],
      prices: [
        price("aaa", "2026-01-01", "100"),
        price("aaa", "2026-01-02", "110"),
        price("bbb", "2026-01-01", "200"),
        price("bbb", "2026-01-02", "190"),
      ],
    });

    assert.equal(records.bestDay?.changeBase.toString(), "50");
    assert.equal(records.bestDay?.changePercent.toString(), "2.5");
    assert.equal(records.bestDay?.contributors[0].symbol, "AAA");
    assert.equal(
      records.bestDay?.contributors[0].contributionBase.toString(),
      "100",
    );
    assert.equal(
      records.bestDay?.contributors[0].sharePercent?.toFixed(2),
      "66.67",
    );
    assert.equal(records.bestDay?.contributors[1].symbol, "BBB");
    assert.equal(
      records.bestDay?.contributors[1].contributionBase.toString(),
      "-50",
    );
  }

  {
    const records = await computeMarketDayRecords({
      baseCurrency: "USD",
      fxOn: usdFx,
      trades: [trade("ccc", "CCC", "2026-01-01", "5")],
      prices: [
        price("ccc", "2026-01-01", "50"),
        price("ccc", "2026-01-02", "45"),
      ],
    });

    assert.equal(records.worstDay?.changeBase.toString(), "-25");
    assert.equal(records.worstDay?.contributors[0].symbol, "CCC");
    assert.equal(
      records.worstDay?.contributors[0].changePercent?.toString(),
      "-10",
    );
  }

  {
    const records = await computeMarketDayRecords({
      baseCurrency: "USD",
      fxOn: usdFx,
      trades: [trade("split", "SPLT", "2026-01-01", "100")],
      prices: [
        price("split", "2026-01-01", "100"),
        price("split", "2026-01-02", "105"),
      ],
      splits: [split("split", "2026-01-02", "1", "10")],
    });

    assert.equal(records.bestDay?.changeBase.toString(), "50");
    assert.equal(
      records.bestDay?.contributors[0].contributionBase.toString(),
      "50",
    );
  }
}

main()
  .then(() => {
    console.log("market day record tests passed");
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
