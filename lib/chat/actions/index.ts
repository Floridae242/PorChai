import { randomUUID } from "node:crypto";
import { addDays, thaiDate } from "@/lib/calc/time";
import { formatThaiDate } from "@/lib/format/date";
import { editReplyAmount, isCorrectionReply, looksLikeAmountReply } from "@/lib/chat/correction";
import { formatBaht } from "@/lib/format/money";
import {
  text,
  type ReplyMessage,
  type QuickReplyAction,
} from "@/lib/line/reply";
import { appUrl } from "@/lib/liff/config";
import { HttpError } from "@/lib/http";
import {
  commandPendingFor,
  recentChat,
  remember,
  type Pending,
} from "@/lib/db/chat-memory";
import { recordEvent, completeEvent, forgetEvent } from "@/lib/db/line-events";
import { loadReport } from "@/lib/db/reports";
import { searchEntries } from "@/lib/db/entry-search";
import {
  getNotificationPreferences,
  saveNotificationPreferences,
} from "@/lib/db/notifications";
import { getReminderSettings, saveReminderSettings } from "@/lib/db/reminders";
import {
  listEntries,
  entryForChat,
  editEntry,
  cancelEntry,
} from "@/lib/db/entries";
import { listPlans, addPlan, actOnPlan } from "@/lib/db/plans";
import {
  pointsState,
  claimDailyPoints,
  listRewards,
  redeemReward,
} from "@/lib/db/rewards";
import {
  loadSummary,
  loadBudget,
  requireBasis,
  basisOf,
} from "@/lib/db/budget";
import {
  createCycle,
  setBuffer,
  setEssentials,
  setPayday,
} from "@/lib/db/cycle";
import { recordBalanceCheck } from "@/lib/db/balance";
import {
  parseNewPlan,
  parseNewCycle,
  parseBufferChange,
  parseEssentials,
  parsePaydayChange,
  parseBalanceCheck,
  parseEntryPatch,
  parseReminderSettings,
} from "@/lib/validate";
import { categoryOf, parseExpense } from "@/lib/chat/parse";
import { reportCard } from "@/lib/chat/cards";
import { CATEGORY_LABELS, miniAppUrl } from "@/lib/line/flex/format";
import { commandText, parseIntent, statedDate, statedMoney } from "./parse";
import { inferReadIntent } from "./infer";
import { sponsorCarousel } from "@/lib/line/sponsor-card";
import { INSTALLMENT_HELP, installmentSchedule, parseInstallment } from "./installments";
import { guideCard } from "@/lib/line/flex/guide-specs";
import { buildActionList } from "@/lib/line/flex/cards/action-list";
import { addInstallments } from "@/lib/db/installments";
import { isBalanceQuestion, isEnoughQuestion, isPaydayQuestion, isQuestion } from "@/lib/advice/question";
import { simulatePurchase } from "@/lib/calc/budget";
import { spendingInsights } from "@/lib/db/spending-insights";
import { spendingCategories,saveSpendingCategory } from "@/lib/db/spending-categories";
import { suggestSpending } from "@/lib/ai/spending-suggestions";
import { addEntry } from "@/lib/db/entries";
import { createBillSchedule } from "@/lib/db/bills";
import { parseBillSchedule } from "@/lib/bills/calendar";
import { parseNewEntry } from "@/lib/validate";
import { categoryCommand } from "./personal-categories";
import { splitExplicitExpenses } from "@/lib/chat/multi-expense";
import type {
  ActionPending,
  CommandPending,
  Intent,
  ListPending,
  Mutation,
  SetupPending,
} from "./types";

interface Answer {
  message: ReplyMessage;
  pending?: Pending;
  heading?:string;
}
const say = (
  body: string,
  pending?: ActionPending,
  actions: QuickReplyAction[] = [],
  heading?:string,
): Answer => ({ message: text(body, actions), pending,heading });
const money = (n: number) => `${formatBaht(n)} บาท`;
const action = (label: string, data: string): QuickReplyAction => ({
  type: "postback",
  label,
  data,
  displayText: label,
});
// «ทำอะไรได้»: a short menu card (was a 14-line text); the rest is one tap away in the guide topics
const helpAnswer = (): Answer => ({ message: guideCard("what-can-do")! });
const expired = () => say("คำขอนี้หมดอายุหรือไม่ใช่ของบัญชีนี้แล้วครับ พิมพ์คำสั่งใหม่ได้เลย");

async function preview(
  userId: string,
  label: string,
  mutation: Mutation,
  seenBasis?: string,
): Promise<Answer> {
  const basis =
    seenBasis ??
    ([
      "balance",
      "buffer",
      "payday",
      "essentials",
      "plan_add",
      "installments",
      "plan_action",
      "entry_edit",
      "entry_delete",
    ].includes(mutation.op)
      ? (await loadSummary(userId)).basis
      : undefined);
  const p: CommandPending = {
    kind: "chat_command",
    key: randomUUID(),
    action: mutation,
    basis,
  };
  if (mutation.op === "notifications") {
    const value = mutation.value;
    return { pending: p, message: buildActionList({
      title: "ตรวจการแจ้งเตือน", subtitle: `เวลาสรุป ${value.time} น. (เวลาไทย)\nยังไม่เปลี่ยนค่า · ตรวจแล้วกดยืนยันครับ`, icon: "bell",
      rows: [
        { title: "สรุปรายวัน", value: value.daily ? "เปิด" : "ปิด" },
        { title: "สรุปรายเดือน", value: value.monthly ? "เปิด" : "ปิด" },
        { title: "เตือนงบ", value: value.budget ? "เปิด" : "ปิด", icon: "wallet" },
      ],
      actions: [action("ยืนยัน", `pc:yes:${p.key}`), action("ยกเลิก", `pc:no:${p.key}`)],
    }) };
  }
  return say(
    `${label}\nยังไม่ได้เปลี่ยนข้อมูลครับ ตรวจแล้วกด “ยืนยัน” ได้เลย`,
    p,
    [action("ยืนยัน", `pc:yes:${p.key}`), action("ยกเลิก", `pc:no:${p.key}`)],
    "ตรวจข้อมูลก่อนยืนยัน",
  );
}
const equal = (a: object, b: object) =>
  Object.keys(a).length === Object.keys(b).length &&
  Object.entries(a).every(
    ([key, value]) => value === (b as Record<string, unknown>)[key],
  );
