import type { SimulateResponse } from "@/lib/api-types";
import { tryOut } from "@/lib/calc/budget";
import { heldThisCycle, reservedTotal, setAsideFits } from "@/lib/calc/inputs";
import { basisOf, loadBudget } from "@/lib/db/budget";
import { HttpError } from "@/lib/http";
import { invalid, SET_ASIDE_OVER, type Trial } from "@/lib/validate";

// Card 14: read-only. Builds a what-if input from the same loader as the summary; writes nothing.
export async function simulate(userId: string, trial: Trial, now = new Date()): Promise<SimulateResponse> {
  const { input, plans, cycle } = await loadBudget(userId, now);
  // Card 23: with payday moved, plans due before the new payday are this cycle's
  const payday = trial.payday ?? cycle.payday;
  const held = plans.filter((p) => heldThisCycle({ status: p.status, dueOn: p.due_on }, payday));
  const postponed = trial.postponePlanIds.map((id) => {
    const plan = held.find((p) => p.id === id);
    // Someone else's plan gets the same answer as one that holds nothing
    if (!plan) throw new HttpError(422, "invalid_input", "แผนที่จะลองเลื่อนไม่ได้กันเงินอยู่ในรอบนี้");
    return plan;
  });
  const kept = held.filter((p) => !postponed.includes(p));

  const countsThisCycle = trial.dueOn === null || trial.dueOn <= payday;
  // An answer (essentials) counts before and after; a change (buffer) only after
  const essentials = trial.essentials;
  const tried = essentials ? { ...input, essentialPerDay: essentials.food + essentials.transport } : input;
  // Card 19 / 15: what if part of the buffer were used (or more set aside)
  const emergencyBuffer = trial.emergencyBuffer ?? input.emergencyBuffer;
  const balance = trial.balance ?? input.balance;
  if (!setAsideFits(balance, input.savings, emergencyBuffer)) throw invalid(SET_ASIDE_OVER);
  const result = tryOut(tried, {
    buy: countsThisCycle ? trial.amount : 0,
    release: postponed.reduce((sum, p) => sum + p.amount, 0),
    emergencyBuffer,
    balance,
    ...(trial.payday !== null && {
      payday,
      reserved: reservedTotal(
        plans.map((p) => ({ amount: p.amount, status: p.status, dueOn: p.due_on })),
        payday,
      ),
    }),
  });

  const sum = (kind: "bill" | "purchase") => kept.filter((p) => p.kind === kind).reduce((s, p) => s + p.amount, 0);
  const after = result.after;
  return {
    basis: basisOf(input),
    ...result,
    countsThisCycle,
    checks:
      after === null
        ? null
        : {
            bills: sum("bill"),
            billsCovered: after.kind === "ok",
            essentialPerDay: tried.essentialPerDay!,
            essentialsCovered: after.kind === "ok" && after.essentialShortPerDay === 0,
            savings: tried.savings,
            emergencyBuffer,
            otherPlans: sum("purchase"),
          },
  };
}
