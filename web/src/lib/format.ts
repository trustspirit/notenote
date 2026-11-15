const fmt = new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "short", day: "numeric" });

export function formatDate(ms: number): string {
  return fmt.format(new Date(ms));
}