const stale = () =>
  new HttpError(409, "stale", "ข้อมูลเปลี่ยนไปแล้วครับ พิมพ์คำสั่งใหม่เพื่อตรวจยอดก่อนยืนยัน");

async function execute(userId: string, p: CommandPending): Promise<string> {
  const a = p.action,
    today = thaiDate(new Date());
  if (p.basis && a.op !== "installments")
    requireBasis(await loadBudget(userId), p.basis);
  switch (a.op) {
    case "bill_schedule_add": {
      const bill = await createBillSchedule(userId, a.input, `chat-bill:${p.key}`);
      return `สร้างบิลประจำ ${bill.title} ${money(bill.amount)} แล้วครับ\nครบกำหนดทุกวันที่ ${Number(bill.startsOn.slice(8))} ของเดือน เริ่ม ${bill.startsOn}\nยังไม่ได้จดเป็นรายจ่ายครับ เปิดดูและปรับบิลได้ที่ “บิลประจำ” ในแอป`;
    }
    case "category_save": {const c=await saveSpendingCategory(userId,a.input);return `บันทึกหมวด ${c.label} · ${c.monthlyBudget===null?"ยังไม่ตั้งงบ":`${money(c.monthlyBudget)} ต่อเดือน`} แล้วครับ งบนี้ใช้ติดตามรายจ่าย ไม่ได้เพิ่มเงินที่ใช้ได้`;}
    case "category_entry": {const {entry}=await addEntry(userId,parseNewEntry(a.input,today),`chat-category:${p.key}`,"chat");return `จด ${entry.note ?? "รายจ่าย"} ${money(entry.amount)} ในหมวดที่เลือกแล้วครับ จดวันนี้ได้รับแต้มอัตโนมัติวันละ 1 แต้ม`;}
    case "installments": {
      if (!p.basis) throw stale();
      await addInstallments(userId, a.input, p.key, p.basis);
      return `สร้างบิลผ่อน ${a.input.title} ${a.input.count} งวด รวม ${money(a.input.total)} แล้วครับ ยังไม่ลงรายจ่ายจนกว่าจะยืนยันจ่ายแต่ละบิล พิมพ์ ดูแผน เพื่อเลือกจ่ายได้เลย`;
    }
    case "plan_add": {
      const r = await addPlan(
        userId,
        parseNewPlan({
          ...a.input,
          category: a.input.kind === "bill" ? null : a.input.category,
        }),
        `chat:${p.key}`,
      );
      return `เพิ่ม${r.plan.kind === "bill" ? "บิล" : "แผน"} ${r.plan.title} ${money(r.plan.amount)} แล้วครับ`;
    }
    case "notifications": {
      if (!equal(await getNotificationPreferences(userId), a.previous))
        throw stale();
      await saveNotificationPreferences(userId, a.value);
      return "บันทึกการตั้งค่าแล้วครับ\nการส่งข้อความขึ้นอยู่กับบริการแจ้งเตือน และต้องเป็นเพื่อนกับน้องพอใช้อยู่ครับ";
    }
    case "reminders": {
      const current = await getReminderSettings(userId);
      if (
        ["enabled", "time", "pausedUntil"].some(
          (k) =>
            current[k as keyof typeof a.previous] !==
            a.previous[k as keyof typeof a.previous],
        )
      )
        throw stale();
      await saveReminderSettings(
        userId,
        parseReminderSettings({
          enabled: a.enabled,
          time: a.time,
          pausedUntil: a.previous.pausedUntil,
        }),
      );
      return "บันทึกการเตือนจดแล้วครับ";
    }
    case "balance":
      await recordBalanceCheck(
        userId,
        parseBalanceCheck({ balance: a.amount, basis: p.basis }, new Date()),
      );
      return `ปรับยอดเงินจริงเป็น ${money(a.amount)} แล้ว ไม่ได้สร้างรายจ่ายครับ`;
    case "buffer":
      await setBuffer(
        userId,
        parseBufferChange({ amount: a.amount, previous: a.previous }),
      );
      return `ตั้งเงินเผื่อ ${money(a.amount)} แล้วครับ`;
    case "payday":
      await setPayday(
        userId,
        parsePaydayChange({ payday: a.date, basis: p.basis }, today),
      );
      return `เปลี่ยนวันรับเงินเป็น ${a.date} แล้วครับ`;
    case "essentials":
      await setEssentials(userId, parseEssentials(a));
      return `ตั้งค่าอาหาร ${money(a.food)} และเดินทาง ${money(a.transport)} ต่อวันแล้วครับ`;
    case "entry_edit":
    case "entry_delete": {
      const current = await entryForChat(userId, a.id);
      if (current.cancelled || !equal(current.entry, a.expected)) throw stale();
      if (a.op === "entry_edit") {
        await editEntry(
          userId,
          a.id,
          parseEntryPatch({ amount: a.amount }, today),
        );
        return `แก้ยอด ${a.expected.note ?? "รายการ"} เป็น ${money(a.amount)} แล้วครับ`;
      }
      await cancelEntry(userId, a.id);
      return `ยกเลิกรายการ ${a.expected.note ?? "รายจ่าย"} แล้วครับ`;
    }
    case "plan_action": {
      const plan = (await listPlans(userId)).find((x) => x.id === a.id);
      if (
        !plan ||
        plan.amount !== a.expected.amount ||
        plan.status !== a.expected.status ||
        plan.title !== a.expected.title
      )
        throw stale();
      const result = await actOnPlan(
        userId,
        a.id,
        a.action,
        plan.category ?? "other",
        today,
      );
      return `อัปเดต ${result.title} ${money(result.amount)} แล้ว · ${statusText(result.status)}`;
    }
    case "redeem": {
      const reward = (await listRewards()).find((x) => x.id === a.id);
      if (!reward || reward.cost !== a.cost || reward.name !== a.title)
        throw stale();
      const result = await redeemReward(userId, a.id, `chat:${p.key}`);
      return `แลก ${a.title} แล้ว รหัส ${result.code}\nเหลือ ${result.balance} แต้ม`;
    }
    case "cycle":
      await createCycle(
        userId,
        parseNewCycle(a.input, today, new Date()),
        today,
      );
      return "เริ่มรอบเงินแล้วครับ พิมพ์รายรับ รายจ่าย หรือถามงบได้เลย ยอดตั้งต้นไม่ใช่รายรับที่บันทึกซ้ำ";
    default:
      throw new HttpError(422, "invalid_input", "คำสั่งนี้ไม่รองรับครับ");
  }
}

