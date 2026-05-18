import assert from "node:assert/strict";
import { parseCommBankTransactionSummaryText } from "@/lib/import/external-cash-parser";

const fixture = `
Created 18/05/26 06:11pm (Sydney/Melbourne time)
Transaction Summary v1.0.5
Account Number 067873 23841332
Here is your account information and a list of transactions from 01/05/26-18/05/26.
Account type GoalSaver
Date Transaction details Amount Balance
16 May 2026 Transfer from xx2394 NetBank $10,000.00 $10,000.00
17 May 2026 Transfer from xx2394 CommBank app $10.00 $10,010.00
18 May 2026 Transfer to xx2394 CommBank app -$5.00 $10,005.00
`;

const parsed = parseCommBankTransactionSummaryText(fixture);

assert.equal(parsed.provider, "COMMBANK");
assert.equal(parsed.accountLast4, "1332");
assert.equal(parsed.accountType, "GoalSaver");
assert.equal(parsed.currency, "AUD");
assert.equal(parsed.endingBalance, "10005.0000");
assert.equal(parsed.transactions.length, 3);

assert.deepEqual(
  parsed.transactions.map((tx) => [tx.type, tx.amount, tx.balance]),
  [
    ["DEPOSIT", "10000.0000", "10000.0000"],
    ["DEPOSIT", "10.0000", "10010.0000"],
    ["WITHDRAWAL", "5.0000", "10005.0000"],
  ],
);

assert.ok(parsed.transactions.every((tx) => tx.externalRef.length === 64));
console.log("external cash parser tests passed");
