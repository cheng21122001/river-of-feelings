/* ui.js — 到处都要用的小东西：转义、toast、底部抽屉。 */

export function esc(s) {
  return String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

export const $ = s => document.querySelector(s);

let toastTimer;

export function toast(msg) {
  const el = $("#toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2400);
}

export function toastUndo(msg, onUndo) {
  const el = $("#toast");
  if (!el) return;
  el.innerHTML = esc(msg) + ' <button class="toast-undo">撤销</button>';
  el.classList.add("show");
  el.querySelector(".toast-undo").onclick = () => { el.classList.remove("show"); onUndo(); };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 6000);
}

/* ---------- 底部抽屉 ---------- */

let sheetCloser = null;

export function openSheet(title, buildBody) {
  const sheet = $("#sheet");
  const back = $("#sheet-back");
  $("#sheet-title").textContent = title;
  const body = $("#sheet-body");
  body.innerHTML = "";
  buildBody(body);
  back.classList.add("show");
  sheet.classList.add("show");
  document.body.style.overflow = "hidden";
  sheetCloser = () => closeSheet();
  return { body, close: closeSheet };
}

export function closeSheet() {
  const sheet = $("#sheet");
  const back = $("#sheet-back");
  if (!sheet) return;
  sheet.classList.remove("show");
  back.classList.remove("show");
  document.body.style.overflow = "";
  sheetCloser = null;
}

export function initSheet() {
  $("#sheet-back").onclick = () => closeSheet();
  $("#sheet-close").onclick = () => closeSheet();
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && sheetCloser) sheetCloser();
  });
}

/** 把日期串写成人能读的样子 */
export function prettyDate(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const wd = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"][new Date(y, m - 1, d).getDay()];
  return dateStr + " · " + wd;
}
