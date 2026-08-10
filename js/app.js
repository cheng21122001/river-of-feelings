/* app.js — 把河、日历、记录串起来。 */

import * as store from "./store.js";
import { MOOD } from "./store.js";
import { createRiver } from "./river.js";
import { createEntryList } from "./entries.js";
import { renderYear } from "./calendar.js";
import { yearLine } from "./digest.js";
import { $, esc, toast, openSheet, closeSheet, initSheet, prettyDate } from "./ui.js";
import * as sync from "./sync.js";

const RECENT_LIMIT = 8;

let river = null;
let recentList = null;
let showAllRecent = false;
let viewYear = new Date().getFullYear();
let todaySel = null;

/* ================= 启动 ================= */

async function boot() {
  const info = await store.init();

  initSheet();
  initTabs();
  initThemeToggle();
  initTodayCard();
  initHistoryNav();

  river = createRiver({
    canvas: $("#scene-canvas"),
    empty: $("#emptyScene")
  });

  recentList = createEntryList($("#entries"), {
    onChange: refresh,
    emptyText: "还没有记录。"
  });

  const ys = store.years();
  if (ys.length) viewYear = Number(ys[ys.length - 1]);
  if (viewYear < new Date().getFullYear() && store.all().some(e => e.date.startsWith(String(new Date().getFullYear())))) {
    viewYear = new Date().getFullYear();
  }

  river.start();
  refresh();

  routeFromHash();
  window.addEventListener("hashchange", routeFromHash);

  // 主题跟随系统或手动切换时，河要重画
  if (window.matchMedia) {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const h = () => river.updateTheme();
    mq.addEventListener ? mq.addEventListener("change", h) : mq.addListener(h);
  }
  new MutationObserver(() => river.updateTheme())
    .observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  let rz;
  window.addEventListener("resize", () => {
    clearTimeout(rz);
    rz = setTimeout(() => river.resize(), 180);
  });

  if (info.migrated) toast("已把 " + info.migrated + " 条旧记录搬进来了");
  if (info.fallback) toast("这台设备的数据库用不了，已改用备用存储");

  initAuth();
  sync.onState(renderAuth);
  // 云端拉到新东西时，整页重画
  sync.init(() => { refresh(); renderAuth(); });

  registerSW();
}

/* ================= 全局刷新 ================= */

function refresh() {
  const list = store.all();

  river.setData(list);
  renderLedger(list);
  renderRecent(list);
  renderHistory();
  renderMe(list);
  sync.scheduleSync();   // 有本地改动就攒一会儿推上去；没登录时它自己不动
}

/* ================= 河（今天页） ================= */

function initTodayCard() {
  const d = new Date();
  $("#today").textContent = prettyDate(store.todayStr(d));

  document.querySelectorAll("#moods .mood").forEach(el => {
    const pick = () => {
      document.querySelectorAll("#moods .mood").forEach(x => x.classList.remove("sel"));
      el.classList.add("sel");
      todaySel = el.dataset.m;
    };
    el.onclick = pick;
    el.onkeydown = ev => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); pick(); } };
  });

  $("#clearSel").onclick = () => {
    document.querySelectorAll("#moods .mood").forEach(x => x.classList.remove("sel"));
    todaySel = null;
    $("#note").value = "";
  };

  $("#save").onclick = async () => {
    if (!todaySel) { toast("先选一个心情"); return; }
    await store.add(store.makeEntry({ mood: todaySel, note: $("#note").value }));
    $("#note").value = "";
    document.querySelectorAll("#moods .mood").forEach(x => x.classList.remove("sel"));
    todaySel = null;
    refresh();
    toast("已记下这一刻");
  };
}

function renderLedger(list) {
  const s = store.stats(list);
  $("#sHappy").textContent = s.happy;
  $("#sCalm").textContent = s.calm;
  $("#sLow").textContent = s.low;
}

function renderRecent(list) {
  const shown = showAllRecent ? list : list.slice(0, RECENT_LIMIT);
  $("#entryCount").textContent = list.length ? list.length + " 条" : "";
  recentList.render(shown, false);

  const more = $("#moreRow");
  if (list.length > RECENT_LIMIT) {
    more.innerHTML = "<button>" + (showAllRecent ? "收起" : "显示全部 " + list.length + " 条") + "</button>";
    more.querySelector("button").onclick = () => { showAllRecent = !showAllRecent; renderRecent(store.all()); };
  } else {
    more.innerHTML = "";
  }
}

