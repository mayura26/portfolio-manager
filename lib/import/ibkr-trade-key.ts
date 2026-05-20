import type { ParsedTrade } from "./ibkr-csv";

export function instrumentResolutionKeyForTrade(trade: ParsedTrade): string {
  return [
    trade.symbol.trim().toUpperCase(),
    trade.currency.trim().toUpperCase(),
    trade.listingExchange?.trim().toUpperCase() ?? "",
    trade.conid?.trim() ?? "",
  ].join("|");
}
