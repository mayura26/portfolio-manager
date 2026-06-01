import assert from "node:assert/strict";
import { parseIbkrCsv } from "@/lib/import/ibkr-csv";
import { parseFlexStatementXml } from "@/lib/import/ibkr-flex";

// ── Flex: forex conversion + fee/interest/withholding cash events ────────────
const flex = `
<FlexStatement>
  <Trades>
    <Trade assetCategory="STK" symbol="BILL" currency="AUD" dateTime="20260102;103000" quantity="10" tradePrice="1.23" ibCommission="-1.00" tradeID="T1"/>
    <Trade assetCategory="CASH" symbol="AUD.CAD" currency="CAD" dateTime="20260103;090000" quantity="1000" tradePrice="0.9" proceeds="-900" ibCommission="-2" ibCommissionCurrency="AUD" tradeID="FX1"/>
  </Trades>
  <CashTransactions>
    <CashTransaction type="Deposits/Withdrawals" currency="AUD" dateTime="20260101;000000" amount="5000" description="Funding" transactionID="C1"/>
    <CashTransaction type="Dividends" currency="CAD" dateTime="20260104;000000" amount="12.5" description="ABC dividend" transactionID="C2"/>
    <CashTransaction type="Withholding Tax" currency="CAD" dateTime="20260104;000000" amount="-1.88" description="ABC tax" transactionID="C3"/>
    <CashTransaction type="Broker Interest Received" currency="AUD" dateTime="20260105;000000" amount="3.21" description="Interest" transactionID="C4"/>
    <CashTransaction type="Other Fees" currency="AUD" dateTime="20260106;000000" amount="-0.99" description="ADR fee" transactionID="C5"/>
  </CashTransactions>
</FlexStatement>
`;

const parsed = parseFlexStatementXml(flex);

// Only the STK trade is a trade; forex is captured as cash legs.
assert.equal(parsed.trades.length, 1, "one STK trade");

const find = (ref: string) => parsed.cashTxs.find((t) => t.externalRef === ref);

// Forex AUD.CAD: buy 1000 AUD, pay 900 CAD, 2 AUD commission.
const fxBase = find("FX1:BASE");
assert.ok(fxBase, "forex base leg exists");
assert.equal(fxBase?.type, "FX_IN");
assert.equal(fxBase?.currency, "AUD");
assert.equal(fxBase?.amount, "1000");

const fxQuote = find("FX1:QUOTE");
assert.ok(fxQuote, "forex quote leg exists");
assert.equal(fxQuote?.type, "FX_OUT");
assert.equal(fxQuote?.currency, "CAD");
assert.equal(fxQuote?.amount, "900");

const fxComm = find("FX1:COMM");
assert.ok(fxComm, "forex commission leg exists");
assert.equal(fxComm?.type, "FEE");
assert.equal(fxComm?.currency, "AUD");
assert.equal(fxComm?.amount, "-2"); // sign preserved

// New cash event types.
assert.equal(find("C1")?.type, "DEPOSIT");
assert.equal(find("C2")?.type, "DIVIDEND");
assert.equal(find("C3")?.type, "WITHHOLDING");
assert.equal(find("C3")?.amount, "-1.88");
assert.equal(find("C4")?.type, "INTEREST");
assert.equal(find("C4")?.amount, "3.21");
assert.equal(find("C5")?.type, "FEE");
assert.equal(find("C5")?.amount, "-0.99");

// ── CSV: forex + new cash sections ───────────────────────────────────────────
const csv = [
  "Trades,Header,Asset Category,Symbol,Currency,Date/Time,Quantity,T. Price,Proceeds,Comm/Fee",
  'Trades,Data,Forex,AUD.CAD,CAD,"2026-01-03, 09:00:00",1000,0.9,-900,-2',
  "Withholding Tax,Header,Currency,Date,Description,Amount",
  "Withholding Tax,Data,CAD,2026-01-04,ABC tax,-1.88",
  "Interest,Header,Currency,Date,Description,Amount",
  "Interest,Data,AUD,2026-01-05,Interest,3.21",
  "Fees,Header,Currency,Date,Description,Amount",
  "Fees,Data,AUD,2026-01-06,ADR fee,-0.99",
].join("\n");

const parsedCsv = parseIbkrCsv(csv);
const csvTypes = parsedCsv.cashTxs.map((t) => t.type).sort();
assert.deepEqual(
  csvTypes,
  // Two FEEs: the forex commission leg plus the ADR fee row.
  ["FEE", "FEE", "FX_IN", "FX_OUT", "INTEREST", "WITHHOLDING"].sort(),
  `csv cash types: got ${csvTypes.join(",")}`,
);
const adrFee = parsedCsv.cashTxs.find((t) => t.description === "ADR fee");
assert.equal(adrFee?.type, "FEE");
assert.equal(adrFee?.amount, "-0.99");

console.log("IBKR cash-events tests passed");
