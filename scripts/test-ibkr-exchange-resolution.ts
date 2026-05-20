import assert from "node:assert/strict";
import { parseIbkrCsv } from "@/lib/import/ibkr-csv";
import { parseFlexStatementXml } from "@/lib/import/ibkr-flex";
import { instrumentResolutionKeyForTrade } from "@/lib/import/ibkr-trade-key";
import {
  shouldPreferMarketSpecificInstrument,
  yahooSymbolCandidatesForRawSymbol,
} from "@/lib/instrument-symbols";

const flexWithExchange = `
<FlexStatement>
  <Trades>
    <Trade assetCategory="STK" symbol="BILL" currency="AUD" conid="12345" listingExchange="ASX" dateTime="20260102;103000" quantity="10" tradePrice="1.23" ibCommission="-1.00" tradeID="T1"/>
  </Trades>
</FlexStatement>
`;

const parsedFlex = parseFlexStatementXml(flexWithExchange);
assert.equal(parsedFlex.trades.length, 1);
assert.equal(parsedFlex.trades[0].symbol, "BILL");
assert.equal(parsedFlex.trades[0].currency, "AUD");
assert.equal(parsedFlex.trades[0].conid, "12345");
assert.equal(parsedFlex.trades[0].listingExchange, "ASX");

const legacyFlex = `
<FlexStatement>
  <Trades>
    <Trade assetCategory="STK" symbol="BILL" currency="AUD" dateTime="20260102;103000" quantity="10" tradePrice="1.23" ibCommission="-1.00" tradeID="T2"/>
  </Trades>
</FlexStatement>
`;

const parsedLegacyFlex = parseFlexStatementXml(legacyFlex);
assert.equal(parsedLegacyFlex.trades.length, 1);
assert.equal(parsedLegacyFlex.trades[0].symbol, "BILL");
assert.equal(parsedLegacyFlex.trades[0].conid, undefined);
assert.equal(parsedLegacyFlex.trades[0].listingExchange, undefined);

const csv = [
  "Trades,Header,Asset Category,Symbol,Currency,Conid,ListingExchange,Date/Time,Quantity,T. Price,Comm/Fee",
  'Trades,Data,Stocks,BILL,AUD,12345,ASX,"2026-01-02, 10:30:00",10,1.23,-1.00',
].join("\n");

const parsedCsv = parseIbkrCsv(csv);
assert.equal(parsedCsv.trades.length, 1);
assert.equal(parsedCsv.trades[0].conid, "12345");
assert.equal(parsedCsv.trades[0].listingExchange, "ASX");

assert.deepEqual(
  yahooSymbolCandidatesForRawSymbol("BILL", { currencyHint: "AUD" }),
  ["BILL.AX", "BILL"],
);
assert.deepEqual(
  yahooSymbolCandidatesForRawSymbol("BILL", { listingExchange: "ASX" }),
  ["BILL.AX", "BILL"],
);
assert.equal(
  shouldPreferMarketSpecificInstrument("BILL", { currencyHint: "AUD" }),
  true,
);
assert.equal(
  shouldPreferMarketSpecificInstrument("BILL", { listingExchange: "ASX" }),
  true,
);
assert.equal(shouldPreferMarketSpecificInstrument("BILL"), false);

const asxKey = instrumentResolutionKeyForTrade({
  symbol: "BILL",
  currency: "AUD",
  listingExchange: "ASX",
  conid: "12345",
  date: new Date("2026-01-02T10:30:00"),
  quantity: "10",
  type: "BUY",
  price: "1.23",
  fees: "1",
  externalRef: "T1",
});
const usKey = instrumentResolutionKeyForTrade({
  symbol: "BILL",
  currency: "USD",
  listingExchange: "NYSE",
  conid: "67890",
  date: new Date("2026-01-02T10:30:00"),
  quantity: "10",
  type: "BUY",
  price: "45",
  fees: "1",
  externalRef: "T2",
});
assert.notEqual(asxKey, usKey);

console.log("IBKR exchange resolution tests passed");
