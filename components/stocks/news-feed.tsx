import { fetchNews } from "@/lib/yahoo";
import { formatRelative } from "@/lib/format";

type Props = {
  yahooSymbol: string;
};

export async function NewsFeed({ yahooSymbol }: Props) {
  const items = await fetchNews(yahooSymbol, 8);

  if (items.length === 0) {
    return <p className="text-sm text-muted">No recent news.</p>;
  }

  return (
    <ul className="hairline divide-y divide-border bg-surface-elevated">
      {items.map((item) => (
        <li key={item.uuid}>
          <a
            href={item.link}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-col gap-1 px-4 py-3 transition-colors hover:bg-surface"
          >
            <p className="line-clamp-2 text-sm text-foreground">{item.title}</p>
            <p className="label">
              {item.publisher} · {formatRelative(item.publishedAt)}
            </p>
          </a>
        </li>
      ))}
    </ul>
  );
}

export function NewsFeedSkeleton() {
  return (
    <div className="hairline animate-pulse bg-surface p-4">
      <div className="space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-10 bg-border" />
        ))}
      </div>
    </div>
  );
}
