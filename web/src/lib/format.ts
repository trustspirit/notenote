const fmt = new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "short", day: "numeric" });

export function formatDate(ms: number): string {
  return fmt.format(new Date(ms));
}

const rtf = new Intl.RelativeTimeFormat("ko-KR", { numeric: "auto" });

/** "방금", "3분 전", "2시간 전", then a plain date. */
export function formatRelative(ms: number, now = Date.now()): string {
  const sec = Math.round((ms - now) / 1000);
  if (Math.abs(sec) < 45) return "방금";
  const min = Math.round(sec / 60);
  if (Math.abs(min) < 60) return rtf.format(min, "minute");
  const hr = Math.round(min / 60);
  if (Math.abs(hr) < 24) return rtf.format(hr, "hour");
  return formatDate(ms);
}
