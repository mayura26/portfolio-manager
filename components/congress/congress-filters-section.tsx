import { getDistinctSectors } from "@/lib/congress-trades";
import { CongressFiltersBar } from "./congress-filters-bar";
import type { CongressFilters } from "@/lib/validators";

type Props = {
  filters: CongressFilters;
};

export async function CongressFiltersSection({ filters }: Props) {
  const sectors = await getDistinctSectors();
  return <CongressFiltersBar filters={filters} sectors={sectors} />;
}
