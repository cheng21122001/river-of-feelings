/* calendar.js — 一年的样子：12 个月方阵。
   格子的心情 = 当天出现次数最多的那种（打平取最晚一条），规则在 store.dayMood。
*/

import { dayMood, todayStr } from "./store.js";
import { MONTHS } from "./digest.js";
import { esc } from "./ui.js";

const WD = ["一", "二", "三", "四", "五", "六", "日"];

/**
 * @param {HTMLElement} container
 * @param {number} year
 * @param {Array} list 该年的全部记录
 * @param {Function} onDayClick (dateStr) => void
 */
export function renderYear(container, year, list, onDayClick) {
  const byDate = new Map();
  list.forEach(e => {
    if (!byDate.has(e.date)) byDate.set(e.date, []);
    byDate.get(e.date).push(e);
  });

  const today = todayStr();
  const html = [];

  for (let m = 0; m < 12; m++) {
    const monthEntries = list.filter(e => Number(e.date.slice(5, 7)) === m + 1);
    html.push(monthHTML(year, m, byDate, today, monthEntries));
  }

  container.innerHTML = html.join("");

  container.querySelectorAll(".cell[data-date]").forEach(btn => {
    btn.onclick = () => onDayClick(btn.dataset.date);
  });
}

function monthHTML(year, m, byDate, today, monthEntries) {
  const first = new Date(year, m, 1);
  const daysInMonth = new Date(year, m + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7;   // 周一起始

  const days = new Set(monthEntries.map(e => e.date)).size;

  const cells = [];
  for (let i = 0; i < lead; i++) cells.push('<span class="cell pad"></span>');

  for (let d = 1; d <= daysInMonth; d++) {
    const date = year + "-" + String(m + 1).padStart(2, "0") + "-" + String(d).padStart(2, "0");
    const isFuture = date > today;

    if (isFuture) {
      // 未来的日子不画格子，只留位置
      cells.push('<span class="cell future"></span>');
      continue;
    }

    const dayEntries = byDate.get(date);
    const mood = dayMood(dayEntries);
    const cls = ["cell", mood || "none"];
    if (date === today) cls.push("today");

    const n = dayEntries ? dayEntries.length : 0;
    const aria = date + (mood ? "，" + ({ happy: "快乐", calm: "平静", low: "不妙" }[mood]) : "，没有记录") +
                 (n > 1 ? "，" + n + " 条" : "");

    cells.push(
      '<button class="' + cls.join(" ") + '" data-date="' + date + '" aria-label="' + esc(aria) + '">' +
      '<i></i>' + (n > 1 ? '<u></u>' : "") +
      "</button>"
    );
  }

  return '<section class="month">' +
    '<div class="m-cal">' +
      '<div class="m-wd">' + WD.map(w => "<span>" + w + "</span>").join("") + "</div>" +
      '<div class="m-grid">' + cells.join("") + "</div>" +
    "</div>" +
    '<div class="m-side">' +
      '<div class="m-head"><h4>' + MONTHS[m] + "</h4>" +
      (days ? '<span class="m-count">' + days + " 天</span>" : "") + "</div>" +
    "</div>" +
    "</section>";
}
