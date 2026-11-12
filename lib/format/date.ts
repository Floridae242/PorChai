// `isoDate` is already a Thai-time calendar date (YYYY-MM-DD). It is built at
// UTC noon and formatted in UTC so no machine timezone can shift the day.
export function formatThaiDate(
  isoDate: string,
  style: "short" | "long",
): string {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!parts) {
    throw new RangeError(`isoDate must be YYYY-MM-DD, got "${isoDate}"`);
  }
  const [y, m, d] = [Number(parts[1]), Number(parts[2]), Number(parts[3])];
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== m - 1 ||
    date.getUTCDate() !== d
  ) {
    throw new RangeError(`isoDate is not a real calendar date: "${isoDate}"`);
  }
  const options: Intl.DateTimeFormatOptions =
    style === "short"
      ? { day: "numeric", month: "short", timeZone: "UTC" }
      : { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" };
  return new Intl.DateTimeFormat("th-TH-u-ca-buddhist", options).format(date);
}
