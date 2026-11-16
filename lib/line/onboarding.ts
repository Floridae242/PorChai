import type {
  FlexMessage,
  FlexBubble,
  FlexComponent,
  FlexBox,
} from "./branded-flex";
import { appUrl } from "@/lib/liff/config";
import { mascotPngUrl } from "./flex/format";
import { text, type TextMessage } from "./reply";
import { EXTRA_HELP } from "./help-request";

export const ONBOARDING_STEPS = [
  {
    id: "start",
    title: "สวัสดีครับ น้องพอใช้ครับ",
    tag: "เริ่มดูแลเงิน แบบไม่ต้องเริ่มคนเดียว",
    pose: "greeting",
    description: "เพื่อนช่วยจด ช่วยดูงบ และช่วยคิดก่อนจ่าย สำหรับชีวิตนักศึกษา",
    example: "ปัดซ้าย → รู้จักพอใช้ทีละเรื่อง",
    detail: "เริ่มจากแหล่งเงิน ยอดที่มี วันรับเงิน และค่าใช้จ่ายจำเป็น ตั้งในแชตก็ได้ครับ",
    label: "เริ่มอย่างไร",
    path: "/app/setup/income",
    command: "เริ่มรอบเงิน",
    tip: "ค่อย ๆ ตั้งค่า แล้วตรวจยืนยันก่อนเริ่มรอบเงิน",
  },
  {
    id: "record",
    title: "จดง่าย แค่พิมพ์หรือส่งรูป",
    tag: "จ่ายอะไรไป บอกพอใช้ได้เลย",
    pose: "scanReceipt",
    description: "จดทีละรายการหรือแยกหลายบรรทัด ส่งใบเสร็จหรือสลิปให้ช่วยอ่านได้",
    example: "ข้าว 50\nรถเมล์ 20",
    detail: "พิมพ์ชื่อกับยอดที่จ่ายจริงได้เลย หลายรายการและรูปจะให้ตรวจ ก่อนกดยืนยันครับ",
    label: "ดูวิธีจด",
    path: "/app/record/new",
    command: "ข้าว 50",
    tip: "รูปอ่านผิดแก้ได้ ก่อนยืนยันยังไม่ลงบัญชี",
  },
  {
    id: "income",
    title: "เงินเข้า ก็จดในแชตได้",
    tag: "ไม่ต้องเปิด MINI App ทุกครั้ง",
    pose: "saveCoins",
    description: "ได้เงินจากบ้าน ทุน หรืองานพิเศษ บันทึกเป็นรายรับแล้วอัปเดตแผนเงิน",
    example: "ได้รับเงิน 1000 บาท",
    detail:
      "ต้องเป็นเงินที่ได้รับจริงวันนี้ครับ โอนระหว่างบัญชีตัวเองหรือยังไม่ได้รับ ให้บอกเพิ่มก่อนลงบัญชี",
    label: "ดูวิธีจดรายรับ",
    path: "/app/record/new",
    command: "ได้รับเงิน 1000 บาท",
    tip: "เริ่มรอบเงินก่อน เพื่อให้รู้ว่าเงินต้องพอถึงวันไหน",
  },
  {
    id: "decide",
    title: "อยากซื้อ ลองคิดก่อนจ่าย",
    tag: "ถามก่อนได้ ยังไม่จดเป็นรายจ่าย",
    pose: "thinking",
    description: "ดูผลต่อแผนเงินจากยอดที่จดจริง พร้อมทางเลือกที่คุณเลือกเองได้",
    example: "ชาบู 199 บาท ไหวไหม",
    detail:
      "บอกของ ราคา และวันที่จะซื้อ ระบบใช้สูตรคำนวณเงิน ส่วน AI ช่วยอธิบาย ลองก่อนจ่ายไม่หักเงินครับ",
    label: "ดูวิธีลองก่อนจ่าย",
    path: "/app/try",
    command: "ชาบู 199 บาท ไหวไหม",
    tip: "ข้อมูลยังไม่ครบ จะถามเพิ่ม ไม่เดาว่าเงินพอ",
  },
  {
    id: "categories",
    title: "หมวดและงบ แบบที่เป็นคุณ",
    tag: "แยกให้เห็น ว่าเงินไปกับอะไร",
    pose: "budgetOk",
    description: "สร้างหมวดย่อย เช่น ชานม ตั้งงบรายเดือน และเลือกหมวดตอนจดได้",
    example: "เพิ่มหมวด ชานม กลุ่ม อาหาร งบ 500 บาท",
    detail:
      "ตรวจแล้วพิมพ์ ยืนยัน เพื่อสร้างหมวด จากนั้นใช้ จด ชานม 50 หมวด ชานม งบเป็นตัวติดตาม ไม่ได้เพิ่มเงินให้ใช้ครับ",
    label: "ดูหมวดและงบ",
    path: "/app/settings/categories",
    command: "ดูหมวด",
    tip: "AI เสนอได้ แต่คุณปรับและยืนยันก่อนใช้",
  },
  {
    id: "plans",
    title: "บิลและผ่อน ไม่หลุดจากแผน",
    tag: "เห็นแต่ละงวด ก่อนถึงวันต้องจ่าย",
    pose: "reminder",
    description: "เก็บบิล แผนซื้อ และงวดผ่อน แยกจากรายการที่จ่ายจริงแล้ว",
    example: "เพิ่มบิล ค่าหอ 500 บาท",
    detail:
      "ผ่อนใช้รูปแบบ: ผ่อน โทรศัพท์ ยอดรวม 12000 บาท 12 งวด เริ่ม YYYY-MM-DD แทนวันที่ด้วยวันจริง ยอดต้องรวมดอกเบี้ยและค่าธรรมเนียมแล้วครับ",
    label: "ดูวิธีบิลและผ่อน",
    path: "/app/plan",
    command: "ดูแผน",
    tip: "ยืนยันก่อนสร้างบิล ไม่ได้ชำระให้ร้านอัตโนมัติ",
  },
  {
    id: "reports",
    title: "ดูภาพรวม เข้าใจแพทเทิร์น",
    tag: "เรียกดูได้ ทุกครั้งที่อยากรู้",
    pose: "thinking",
    description: "สรุปวัน/เดือน ค้นรายจ่าย ดูหมวดที่ใช้บ่อยและรายการที่เกิดซ้ำ",
    example: "ดูภาพรวม · วิเคราะห์\nค้นรายจ่าย ข้าว",
    detail:
      "พิมพ์ ดูรายงานวันนี้ หรือ วิเคราะห์ เพื่อดูข้อมูลที่จด ใช้ AI วิเคราะห์ เพื่อขอคำอธิบายเพิ่ม ค้นเว็บเปิดหน้าค้นหาพร้อมแหล่งอ้างอิงครับ",
    label: "ดูสรุปและวิเคราะห์",
    path: "/app/insights",
    command: "ดูภาพรวม",
    tip: "วันที่ไม่ได้จด ไม่ได้แปลว่าไม่ได้ใช้เงิน",
  },
  {
    id: "points",
    title: "จดวันนี้ รับแต้มอัตโนมัติ",
    tag: "ทีละวัน ก็สร้างนิสัยได้",
    pose: "reward",
    description: "บันทึกรายรับหรือรายจ่ายของวันนี้สำเร็จ ได้วันละ 1 แต้มตามเวลาไทย",
    example: "ดูแต้ม · เช็กครบแล้ว · แลกของ",
    detail:
      "จดหลายรายการหรือกดซ้ำก็ได้วันละ 1 แต้ม วันที่ไม่มีรายจ่ายเช็กแผนแล้วรับได้ ของรางวัลขึ้นอยู่กับรายการที่เปิดให้แลกครับ",
    label: "ดูวิธีแต้มและแลกของ",
    path: "/app/points",
    command: "ดูแต้ม",
    tip: "รายการร่างและการจดย้อนหลังไม่ได้แต้มวันนี้เพิ่ม",
  },
  {
    id: "notify",
    title: "ให้น้องพอใช้ช่วยเตือน",
    tag: "เลือกเปิดเอง ปิดได้ทุกเมื่อ",
    pose: "reminder",
    description: "ตั้งสรุปรายวัน/เดือน เตือนงบ และเตือนรายการประจำที่อาจลืมจด",
    example: "เปิดสรุปรายวัน เวลา 20:00",
    detail:
      "ตรวจคำขอแล้วค่อยยืนยัน พิมพ์ ดูแจ้งเตือน เพื่อเช็กค่า หรือ ปิดแจ้งเตือน เพื่อปิดสรุปและเตือนงบ ส่วนเตือนจดใช้ ปิดเตือนจด ครับ",
    label: "ดูวิธีตั้งแจ้งเตือน",
    path: "/app/notifications",
    command: "ดูแจ้งเตือน",
    tip: "ยังเป็นเพื่อน OA และเปิดรับการแจ้งเตือนไว้",
  },
  {
    id: "promos",
    title: "สิทธิพิเศษ และทางลัดของคุณ",
    tag: "คุยต่อในแชต หรือดูจอใหญ่ก็ได้",
    pose: "greeting",
    description:
      "ดูคูปองและโปรตัวอย่าง เปิด MINI App เมื่อต้องการกราฟหรือจัดการรายละเอียด",
    example: "ดูคูปอง · เมนู · คู่มือ",
    detail:
      "โปรและคูปองปัจจุบันเป็นข้อมูลจำลอง ใช้ซื้อจริงไม่ได้ครับ พิมพ์ คู่มือ เพื่อกลับมาเลื่อนดูการ์ดนี้ได้เสมอ",
    label: "ดูวิธีใช้สิทธิ์",
    path: "/app/sponsors", // the user-facing demo page; /app/promotions is dev-only
    command: "ดูคูปอง",
    tip: "เริ่มจากพิมพ์ เริ่มรอบเงิน แล้วค่อยจดรายจ่ายแรก",
  },
] as const;
export type OnboardingTopic = (typeof ONBOARDING_STEPS)[number]["id"];
const box = (
  contents: FlexComponent[],
  props: Partial<FlexBox> = {},
): FlexBox => ({ type: "box", layout: "vertical", contents, ...props });
const tx = (
  value: string,
  size = "sm",
  color = "#12301B",
  bold = false,
): FlexComponent => ({
  type: "text",
  text: value,
  size,
  color,
  wrap: true,
  ...(bold ? { weight: "bold" as const } : {}),
});

