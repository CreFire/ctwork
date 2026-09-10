/** 中文大数格式化:万 / 亿 / 万亿 / 京 ... */
const UNITS: Array<[number, string]> = [
  [1e32, "沟"],
  [1e28, "穰"],
  [1e24, "秭"],
  [1e20, "垓"],
  [1e16, "京"],
  [1e12, "万亿"],
  [1e8, "亿"],
  [1e4, "万"],
];

function trim(n: number, digits: number): string {
  return parseFloat(n.toFixed(digits)).toString();
}

/** 数值格式化(用于资源量) */
export function fmt(n: number): string {
  if (!Number.isFinite(n)) return "∞";
  if (n < 0) return "-" + fmt(-n);
  if (n < 1e4) {
    if (n < 10 && n % 1 !== 0) return trim(n, 1);
    return Math.floor(n).toString();
  }
  for (const [base, unit] of UNITS) {
    if (n >= base) {
      const v = n / base;
      if (v >= 1000) continue;
      if (v >= 100) return trim(v, 0) + unit;
      if (v >= 10) return trim(v, 1) + unit;
      return trim(v, 2) + unit;
    }
  }
  return n.toExponential(2);
}

/** 速率格式化 x/s */
export function fmtRate(n: number): string {
  if (!Number.isFinite(n)) return "∞/s";
  if (n < 0) return "-" + fmtRate(-n);
  return fmt(n) + "/s";
}

/** 倒计时 HH:MM:SS(超过一天加天数) */
export function fmtClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = (x: number) => x.toString().padStart(2, "0");
  const base = `${pad(h)}:${pad(m)}:${pad(ss)}`;
  return d > 0 ? `${d}天 ${base}` : base;
}

/** 时长描述(离线报告等) */
export function fmtDur(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  if (s < 60) return `${s}秒`;
  if (s < 3600) return `${Math.floor(s / 60)}分${s % 60 ? (s % 60) + "秒" : ""}`;
  if (s < 86400) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return `${h}小时${m ? m + "分" : ""}`;
  }
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  return `${d}天${h ? h + "小时" : ""}`;
}

export function pct(n: number): string {
  return (n * 100).toFixed(0) + "%";
}
