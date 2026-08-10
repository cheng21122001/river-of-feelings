/* store.js — 记录的存放处。
   IndexedDB 为主，localStorage 兜底（隐私模式下 IDB 可能打不开）。
   数据模型与旧版完全一致，老的导出文件与分享链接仍可导入：
   { id, date:"YYYY-MM-DD", ts, mood:"happy"|"calm"|"low", note, editedTs?, backfilled? }
*/

const DB_NAME = "river_of_feelings";
const DB_VER  = 1;
const STORE   = "entries";

const LS_KEY      = "river_of_feelings_v1";   // 旧版数据，迁移后保留不删
const LS_MIRROR   = "river_of_feelings_v2";   // IDB 不可用时的兜底存放
const LS_MIGRATED = "river_migrated_to_idb";
const LS_BACKUP   = "river_last_backup";

export const MOOD = {
  happy: { label: "快乐", cls: "happy", short: "光" },
  calm:  { label: "平静", cls: "calm",  short: "水色" },
  low:   { label: "不妙", cls: "low",   short: "河水" }
};

let db = null;
let cache = [];
let usingFallback = false;

/* ---------- IndexedDB 薄封装 ---------- */

function openDB() {
  return new Promise((resolve, reject) => {
    let req;
    try { req = indexedDB.open(DB_NAME, DB_VER); }
    catch (e) { return reject(e); }
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains(STORE)) {
        const os = d.createObjectStore(STORE, { keyPath: "id" });
        os.createIndex("date", "date", { unique: false });
        os.createIndex("ts", "ts", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("blocked"));
  });
}

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

/* ---------- 兜底存放 ---------- */

function readMirror() {
  try { return JSON.parse(localStorage.getItem(LS_MIRROR)) || []; } catch (e) { return []; }
}
function writeMirror() {
  try { localStorage.setItem(LS_MIRROR, JSON.stringify(cache)); } catch (e) {}
}

function readLegacy() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || []; } catch (e) { return []; }
}

/* ---------- 启动 ---------- */

export async function init() {
  try {
    db = await openDB();
  } catch (e) {
    usingFallback = true;
    cache = sortDesc(readMirror().concat(readLegacy()).filter(valid));
    cache = dedupe(cache);
    return { fallback: true, migrated: 0 };
  }

  cache = sortDesc((await reqP(db.transaction(STORE, "readonly").objectStore(STORE).getAll())).filter(valid));

  // 首次启动：把旧版 localStorage 里的记录搬进来。旧副本保留不删，当保险。
  let migrated = 0;
  const done = (() => { try { return localStorage.getItem(LS_MIGRATED) === "1"; } catch (e) { return false; } })();
  if (!done) {
    const legacy = readLegacy().filter(valid);
    if (legacy.length) {
      const have = new Set(cache.map(e => e.id));
      const fresh = legacy.filter(e => !have.has(e.id));
      if (fresh.length) {
        const tx = db.transaction(STORE, "readwrite");
        const os = tx.objectStore(STORE);
        fresh.forEach(e => os.put(normalize(e)));
        await txDone(tx);
        cache = sortDesc(cache.concat(fresh.map(normalize)));
        migrated = fresh.length;
      }
    }
    try { localStorage.setItem(LS_MIGRATED, "1"); } catch (e) {}
  }

  return { fallback: false, migrated };
}

/* ---------- 读 ---------- */

export function all() { return cache.slice(); }

/** date("YYYY-MM-DD") -> 该日全部记录（按时间正序） */
export function groupByDate(list) {
  const map = new Map();
  (list || cache).forEach(e => {
    if (!map.has(e.date)) map.set(e.date, []);
    map.get(e.date).push(e);
  });
  map.forEach(arr => arr.sort((a, b) => a.ts - b.ts));
  return map;
}

export function onDate(date) {
  return cache.filter(e => e.date === date).sort((a, b) => a.ts - b.ts);
}