/** Same payload powers follow replies and the review screen. All guide postbacks are read-only. */
export function buildOnboardingCarousel(): FlexMessage {
  return {
    type: "flex",
    altText:
      "สวัสดีครับ น้องพอใช้ครับ · เลื่อนดู 10 การ์ด: เริ่มใช้ จดรายรับรายจ่าย ลองก่อนจ่าย หมวด/งบ บิล/ผ่อน สรุป/วิเคราะห์ แต้ม แจ้งเตือน และโปรตัวอย่าง พิมพ์ คู่มือ เพื่อดูอีกครั้ง",
    contents: {
      type: "carousel",
      contents: ONBOARDING_STEPS.map((step, index): FlexBubble => ({
        type: "bubble",
        size: "mega",
        header: box(
          [
            tx(
              `PORCHAI · เริ่มใช้ ${String(index + 1).padStart(2, "0")} / ${ONBOARDING_STEPS.length}`,
              "xs",
              "#1F4D2B",
              true,
            ),
          ],
          { paddingAll: "16px", backgroundColor: "#E8F3CF" },
        ),
        body: box(
          [
            tx(step.title, "xl", "#12301B", true),
            tx(step.tag, "xs", "#4A5A48"),
            {
              type: "image",
              url: mascotPngUrl(step.pose),
              size: "full",
              aspectRatio: "3:2",
              aspectMode: "fit",
            },
            tx(step.description, "sm"),
            box(
              [
                tx(
                  index === 0 ? "เริ่มทีละนิด" : "ตัวอย่างคำพูด ไม่ใช่รายการที่บันทึกแล้ว",
                  "xxs",
                  "#4A5A48",
                ),
                tx(step.example, "sm", "#1F4D2B", true),
              ],
              {
                paddingAll: "12px",
                spacing: "sm",
                backgroundColor: "#F4F8E8",
                cornerRadius: "12px",
              },
            ),
            tx(step.tip, "xs", "#4A5A48"),
          ],
          { paddingAll: "20px", spacing: "md", backgroundColor: "#FFFFFF" },
        ),
        footer: box(
          [
            {
              type: "button",
              style: "primary",
              color: "#1F4D2B",
              height: "sm",
              action: {
                type: "postback",
                label: step.label,
                data: `guide:${step.id}`,
                displayText: step.label,
              },
            },
            {
              type: "button",
              style: "secondary",
              height: "sm",
              action: {
                type: "uri",
                label: index === 0 ? "ตั้งค่าใน MINI App" : "ดูใน MINI App",
                uri: appUrl(step.path),
              },
            },
          ],
          { paddingAll: "16px", spacing: "sm", backgroundColor: "#FFFFFF" },
        ),
      })),
    },
  };
}

export function onboardingHelp(data: string): TextMessage | null {
  const extra=Object.entries(EXTRA_HELP).find(([id])=>data===`guide:${id}`)?.[1];
  if(extra)return text(`${extra.title}\n${extra.detail}\n\nตัวอย่างสำหรับพิมพ์เอง: ${extra.command}\n${extra.tip}\nปุ่มคู่มือยังไม่ได้บันทึกหรือเปลี่ยนข้อมูลครับ`);
  const step = ONBOARDING_STEPS.find((s) => data === `guide:${s.id}`);
  return step
    ? text(
        `${step.title}\n${step.detail}\n\nตัวอย่างสำหรับพิมพ์เอง: ${step.command}\n${step.tip}\nปุ่มคู่มือยังไม่ได้บันทึกหรือเปลี่ยนข้อมูลครับ`,
      )
    : null;
}
