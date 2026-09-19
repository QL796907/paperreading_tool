const WEEK = "日一二三四五六";
const MONTHS = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十", "十一", "十二"];
const DIGITS = "零一二三四五六七八九";

export function todayStamp() {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

export function parseStamp(stamp) {
  const [y, m, d] = String(stamp).split("-").map(Number);
  return { y, m, d, date: new Date(y, m - 1, d) };
}

export function formatDirDate(stamp) {
  const { m, d, date } = parseStamp(stamp);
  return `${m}月${d}日 · 周${WEEK[date.getDay()]}`;
}

export function formatWrittenDate(stamp) {
  const { m, d } = parseStamp(stamp);
  return `${m}月${d}日`;
}

function chineseDay(n) {
  if (n <= 10) return `${n === 10 ? "十" : DIGITS[n]}日`;
  if (n < 20) return `十${DIGITS[n - 10]}日`;
  if (n === 20) return "二十日";
  if (n < 30) return `二十${DIGITS[n - 20]}日`;
  return n === 30 ? "三十日" : `三十${DIGITS[n - 30]}日`;
}

export function formatBigDate(stamp) {
  const { m, d } = parseStamp(stamp);
  return `${MONTHS[m]}月${chineseDay(d)}`;
}

export function monthLabel(stamp) {
  const { y, m } = parseStamp(stamp);
  return `${y}年${m}月`;
}

export function sourceLine(source) {
  const who = [source.creators, source.year].filter(Boolean).join(", ");
  return who ? `${source.title} · ${who}` : source.title;
}

export function matchesQuery(term, query) {
  if (!query) return true;
  const blob = [
    term.word,
    term.definition,
    term.context,
    ...(term.sources || []).map((s) => `${s.title} ${s.creators}`),
  ]
    .join(" ")
    .toLowerCase();
  return blob.includes(query.toLowerCase());
}