async function confirm(
  userId: string,
  p: CommandPending,
  yes: boolean,
): Promise<Answer> {
  if (p.closed) return say("คำขอนี้จบแล้วครับ ไม่ได้ทำซ้ำ");
  const id = `chat-command:${userId}:${p.key}`,
    owner = randomUUID();
  if (!(await recordEvent(id, owner))) return say("คำขอนี้จบแล้วครับ ไม่ได้ทำซ้ำ");
  let result: string;
  let rejected=false;
  try {
    result = yes ? await execute(userId, p) : "ยกเลิกคำขอแล้วครับ";
  } catch (error) {
    if (!(error instanceof HttpError) || error.status >= 500) {
      await forgetEvent(id, owner);
      throw error;
    }
    result = error.message;
    rejected=true;
  }
  // Persist closure before replying, including cancellation; a different webhook cannot replay it.
  await remember(userId, [
    { role: "bot", body: result, pending: { ...p, closed: true } },
  ]);
  await completeEvent(id, owner);
  return say(result, { ...p, closed: true },[],rejected?"ตรวจคำขออีกครั้ง":yes?"ผลการทำรายการ":"ยกเลิกคำขอ");
}

function ask(
  intent: Intent,
  field: "amount" | "date" | "title" | "food" | "transport" | "time",
): Answer {
  if (field === "amount" && intent.tool === "add_bill" && intent.repeat === "monthly") {
    return say(`บิล${intent.title ? ` ${intent.title}` : ""}${intent.date ? ` · ครบกำหนดทุกวันที่ ${Number(intent.date.slice(8))} ของเดือน` : ""}\nจำนวนกี่บาทต่อเดือนครับ? เช่น 399 บาท\nน้องพอใช้ยังไม่ได้สร้างบิลหรือหักเงินครับ`, { kind: "chat_form", intent, field }, [], "สร้างบิลประจำ");
  }
  const prompts = {
    amount: "จำนวนกี่บาทครับ? พิมพ์ยอดที่แน่นอน เช่น 500",
    date: "วันที่เท่าไหร่ครับ? ใช้ YYYY-MM-DD เช่น 2026-12-01",
    title: "ชื่อรายการอะไรครับ?",
    food: "กันค่าอาหารวันละกี่บาทครับ? ใส่ 0 ได้",
    transport: "กันค่าเดินทางวันละกี่บาทครับ? ใส่ 0 ได้",
    time: "แจ้งเตือนเวลาไหนครับ? เช่น 20:00",
  };
  return say(prompts[field], { kind: "chat_form", intent, field });
}

async function retireEdit(userId: string, pending: CommandPending): Promise<void> {
  await remember(userId, [{ role: "bot", body: "เปลี่ยนคำขอแก้รายการก่อนยืนยัน", pending: { ...pending, closed: true } }]);
}

async function choose(
  userId: string,
  type: ListPending["type"],
  intent?: Intent,
  page = intent?.page ?? 1,
): Promise<Answer> {
  if (!Number.isSafeInteger(page) || page < 1 || page > 100)
    return say("เลือกหน้ารายการ 1–100 ครับ เช่น ดูแผน หน้า 2");
  const rows: ListPending["items"] =
    type === "entry"
      ? (await listEntries(userId))
          .slice((page - 1) * 10, page * 10)
          .map((e) => ({
            id: e.id,
            title: e.note ?? "รายจ่าย",
            amount: e.amount,
          }))
      : type === "plan"
        ? (await listPlans(userId))
            .slice((page - 1) * 10, page * 10)
            .map((p) => ({
              id: p.id,
              title: p.title,
              amount: p.amount,
              status: p.status,
            }))
        : (await listRewards()).slice((page - 1) * 10, page * 10).map((r) => ({
            id: r.id,
            title: r.name,
            amount: r.cost,
            status: `เหลือ ${r.stock}`,
          }));
  if (!rows.length)
    return say(
      type === "reward" ? "ยังไม่มีของรางวัลที่เปิดให้แลกครับ" : "ยังไม่มีรายการในรอบนี้ครับ",
    );
  const target =
    intent?.target === "latest"
      ? rows[0]
      : typeof intent?.target === "number"
        ? rows[intent.target - 1]
        : undefined;
  if (target && intent) return run(userId, { ...intent, selected: target });
  const p: ListPending = {
    kind: "chat_list",
    key: randomUUID(),
    type,
    items: rows,
    purpose: intent,
    page,
  };
  const picks = rows.map((_, index) => action(`เลือก ${index + 1}`, `pc:pick:${p.key}:${index}`));
  const nextQuery = type === "plan" ? "ดูแผน" : type === "entry" ? "ดูรายการ" : "ดูของรางวัล";
  return { pending: p, message: {
    ...buildActionList({
      title: type === "reward" ? "ของรางวัล" : type === "plan" ? "แผนและบิล" : "รายจ่ายล่าสุด",
      subtitle: `หน้า ${page} · แตะรายการเพื่อ${intent ? "ทำต่อ" : "ดูรายละเอียด"}ครับ`,
      icon: type === "reward" ? "gift-box" : type === "plan" ? "budget-calendar" : "receipt",
      rows: rows.map((row, index) => ({ title: `${index + 1}. ${row.title}`,
        detail: `${type === "reward" ? `${row.amount} แต้ม` : money(row.amount)}${row.status ? ` · ${statusText(row.status)}` : ""}`,
        ...(type === "plan" ? { icon: row.status === "paid" ? "check" as const : row.status === "postponed" ? "clock" as const : "receipt" as const } : {}),
        action: picks[index],
      })),
      ...(rows.length === 10 && page < 100 ? { actions: [{ type: "message" as const, label: "หน้าถัดไป", text: `${nextQuery} หน้า ${page + 1}` }] } : {}),
    }),
    quickReply: { items: picks.map(action => ({ type: "action" as const, action })) },
  } };
}

