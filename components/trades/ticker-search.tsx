"use client";

import { Search, X } from "lucide-react";
import { useEffect, useId, useRef, useState, useTransition } from "react";

type Hit = {
  yahooSymbol: string;
  symbol: string;
  exchange: string;
  name: string;
  quoteType: string;
};

type Props = {
  name: string;
  defaultYahooSymbol?: string;
  defaultDisplayLabel?: string;
  onSelect?: (hit: Hit) => void;
};

export function TickerSearch({
  name,
  defaultYahooSymbol,
  defaultDisplayLabel,
  onSelect,
}: Props) {
  const inputId = useId();
  const [query, setQuery] = useState(
    defaultDisplayLabel ?? defaultYahooSymbol ?? "",
  );
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(
    defaultYahooSymbol ?? null,
  );
  const [isSearching, startSearch] = useTransition();
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!query || query.trim().length < 1) {
      setHits([]);
      return;
    }
    if (
      selected &&
      (defaultDisplayLabel === query || defaultYahooSymbol === query)
    ) {
      return;
    }

    const controller = new AbortController();
    const t = setTimeout(() => {
      startSearch(async () => {
        try {
          const res = await fetch(
            `/api/stocks/search?q=${encodeURIComponent(query)}`,
            {
              signal: controller.signal,
            },
          );
          if (!res.ok) return;
          const data = (await res.json()) as { results: Hit[] };
          setHits(data.results);
          setOpen(true);
        } catch {
          // ignored
        }
      });
    }, 200);

    return () => {
      controller.abort();
      clearTimeout(t);
    };
  }, [query, selected, defaultDisplayLabel, defaultYahooSymbol]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, []);

  function pick(hit: Hit) {
    setSelected(hit.yahooSymbol);
    setQuery(`${hit.symbol} — ${hit.name}`);
    setOpen(false);
    onSelect?.(hit);
  }

  function clear() {
    setSelected(null);
    setQuery("");
    setHits([]);
  }

  return (
    <div ref={containerRef} className="relative">
      <input type="hidden" name={name} value={selected ?? ""} />

      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle"
          strokeWidth={1.5}
          aria-hidden
        />
        <input
          id={inputId}
          type="text"
          autoComplete="off"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(null);
          }}
          onFocus={() => hits.length > 0 && setOpen(true)}
          placeholder="Search ticker or company name"
          className="hairline w-full bg-surface px-9 py-2 text-sm text-foreground"
        />
        {selected ? (
          <button
            type="button"
            onClick={clear}
            aria-label="Clear selection"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-subtle hover:bg-border hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
        ) : null}
      </div>

      {selected ? (
        <p className="mt-1 text-xs text-subtle">
          Selected: <span className="tabular text-muted">{selected}</span>
        </p>
      ) : isSearching ? (
        <p className="mt-1 text-xs text-subtle">Searching…</p>
      ) : null}

      {open && hits.length > 0 ? (
        <ul className="hairline absolute z-20 mt-1 max-h-80 w-full overflow-auto bg-surface-elevated shadow-md">
          {hits.map((hit) => (
            <li key={hit.yahooSymbol}>
              <button
                type="button"
                onClick={() => pick(hit)}
                className="flex w-full items-baseline justify-between gap-3 border-b border-border px-3 py-2 text-left transition-colors last:border-b-0 hover:bg-surface"
              >
                <div className="min-w-0">
                  <p className="text-sm text-foreground">
                    <span className="tabular font-medium">{hit.symbol}</span>{" "}
                    <span className="text-muted"> · {hit.name}</span>
                  </p>
                  <p className="label">
                    {hit.exchange || hit.quoteType} · {hit.yahooSymbol}
                  </p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
