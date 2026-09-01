import assert from "node:assert/strict";
import { homeAssetBucketForInstrumentProfile } from "@/lib/instrument-types";

assert.equal(
  homeAssetBucketForInstrumentProfile({
    instrumentType: "ETF",
    sector: "Cash / Currency",
    industry: "Cash management ETF",
    name: "iShares Core Cash ETF",
  }),
  "income",
);

assert.equal(
  homeAssetBucketForInstrumentProfile({
    instrumentType: "OTHER",
    sector: "Gold / Commodities",
    industry: "Gold-linked structured product",
    name: "Perth Mint Gold Structured Product",
  }),
  "alternatives",
);

assert.equal(
  homeAssetBucketForInstrumentProfile({
    instrumentType: "COMMODITY",
    sector: "Gold / Commodities",
    industry: "Gold-linked structured product",
    name: "Perth Mint Gold Structured Product",
  }),
  "alternatives",
);

assert.equal(
  homeAssetBucketForInstrumentProfile({
    instrumentType: "ETF",
    sector: "Fixed Income",
    industry: "Australian bank senior floating rate bonds",
    name: "BetaShares Australian Bank Senior Floating Rate Bond ETF",
  }),
  "income",
);

assert.equal(
  homeAssetBucketForInstrumentProfile({
    instrumentType: "ETF",
    sector: "Technology",
    industry: "Software",
    name: "Normal growth ETF",
  }),
  "equities",
);

console.log("instrument type bucket tests passed");
