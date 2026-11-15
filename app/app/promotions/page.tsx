import { notFound } from "next/navigation";
import { PromotionMockView } from "./promotion-mock-view";

export const instant = false;

export default function PromotionsPage() {
  // Dev-only (docs/POINTS-SYNC-AND-SPONSORS.md): the user-facing demo is /app/sponsors.
  if (process.env.NODE_ENV === "production") notFound();
  return <PromotionMockView />;
}
