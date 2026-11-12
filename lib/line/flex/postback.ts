/**
 * Shared contract between Frontend Flex Card builders and Backend webhook dispatcher.
 * Format: `v1.<action>.<id>` (or `v1.<action>.<id>.<extra>`), max 300 chars per LINE limit.
 */

export const POSTBACK_ACTIONS = [
  // C1: Habit reminder (C-16)
  "rem_yes",
  "rem_edit",
  "rem_skip",
  "rem_edit_cancel",
  // C1: Recorded entry actions (C-3, C-4, C-8, C-3b)
  "entry_edit",
  "entry_date",
  "entry_cat",
  "entry_cat_set",
  "entry_del",
  "entry_del_ok",
  "entry_undo_del",
  // C2: Try before buy / Ask AI (C-6, C-7, C-18, C-18b)
  "keep_plan",
  "pay_real",
  "postpone_next",
  "try_other",
  "try_cancel",
  "ask_date_today",
  "ask_date_tomorrow",
  "ask_date_fri",
  // C3: Rich Menu & Clarify/Adjust (C-5, C-9, C-10, C-14, C-15)
  "menu_record",
  "menu_try",
  "menu_today",
  "menu_perks",
  "menu_app",
  "bal_adjust_ask",
  "bal_adjust_ok",
  "bal_adjust_no",
  // C4: OCR & Bill alerts (C-16d, C-17, C-17b)
  "ocr_save",
  "ocr_edit",
  "ocr_cancel",
  "ocr_pick_amount",
  "ocr_kind_expense",
  "ocr_kind_income",
  "ocr_kind_transfer",
  "bill_paid",
] as const;

export type PostbackAction = (typeof POSTBACK_ACTIONS)[number];

export interface DecodedPostback {
  version: "v1";
  action: PostbackAction;
  id: string;
  extra?: string;
}

const ACTION_SET = new Set<string>(POSTBACK_ACTIONS);
const SAFE_SEGMENT = /^[A-Za-z0-9_-]{1,80}$/;

export function encodePostback(
  action: PostbackAction,
  id: string,
  extra?: string,
): string {
  if (!ACTION_SET.has(action)) {
    throw new Error(`Invalid postback action: ${action}`);
  }
  if (!SAFE_SEGMENT.test(id)) {
    throw new Error(`Invalid postback id "${id}": must match ${SAFE_SEGMENT}`);
  }
  if (extra !== undefined && !SAFE_SEGMENT.test(extra)) {
    throw new Error(`Invalid postback extra "${extra}": must match ${SAFE_SEGMENT}`);
  }
  const encoded = extra === undefined ? `v1.${action}.${id}` : `v1.${action}.${id}.${extra}`;
  if (encoded.length > 300) {
    throw new RangeError(`Postback data exceeds 300 chars (${encoded.length})`);
  }
  return encoded;
}

export function decodePostback(raw: string): DecodedPostback | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 300) {
    return null;
  }
  const parts = raw.split(".");
  if (parts.length !== 3 && parts.length !== 4) {
    return null;
  }
  const [version, action, id, extra] = parts;
  if (version !== "v1") return null;
  if (!ACTION_SET.has(action)) return null;
  if (!SAFE_SEGMENT.test(id)) return null;
  if (extra !== undefined && !SAFE_SEGMENT.test(extra)) return null;

  return {
    version: "v1",
    action: action as PostbackAction,
    id,
    ...(extra !== undefined ? { extra } : {}),
  };
}
