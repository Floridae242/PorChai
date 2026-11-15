import { notFound } from "next/navigation";
import { PromotionMockView } from "./promotion-mock-view";

export const instant = false;

export default function PromotionsPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <PromotionMockView />;
}