const FEATURE_HEADINGS:Partial<Record<Intent["tool"],string>>={help:"เมนูช่วยเหลือ",setup:"เริ่มรอบเงิน",insights:"วิเคราะห์การใช้เงิน",categories:"หมวดและงบ",category_save:"หมวดและงบ",category_entry:"จดเข้าหมวด",installments:"แผนผ่อนสินค้า",report:"รายงานการใช้เงิน",search:"ค้นรายจ่าย",web:"ค้นเว็บพร้อมอ้างอิง",points:"แต้มของฉัน",claim_points:"เช็กแผนและแต้ม",entries:"รายการที่จด",plans:"แผนและบิล",rewards:"ของรางวัล",promos:"โปรตัวอย่าง",notifications:"สรุปและเตือนงบ",reminders:"เตือนจดรายการ",balance:"ปรับยอดเงินจริง",buffer:"เงินเผื่อ",payday:"วันรับเงิน",essentials:"ค่าใช้จ่ายจำเป็น",entry_edit:"แก้ไขรายการ",entry_delete:"ยกเลิกรายการ",plan_action:"จัดการแผน"};
async function run(userId:string,i:Intent):Promise<Answer>{
  const answer=await runFeature(userId,i);
  return {...answer,heading:answer.heading??FEATURE_HEADINGS[i.tool]};
}
async function runFeature(userId: string, i: Intent): Promise<Answer> {
  switch (i.tool) {
    case "categories": {const rows=await spendingCategories(userId);return say(`หมวดและงบรายเดือน\n${rows.slice(0,15).map(c=>`${c.label} (${CATEGORY_LABELS[c.parent]}) · ${c.monthlyBudget===null?"ยังไม่ตั้งงบ":money(c.monthlyBudget)}`).join("\n")}\nตั้งงบ อาหาร 2000 บาท\nเพิ่มหมวด ชานม กลุ่ม อาหาร งบ 500 บาท\nจด ชานม 50 หมวด ชานม\nหมวดหลักรวมหมวดย่อยแล้ว อย่านำยอดมาบวกซ้ำ`);}
    case "category_save": case "category_entry": {
      const result=await categoryCommand(userId,i.query??"",i.tool);
      return preview(userId,result.label,result.mutation);
    }
    case "insights": {
      const data=await spendingInsights(userId);
      const ai=/^AI\s*(?:แนะนำ|วิเคราะห์)/iu.test(i.query??"")?await suggestSpending(data):undefined;
      return say(`วิเคราะห์รายการที่จด ${formatThaiDate(data.from, "short")} – ${formatThaiDate(addDays(data.until, -1), "short")}\n${data.observations.slice(0,6).join("\n")}\n${data.suggestions.slice(0,3).map(s=>`จุดเริ่มงบ ${s.label}: ${money(s.amount)} จากยอดเดือนนี้ ยังไม่ใช่ประมาณการเต็มเดือน`).join("\n")}\n${ai??""}\nใช้ ตั้งงบ ชื่อหมวด จำนวนบาท เพื่อปรับหลังตรวจแผน หรือพิมพ์ AI วิเคราะห์ เพื่อขอคำแนะนำเพิ่มเติม`);
    }
    case "installments": {
      const raw = i.query ?? "",
        question = isQuestion(raw);
      const input = parseInstallment(
        raw.replace(
          /\s*(?:ไหวไหม|พอไหม|ได้ไหม|ควรไหม|[?？])(?:ครับ|ค่ะ)?\s*$/u,
          "",
        ),
        thaiDate(new Date()),
      );
      const schedule = installmentSchedule(input, thaiDate(new Date()));
      const loaded = await loadBudget(userId),
        payday = loaded.input.payday;
      const held = schedule
        .filter((s) => s.dueOn <= payday)
        .reduce((sum, s) => sum + s.amount, 0);
      const details = `${input.title} · ${input.count} งวดรายเดือน · ยอดรวมที่ต้องจ่าย ${money(input.total)}\n${schedule
        .slice(0, 6)
        .map((s) => `${s.dueOn} · ${money(s.amount)}`)
        .join(
          "\n",
        )}${schedule.length > 6 ? `\n… งวดสุดท้าย ${schedule.at(-1)!.dueOn} · ${money(schedule.at(-1)!.amount)}` : ""}\nกันเงินเพิ่มในรอบนี้ ${money(held)} ตามวันรับเงิน ${payday}\nบิลที่ยังไม่จ่ายย้ายไปรอบถัดไป ไม่มีการตัดเงินหรือชำระให้ร้านอัตโนมัติ และยังสรุปไม่ได้ว่าจะผ่อนไหวทุกเดือน`;
      const projected = simulatePurchase(loaded.input, held);
      const outcome =
        projected.kind === "shortfall"
          ? `รอบนี้เงินขาด ${money(projected.shortfall)}`
          : projected.kind === "payday-passed"
            ? "เลยวันรับเงินแล้ว ต้องอัปเดตรอบก่อนประเมิน"
            : `หากกันงวดในรอบนี้ วันนี้ใช้ได้อีก ${money(projected.todayRemaining)}${projected.spare === null ? " · ยังไม่ได้ตั้งค่าอาหาร/เดินทาง จึงยังประเมินค่าใช้จ่ายจำเป็นไม่ได้" : projected.spare < 0 ? ` · หลังกันค่าใช้จ่ายจำเป็นยังขาด ${money(-projected.spare)}` : ""}`;
      if (question)
        return say(
          `ลองผ่อน ยังไม่ได้สร้างบิลหรือบันทึกรายจ่ายครับ\n${details}\n${outcome}`,
        );
      return preview(
        userId,
        `สร้างบิลผ่อน\n${details}\n${outcome}`,
        {
          op: "installments",
          input,
        },
        basisOf(loaded.input),
      );
    }
    case "help":
      return helpAnswer();
    case "setup":
      return setup({
        kind: "chat_setup",
        key: randomUUID(),
        field: "source",
        input: {},
      });
    case "report": {
      // 15 Nov: a card with Thai dates (week = Monday to today), not raw ISO text
      const r = await loadReport(
        userId,
        i.period === "day" || i.period === "week" ? i.period : "month",
        i.date,
      );
      return { message: reportCard(r, thaiDate(new Date())) };
    }
    case "search": {
      if (!i.query) return say("พิมพ์ชื่อรายการ เช่น ค้นรายจ่าย ข้าว ครับ");
      // Search has no week: a week asked for searches the month, as before weeks were read
      const r = await searchEntries(userId, i.query, i.period === "week" ? "month" : i.period);
      return say(
        `${r.answer}\n${
          r.entries
            ?.slice(0, 5)
            .map((e) => `${formatThaiDate(e.spentOn, "short")} ${e.note ?? "รายจ่าย"} ${money(e.amount)}`)
            .join("\n") ?? ""
        }`,
      );
    }
    case "web":
      return say(
        "ค้นเว็บต้องแสดงแหล่งอ้างอิงและส่วนค้นหาของผู้ให้บริการ จึงเปิดในหน้าค้นหาครับ ส่วนค้นรายจ่ายทำในแชตได้ เช่น ค้นรายจ่าย ข้าว",
        undefined,
        [{ type: "uri", label: "ค้นเว็บ", uri: appUrl("/app/search") }],
      );
    case "points": {
      const r = await pointsState(userId);
      return say(
        `คุณมี ${r.balance} แต้ม · ${r.claimedToday ? "เช็กครบแล้ววันนี้" : "จดรายการเพื่อรับแต้มอัตโนมัติ หรือพิมพ์ เช็กครบแล้ว เพื่อรับแต้มวันนี้"}`,
      );
    }
    case "claim_points": {
      const r = await claimDailyPoints(
        userId,
        `chat-daily:${thaiDate(new Date())}`,
      );
      return say(
        `${r.created ? "รับ 1 แต้มแล้ว" : "รับแต้มวันนี้ไปแล้ว"} · มี ${r.balance} แต้มครับ`,
      );
    }
    case "entries":
      return choose(userId, "entry", undefined, i.page);
    case "plans":
      return choose(userId, "plan", undefined, i.page);
    case "rewards":
      if (!i.selected) return choose(userId, "reward", i);
      return preview(
        userId,
        `แลก ${i.selected.title} ใช้ ${i.selected.amount} แต้ม`,
        {
          op: "redeem",
          id: i.selected.id,
          title: i.selected.title,
          cost: i.selected.amount,
        },
      );
    case "promos":
      return { message: sponsorCarousel() };
    case "bill_reminder_help":
      return say("ยังไม่ได้เปลี่ยนการเตือนบิลหรือค่าสรุปครับ\nเลือกวันครบกำหนดและเปิด/ปิดเตือนได้ใน “บิลประจำ”\nถ้าเปิดเตือน จะเตือนล่วงหน้า 3 วันและวันครบกำหนด เวลา 09:00 น.\nตอนนี้ยังเลือกเวลาเฉพาะบิลผ่านแชตไม่ได้ครับ", undefined,
        [{ type: "uri", label: "ตั้งเตือนบิล", uri: miniAppUrl("/app/settings/bills") }], "เตือนบิลประจำ");
    case "notifications": {
      const p = await getNotificationPreferences(userId);
      if (i.enabled === undefined && !i.time)
        return say(
          `แจ้งเตือน: รายวัน ${p.daily ? "เปิด" : "ปิด"} · รายเดือน ${p.monthly ? "เปิด" : "ปิด"} · งบ ${p.budget ? "เปิด" : "ปิด"} · เวลา ${p.time}\nเช่น เปิดสรุปรายวัน เวลา 20:00`,
        );
      const value = { ...p, time: i.time ?? p.time };
      if (i.enabled !== undefined)
        for (const key of ["daily", "monthly", "budget"] as const)
          if (i.notification === key || i.notification === "all")
            value[key] = i.enabled;
      return preview(
        userId,
        `แจ้งเตือน รายวัน ${value.daily ? "เปิด" : "ปิด"} รายเดือน ${value.monthly ? "เปิด" : "ปิด"} งบ ${value.budget ? "เปิด" : "ปิด"} เวลา ${value.time}`,
        { op: "notifications", value, previous: p },
      );
    }
    case "reminders": {
      const p = await getReminderSettings(userId);
      if (i.enabled === undefined && !i.time)
        return say(
          `เตือนจด ${p.enabled ? "เปิด" : "ปิด"} เวลา ${p.time}\n${p.habits.map((h) => `${h.label} ${money(h.amount)}`).join("\n")}`,
        );
      return preview(
        userId,
        `เตือนจด ${(i.enabled ?? p.enabled) ? "เปิด" : "ปิด"} เวลา ${i.time ?? p.time}`,
        {
          op: "reminders",
          enabled: i.enabled ?? p.enabled,
          time: i.time ?? p.time,
          previous: {
            enabled: p.enabled,
            time: p.time,
            pausedUntil: p.pausedUntil,
          },
        },
      );
    }
    case "add_bill":
    case "add_plan":
      if (!i.title) return ask(i, "title");
      if (i.amount === undefined) return ask(i, "amount");
      if (i.tool === "add_bill" && i.repeat === "monthly") {
        if (!i.date) return ask(i, "date");
        const input = parseBillSchedule({ title: i.title, amount: i.amount, startsOn: i.date, repeat: "monthly", notify: true }, thaiDate(new Date()));
        await loadSummary(userId); // Require an active cycle before offering a confirmation.
        return preview(userId,
          `สร้างบิลประจำ ${input.title} ${money(input.amount)}\nทุกวันที่ ${Number(input.startsOn.slice(8))} ของเดือน เริ่ม ${input.startsOn}\nเตือน LINE ล่วงหน้า 3 วันและวันครบกำหนด 09:00 น.\nยังไม่ได้จดเป็นรายจ่ายครับ`,
          { op: "bill_schedule_add", input });
      }
      return preview(
        userId,
        `${i.tool === "add_bill" ? "เพิ่มบิล" : "เพิ่มแผน"} ${i.title} ${money(i.amount)}${i.date ? ` วันที่ ${i.date}` : " ไม่กำหนดวัน"}`,
        {
          op: "plan_add",
          input: {
            kind: i.tool === "add_bill" ? "bill" : "purchase",
            title: i.title,
            amount: i.amount,
            dueOn: i.date ?? null,
            category: categoryOf(i.title),
          },
        },
      );
    case "balance":
    case "buffer":
      if (i.amount === undefined) return ask(i, "amount");
      return preview(
        userId,
        `${i.tool === "balance" ? "ปรับยอดเงินจริง" : "ตั้งเงินเผื่อ"} ${money(i.amount)}`,
        i.tool === "balance"
          ? { op: "balance", amount: i.amount }
          : {
              op: "buffer",
              amount: i.amount,
              previous: (await loadSummary(userId)).emergencyBuffer,
            },
      );
    case "payday":
      if (!i.date) return ask(i, "date");
      return preview(userId, `วันรับเงิน ${i.date}`, {
        op: "payday",
        date: i.date,
      });
    case "essentials":
      if (i.food === undefined) return ask(i, "food");
      if (i.transport === undefined) return ask(i, "transport");
      return preview(
        userId,
        `ค่าอาหาร ${money(i.food)} และเดินทาง ${money(i.transport)} ต่อวัน`,
        { op: "essentials", food: i.food, transport: i.transport },
      );
    case "entry_edit":
    case "entry_delete": {
      if (!i.selected) return choose(userId, "entry", i);
      const { entry, cancelled } = await entryForChat(userId, i.selected.id);
      if (cancelled) throw stale();
      if (i.tool === "entry_edit" && i.amount === undefined)
        return ask(i, "amount");
      return preview(
        userId,
        `${i.tool === "entry_edit" ? "แก้ยอด" : "ยกเลิก"} ${entry.note ?? "รายการ"} ${money(entry.amount)}${i.tool === "entry_edit" ? ` เป็น ${money(i.amount!)}` : ""}`,
        i.tool === "entry_edit"
          ? {
              op: "entry_edit",
              id: entry.id,
              amount: i.amount!,
              expected: entry,
            }
          : { op: "entry_delete", id: entry.id, expected: entry },
      );
    }
    case "plan_action": {
      if (!i.selected) return choose(userId, "plan", i);
      const p = (await listPlans(userId)).find((p) => p.id === i.selected!.id);
      if (!p || !i.action) throw stale();
      return preview(
        userId,
        `${{ pay: "จ่ายจริง", unpay: "ยกเลิกการจ่าย", cancel: "ยกเลิกแผน", postpone: "เลื่อนแผน", keep: "กันเงิน" }[i.action]} ${p.title} ${money(p.amount)}`,
        {
          op: "plan_action",
          id: p.id,
          action: i.action,
          expected: { title: p.title, amount: p.amount, status: p.status },
        },
      );
    }
    default:
      return helpAnswer();
  }
}

