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

  wire(box, date, onChange);
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
    btn.onclick = () => commit(box, date, btn.dataset.ok, onChange);
  });

  box.querySelectorAll(".daily-min").forEach(input => {
    input.onkeydown = e => {
      if (e.key === "Enter") { e.preventDefault(); commit(box, date, input.dataset.item, onChange); }
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
  const n = Math.round(Number(input && input.value));
  if (!n || n <= 0) { toast("填个分钟数"); if (input) input.focus(); return; }
  if (n > 600) { toast("最多 600 分钟"); return; }

  await daily.add(daily.makeLog({ item, minutes: n, date }));
  toast(daily.ITEMS[item].label + " " + n + " 分钟");
  renderToday(box, onChange);
  if (onChange) onChange();
}
