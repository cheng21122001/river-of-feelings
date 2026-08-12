/* daily.js — 日课在界面上的那一层。
   「河」页只显示今天排了什么，点一下就是做了，再点一下撤销。
   漏做的项目保持中性：不标红、不显示欠账——排班表是提示，不是债主。
*/

import * as daily from "./daily-store.js";
import * as schedule from "./schedule.js";
import { todayStr } from "./store.js";
import { esc, toast } from "./ui.js";

/**
 * 画「河」页的日课区。
 * @param {HTMLElement} box
 * @param {Function} onChange 记录变动后调用，用来触发同步与重绘
 */
export function renderToday(box, onChange) {
  const date = todayStr();
  const planned = schedule.forDate(date);

  // 只画今天排了的。想记别的，就去「我」页把它排进来——
  // 排班表是这里唯一的入口，没有临时通道。
  const head = planned.length ? "今天排了" : "今天没排";

  const rows = planned.map(k => rowHTML(k, date)).join("");

  box.innerHTML =
    '<div class="daily-h">' + esc(head) + "</div>" +
    '<div class="daily-rows">' + rows + "</div>";

  wire(box, date, onChange);
}

function rowHTML(item, date) {
  const done = daily.doneOn(date, item);
  const label = daily.ITEMS[item].label;
  return '<button type="button" class="daily-row' + (done ? " on" : "") +
    '" data-item="' + item + '" ' +
    'aria-pressed="' + (done ? "true" : "false") + '">' +
    '<span class="daily-name">' + esc(label) + "</span>" +
    '<span class="daily-mark">' + (done ? "✓" : "○") + "</span>" +
    "</button>";
}

function wire(box, date, onChange) {
  box.querySelectorAll(".daily-row[data-item]").forEach(btn => {
    btn.onclick = () => {
      if (btn.disabled) return;
      btn.disabled = true;   // 挡掉连点：add/remove 都要等一次 IndexedDB 事务
      toggle(box, date, btn.dataset.item, onChange);
    };
  });
}

async function toggle(box, date, item, onChange) {
  const logs = daily.onDate(date).filter(e => e.item === item);
  if (logs.length) {
    for (const e of logs) await daily.remove(e.id);
    toast(daily.ITEMS[item].label + "已撤销");
  } else {
    await daily.add(daily.makeLog({ item, date }));
    toast(daily.ITEMS[item].label + " 记下了");
  }
  renderToday(box, onChange);
  if (onChange) onChange();
}

/* ===== 「我」页 ===== */

const DOW = ["一", "二", "三", "四", "五", "六", "日"];

export function renderStats(box) {
  box.innerHTML = '<div class="me-row"><span>连续</span><b>' + daily.streak() + " 天</b></div>";
}

export function renderSchedule(box, onChange) {
  const sch = schedule.get();

  box.innerHTML = DOW.map((label, i) => {
    const dow = i + 1;
    const on = sch[dow] || [];
    const chips = daily.ITEM_KEYS.map(k =>
      '<button class="chip' + (on.includes(k) ? " on" : "") + '" ' +
      'data-dow="' + dow + '" data-item="' + k + '">' + esc(daily.ITEMS[k].label) + "</button>"
    ).join("");
    return '<div class="sched-row"><span class="sched-d">' + label + "</span>" +
           '<div class="chips">' + chips + "</div></div>";
  }).join("");

  box.querySelectorAll(".chip").forEach(btn => {
    btn.onclick = () => {
      schedule.toggle(Number(btn.dataset.dow), btn.dataset.item);
      renderSchedule(box, onChange);
      if (onChange) onChange();
    };
  });
}
