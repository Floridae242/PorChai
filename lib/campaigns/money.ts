/** Parse a user-entered baht amount without rounding fractional satang. */
export function parseBaht(value: string): number {
  if (!/^\d+(\.\d{1,2})?$/.test(value)) throw new Error("กรอกต้นทุนเป็นบาทตั้งแต่ 0 และทศนิยมไม่เกิน 2 ตำแหน่ง");
  const [whole, fraction = ""] = value.split(".");
  const satang = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(satang)) throw new Error("ยอดต้นทุนสูงเกินขอบเขตที่รองรับ");
  return satang;
}

export function formatBaht(satang: number): string {
  if (!Number.isSafeInteger(satang)) throw new Error("Invalid satang amount");
  const absolute = Math.abs(satang);
  const baht = new Intl.NumberFormat("th-TH").format(Math.floor(absolute / 100));
  const fraction = String(absolute % 100).padStart(2, "0");
  return `${satang < 0 ? "-" : ""}฿${baht}.${fraction}`;
}
