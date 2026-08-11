/* schedule.js — 排班表。
   一份很小的本地配置：周几排哪几个项目。不同步——为 7×5 个开关
   加一张云端表和一条同步流水线不划算，换设备重填不到一分钟。
   周一 = 1，周日 = 7。
*/

import { ITEM_KEYS } from "./daily-store.js";

const LS_KEY = "river_daily_schedule";

/* 背词和西语每天都排：这两项都是二十分钟以内的量，断一天比补一天贵。
   读课件、写作、健身按周排。健身默认一三五，只是个起始值。 */
export const DEFAULT = {
  1: ["vocab", "spanish", "fitness"],
  2: ["vocab", "spanish", "reading"],
  3: ["vocab", "spanish", "fitness"],
  4: ["vocab", "spanish", "reading"],
  5: ["vocab", "spanish", "fitness"],
  6: ["vocab", "spanish", "writing"],
  7: ["vocab", "spanish"]
};

let cache = null;

function clean(raw) {
  const out = {};
  for (let d = 1; d <= 7; d++) {
    const list = Array.isArray(raw && raw[d]) ? raw[d] : [];
    // 只保留认得的项目，并按固定顺序排列，界面才不会跳来跳去
    out[d] = ITEM_KEYS.filter(k => list.includes(k));
  }
  return out;
}

export function get() {
  if (cache) return cache;
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(LS_KEY)); } catch (e) {}
  cache = raw ? clean(raw) : clean(DEFAULT);
  return cache;
}

function save() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(cache)); } catch (e) {}
}

export function forDay(dow) { return get()[dow] || []; }

export function forDate(dateStr) { return forDay(dowOf(dateStr)); }

export function setDay(dow, items) {
  get();
  cache[dow] = ITEM_KEYS.filter(k => items.includes(k));
  save();
  return cache[dow];
}

/** 开或关某天的某个项目，返回该天最新的项目列表 */
export function toggle(dow, item) {
  const cur = forDay(dow);
  return setDay(dow, cur.includes(item) ? cur.filter(k => k !== item) : cur.concat([item]));
}

/** "YYYY-MM-DD" -> 1..7。JS 的 getDay() 里周日是 0，这里换成 7。 */
export function dowOf(dateStr) {
  const d = new Date(dateStr + "T12:00:00");
  const n = d.getDay();
  return n === 0 ? 7 : n;
}
