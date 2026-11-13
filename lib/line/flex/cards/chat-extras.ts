import { bahtText, categoryLabel, FLEX_COLORS, formatBaht, mascotPngUrl } from "../format";
import type { FlexBox, FlexButton, FlexMessage, FlexNode, MascotPose, UserCategory } from "../types";

// Cards โฟรวิว had not drawn yet, made by Por in the same style (header with the mascot, colors,
// money formatting) so the chat can be cards (user's request 13 Nov). For โฟรวิว to review.
// Numbers come in computed; a card never calculates.

export interface CardAction {
  label: string;
  data: string; // postback data, built by the caller
  displayText?: string;
}

function header(pose: MascotPose, heading: string, sub: string, background: string): FlexBox {
  return {
    type: "box",
    layout: "horizontal",
    alignItems: "center",
    spacing: "sm",
    paddingAll: "14px",
    backgroundColor: background,
    contents: [
      { type: "image", url: mascotPngUrl(pose), size: "xxs", aspectRatio: "1:1", aspectMode: "fit" },
      {
        type: "box",
        layout: "vertical",
        flex: 1,
        contents: [
          { type: "text", text: heading, size: "md", weight: "bold", color: FLEX_COLORS.green900, wrap: true },
          { type: "text", text: sub, size: "xxs", color: FLEX_COLORS.sage500, wrap: true },
        ],
      },
    ],
  };
}

const footer = (actions: CardAction[]): FlexBox => ({
  type: "box",
  layout: "horizontal",
  spacing: "xs",
  paddingAll: "12px",
  backgroundColor: FLEX_COLORS.white,
  contents: actions.map(
    (a, i): FlexButton => ({
      type: "button",
      style: i === 0 ? "primary" : "secondary",
      ...(i === 0 && { color: FLEX_COLORS.green800 }),
      height: "sm",
      flex: 1,
      action: { type: "postback", label: a.label, data: a.data, displayText: a.displayText ?? a.label },
    }),
  ),
});

const row = (left: string, right: string, opts: { bold?: boolean; color?: string } = {}): FlexBox => ({
  type: "box",
  layout: "horizontal",
  justifyContent: "space-between",
  spacing: "sm",
  margin: "sm",
  contents: [
    { type: "text", text: left, size: "sm", color: opts.color ?? FLEX_COLORS.sage500, flex: 1, wrap: true, weight: opts.bold ? "bold" : "regular" },
    { type: "text", text: right, size: "sm", color: opts.color ?? FLEX_COLORS.green900, align: "end", flex: 0, weight: opts.bold ? "bold" : "regular" },
  ],
});

const note = (text: string, color: string = FLEX_COLORS.sage400): FlexNode => ({ type: "text", text, size: "xs", color, wrap: true, margin: "md" });

function card(alt: string, head: FlexBox, body: FlexNode[], actions: CardAction[] = []): FlexMessage {
  return {
    type: "flex",
    altText: alt,
    contents: {
      type: "bubble",
      size: "mega",
      header: head,
      body: { type: "box", layout: "vertical", paddingAll: "16px", backgroundColor: FLEX_COLORS.white, contents: body },
      ...(actions.length > 0 && { footer: footer(actions) }),
    },
  };
}

// «รับ 500»: money in, and what today looks like now
export interface IncomeCardViewModel {
  amount: number;
  balance: number;
  todayRemaining: number | null; // null when the budget is not normal (shortfall, payday passed)
  dailyBudget: number | null;
}

export function buildIncomeCard(vm: IncomeCardViewModel): FlexMessage {
  const today = vm.todayRemaining === null ? null : `วันนี้ใช้ได้อีก ${bahtText(vm.todayRemaining)}`;
  return card(
    `รับเงินแล้ว ✓ +${bahtText(vm.amount)}${today ? ` · ${today}` : ""}`,
    header("saveCoins", "รับเงินแล้ว ✓", "เพิ่มเข้าเงินที่มีแล้ว", FLEX_COLORS.lime100),
    [
      { type: "text", text: `+${bahtText(vm.amount)}`, size: "xxl", weight: "bold", color: FLEX_COLORS.green700 },
      { type: "separator", margin: "md", color: FLEX_COLORS.line200 },
      row("เงินที่มีตอนนี้", bahtText(vm.balance)),
      ...(vm.dailyBudget === null ? [] : [row("งบต่อวัน", bahtText(vm.dailyBudget))]),
      ...(today === null ? [] : [row("วันนี้ใช้ได้อีก", bahtText(vm.todayRemaining!), { bold: true })]),
    ],
  );
}

// Several spends the AI split: nothing recorded until [จดทั้งหมด]
export interface ProposalCardViewModel {
  items: { title: string; amount: number; category: UserCategory }[];
  total: number;
  overToday: { remaining: number; by: number } | null; // the total is over what is left today
  record: CardAction;
  notThis: CardAction;
}

export function buildProposalCard(vm: ProposalCardViewModel): FlexMessage {
  const rows = vm.items.map((i) => row(`${i.title} · ${categoryLabel(i.category)}`, bahtText(i.amount), { color: FLEX_COLORS.green900 }));
  return card(
    `เจอ ${vm.items.length} รายการ รวม ${bahtText(vm.total)} · จดให้เลยไหมครับ?`,
    header("thinking", `เจอ ${vm.items.length} รายการ`, "จดให้เลยไหมครับ? ยังไม่ได้จดจนกว่าจะกด", FLEX_COLORS.lime100),
    [
      ...rows,
      { type: "separator", margin: "md", color: FLEX_COLORS.line200 },
      row("รวม", bahtText(vm.total), { bold: true, color: FLEX_COLORS.green900 }),
      ...(vm.overToday
        ? [note(`เกินงบที่เหลือวันนี้ (${bahtText(vm.overToday.remaining)}) อยู่ ${bahtText(vm.overToday.by)}`, FLEX_COLORS.amber600)]
        : []),
    ],
    [vm.record, vm.notThis],
  );
}

// L6: over what is left today — held until the user says it was really paid (never decided for them)
export interface HoldCardViewModel {
  title: string;
  amount: number;
  todayRemaining: number;
  pay: CardAction;
  tryFirst: CardAction;
}

export function buildHoldCard(vm: HoldCardViewModel): FlexMessage {
  const line = `${formatBaht(vm.amount)} บาท สูงกว่างบที่เหลือวันนี้ (${bahtText(vm.todayRemaining)})`;
  return card(
    `${line} · จ่ายไปแล้ว หรืออยากลองก่อนซื้อ?`,
    header("budgetTight", "ยังไม่ได้จด", "สูงกว่างบที่เหลือวันนี้", FLEX_COLORS.amber50),
    [
      row(vm.title, bahtText(vm.amount), { bold: true, color: FLEX_COLORS.green900 }),
      row("วันนี้ใช้ได้อีก", bahtText(vm.todayRemaining)),
      note(line, FLEX_COLORS.amber600),
      note("จ่ายไปแล้ว หรืออยากลองก่อนซื้อ? กดยืนยันถึงจะจด"),
    ],
    [vm.pay, vm.tryFirst],
  );
}
