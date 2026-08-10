/* sync.js — 什么时候同步、怎么合并。
   顺序永远是「先拉后推」：拉下来的不覆盖本地未推送的改动，
   随后本地改动被推上去覆盖云端。这样同一条记录在两台设备上都改过时，
   后同步的那台赢——规则简单、可解释，不去比两台设备的钟。
*/

import * as store from "./store.js";
import * as cloud from "./cloud.js";

const AUTO_INTERVAL = 5 * 60 * 1000;   // 兜底轮询
const DEBOUNCE = 1500;                 // 本地写入后等一会儿再推，避免连打

let user = null;
let status = "signed-out";   // signed-out | idle | syncing | ok | error | offline
let message = "";
let lastAt = 0;
let running = false;
let pending = false;
let debounceTimer = null;
let onDataChanged = null;
const listeners = [];

export function getState() {
  return { user, status, message, lastAt, pendingCount: store.dirtyRows().length };
}

export function onState(fn) { listeners.push(fn); }
function emit() { const s = getState(); listeners.forEach(f => { try { f(s); } catch (e) {} }); }

function set(st, msg) { status = st; message = msg || ""; emit(); }

/* ================= 启动 ================= */

export async function init(onData) {
  onDataChanged = onData;
  if (!cloud.available()) { set("signed-out", "云同步没加载起来"); return null; }

  user = await cloud.currentUser();
  set(user ? "idle" : "signed-out");

  cloud.onAuthChange(u => {
    user = u;
    if (!u) { set("signed-out"); return; }
    set("idle");
    syncNow();
  });

  window.addEventListener("online", () => syncNow());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") syncNow();
  });
  setInterval(() => syncNow(), AUTO_INTERVAL);

  if (user) syncNow();
  return user;
}

/** 本地写入之后调这个，攒一会儿再推 */
export function scheduleSync() {
  if (!user) return;
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => syncNow(), DEBOUNCE);
}

/* ================= 主流程 ================= */

export async function syncNow() {
  if (!user) return;
  if (!navigator.onLine) { set("offline"); return; }
  if (running) { pending = true; return; }

  running = true;
  set("syncing");

  try {
    await handleAccountSwitch();

    const remote = await cloud.pull();
    const applied = await store.applyRemote(remote);

    const dirty = store.dirtyRows();
    if (dirty.length) {
      await cloud.push(dirty, user.id);
      await store.markClean(dirty.map(e => e.id));
    }

    lastAt = Date.now();
    set("ok");
    if ((applied || dirty.length) && onDataChanged) onDataChanged();
  } catch (e) {
    const m = String(e && e.message ? e.message : e);
    if (/fetch|network|offline/i.test(m)) set("offline");
    else set("error", m);
  } finally {
    running = false;
    if (pending) { pending = false; setTimeout(() => syncNow(), 300); }
  }
}

/**
 * 三种情况：
 * - 从没同步过：这台设备已有的记录全部标为待传，一次性并入这个账号
 * - 还是同一个账号：正常增量同步
 * - 换了账号：清空本地再全量拉，绝不把上一个人的记录混进新账号
 */
async function handleAccountSwitch() {
  const prev = cloud.getSyncedUser();
  if (prev === user.id) return;

  if (!prev) {
    await store.markAllDirty();
  } else {
    await store.clearAll();
    cloud.resetCursor();
    if (onDataChanged) onDataChanged();
  }
  cloud.setSyncedUser(user.id);
}

/* ================= 账号操作 ================= */

export async function signIn(email, password) {
  const u = await cloud.signIn(email, password);
  user = u;
  set("idle");
  await syncNow();
  return u;
}

export async function signUp(email, password) {
  const r = await cloud.signUp(email, password);
  if (r.user && !r.needsEmail) {
    user = r.user;
    set("idle");
    await syncNow();
  }
  return r;
}

export async function signOut() {
  await cloud.signOut();
  user = null;
  cloud.setSyncedUser(null);
  cloud.resetCursor();
  set("signed-out");
  // 本地记录留着不动：退出登录不该让这台设备上的东西消失
}

export function statusText() {
  const n = store.dirtyRows().length;
  switch (status) {
    case "signed-out": return "未登录 · 记录只存在这台设备";
    case "syncing":    return "正在同步…";
    case "ok":         return "已同步 · " + new Date(lastAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
    case "offline":    return n ? "离线 · " + n + " 条等着上传" : "离线";
    case "error":      return "同步出错：" + message;
    default:           return n ? n + " 条等着上传" : "已登录";
  }
}
