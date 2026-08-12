/* daily.js — 日课在界面上的那一层。
   「河」页只显示今天排了什么，填分钟就记下。
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
  const expanded = box.dataset.expanded === "1";
  const extra = daily.ITEM_KEYS.filter(k => !planned.includes(k));
  const shown = expanded ? planned.concat(extra) : planned;

  // 重画会整个换掉 box.innerHTML——先把还没提交的输入捞出来，画完再填回去。
  // 刚提交成功的那一行画完之后不再是输入框，捞不到自然也填不回去。
  const pending = capturePending(box);

  const head = planned.length ? "今天排了" : "今天没排，想记也可以记";

  const rows = shown.map(k => rowHTML(k, date, !planned.includes(k))).join("");

  const moreLabel = expanded ? "收起" : "记别的";
  const more = extra.length
    ? '<button class="ghost daily-more" id="dailyMore">' + moreLabel + "</button>"
    : "";

  box.innerHTML =
    '<div class="daily-h">' + esc(head) + "</div>" +
    '<div class="daily-rows">' + rows + "</div>" +
    (more ? '<div class="daily-foot">' + more + "</div>" : "");

  restorePending(box, pending);
  wire(box, date, onChange);
}

function capturePending(box) {
  const out = {};
  box.querySelectorAll(".daily-min").forEach(input => {
    if (input.value !== "") out[input.dataset.item] = input.value;
  });
  return out;
}

function restorePending(box, pending) {
  box.querySelectorAll(".daily-min").forEach(input => {
    const v = pending[input.dataset.item];
    if (v !== undefined) input.value = v;
  });
}

function rowHTML(item, date, isExtra) {
  const mins = daily.minutesOn(date, item);
  const label = daily.ITEMS[item].label;
  const done = mins > 0;

  const right = done
    ? '<span class="daily-done">已记 ' + mins + ' 分钟</span>' +
      '<button class="daily-undo" data-undo="' + item + '" aria-label="撤销">×</button>'
    : '<input class="daily-min" type="number" inputmode="numeric" min="1" max="600" ' +
      'placeholder="分钟" data-item="' + item + '">' +
      '<button class="daily-ok" data-ok="' + item + '" aria-label="记下">✓</button>';

  return '<div class="daily-row' + (done ? " on" : "") + (isExtra ? " extra" : "") + '">' +
    '<span class="daily-name">' + esc(label) + "</span>" +
    '<span class="daily-act">' + right + "</span>" +
    "</div>";
}

function wire(box, date, onChange) {
  const more = box.querySelector("#dailyMore");
  if (more) {
    more.onclick = () => {
      box.dataset.expanded = box.dataset.expanded === "1" ? "0" : "1";
      renderToday(box, onChange);
    };
  }

  box.querySelectorAll("[data-ok]").forEach(btn => {
    btn.onclick = () => {
      if (btn.disabled) return;
      btn.disabled = true;   // 提交进行中，挡掉连点造成的重复记录
      commit(box, date, btn.dataset.ok, onChange);
    };
  });

  box.querySelectorAll(".daily-min").forEach(input => {
    input.onkeydown = e => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      const btn = box.querySelector('[data-ok="' + input.dataset.item + '"]');
      if (btn) {
        if (btn.disabled) return;
        btn.disabled = true;
      }
      commit(box, date, input.dataset.item, onChange);
    };
  });

  box.querySelectorAll("[data-undo]").forEach(btn => {
    btn.onclick = async () => {
      const item = btn.dataset.undo;
      const logs = daily.onDate(date).filter(e => e.item === item);
      for (const e of logs) await daily.remove(e.id);
      toast(daily.ITEMS[item].label + "已撤销");
      renderToday(box, onChange);
      if (onChange) onChange();
    };
  });
}

async function commit(box, date, item, onChange) {
  const input = box.querySelector('.daily-min[data-item="' + item + '"]');
  const btn = box.querySelector('[data-ok="' + item + '"]');
  const n = Math.round(Number(input && input.value));
  if (!n || n <= 0) { toast("填个分钟数"); if (input) input.focus(); if (btn) btn.disabled = false; return; }
  if (n > 600) { toast("最多 600 分钟"); if (btn) btn.disabled = false; return; }

  await daily.add(daily.makeLog({ item, minutes: n, date }));
  toast(daily.ITEMS[item].label + " " + n + " 分钟");
  renderToday(box, onChange);
  if (onChange) onChange();
}

/* ===== 「我」页 ===== */

const DOW = ["一", "二", "三", "四", "五", "六", "日"];

export function renderStats(box) {
  const s = daily.statsSince(30);
  const streak = daily.streak();
  const hours = Math.round(s.minutes / 6) / 10;   // 一位小数

  const dist = daily.ITEM_KEYS
    .filter(k => s.byItem[k] > 0)
    .map(k => '<div class="dist-row"><span>' + esc(daily.ITEMS[k].label) + "</span>" +
              "<b>" + s.byItem[k] + " 分钟</b></div>")
    .join("");

  box.innerHTML =
    '<div class="me-row"><span>连续</span><b>' + streak + " 天</b></div>" +
    '<div class="me-row"><span>近 30 天</span><b>' + s.days + " 天 · " + hours + " 小时</b></div>" +
    (dist ? '<div class="dist">' + dist + "</div>"
          : '<div class="me-hint">近 30 天还没有日课记录。</div>');
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
