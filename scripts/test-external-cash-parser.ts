import assert from "node:assert/strict";
import { classifyExternalCashAccountKind } from "@/lib/cash-vehicles";
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
assert.equal(classifyExternalCashAccountKind(parsed.accountType), "HISA");
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

// Interest entries (Credit Interest, Bonus Interest) should map to INTEREST type.
const interestFixture = `
Created 01/06/26 09:01pm (Sydney/Melbourne time)
CommBank Transaction Summary v1.0.5
Account Number 067873 23841332
Here is your account information and a list of transactions from 01/05/26-01/06/26.
Account type GoalSaver
Date Transaction details Amount Balance
16 May 2026 Transfer from xx2394 NetBank $10,000.00 $10,000.00
01 Jun 2026 Credit Interest $4.13 $10,004.13
01 Jun 2026 Bonus Interest $78.38 $10,082.51
`;

const parsedInterest = parseCommBankTransactionSummaryText(interestFixture);
assert.equal(parsedInterest.transactions.length, 3);
assert.deepEqual(
  parsedInterest.transactions.map((tx) => [tx.type, tx.amount]),
  [
    ["DEPOSIT", "10000.0000"],
    ["INTEREST", "4.1300"],
    ["INTEREST", "78.3800"],
  ],
);
assert.equal(classifyExternalCashAccountKind("Smart Access"), "CASH");
assert.equal(classifyExternalCashAccountKind("NetBank Saver"), "HISA");

// CommBank PDFs can wrap transaction descriptions across lines; the continuation
// must stay attached to the dated row so the transfer is not skipped.
const wrappedFixture = `
Created 01/09/26 09:01pm (Sydney/Melbourne time)
CommBank Transaction Summary v1.0.5
Account Number 067873 23841332
Here is your account information and a list of transactions from 01/09/26-01/09/26.
Account type GoalSaver
Date Transaction details Amount Balance
01 Sep 2026 Transfer from xx2394 NetBank $500.00 $61,022.57
01 Sep 2026 Transfer from xx2394 CommBank app
savings $8,500.00 $69,522.57
`;

const parsedWrapped = parseCommBankTransactionSummaryText(wrappedFixture);
assert.equal(parsedWrapped.transactions.length, 2);
assert.deepEqual(
  parsedWrapped.transactions.map((tx) => [
    tx.type,
    tx.description,
    tx.amount,
    tx.balance,
  ]),
  [
    ["DEPOSIT", "Transfer from xx2394 NetBank", "500.0000", "61022.5700"],
    [
      "DEPOSIT",
      "Transfer from xx2394 CommBank app savings",
      "8500.0000",
      "69522.5700",
    ],
  ],
);

console.log("external cash parser tests passed");
