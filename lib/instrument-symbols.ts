export type SymbolCandidateOptions = {
  currencyHint?: string;
  listingExchange?: string;
  ibkrConid?: string;
};

const YAHOO_SUFFIX_BY_IBKR_LISTING_EXCHANGE: Record<string, string> = {
  ASX: "AX",
  HKG: "HK",
  HKEX: "HK",
  SEHK: "HK",
  JPX: "T",
  TSEJ: "T",
  LSE: "L",
  TSX: "TO",
  TOR: "TO",
  KSE: "KS",
  KOSDAQ: "KQ",
};

function yahooSuffixForIbkrListingExchange(
  listingExchange: string | undefined,
): string | null {
  const key = listingExchange?.trim().toUpperCase();
  if (!key) return null;
  return YAHOO_SUFFIX_BY_IBKR_LISTING_EXCHANGE[key] ?? null;
}

/**
 * Yahoo symbols to try when an upstream source gives us a local exchange
 * symbol without Yahoo's market suffix.
 */
export function yahooSymbolCandidatesForRawSymbol(
  raw: string,
  options: SymbolCandidateOptions = {},
): string[] {
  const key = raw.trim().toUpperCase();
  const currencyHint = options.currencyHint?.trim().toUpperCase();
  const listingExchangeSuffix = yahooSuffixForIbkrListingExchange(
    options.listingExchange,
  );
  const out: string[] = [];
  const add = (...symbols: string[]) => {
    for (const symbol of symbols) {
      if (symbol) out.push(symbol);
    }
  };

  if (key && !key.includes(".")) {
    if (listingExchangeSuffix) {
      add(`${key}.${listingExchangeSuffix}`, key);
    }
    if (/^\d{6}$/.test(key)) {
      if (currencyHint === "KRW") {
        add(`${key}.KS`, `${key}.KQ`, key);
      } else {
        add(key, `${key}.KS`, `${key}.KQ`);
      }
    }
    if (/^\d{4}$/.test(key)) {
      if (currencyHint === "HKD") {
        add(`${key}.HK`, key, `${key}.T`);
      } else if (currencyHint === "JPY") {
        add(`${key}.T`, key, `${key}.HK`);
      } else {
        add(key, `${key}.T`, `${key}.HK`);
      }
    }
    if (/^\d{5}$/.test(key)) {
      if (currencyHint === "HKD") {
        add(`${key}.HK`, key);
      } else {
        add(key, `${key}.HK`);
      }
    }
    if (currencyHint === "AUD") {
      add(`${key}.AX`, key);
    }
    // US and other markets: bare ticker (AAPL, VOO, ...).
    if (out.length === 0) add(key);
  } else {
    add(key);
  }
  return [...new Set(out)];
}

export function shouldPreferMarketSpecificInstrument(
  raw: string,
  options: SymbolCandidateOptions = {},
): boolean {
  const key = raw.trim().toUpperCase();
  if (!key || key.includes(".")) return false;
  const candidates = yahooSymbolCandidatesForRawSymbol(key, options);
  if (!candidates.some((candidate) => candidate !== key)) return false;
  if (yahooSuffixForIbkrListingExchange(options.listingExchange)) return true;
  return Boolean(options.currencyHint?.trim());
}
