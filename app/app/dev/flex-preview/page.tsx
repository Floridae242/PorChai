import { notFound } from "next/navigation";
import { FlexPreviewClient } from "./flex-preview-client";

export const instant = false;

export default function FlexPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <FlexPreviewClient />;
}