// The summary names what the questions asked, not the stored code (it said «family · monthly», 16 Nov)
const SOURCE_TH = { family: "เงินจากบ้าน/ทุน", side_job: "งานพิเศษ", other: "อื่น ๆ" } as const;
const FREQUENCY_TH = { weekly: "รายสัปดาห์", monthly: "รายเดือน", irregular: "ไม่แน่นอน" } as const;
// «ดูแผน» / «ดูบิล» said «reserved»: the words the plan screen uses
const PLAN_STATUS_TH: Record<string, string> = {
  reserved: "กันเงินไว้แล้ว", postponed: "เลื่อนไปรอบหน้า", paid: "จ่ายแล้ว", cancelled: "ยกเลิกแล้ว", separate: "จ่ายแยก",
};
const statusText = (status: string) => PLAN_STATUS_TH[status] ?? status;

function setup(p: SetupPending, lead: "unclear" | "past_payday" | null = null): Answer {
  const prompts = {
    source: "เงินหลักมาจากไหนครับ? พิมพ์ เงินจากบ้าน/ทุน, งานพิเศษ หรือ อื่นๆ",
    frequency: "รับเงินเป็นรอบแบบไหนครับ? รายสัปดาห์, รายเดือน หรือ ไม่แน่นอน",
    balance:
      "ตอนนี้มีเงินรวมจริงกี่บาทครับ? รวมเงินที่เพิ่งได้รับด้วย ยอดนี้เป็นยอดตั้งต้น ไม่ได้ลงรายรับซ้ำ",
    payday: "วันรับเงินรอบถัดไปเมื่อไหร่ครับ? ใช้ YYYY-MM-DD หรือ พรุ่งนี้",
    savings: "กันเงินออมกี่บาทครับ? ใส่ 0 ได้",
    buffer: "กันเงินเผื่อฉุกเฉินกี่บาทครับ? ใส่ 0 ได้",
    food: "กันค่าอาหารวันละกี่บาทครับ? ใส่ 0 หรือพิมพ์ ข้าม เพื่อยังไม่ตั้งค่าใช้จ่ายจำเป็น",
    transport: "กันค่าเดินทางวันละกี่บาทครับ? ใส่ 0 ได้",
  };
  if (lead === "past_payday") return say(`วันเงินเข้าต้องเป็นวันหลังวันนี้ครับ ${prompts.payday}`, p);
  return say(lead === "unclear" ? `ยังไม่เข้าใจคำตอบครับ ${prompts[p.field]}\nหรือพิมพ์ ยกเลิก เพื่อออกจากการเริ่มรอบเงิน` : prompts[p.field], p);
}

