// The one interface every screen uses for data. Live and mock implementations both satisfy it.
import type {
  BalanceCheckRequest,
  EditEntryRequest,
  EntriesResponse,
  EntryResponse,
  EssentialsRequest,
  NewCycleRequest,
  NewEntryRequest,
  NewPlanRequest,
  PayPlanRequest,
  PlanResponse,
  PlansResponse,
  SimulateRequest,
  SimulateResponse,
  Summary,
} from "@/lib/api-types";

export interface Promo {
  id: string;
  shop: string;
  title: string;
  price: number; // satang
  validDays: string;
  terms: string[];
  sponsored: true;
  fitsBudget: boolean | null;
  leftAfter: number | null;
}

export interface Reward {
  id: string;
  name: string;
  cost: number; // points
  stock: number;
}

export type PlanActionName = "pay" | "unpay" | "cancel" | "postpone" | "keep";

export interface PorchaiApi {
  me(): Promise<{ hasActiveCycle: boolean }>;
  createCycle(req: NewCycleRequest): Promise<{ summary: Summary }>;
  summary(): Promise<Summary>;
  entries(): Promise<EntriesResponse>;
  addEntry(req: NewEntryRequest, idempotencyKey: string): Promise<EntryResponse>;
  editEntry(id: string, req: EditEntryRequest): Promise<EntryResponse>;
  cancelEntry(id: string): Promise<EntryResponse>;
  adjustBalance(req: BalanceCheckRequest): Promise<{ summary: Summary }>;
  simulate(req: SimulateRequest): Promise<SimulateResponse>;
  setEssentials(req: EssentialsRequest): Promise<{ summary: Summary }>;
  plans(): Promise<PlansResponse>;
  addPlan(req: NewPlanRequest, idempotencyKey: string): Promise<PlanResponse>;
  planAction(id: string, action: PlanActionName, body?: PayPlanRequest): Promise<PlanResponse>;
  // Not on the backend yet: live throws ApiError('not_implemented'); mock implements them.
  consent(): Promise<{ accepted: boolean; version: string | null }>;
  acceptConsent(version: string): Promise<void>;
  points(): Promise<{ balance: number; claimedToday: boolean }>;
  claimPoints(idempotencyKey: string): Promise<{ balance: number; claimedToday: true }>;
  promos(): Promise<Promo[]>;
  promo(id: string): Promise<Promo>;
  claimPromo(id: string): Promise<{ code: string; expiresAt: string }>;
  rewards(): Promise<Reward[]>;
  redeemReward(id: string, idempotencyKey: string): Promise<{ balance: number; code: string }>;
  shopRedeem(code: string): Promise<{
    status: "redeemed" | "already_redeemed" | "invalid" | "expired";
    promoTitle?: string;
  }>;
}

export { ApiError } from "./errors";
