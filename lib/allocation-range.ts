import Decimal from "decimal.js";

const ZERO = new Decimal(0);
const TWO = new Decimal(2);

export type AllocationRangeStatus = "on-target" | "underweight" | "overweight";

export type AllocationRangeDrift = {
  status: AllocationRangeStatus;
  driftPercent: Decimal;
  rebalanceTargetPercent: Decimal;
};

export function midpointPercent(min: Decimal, max: Decimal): Decimal {
  return min.plus(max).dividedBy(TWO);
}

export function computeRangeDrift({
  actualPercent,
  targetMinPercent,
  targetMaxPercent,
}: {
  actualPercent: Decimal;
  targetMinPercent: Decimal;
  targetMaxPercent: Decimal;
}): AllocationRangeDrift {
  if (actualPercent.lt(targetMinPercent)) {
    return {
      status: "underweight",
      driftPercent: actualPercent.minus(targetMinPercent),
      rebalanceTargetPercent: targetMinPercent,
    };
  }

  if (actualPercent.gt(targetMaxPercent)) {
    return {
      status: "overweight",
      driftPercent: actualPercent.minus(targetMaxPercent),
      rebalanceTargetPercent: targetMaxPercent,
    };
  }

  return {
    status: "on-target",
    driftPercent: ZERO,
    rebalanceTargetPercent: actualPercent,
  };
}
