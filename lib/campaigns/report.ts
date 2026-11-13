/** Aggregate inputs only. The backend supplies deduplicated, confirmed counts. */
export type CampaignReportInput = Readonly<{
  views: number;
  claimed: number;
  redeemed: number;
  feePerRedemptionSatang: number;
  /** Total supplied costs, not an estimate of provider pricing. Omit when unknown. */
  knownCostSatang?: number;
}>;

function requireNonNegativeInteger(value: number, field: string) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative safe integer`);
  }
}

export function calculateCampaignReport(input: CampaignReportInput) {
  for (const field of ["views", "claimed", "redeemed", "feePerRedemptionSatang"] as const) {
    requireNonNegativeInteger(input[field], field);
  }
  if (input.redeemed > input.claimed) throw new Error("Redemptions cannot exceed claims");
  if (input.knownCostSatang !== undefined) requireNonNegativeInteger(input.knownCostSatang, "knownCostSatang");
  const serviceRevenueSatang = input.redeemed * input.feePerRedemptionSatang;
  if (!Number.isSafeInteger(serviceRevenueSatang)) throw new Error("Revenue exceeds safe integer precision");
  return {
    views: input.views,
    claimed: input.claimed,
    redeemed: input.redeemed,
    unredeemed: input.claimed - input.redeemed,
    serviceRevenueSatang,
    redemptionRatePercent: input.claimed === 0 ? null : (input.redeemed / input.claimed) * 100,
    knownCostSatang: input.knownCostSatang ?? null,
    contributionSatang: input.knownCostSatang === undefined ? null : serviceRevenueSatang - input.knownCostSatang,
  };
}
