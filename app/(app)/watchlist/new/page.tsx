import Link from "next/link";
import { addToWatchlist } from "@/actions/watchlist";
import { AddWatchlistForm } from "@/components/watchlist/add-watchlist-form";

export default function NewWatchlistItemPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <nav className="label mb-6">
        <Link href="/watchlist" className="text-muted hover:text-foreground">
          Watchlist
        </Link>{" "}
        / Add
      </nav>
      <header className="mb-8 border-b border-border pb-6">
        <h1 className="display text-4xl text-foreground">Add to watchlist</h1>
        <p className="mt-2 max-w-prose text-sm text-muted">
          Track a stock and get alerted when it falls into your target buy zone.
        </p>
      </header>

      <AddWatchlistForm action={addToWatchlist} />
    </div>
  );
}
