// `isoDate` is already a Thai-time calendar date (YYYY-MM-DD). It is built at
// UTC noon and formatted in UTC so no machine timezone can shift the day.
export function formatThaiDate(
  isoDate: string,
  style: "short" | "long",
): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  const options: Intl.DateTimeFormatOptions =
    style === "short"
      ? { day: "numeric", month: "short", timeZone: "UTC" }
      : { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" };
  return new Intl.DateTimeFormat("th-TH-u-ca-buddhist", options).format(date);
}