/* ================= 历 ================= */

function initHistoryNav() {
  $("#yearPrev").onclick = () => { viewYear--; renderHistory(); };
  $("#yearNext").onclick = () => { viewYear++; renderHistory(); };
}

function renderHistory() {
  const all = store.all();
  const ys = store.years().map(Number);
  const thisYear = new Date().getFullYear();
  const minY = ys.length ? Math.min(...ys, thisYear) : thisYear;
  const maxY = ys.length ? Math.max(...ys, thisYear) : thisYear;
  viewYear = Math.min(maxY, Math.max(minY, viewYear));

  $("#yearPrev").disabled = viewYear <= minY;
  $("#yearNext").disabled = viewYear >= maxY;
  $("#yearLabel").textContent = viewYear;

  const list = all.filter(e => e.date.startsWith(String(viewYear)));
  $("#yearLine").textContent = yearLine(list);

  renderYear($("#yearGrid"), viewYear, list, openDaySheet);
}

/* ================= 某一天（抽屉） ================= */

function openDaySheet(date) {
  const dayEntries = store.onDate(date);
  const isToday = date === store.todayStr();
  let pick = null;

  openSheet(prettyDate(date), body => {
    const listBox = document.createElement("div");
    body.appendChild(listBox);

    const list = createEntryList(listBox, {
      onChange: () => { refresh(); rerenderSheetList(); },
      emptyText: isToday ? "今天还没有记录。" : "这一天没有留下记录。",
      metaMode: "time"
    });
    list.render(dayEntries, false);

    function rerenderSheetList() { list.render(store.onDate(date), false); }

    // 补记 / 再记一条
    const add = document.createElement("div");
    add.className = "sheet-add";
    add.innerHTML =
      '<div class="section-h"><h3>' + (isToday ? "再记一条" : "补记这一天") + "</h3></div>" +
      '<div class="moods">' +
        '<div class="mood" data-m="happy" role="button" tabindex="0"><span class="ind"><span class="disc"></span></span>快乐</div>' +
        '<div class="mood" data-m="calm" role="button" tabindex="0"><span class="ind"><span class="bar"></span></span>平静</div>' +
        '<div class="mood" data-m="low" role="button" tabindex="0"><span class="ind"><span class="ring"></span></span>不妙</div>' +
      "</div>" +
      '<textarea class="sheet-ta" placeholder="（可留空）"></textarea>' +
      '<div class="row"><button class="primary sheet-save">记下</button></div>';
    body.appendChild(add);

    add.querySelectorAll(".mood").forEach(el => {
      const choose = () => {
        add.querySelectorAll(".mood").forEach(x => x.classList.remove("sel"));
        el.classList.add("sel");
        pick = el.dataset.m;
      };
      el.onclick = choose;
      el.onkeydown = ev => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); choose(); } };
    });

    add.querySelector(".sheet-save").onclick = async () => {
      if (!pick) { toast("先选一个心情"); return; }
      const ta = add.querySelector(".sheet-ta");
      const backfilled = !isToday;
      // 补记的记录按它所属的那天排序，而不是按写下的时刻
      const ts = backfilled
        ? Date.parse(date + "T12:00:00") + store.onDate(date).length * 60000
        : Date.now();
      await store.add(store.makeEntry({ mood: pick, note: ta.value, date, backfilled, ts }));
      ta.value = "";
      add.querySelectorAll(".mood").forEach(x => x.classList.remove("sel"));
      pick = null;
      refresh();
      rerenderSheetList();
      toast(backfilled ? "已补记这一天" : "已记下这一刻");
    };
  });
}

/* ================= 我 ================= */

function renderMe(list) {
  const s = store.stats(list);
  const first = list.length ? list[list.length - 1].date : null;

  $("#meStats").innerHTML =
    tile(s.total, "条记录") +
    tile(s.days, "天") +
    tile(s.low, "次不妙") +
    tile(first ? first.slice(5).replace("-", "/") : "—", first ? first.slice(0, 4) + " 年起" : "还没开始");
}

function tile(v, label) {
  return "<div><b>" + esc(String(v)) + "</b><span>" + esc(label) + "</span></div>";
}