// Mid-setup «ข้าว 50», «วันนี้ใช้ได้เท่าไหร่», «ดูแต้ม»: another request, not an answer, so the setup ends (16 Nov)
function leavesSetup(body: string): boolean {
  if (parseIntent(body, thaiDate(new Date()))) return true;
  if (isBalanceQuestion(body) || isPaydayQuestion(body) || isEnoughQuestion(body)) return true;
  const parsed = parseExpense(body);
  return parsed.kind === "income" || (parsed.kind === "entry" && /\p{L}/u.test(parsed.title));
}
// A number step took «ข้าว 50» as the balance (17 Nov); «มี 3000», «ออม 500», «ค่ารถ 20» are still answers
const ANSWER_WORDS = /^(?:(?:มี|เหลือ|เงิน|ยอด|รวม|ทั้งหมด|วันละ|เดือนละ|ใส่|กัน|ไว้|ออม|เก็บ|เผื่อ|ฉุกเฉิน|สำรอง|ค่า|อาหาร|กิน|เดินทาง|รถ)\s*)+$/u;
function spendsInstead(body: string): boolean {
  const parsed = parseExpense(body);
  return parsed.kind === "entry" && /\p{L}/u.test(parsed.title) && !ANSWER_WORDS.test(parsed.title);
}
async function setupReply(
  userId: string,
  p: SetupPending,
  body: string,
): Promise<Answer | null> {
  const input = { ...p.input },
    n = spendsInstead(body) ? undefined : statedMoney(body),
    today = thaiDate(new Date());
  const next = (field: SetupPending["field"]) => setup({ ...p, input, field });
  const unclear = () => (leavesSetup(body) ? null : setup(p, "unclear"));
  switch (p.field) {
    case "source":
      if (/บ้าน|ทุน|family/u.test(body)) input.incomeSource = "family";
      else if (/งานพิเศษ|side_job/u.test(body)) input.incomeSource = "side_job";
      else if (/^(อื่นๆ?|other)$/u.test(body.trim()))
        input.incomeSource = "other";
      else return unclear();
      return next("frequency");
    case "frequency":
      if (/สัปดาห์/u.test(body)) input.incomeFrequency = "weekly";
      else if (/เดือน/u.test(body)) input.incomeFrequency = "monthly";
      else if (/ไม่แน่นอน/u.test(body)) input.incomeFrequency = "irregular";
      else return unclear();
      return next("balance");
    case "balance":
      if (n === undefined) return unclear();
      input.balance = n;
      return next("payday");
    case "payday": {
      const date = statedDate(body, today);
      if (!date) return unclear();
      // Checked here, not after four more answers (2020-01-01 failed only at the summary, 16 Nov)
      if (date <= today) return setup(p, "past_payday");
      input.payday = date;
      return next("savings");
    }
    case "savings":
      if (n === undefined) return unclear();
      input.savingsAmount = n;
      return next("buffer");
    case "buffer":
      if (n === undefined) return unclear();
      input.emergencyBuffer = n;
      return next("food");
    case "food":
      if (body.trim() === "ข้าม") break;
      if (n === undefined) return unclear();
      input.essentials = { food: n, transport: 0 };
      return next("transport");
    case "transport":
      if (n === undefined) return unclear();
      input.essentials = { food: input.essentials!.food, transport: n };
      break;
  }
  parseNewCycle(input, today, new Date());
  return preview(
    userId,
    `เริ่มรอบเงิน\nแหล่งเงิน ${SOURCE_TH[input.incomeSource!]} · ${FREQUENCY_TH[input.incomeFrequency!]}\nยอดตั้งต้น ${money(input.balance!)} · รับเงิน ${input.payday}\nออม ${money(input.savingsAmount!)} · เผื่อ ${money(input.emergencyBuffer!)}\n${input.essentials ? `อาหาร ${money(input.essentials.food)} เดินทาง ${money(input.essentials.transport)} ต่อวัน` : "ยังไม่ตั้งค่าใช้จ่ายจำเป็น"}`,
    {
      op: "cycle",
      input: input as Required<
        Pick<
          typeof input,
          "incomeSource" | "incomeFrequency" | "balance" | "payday"
        >
      > &
        typeof input,
    },
  );
}

