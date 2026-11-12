import { userIdForLine } from "@/lib/db/users";

// The webhook verified LINE's signature before calling this, so source.userId is LINE's word, not the client's.
export async function handleEvent(event: unknown): Promise<void> {
  const source = (event as { source?: { type?: unknown; userId?: unknown } } | null)?.source;
  // Only one-to-one chats belong to a user; group and room events are not anyone's account
  if (source?.type !== "user" || typeof source.userId !== "string") return;
  await userIdForLine(source.userId);
  // Layer 1 (card 09) reads the message itself here
}
