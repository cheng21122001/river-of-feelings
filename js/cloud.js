/* cloud.js — 账号与云同步。
   本地永远是唯一的显示来源；云只是让两台设备看到同一条河。
   断网时这里全部安静失败，本地照记，联网后自动补上。
*/

import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const TABLE = "entries";
const TABLE_DAILY = "daily_logs";
const LS_CURSOR = "river_sync_cursor";   // 上次拉取到的服务器时间
const LS_CURSOR_DAILY = "river_sync_cursor_daily";
const LS_USER   = "river_sync_user";     // 上次同步的账号，用来识别换号

let client = null;

function sb() {
  if (client) return client;
  const lib = window.supabase;
  if (!lib || !lib.createClient) throw new Error("supabase 客户端没加载起来");
  client = lib.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
  });
  return client;
}

export function available() {
  return !!(window.supabase && window.supabase.createClient);
}

/* ================= 账号 ================= */

export async function currentUser() {
  try {
    const { data } = await sb().auth.getUser();
    return data && data.user ? data.user : null;
  } catch (e) { return null; }
}

export async function signUp(email, password) {
  const { data, error } = await sb().auth.signUp({ email, password });
  if (error) throw new Error(readableAuthError(error));
  // 关掉了确认邮件就直接有 session；没关掉则 session 为空，要先去邮箱点链接
  return { user: data.user, needsEmail: !data.session };
}

export async function signIn(email, password) {
  const { data, error } = await sb().auth.signInWithPassword({ email, password });
  if (error) throw new Error(readableAuthError(error));
  return data.user;
}

export async function signOut() {
  try { await sb().auth.signOut(); } catch (e) {}
}

export function onAuthChange(fn) {
  try { sb().auth.onAuthStateChange((_evt, session) => fn(session ? session.user : null)); }
  catch (e) {}
}

function readableAuthError(error) {
  const m = (error && error.message ? error.message : "").toLowerCase();
  if (m.includes("invalid login credentials")) return "邮箱或密码不对";
  if (m.includes("user already registered")) return "这个邮箱已经注册过了，直接登录吧";
  if (m.includes("password should be at least")) return "密码太短了，至少 6 位";
  if (m.includes("unable to validate email")) return "邮箱格式不对";
  if (m.includes("email not confirmed")) return "邮箱还没确认，去收件箱点一下确认链接";
  if (m.includes("failed to fetch") || m.includes("network")) return "连不上服务器，检查一下网络";
  return error && error.message ? error.message : "登录失败";
}

/* ================= 同步游标 ================= */

export function getCursor() {
  try { return localStorage.getItem(LS_CURSOR) || null; } catch (e) { return null; }
}
function setCursor(v) {
  try { if (v) localStorage.setItem(LS_CURSOR, v); } catch (e) {}
}
function getCursorDaily() {
  try { return localStorage.getItem(LS_CURSOR_DAILY) || null; } catch (e) { return null; }
}
function setCursorDaily(v) {
  try { if (v) localStorage.setItem(LS_CURSOR_DAILY, v); } catch (e) {}
}
export function getSyncedUser() {
  try { return localStorage.getItem(LS_USER) || null; } catch (e) { return null; }
}
export function setSyncedUser(id) {
  try { id ? localStorage.setItem(LS_USER, id) : localStorage.removeItem(LS_USER); } catch (e) {}
}
export function resetCursor() {
  try {
    localStorage.removeItem(LS_CURSOR);
    localStorage.removeItem(LS_CURSOR_DAILY);
  } catch (e) {}
}

/* ================= 字段映射 ================= */

function toRemote(e, userId) {
  return {
    user_id: userId,
    id: e.id,
    date: e.date,
    ts: e.ts,
    mood: e.mood,
    note: e.note || "",
    edited_ts: e.editedTs || null,
    backfilled: !!e.backfilled,
    deleted: !!e.deleted
  };
}

export function fromRemote(r) {
  return {
    id: r.id,
    date: r.date,
    ts: Number(r.ts),
    mood: r.mood,
    note: r.note || "",
    editedTs: r.edited_ts ? Number(r.edited_ts) : undefined,
    backfilled: !!r.backfilled,
    deleted: !!r.deleted,
    dirty: false
  };
}

function toRemoteDaily(e, userId) {
  return {
    user_id: userId,
    id: e.id,
    date: e.date,
    ts: e.ts,
    item: e.item,
    edited_ts: e.editedTs || null,
    deleted: !!e.deleted
  };
}

export function fromRemoteDaily(r) {
  return {
    id: r.id,
    date: r.date,
    ts: Number(r.ts),
    item: r.item,
    editedTs: r.edited_ts ? Number(r.edited_ts) : undefined,
    deleted: !!r.deleted,
    dirty: false
  };
}

/* ================= 拉 / 推 ================= */

/** 拉取游标之后有变动的记录。首次（无游标）拉全部。 */
export async function pull() {
  let q = sb().from(TABLE).select("*").order("updated_at", { ascending: true }).limit(5000);
  const cursor = getCursor();
  if (cursor) q = q.gt("updated_at", cursor);

  const { data, error } = await q;
  if (error) throw new Error("拉取失败：" + error.message);

  if (data && data.length) setCursor(data[data.length - 1].updated_at);
  return (data || []).map(fromRemote);
}

/** 推送本地待同步的记录。返回成功推上去的条数。 */
export async function push(rows, userId) {
  if (!rows.length) return 0;

  // 分批，避免一次请求过大
  const CHUNK = 200;
  let newest = getCursor();

  for (let i = 0; i < rows.length; i += CHUNK) {
    const batch = rows.slice(i, i + CHUNK).map(e => toRemote(e, userId));
    const { data, error } = await sb()
      .from(TABLE)
      .upsert(batch, { onConflict: "user_id,id" })
      .select("updated_at");
    if (error) throw new Error("上传失败：" + error.message);

    // 把游标推到自己刚写入的时间，免得下一轮把自己写的又拉回来
    (data || []).forEach(r => { if (!newest || r.updated_at > newest) newest = r.updated_at; });
  }

  if (newest) setCursor(newest);
  return rows.length;
}

/** 拉取日课记录。规则与 pull() 完全一致，只是换了表和游标。 */
export async function pullDaily() {
  let q = sb().from(TABLE_DAILY).select("*").order("updated_at", { ascending: true }).limit(5000);
  const cursor = getCursorDaily();
  if (cursor) q = q.gt("updated_at", cursor);

  const { data, error } = await q;
  if (error) throw new Error("拉取日课失败：" + error.message);

  if (data && data.length) setCursorDaily(data[data.length - 1].updated_at);
  return (data || []).map(fromRemoteDaily);
}

/** 推送日课记录。 */
export async function pushDaily(rows, userId) {
  if (!rows.length) return 0;

  const CHUNK = 200;
  let newest = getCursorDaily();

  for (let i = 0; i < rows.length; i += CHUNK) {
    const batch = rows.slice(i, i + CHUNK).map(e => toRemoteDaily(e, userId));
    const { data, error } = await sb()
      .from(TABLE_DAILY)
      .upsert(batch, { onConflict: "user_id,id" })
      .select("updated_at");
    if (error) throw new Error("上传日课失败：" + error.message);

    (data || []).forEach(r => { if (!newest || r.updated_at > newest) newest = r.updated_at; });
  }

  if (newest) setCursorDaily(newest);
  return rows.length;
}
