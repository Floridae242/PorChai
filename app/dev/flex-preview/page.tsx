import { notFound } from "next/navigation";
import { fontBody, fontDisplay } from "@/app/app/fonts";
import { FlexPreviewClient } from "./flex-preview-client";

// Dev-only: 404 in production. Lives next to the other previews under /dev (line-flex, line-onboarding).
export const instant = false;

export default function FlexPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <div className={`${fontBody.variable} ${fontDisplay.variable}`}>
      <FlexPreviewClient />
    </div>
  );
}
