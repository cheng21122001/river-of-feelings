/* digest.js — 月度小结的文案。纯本地计算，不调任何模型。
   规则：
   - 当月 0 天记录：什么都不写（空白的月份不该有一句让人心虚的话）
   - 少于 3 天：只给数字，不抒情
   - 有 low 才提河水，没有就不提
   - 口吻沿用旧版 riverPhrase，保持同一条河的声音
*/

import { dayMood } from "./store.js";

const MONTHS = ["一月", "二月", "三月", "四月", "五月", "六月",
                "七月", "八月", "九月", "十月", "十一月", "十二月"];

const CN = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];

/** 0–99 的中文数字。超出范围就原样返回阿拉伯数字。 */
export function cn(n) {
  n = Math.round(n);
  if (n < 0 || n > 99) return String(n);
  if (n < 10) return CN[n];
  if (n < 20) return n === 10 ? "十" : "十" + CN[n % 10];
  const t = Math.floor(n / 10), o = n % 10;
  return CN[t] + "十" + (o ? CN[o] : "");
}

/** 量词前面的数：两天、两瓶，不是二天、二瓶。只有正好是 2 时才变（二十二天仍是「二十二」）。 */
export function cnM(n) {
  return Math.round(n) === 2 ? "两" : cn(n);
}

export function riverPhrase(n) {
  if (n < 3) return "还只是瓶底的一点水光。";
  if (n < 7) return "小瓶已经沉了些，能听见晃动的声音。";
  if (n < 15) return "够注满一洼小小的水塘了。";
  if (n < 30) return "已经是一条细细的溪。你看，它在流，在发光。";
  return "有一条河那么长、那么大了——赞叹它的体积吧，就像赞美一条普通的河。";
}

/**
 * 一个月的小结。
 * @param {Array} monthEntries 该月全部记录
 * @param {number} monthIndex 0–11
 * @returns {string|null} 没有记录时返回 null
 */
export function monthDigest(monthEntries, monthIndex) {
  if (!monthEntries || !monthEntries.length) return null;

  const name = MONTHS[monthIndex];
  const byDay = new Map();
  monthEntries.forEach(e => {
    if (!byDay.has(e.date)) byDay.set(e.date, []);
    byDay.get(e.date).push(e);
  });
  const days = byDay.size;

  const happy = monthEntries.filter(e => e.mood === "happy").length;
  const calm  = monthEntries.filter(e => e.mood === "calm").length;
  const low   = monthEntries.filter(e => e.mood === "low").length;

  // 记得太少的月份，不抒情，只报数
  if (days < 3) {
    return name + "，你记下了 " + cnM(days) + " 天。";
  }

  const parts = [name + "，你记下了 " + cnM(days) + " 天。"];

  const counts = [];
  if (happy) counts.push(cnM(happy) + "次光");
  if (calm)  counts.push(cnM(calm) + "次微光的水");
  if (low)   counts.push(cnM(low) + "瓶河水");
  if (counts.length) parts.push(counts.join("，") + "。");

  const run = longestCalmRun(byDay);
  if (run && run.len >= 3) {
    parts.push("最长的一段平静有" + cnM(run.len) + "天，从 " + run.from + " 号到 " + run.to + " 号。");
  }

  return parts.join("");
}

/** 当月最长的一段「日心情为平静」的连续天数 */
function longestCalmRun(byDay) {
  const dates = Array.from(byDay.keys()).sort();
  if (!dates.length) return null;

  let best = null;
  let curLen = 0, curFrom = null, curPrev = null;

  for (const d of dates) {
    const mood = dayMood(byDay.get(d));
    const dayNum = Number(d.slice(8, 10));
    const consecutive = curPrev != null && dayNum === curPrev + 1;

    if (mood === "calm") {
      if (consecutive && curLen > 0) {
        curLen++;
      } else {
        curLen = 1; curFrom = dayNum;
      }
      if (!best || curLen > best.len) best = { len: curLen, from: curFrom, to: dayNum };
    } else {
      curLen = 0; curFrom = null;
    }
    curPrev = dayNum;
  }
  return best;
}

/** 「历」页顶部的全年一行账 */
export function yearLine(list) {
  if (!list.length) return "这一年还没有记录。";
  const days = new Set(list.map(e => e.date)).size;
  const happy = list.filter(e => e.mood === "happy").length;
  const calm  = list.filter(e => e.mood === "calm").length;
  const low   = list.filter(e => e.mood === "low").length;
  return "记了 " + days + " 天 · 光 " + happy + " · 水色 " + calm + " · 河水 " + low;
}

export { MONTHS };