/** 一天多条时格子显示哪种心情：出现次数最多的；打平取最晚的一条。 */
export function dayMood(dayEntries) {
  if (!dayEntries || !dayEntries.length) return null;
  const n = { happy: 0, calm: 0, low: 0 };
  dayEntries.forEach(e => { if (n[e.mood] != null) n[e.mood]++; });
  let best = null, bestN = -1;
  for (const k of ["happy", "calm", "low"]) {
    if (n[k] > bestN) { best = k; bestN = n[k]; }
  }
  const tied = ["happy", "calm", "low"].filter(k => n[k] === bestN);
  if (tied.length > 1) {
    const latest = dayEntries.slice().sort((a, b) => b.ts - a.ts).find(e => tied.includes(e.mood));
    if (latest) return latest.mood;
  }
  return best;
}

export function stats(list) {
  list = list || cache;
  const s = { total: list.length, happy: 0, calm: 0, low: 0, days: 0 };
  list.forEach(e => { if (s[e.mood] != null) s[e.mood]++; });
  s.days = new Set(list.map(e => e.date)).size;
  return s;
}

export function years() {
  const set = new Set(cache.map(e => (e.date || "").slice(0, 4)).filter(Boolean));
  return Array.from(set).sort();
}

/* ---------- 写 ---------- */

export function makeEntry({ mood, note, date, backfilled, ts }) {
  const now = Date.now();
  return normalize({
    id: "e" + now + Math.floor(Math.random() * 999),
    date: date || todayStr(),
    ts: ts || now,
    mood,
    note: (note || "").trim(),
    backfilled: !!backfilled
  });
}

export async function add(entry) {
  const e = normalize(entry);
  cache = sortDesc(cache.concat([e]));
  await persistOne(e);
  return e;
}

export async function update(id, patch) {
  const e = cache.find(x => x.id === id);
  if (!e) return null;
  Object.assign(e, patch, { editedTs: Date.now() });
  await persistOne(e);
  return e;
}

export async function remove(id) {
  const e = cache.find(x => x.id === id);
  cache = cache.filter(x => x.id !== id);
  if (usingFallback) { writeMirror(); return e; }
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).delete(id);
  await txDone(tx);
  return e;
}

/** 导入/合并：按 id 去重，已存在的不覆盖。返回新增条数。 */
export async function merge(list) {
  const incoming = (list || []).filter(valid).map(normalize);
  const have = new Set(cache.map(e => e.id));
  const fresh = incoming.filter(e => !have.has(e.id));
  if (!fresh.length) return 0;
  cache = sortDesc(cache.concat(fresh));
  if (usingFallback) { writeMirror(); return fresh.length; }
  const tx = db.transaction(STORE, "readwrite");
  const os = tx.objectStore(STORE);
  fresh.forEach(e => os.put(e));
  await txDone(tx);
  return fresh.length;
}

async function persistOne(e) {
  if (usingFallback) { writeMirror(); return; }
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).put(e);
  await txDone(tx);
}

/* ---------- 备份状态 ---------- */

export function lastBackup() {
  try { return Number(localStorage.getItem(LS_BACKUP)) || 0; } catch (e) { return 0; }
}
export function markBackup() {
  try { localStorage.setItem(LS_BACKUP, String(Date.now())); } catch (e) {}
}
/** 距上次备份超过 30 天，且这期间有新记录 */
export function needsBackup() {
  if (!cache.length) return false;
  const last = lastBackup();
  const newest = Math.max(...cache.map(e => e.ts || 0));
  if (!last) return cache.length >= 5;
  if (newest <= last) return false;
  return Date.now() - last > 30 * 24 * 3600 * 1000;
}

/* ---------- 小工具 ---------- */

export function todayStr(d) {
  d = d || new Date();
  return d.getFullYear() + "-" +
    String(d.getMonth() + 1).padStart(2, "0") + "-" +
    String(d.getDate()).padStart(2, "0");
}

function valid(e) {
  return e && typeof e === "object" && e.mood && MOOD[e.mood] && typeof e.date === "string";
}

function normalize(e) {
  return {
    id: e.id || ("e" + (e.ts || Date.now()) + Math.floor(Math.random() * 999)),
    date: e.date,
    ts: e.ts || Date.parse(e.date + "T12:00:00") || Date.now(),
    mood: e.mood,
    note: e.note || "",
    editedTs: e.editedTs,
    backfilled: !!e.backfilled
  };
}

function sortDesc(list) { return list.slice().sort((a, b) => b.ts - a.ts); }

function dedupe(list) {
  const seen = new Set();
  return list.filter(e => (seen.has(e.id) ? false : (seen.add(e.id), true)));
}

export function isFallback() { return usingFallback; }
