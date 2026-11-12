import type { UserCategory } from "@/lib/api-types";
import type { Satang } from "@/lib/calc/money";
import type { MascotPose } from "@/components/ui/mascot";

export type { Satang, UserCategory, MascotPose };

// --- LINE Messaging API Flex / Text primitives ---

export type FlexAction =
  | { type: "postback"; label: string; data: string; displayText?: string }
  | { type: "uri"; label: string; uri: string };

export interface FlexText {
  type: "text";
  text: string;
  size?: "xxs" | "xs" | "sm" | "md" | "lg" | "xl" | "xxl" | "3xl";
  weight?: "regular" | "bold";
  color?: string;
  wrap?: boolean;
  align?: "start" | "center" | "end";
  flex?: number;
  margin?: "none" | "xs" | "sm" | "md" | "lg" | "xl";
}

export interface FlexImage {
  type: "image";
  url: string;
  size?: "xxs" | "xs" | "sm" | "md" | "lg" | "xl" | "full";
  aspectRatio?: string;
  aspectMode?: "cover" | "fit";
  flex?: number;
  animated?: boolean;
}

export interface FlexSeparator {
  type: "separator";
  margin?: "none" | "xs" | "sm" | "md" | "lg" | "xl";
  color?: string;
}

export interface FlexButton {
  type: "button";
  style?: "primary" | "secondary" | "link";
  color?: string;
  height?: "sm" | "md";
  margin?: "none" | "xs" | "sm" | "md" | "lg";
  flex?: number;
  action: FlexAction;
}

export interface FlexBox {
  type: "box";
  layout: "vertical" | "horizontal" | "baseline";
  contents: FlexNode[];
  spacing?: "none" | "xs" | "sm" | "md" | "lg";
  margin?: "none" | "xs" | "sm" | "md" | "lg" | "xl";
  paddingAll?: string;
  paddingTop?: string;
  paddingBottom?: string;
  paddingStart?: string;
  paddingEnd?: string;
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: string;
  cornerRadius?: string;
  alignItems?: "flex-start" | "center" | "flex-end";
  justifyContent?: "flex-start" | "center" | "flex-end" | "space-between";
  flex?: number;
  height?: string;
  width?: string;
}

export type FlexNode = FlexBox | FlexText | FlexImage | FlexSeparator | FlexButton;

export interface FlexBubble {
  type: "bubble";
  size?: "nano" | "micro" | "deca" | "hecto" | "kilo" | "mega";
  header?: FlexBox;
  body: FlexBox;
  footer?: FlexBox;
}

export interface QuickReply {
  items: { type: "action"; action: FlexAction }[];
}

export interface FlexMessage {
  type: "flex";
  altText: string;
  contents: FlexBubble;
  quickReply?: QuickReply;
}

export interface TextReplyMessage {
  type: "text";
  text: string;
  quickReply?: QuickReply;
}

export type LineChatMessage = FlexMessage | TextReplyMessage;

// --- ViewModels (Pure Server-Computed Data, Money in Satang) ---

export interface RecordedItemView {
  id: string;
  title: string;
  amount: Satang;
  category: UserCategory | "uncategorized";
}

export interface RecordedCardViewModel {
  entryId: string;
  /** Default "จดแล้ว ✓" or "จดย้อนหลัง · เมื่อวาน (3 พ.ย.)" */
  heading?: string;
  dateLabel?: string;
  items: RecordedItemView[];
  totalAmount: Satang;
  dailyBudget: Satang;
  spentToday: Satang;
  /** Positive or 0 when within budget; negative when over budget */
  todayRemaining: Satang;
  /** Present when todayRemaining < 0 and days remain */
  tomorrowDailyBudget?: Satang | null;
  /** Optional subtitle for backdated entries */
  subnote?: string;
  /** Pending high-amount item in multi-line C-8 */
  pendingItem?: { id: string; title: string; amount: Satang };
  /** When true (C-16b/C-16c/C-17), show 2 buttons [แก้] [ลบ] instead of 3 */
  compactActions?: boolean;
  /** When true (C-3b backdated), show [แก้รายการ] [แก้วันที่] [ลบ] */
  isBackdated?: boolean;
  appOrigin?: string;
}

export interface HabitReminderCardViewModel {
  reminderId: string;
  habitTitle: string;
  habitAmount: Satang;
  timeLabel?: string;
  appOrigin?: string;
}

export interface HabitEditAskViewModel {
  reminderId: string;
  habitTitle: string;
  habitAmount: Satang;
}

export interface HabitSkippedViewModel {
  habitTitle: string;
  todayRemaining: Satang;
  appOrigin?: string;
}

export interface AiCompareCardViewModel {
  draftId: string;
  itemTitle: string;
  amount: Satang;
  dueLabel: string;
  /** Max spendable without breaking essentials/savings; null if not set */
  maxSpendable: Satang | null;
  /** Positive satang if amount > maxSpendable, else 0 */
  overBy: Satang;
  beforeDaily: Satang;
  afterDaily: Satang;
  essentialsPerDay?: Satang | null;
  explanation?: string;
  hasMatchingPromo?: boolean;
  appOrigin?: string;
}

export interface AskDateViewModel {
  draftId: string;
  itemTitle: string;
  amount: Satang;
}

export interface TryBeforeBuyCardViewModel {
  draftId: string;
  itemTitle: string;
  amount: Satang;
  isMealToday?: boolean;
  beforeDaily: Satang;
  afterDaily: Satang;
  maxSpendable?: Satang | null;
  overBy?: Satang;
  essentialsPerDay?: Satang | null;
  billsTotal?: Satang;
  /** Optional formula line for C-6b (e.g. "(1,440 - 250) ÷ 12 วัน") */
  formulaNote?: string;
  appOrigin?: string;
}

export interface WelcomeCardViewModel {
  appOrigin?: string;
}

export interface TodayBudgetCardViewModel {
  todayRemaining: Satang;
  spentToday: Satang;
  dailyBudget: Satang;
  disposablePool: Satang;
  daysRemaining: number;
  savingsReserved: Satang;
  bufferReserved: Satang;
  appOrigin?: string;
}

export interface HowToRecordCardViewModel {
  appOrigin?: string;
}

export interface BalanceAdjustAskViewModel {
  requestId: string;
  systemBalance: Satang;
  actualBalance: Satang;
  diffAmount: Satang;
  billsReserved?: Satang;
  savingsReserved?: Satang;
  bufferReserved?: Satang;
  daysRemaining?: number;
  beforeDaily?: Satang;
  afterDaily?: Satang;
}

export interface SavingsStatusCardViewModel {
  savingsAmount: Satang;
  savingsPercent: number;
  bufferAmount: Satang;
  appOrigin?: string;
}

export interface OcrDraftCardViewModel {
  ocrId: string;
  merchantName: string;
  amount: Satang;
  dateLabel: string;
  candidateAmounts?: Satang[];
  duplicateEntry?: { id: string; title: string; amount: Satang; timeLabel: string };
  needsSlipKind?: boolean;
  appOrigin?: string;
}

export interface BillOrPaydayAlertViewModel {
  kind: "bill_due" | "payday_delayed";
  alertId: string;
  title: string;
  amount?: Satang;
  delayedDays?: number;
  appOrigin?: string;
}
