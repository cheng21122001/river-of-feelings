/* daily-store.js — 日课记录的存放处。
   结构与 store.js 平行：IndexedDB 为主，localStorage 兜底。
   数据库由 store.js 打开，这里只借用句柄——两处各开一次会因版本号打架。
   { id, date:"YYYY-MM-DD", ts, item, minutes, note, editedTs?, deleted?, dirty? }
*/

import { getDB, todayStr } from "./store.js";

const STORE = "daily";
const LS_MIRROR = "river_daily_v1";   // IDB 不可用时的兜底存放

export const ITEMS = {
  vocab:   { label: "背词"   },
  reading: { label: "读课件" },
  writing: { label: "写作"   },
  spanish: { label: "西语"   },
  fitness: { label: "健身"   }
};

export const ITEM_KEYS = ["vocab", "reading", "writing", "spanish", "fitness"];

let cache = [];
let usingFallback = false;

/* ---------- IndexedDB 小工具 ---------- */

function reqP(r) {
  return new Promise((res, rej) => {
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

function txDone(tx) {
  return new Promise((res, rej) => {
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
    tx.onabort = () => rej(tx.error);
  });
}

function readMirror() {
  try { return JSON.parse(localStorage.getItem(LS_MIRROR)) || []; } catch (e) { return []; }
}
function writeMirror() {
  try { localStorage.setItem(LS_MIRROR, JSON.stringify(cache)); } catch (e) {}
}

/* ---------- 启动 ---------- */

/** 必须在 store.init() 之后调用，否则拿不到数据库句柄。 */
export async function init() {
  const db = getDB();
  if (!db) {
    usingFallback = true;
    cache = sortDesc(readMirror().filter(valid).map(normalize));
    return { fallback: true };
  }
  const rows = await reqP(db.transaction(STORE, "readonly").objectStore(STORE).getAll());
  cache = sortDesc(rows.filter(valid).map(normalize));
  return { fallback: false };
}

/* ---------- 读 ---------- */

export function all() { return cache.filter(e => !e.deleted); }
export function allRaw() { return cache.slice(); }

export function onDate(date) {
  return cache.filter(e => !e.deleted && e.date === date).sort((a, b) => a.ts - b.ts);
}

/** 某天某项目的累计分钟 */
export function minutesOn(date, item) {
  return onDate(date).filter(e => e.item === item).reduce((n, e) => n + (e.minutes || 0), 0);
}

/** 有日课记录的日期集合，日历那层用 */
export function datesWithLogs() {
  return new Set(all().map(e => e.date));
}

/** 连续天数：从今天往前数。今天还没记不算断，从昨天接着数。 */
export function streak() {
  const days = datesWithLogs();
  if (!days.size) return 0;
  const d = new Date();
  if (!days.has(todayStr(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (days.has(todayStr(d))) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

/** 近 N 天的汇总 */
export function statsSince(days) {
  const from = new Date();
  from.setDate(from.getDate() - (days - 1));
  const fromStr = todayStr(from);
  const list = all().filter(e => e.date >= fromStr);
  const byItem = {};
  ITEM_KEYS.forEach(k => { byItem[k] = 0; });
  list.forEach(e => { if (byItem[e.item] != null) byItem[e.item] += (e.minutes || 0); });
  return {
    total: list.length,
    minutes: list.reduce((n, e) => n + (e.minutes || 0), 0),
    byItem,
    days: new Set(list.map(e => e.date)).size
  };
}

/* ---------- 写 ---------- */

export function makeLog({ item, minutes, note, date, ts }) {
  const now = Date.now();
  return normalize({
    id: "d" + now + Math.floor(Math.random() * 999),
    date: date || todayStr(),
    ts: ts || now,
    item,
    minutes: Math.max(0, Math.round(Number(minutes) || 0)),
    note: (note || "").trim()
  });
}

export async function add(log) {
  const e = normalize(log);
  e.dirty = true;
  const existing = cache.find(x => x.id === e.id);
  if (existing) {
    Object.assign(existing, e);
    await persistOne(existing);
    return existing;
  }
  cache = sortDesc(cache.concat([e]));
  await persistOne(e);
  return e;
}

export async function update(id, patch) {
  const e = cache.find(x => x.id === id);
  if (!e) return null;
  Object.assign(e, patch, { editedTs: Date.now(), dirty: true });
  if (patch.minutes != null) e.minutes = Math.max(0, Math.round(Number(patch.minutes) || 0));
  await persistOne(e);
  return e;
}

export async function remove(id) {
  const e = cache.find(x => x.id === id);
  if (!e) return null;
  e.deleted = true;
  e.dirty = true;
  e.editedTs = Date.now();
  await persistOne(e);
  return e;
}

export async function restore(id) { return update(id, { deleted: false }); }

async function persistOne(e) {
  if (usingFallback) { writeMirror(); return; }
  const tx = getDB().transaction(STORE, "readwrite");
  tx.objectStore(STORE).put(plain(e));
  await txDone(tx);
}

/* ---------- 同步用的读写 ---------- */

export function dirtyRows() { return cache.filter(e => e.dirty); }

export async function markClean(ids) {
  const set = new Set(ids);
  const touched = cache.filter(e => set.has(e.id) && e.dirty);
  touched.forEach(e => { e.dirty = false; });
  await persistMany(touched);
}

export async function markAllDirty() {
  cache.forEach(e => { e.dirty = true; });
  await persistMany(cache);
}

/** 合并规则与心情记录完全一致：本地有未推送的改动就保留本地。 */
export async function applyRemote(rows) {
  const changed = [];
  for (const r of rows) {
    const local = cache.find(e => e.id === r.id);
    if (!local) {
      const e = normalize(r);
      e.dirty = false;
      cache.push(e);
      changed.push(e);
      continue;
    }
    if (local.dirty) continue;
    Object.assign(local, normalize(r), { dirty: false });
    changed.push(local);
  }
  if (changed.length) {
    cache = sortDesc(cache);
    await persistMany(changed);
  }
  return changed.length;
}

export async function clearAll() {
  cache = [];
  if (usingFallback) { writeMirror(); return; }
  const tx = getDB().transaction(STORE, "readwrite");
  tx.objectStore(STORE).clear();
  await txDone(tx);
}

async function persistMany(list) {
  if (!list.length) return;
  if (usingFallback) { writeMirror(); return; }
  const tx = getDB().transaction(STORE, "readwrite");
  const os = tx.objectStore(STORE);
  list.forEach(e => os.put(plain(e)));
  await txDone(tx);
}

function plain(e) {
  return {
    id: e.id, date: e.date, ts: e.ts, item: e.item, minutes: e.minutes,
    note: e.note, editedTs: e.editedTs,
    deleted: !!e.deleted, dirty: !!e.dirty
  };
}

/* ---------- 小工具 ---------- */

function valid(e) {
  return e && typeof e === "object" && e.item && ITEMS[e.item] && typeof e.date === "string";
}

function normalize(e) {
  return {
    id: e.id || ("d" + (e.ts || Date.now()) + Math.floor(Math.random() * 999)),
    date: e.date,
    ts: e.ts || Date.parse(e.date + "T12:00:00") || Date.now(),
    item: e.item,
    minutes: Math.max(0, Math.round(Number(e.minutes) || 0)),
    note: e.note || "",
    editedTs: e.editedTs,
    deleted: !!e.deleted,
    dirty: !!e.dirty
  };
}

function sortDesc(list) { return list.slice().sort((a, b) => b.ts - a.ts); }

export function isFallback() { return usingFallback; }