/* ================= 账号与同步 ================= */

function initAuth() {
  const form = $("#authForm");
  const emailEl = $("#authEmail");
  const passEl = $("#authPass");

  const creds = () => ({ email: emailEl.value.trim(), password: passEl.value });
  const busy = on => {
    $("#signInBtn").disabled = on;
    $("#signUpBtn").disabled = on;
  };

  form.onsubmit = async ev => {
    ev.preventDefault();
    const { email, password } = creds();
    if (!email || !password) return;
    busy(true);
    authMsg("");
    try {
      await sync.signIn(email, password);
      passEl.value = "";
      toast("已登录，正在同步");
    } catch (e) {
      authMsg(e.message, true);
    } finally { busy(false); }
  };

  $("#signUpBtn").onclick = async () => {
    const { email, password } = creds();
    if (!email || !password) { authMsg("先填邮箱和密码", true); return; }
    if (password.length < 6) { authMsg("密码至少 6 位", true); return; }
    busy(true);
    authMsg("");
    try {
      const r = await sync.signUp(email, password);
      passEl.value = "";
      if (r.needsEmail) authMsg("注册成功。去邮箱点确认链接，回来再登录。");
      else toast("账号已创建，正在同步");
    } catch (e) {
      authMsg(e.message, true);
    } finally { busy(false); }
  };

  $("#signOutBtn").onclick = async () => {
    await sync.signOut();
    toast("已退出");
  };

  $("#syncNowBtn").onclick = async () => {
    await sync.syncNow();
    refresh();
  };

  renderAuth(sync.getState());
}

function authMsg(text, bad) {
  const el = $("#authMsg");
  if (!text) { el.hidden = true; el.textContent = ""; return; }
  el.hidden = false;
  el.textContent = text;
  el.classList.toggle("bad", !!bad);
}

function renderAuth(state) {
  state = state || sync.getState();
  const signedIn = !!state.user;

  $("#authOut").hidden = signedIn;
  $("#authIn").hidden = !signedIn;
  $("#syncStatus").textContent = sync.statusText();

  if (signedIn) {
    $("#authWho").textContent = state.user.email || "";
    const n = state.pendingCount;
    $("#syncHint").textContent = n ? n + " 条待同步" : "";
  }
}

/* ================= tab ================= */

function initTabs() {
  document.querySelectorAll(".tab").forEach(b => {
    b.onclick = () => { location.hash = "#/" + b.dataset.tab; };
  });
}

function routeFromHash() {
  const m = /^#\/(today|history|me)$/.exec(location.hash);
  switchTab(m ? m[1] : "today");
}

function switchTab(name) {
  ["today", "history", "me"].forEach(n => {
    $("#page-" + n).hidden = n !== name;
  });
  document.querySelectorAll(".tab").forEach(b => b.classList.toggle("on", b.dataset.tab === name));
  closeSheet();
  window.scrollTo(0, 0);
  if (name === "today" && river) river.resize();
}

/* ================= 主题 ================= */

function currentPref() {
  try {
    const t = localStorage.getItem("river_theme");
    return (t === "light" || t === "dark") ? t : "auto";
  } catch (e) { return "auto"; }
}

function initThemeToggle() {
  mark(currentPref());
  document.querySelectorAll("[data-theme-set]").forEach(b => {
    b.onclick = () => {
      const v = b.dataset.themeSet;
      try {
        if (v === "auto") {
          localStorage.removeItem("river_theme");
          document.documentElement.removeAttribute("data-theme");
        } else {
          localStorage.setItem("river_theme", v);
          document.documentElement.setAttribute("data-theme", v);
        }
      } catch (e) {}
      mark(v);
    };
  });
  function mark(pref) {
    document.querySelectorAll("[data-theme-set]").forEach(b => b.classList.toggle("on", b.dataset.themeSet === pref));
  }
}

/* ================= Service Worker ================= */

function registerSW() {
  if (!("serviceWorker" in navigator)) return;
  if (location.protocol === "file:") return;
  const go = () => navigator.serviceWorker.register("sw.js").catch(() => {});
  // boot() 里有 await，跑到这里时 load 多半已经过去了——那就直接注册
  if (document.readyState === "complete") go();
  else window.addEventListener("load", go, { once: true });
}

boot();