async function selected(
  userId: string,
  p: ListPending,
  index: number,
): Promise<Answer> {
  const item = p.items[index];
  if (!item) return say("เลือกหมายเลขที่แสดงในรายการครับ", p);
  if (p.purpose) return run(userId, { ...p.purpose, selected: item });
  const page = p.page ?? 1;
  const detail = p.type === "plan"
    ? item.status === "cancelled" ? "รายการนี้ยกเลิกแล้วครับ ไม่ต้องจ่ายซ้ำ"
      : item.status === "paid" ? `จ่ายแล้วครับ หากจดผิด พิมพ์ “ยังไม่จ่าย ${index + 1} หน้า ${page}”`
      : `พิมพ์ “จ่ายบิล ${index + 1} หน้า ${page}” หรือ “เลื่อนแผน ${index + 1} หน้า ${page}” ได้ครับ`
    : p.type === "reward" ? "พิมพ์ แลกของรางวัล แล้วเลือกของที่ต้องการครับ"
    : `พิมพ์ “แก้รายการ ${index + 1} หน้า ${page} 60 บาท” หรือ “ลบรายการ ${index + 1} หน้า ${page}” ได้ครับ`;
  return say(
    `${item.title}\n${p.type === "reward" ? `${item.amount} แต้ม` : money(item.amount)}${item.status ? ` · ${statusText(item.status)}` : ""}\n${detail}`,
  );
}

