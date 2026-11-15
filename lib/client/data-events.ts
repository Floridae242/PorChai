import type { PorchaiApi } from "./types";
export const DATA_CHANGED = "porchai:data-changed";
const MUTATIONS = new Set<keyof PorchaiApi>([
  "createCycle",
  "addEntry",
  "editEntry",
  "cancelEntry",
  "adjustBalance",
  "changePayday",
  "setEssentials",
  "addPlan",
  "planAction",
  "claimPoints",
  "redeemReward",
  "addIncome",
  "deleteMyData",
  "saveSpendingCategory",
  "createBillSchedule",
  "updateBillSchedule",
]);
/** Session-scoped API identity keeps one account's data events out of another session. */
export function withDataEvents(api: PorchaiApi): PorchaiApi {
  const wrappers = new Map<PropertyKey, unknown>();
  const wrapped = new Proxy(api, {
    get(target, key, receiver) {
      const value = Reflect.get(target, key, receiver);
      if (
        typeof value !== "function" ||
        !MUTATIONS.has(key as keyof PorchaiApi)
      )
        return value;
      if (!wrappers.has(key))
        wrappers.set(key, async (...args: unknown[]) => {
          const result = await Reflect.apply(value, target, args);
          if (typeof window !== "undefined")
            window.dispatchEvent(
              new CustomEvent(DATA_CHANGED, {
                detail: { api: wrapped, reset: key === "deleteMyData" },
              }),
            );
          return result;
        });
      return wrappers.get(key);
    },
  });
  return wrapped;
}
