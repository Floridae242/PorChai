import type { Metadata } from "next";
import { flexExamples } from "@/lib/line/flex-examples";
import { FlexPreview } from "./preview";

export const metadata: Metadata = {
  title: "พรีวิว Flex Message · พอใช้",
  robots: { index: false, follow: false },
};

export default function LineFlexPage() {
  return <FlexPreview examples={flexExamples()} />;
}
