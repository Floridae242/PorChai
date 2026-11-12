import { describe, expect, it } from "vitest";
import { calculateCampaignReport } from "./report";

const sample = { views: 60, claimed: 30, redeemed: 20, feePerRedemptionSatang: 500 };

describe("campaign business report", () => {
  it("charges only confirmed redemptions: 20 × 5 baht = 100 baht", () => {
    expect(calculateCampaignReport(sample)).toEqual({
      views: 60, claimed: 30, redeemed: 20, unredeemed: 10,
      serviceRevenueSatang: 10000, redemptionRatePercent: expect.closeTo(66.6667, 3),
      knownCostSatang: null, contributionSatang: null,
    });
  });
  it("does not charge for views or claims", () => {
    expect(calculateCampaignReport({ ...sample, redeemed: 0 }).serviceRevenueSatang).toBe(0);
  });
  it("returns no conversion rate when no coupons were claimed", () => {
    expect(calculateCampaignReport({ ...sample, claimed: 0, redeemed: 0 }).redemptionRatePercent).toBeNull();
  });
  it("keeps unknown costs distinct from confirmed zero costs", () => {
    expect(calculateCampaignReport(sample).contributionSatang).toBeNull();
    expect(calculateCampaignReport({ ...sample, knownCostSatang: 0 }).contributionSatang).toBe(10000);
  });
  it("subtracts the supplied total cost and can report a loss", () => {
    expect(calculateCampaignReport({ ...sample, knownCostSatang: 12500 }).contributionSatang).toBe(-2500);
  });
  it.each([-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])("rejects invalid counts or money: %s", value => {
    expect(() => calculateCampaignReport({ ...sample, redeemed: value })).toThrow();
    expect(() => calculateCampaignReport({ ...sample, feePerRedemptionSatang: value })).toThrow();
    expect(() => calculateCampaignReport({ ...sample, knownCostSatang: value })).toThrow();
  });
  it("rejects more redemptions than claims", () => {
    expect(() => calculateCampaignReport({ ...sample, redeemed: 31 })).toThrow();
  });
  it("rejects revenue beyond safe integer precision", () => {
    expect(() => calculateCampaignReport({ ...sample, feePerRedemptionSatang: Number.MAX_SAFE_INTEGER })).toThrow();
  });
});