export async function chatAction(
  userId: string,
  body: string,
  pending: Pending | null,
): Promise<Answer | null> {
  try {
    const control = commandText(body);
    const isAction = pending?.kind.startsWith("chat_");
    if (isAction && /^(ยกเลิก|ไม่เอา|ไม่ยืนยัน|cancel)$/iu.test(control))
      return pending?.kind === "chat_command"
        ? confirm(userId, pending, false)
        : say("ยกเลิกคำขอแล้วครับ");
    if (pending?.kind === "chat_command" && !pending.closed && pending.action.op === "entry_edit") {
      const amount = editReplyAmount(body);
      if (amount !== null) {
        // Retire the old card before issuing a replacement; it must not apply the previous amount.
        await retireEdit(userId, pending);
        return await run(userId, {
          tool: "entry_edit", amount,
          selected: { id: pending.action.id, title: pending.action.expected.note ?? "รายการ", amount: pending.action.expected.amount },
        });
      }
    }
    if (
      pending?.kind === "chat_command" &&
      /^(ยืนยัน|ตกลง|ใช่)$/u.test(control)
    )
      return confirm(userId, pending, true);
    const intent = parseIntent(body, thaiDate(new Date()));
    if (intent) {
      if (pending?.kind === "chat_command" && !pending.closed && pending.action.op === "entry_edit" &&
          (intent.tool === "entry_edit" || intent.tool === "entry_delete")) await retireEdit(userId, pending);
      return await run(userId, intent);
    }
    // A list/finished command is context, not a lock on the next independent message.
    // Only explicit multi-item syntax can bypass it; ambiguous numbers still need clarification.
    if ((pending?.kind === "chat_list" || pending?.kind === "chat_command") && splitExplicitExpenses(body)) return null;
    if (pending?.kind === "chat_command" && pending.action.op === "entry_edit" &&
        (looksLikeAmountReply(body) || isCorrectionReply(body))) {
      if (pending.closed) return expired();
      await retireEdit(userId, pending);
      return ask({ tool: "entry_edit", selected: {
        id: pending.action.id, title: pending.action.expected.note ?? "รายการ", amount: pending.action.expected.amount,
      } }, "amount");
    }
    if (pending?.kind === "chat_command" || pending?.kind === "chat_list") {
      const parsed = parseExpense(body);
      if (
        (parsed.kind === "entry" || parsed.kind === "income") &&
        !/ยืนยัน|ตกลง|ใช่|ยกเลิก/u.test(body)
      )
        return null;
    }
    if (pending?.kind === "chat_setup")
      return await setupReply(userId, pending, body);
    if (pending?.kind === "chat_form") {
      const i = { ...pending.intent },
        field = pending.field;
      if (field === "date") i.date = statedDate(body, thaiDate(new Date()));
      else if (field === "title")
        i.title = body.trim().length <= 40 ? body.trim() : undefined;
      else if (field === "time")
        i.time = /^([01]\d|2[0-3]):[0-5]\d$/.test(body.trim())
          ? body.trim()
          : undefined;
      else if (field === "amount" && i.tool === "entry_edit") i.amount = editReplyAmount(body) ?? undefined;
      else i[field] = statedMoney(body);
      return i[field] === undefined ? ask(i, field) : await run(userId, i);
    }
    if (pending?.kind === "chat_list" && /^\d{1,2}$/.test(body.trim()))
      return await selected(userId, pending, Number(body.trim()) - 1);
    // A finished command must allow the next message through read-intent inference.
    if (isAction && !(pending?.kind === "chat_command" && pending.closed))
      return say("น้องพอใช้ยังไม่ได้บันทึกเพิ่มครับ ถ้าต้องการทำตามร่างล่าสุด พิมพ์ ‘ยืนยัน’ หรือพิมพ์ ‘ยกเลิก’ เพื่อเริ่มใหม่ได้เลยครับ");
    const inferred = await inferReadIntent(body, thaiDate(new Date()));
    return inferred ? await run(userId, inferred) : null;
  } catch (error) {
    if (
      error instanceof HttpError &&
      error.code !== "no_cycle" &&
      error.status < 500
    )
      // the installment how-to is a card, every other message stays text
      return error.message === INSTALLMENT_HELP
        ? { message: guideCard("installment-help")!, heading: "แผนผ่อนสินค้า" }
        : say(error.message, undefined, [], "ตรวจคำขออีกครั้ง");
    throw error;
  }
}

export async function chatActionButton(
  userId: string,
  data: string,
): Promise<Answer | null> {
  if (!data.startsWith("pc:")) return null;
  const match = /^pc:(yes|no|pick):([0-9a-f-]{36})(?::([0-9]))?$/.exec(data);
  if (!match) return expired();
  const p = await commandPendingFor(userId, match[2]);
  if (!p) return expired();
  if (p.kind === "chat_command" && p.closed && p.action.op === "bill_schedule_add") {
    const history = await recentChat(userId);
    const latest = history.at(-1)?.pending;
    return say("ร่างบิลนี้ใช้ต่อไม่ได้แล้วครับ ใช้ร่างล่าสุดหรือเริ่มสร้างบิลใหม่ได้เลย", latest?.kind.startsWith("chat_") ? latest as ActionPending : undefined);
  }
  if (p.kind === "chat_command" && match[1] !== "pick")
    return confirm(userId, p, match[1] === "yes");
  if (p.kind === "chat_list" && match[1] === "pick" && match[3] !== undefined)
    return selected(userId, p, Number(match[3]));
  return expired();
}
