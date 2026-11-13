// The new payday chosen in E1a, carried to E2 in memory only. It used to travel as ?payday=… in the URL, but
// Clarity records URLs and cannot mask them. A reload or a direct open loses it and E2 sends the user back to E1a.
let draft: string | null = null;

export function setPaydayDraft(date: string): void {
  draft = date;
}

export function getPaydayDraft(): string | null {
  return draft;
}

export function clearPaydayDraft(): void {
  draft = null;
}
