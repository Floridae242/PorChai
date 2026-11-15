import { buildOnboardingCarousel } from "@/lib/line/onboarding";
import { HelpView } from "./help-view";
export const instant = false;
export default function HelpPage() {
  return <HelpView message={buildOnboardingCarousel()} />;
}
