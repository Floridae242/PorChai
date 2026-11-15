import { spendingCategories } from "@/lib/db/spending-categories";
import { statedMoney } from "./parse";
import { parseExpense } from "@/lib/chat/parse";
import { conversationBoundary } from "@/lib/chat/intent";
import { isQuestion } from "@/lib/advice/question";
import type { Mutation } from "./types";
import type { Category } from "@/lib/api-types";
import { HttpError } from "@/lib/http";
const groups: Record<string, Category> = {
  อาหาร: "food",
  เดินทาง: "transport",
  ของใช้: "supplies",
  อื่นๆ: "other",
  "อื่น ๆ": "other",
};
function bad(): never {
  throw new HttpError(
    422,
    "invalid_category",
    "พิมพ์ เช่น เพิ่มหมวด ชานม กลุ่ม อาหาร งบ 500 บาท / ตั้งงบ อาหาร 2000 บาท / จด ชานม 50 หมวด ชานม ครับ ยังไม่ได้บันทึก",
  );
}
export async function categoryCommand(
  userId: string,
  message: string,
  tool: "category_save" | "category_entry",
): Promise<{ label: string; mutation: Mutation }> {
  if (
    message.length > 250 ||
    conversationBoundary(message) ||
    isQuestion(message)
  )
    bad();
  const rows = await spendingCategories(userId);
  if (tool === "category_entry") {
    const m = /^(?:จด\s*)?(.+?)\s+หมวด\s+(.+)$/u.exec(message);
    if (!m) bad();
    const c = rows.find((c) => c.label === m![2].trim()),
      parsed = parseExpense(m![1]);
    if (!c || c.parent === "bills" || parsed.kind !== "entry") bad();
    return {
      label: `จด ${parsed.title} ${(parsed.amount / 100).toFixed(2)} บาท · หมวด ${c.label}`,
      mutation: {
        op: "category_entry",
        input: {
          amount: parsed.amount,
          category: c.parent,
          note: parsed.title,
          categoryId: c.id,
        },
      },
    };
  }
  const edit = /^ตั้งงบ\s+(.+?)\s+([\d๐-๙,.]+)\s*(?:บาท)?$/u.exec(message);
  if (edit) {
    const c = rows.find((c) => c.label === edit[1].trim()),
      amount = statedMoney(edit[2]);
    if (!c || amount === undefined) bad();
    return {
      label: `ตั้งงบ ${c.label} ${amount / 100} บาท/เดือน`,
      mutation: { op: "category_save", input: { ...c, monthlyBudget: amount } },
    };
  }
  const add =
    /^(?:เพิ่ม|ตั้ง)หมวด\s+(.+?)\s+กลุ่ม\s+(.+?)\s+งบ\s+([\d๐-๙,.]+)\s*(?:บาท)?$/u.exec(
      message,
    );
  if (!add) bad();
  const amount = statedMoney(add![3]),
    parent = groups[add![2].trim()];
  if (amount === undefined || !parent) bad();
  return {
    label: `เพิ่มหมวด ${add![1]} · งบ ${amount / 100} บาท/เดือน`,
    mutation: {
      op: "category_save",
      input: { label: add![1].trim(), parent, monthlyBudget: amount },
    },
  };
}
