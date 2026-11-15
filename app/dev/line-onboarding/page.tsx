import { notFound } from "next/navigation";
import { buildOnboardingCarousel } from "@/lib/line/onboarding";
import { OnboardingPreview } from "./preview";
import { fontBody, fontDisplay } from "@/app/app/fonts";
export const instant = false;
export default function OnboardingPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <div className={`${fontBody.variable} ${fontDisplay.variable}`}>
      <OnboardingPreview message={buildOnboardingCarousel()} />
    </div>
  );
}
