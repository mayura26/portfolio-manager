export default function PortfolioOverviewPage() {
  return (
    <div className="hairline bg-surface px-6 py-12 text-center">
      <p className="label">Phase 2</p>
      <h2 className="display mt-2 text-2xl text-foreground">Holdings appear here</h2>
      <p className="mt-2 max-w-md text-sm text-muted mx-auto">
        Once trades and pricing are wired up, this page will show holdings, cost basis, and
        unrealized P&L.
      </p>
    </div>
  );
}
