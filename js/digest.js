/* digest.js — 月份名与「历」页顶部的一行数字。 */

const MONTHS = ["一月", "二月", "三月", "四月", "五月", "六月",
                "七月", "八月", "九月", "十月", "十一月", "十二月"];

/** 「历」页顶部的全年一行账 */
export function yearLine(list) {
  if (!list.length) return "这一年还没有记录。";
  const days = new Set(list.map(e => e.date)).size;
  const happy = list.filter(e => e.mood === "happy").length;
  const calm  = list.filter(e => e.mood === "calm").length;
  const low   = list.filter(e => e.mood === "low").length;
  return "记了 " + days + " 天 · 快乐 " + happy + " · 平静 " + calm + " · 不妙 " + low;
}

export { MONTHS };
