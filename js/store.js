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

export const MOOD = {
  happy: { label: "快乐", cls: "happy" },
  calm:  { label: "平静", cls: "calm"  },
  low:   { label: "不妙", cls: "low"   }
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

/** 界面上看得见的记录（墓碑不算） */
export function all() { return cache.filter(e => !e.deleted); }

/** 含墓碑的全部记录，只有同步逻辑该用 */
export function allRaw() { return cache.slice(); }

/** date("YYYY-MM-DD") -> 该日全部记录（按时间正序） */
export function groupByDate(list) {
  const map = new Map();
  (list || all()).forEach(e => {
    if (!map.has(e.date)) map.set(e.date, []);
    map.get(e.date).push(e);
  });
  map.forEach(arr => arr.sort((a, b) => a.ts - b.ts));
  return map;
}

export function onDate(date) {
  return cache.filter(e => !e.deleted && e.date === date).sort((a, b) => a.ts - b.ts);
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
  list = list || all();
  const s = { total: list.length, happy: 0, calm: 0, low: 0, days: 0 };
  list.forEach(e => { if (s[e.mood] != null) s[e.mood]++; });
  s.days = new Set(list.map(e => e.date)).size;
  return s;
}

export function years() {
  const set = new Set(all().map(e => (e.date || "").slice(0, 4)).filter(Boolean));
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
  e.dirty = true;
  const existing = cache.find(x => x.id === e.id);
  if (existing) {                       // 撤销删除时会走到这里
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
  await persistOne(e);
  return e;
}

/** 删除 = 立墓碑。行还在，只是不再显示，并且会把「已删除」这件事同步出去。 */
export async function remove(id) {
  const e = cache.find(x => x.id === id);
  if (!e) return null;
  e.deleted = true;
  e.dirty = true;
  e.editedTs = Date.now();
  await persistOne(e);
  return e;
}

/** 撤销删除 */
export async function restore(id) {
  return update(id, { deleted: false });
}

async function persistOne(e) {
  if (usingFallback) { writeMirror(); return; }
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).put(plain(e));
  await txDone(tx);
}

/* ---------- 同步用的读写 ---------- */

/** 有本地改动、还没推上云的记录（含墓碑） */
export function dirtyRows() { return cache.filter(e => e.dirty); }

/** 推送成功后清掉待同步标记 */
export async function markClean(ids) {
  const set = new Set(ids);
  const touched = cache.filter(e => set.has(e.id) && e.dirty);
  touched.forEach(e => { e.dirty = false; });
  await persistMany(touched);
}

/** 首次登录：把本地已有的记录全部标成待同步，好一次性传进这个账号 */
export async function markAllDirty() {
  cache.forEach(e => { e.dirty = true; });
  await persistMany(cache);
}

/**
 * 把云端拉下来的记录合并进本地。
 * 规则：本地有未推送的改动就保留本地（它随后会被推上去覆盖云端）；
 * 否则一律采用云端的版本。不比较两边时钟——设备之间的钟本来就对不齐。
 * @returns {number} 实际改变了本地状态的条数
 */
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
    if (local.dirty) continue;          // 本地改动优先，等会儿推上去
    Object.assign(local, normalize(r), { dirty: false });
    changed.push(local);
  }
  if (changed.length) {
    cache = sortDesc(cache);
    await persistMany(changed);
  }
  return changed.length;
}

/** 换账号时清空本地缓存，避免把上一个人的记录混进新账号 */
export async function clearAll() {
  cache = [];
  if (usingFallback) { writeMirror(); return; }
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).clear();
  await txDone(tx);
}

async function persistMany(list) {
  if (!list.length) return;
  if (usingFallback) { writeMirror(); return; }
  const tx = db.transaction(STORE, "readwrite");
  const os = tx.objectStore(STORE);
  list.forEach(e => os.put(plain(e)));
  await txDone(tx);
}

/** IndexedDB 存不了带原型/函数的对象，统一转成纯数据 */
function plain(e) {
  return {
    id: e.id, date: e.date, ts: e.ts, mood: e.mood, note: e.note,
    editedTs: e.editedTs, backfilled: !!e.backfilled,
    deleted: !!e.deleted, dirty: !!e.dirty
  };
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
    backfilled: !!e.backfilled,
    // 删除不真删，只立一块墓碑——否则在手机上删掉一条，
    // 另一台设备一同步又会把它捞回来。
    deleted: !!e.deleted,
    // 有本地改动、还没推上云的标记
    dirty: !!e.dirty
  };
}

function sortDesc(list) { return list.slice().sort((a, b) => b.ts - a.ts); }

function dedupe(list) {
  const seen = new Set();
  return list.filter(e => (seen.has(e.id) ? false : (seen.add(e.id), true)));
}

export function isFallback() { return usingFallback; }
