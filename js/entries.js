/* entries.js — 一组记录卡片，带编辑与删除。
   「河」页的最近记录、日历里点开的某一天，用的都是这一套。
*/

import { MOOD, update, remove, restore } from "./store.js";
import { esc, toast, toastUndo } from "./ui.js";

/**
 * @param {HTMLElement} container
 * @param {object} opts
 * @param {Function} opts.onChange 数据变动后回调（重画河流、日历等）
 * @param {string}   opts.emptyText 没有记录时显示的话
 * @param {string}   opts.metaMode "date"（默认）显示日期；"time" 显示时刻，
 *                   用在某一天的抽屉里——标题已经是那天了，再重复日期是废话
 */
export function createEntryList(container, { onChange, emptyText, metaMode } = {}) {
  let editingId = null, confirmingId = null, editMood = null;
  let current = [], readonly = false;

  function render(list, ro) {
    current = list || [];
    readonly = !!ro;
    const sorted = current.slice().sort((a, b) => b.ts - a.ts);

    if (!sorted.length) {
      container.innerHTML = '<div class="empty">' + esc(emptyText || "还没有记录。") + "</div>";
      return;
    }

    container.innerHTML = sorted.map(cardHTML).join("");
    if (!readonly) wire();
  }

  function cardHTML(e) {
    const m = MOOD[e.mood] || MOOD.calm;

    if (!readonly && editingId === e.id) {
      const opt = (mm, lbl, ic) =>
        '<button class="em' + (editMood === mm ? " sel" : "") + '" data-m="' + mm + '">' + ic + " " + lbl + "</button>";
      return '<div class="entry editing"><div class="dot ' + (MOOD[editMood] || m).cls + '"></div><div class="body">' +
        '<div class="meta">' + esc(e.date) + "</div>" +
        '<div class="edit-moods">' + opt("happy", "快乐", "●") + opt("calm", "平静", "—") + opt("low", "不妙", "○") + "</div>" +
        '<textarea class="edit-note" placeholder="（可留空）">' + esc(e.note || "") + "</textarea>" +
        '<div class="edit-actions"><button class="mini-primary" data-act="save" data-id="' + e.id + '">保存</button>' +
        '<button class="mini-ghost" data-act="cancel">取消</button></div>' +
        "</div></div>";
    }

    const note = e.note ? '<div class="note">' + esc(e.note) + "</div>" : "";

    const mark = e.backfilled ? '<span class="tag tag-back">补记</span>' : "";

    let actions = "";
    if (!readonly) {
      if (confirmingId === e.id) {
        actions = '<div class="confirm">删掉这条？<button class="c-yes" data-id="' + e.id + '">删除</button><button class="c-no">取消</button></div>';
      } else {
        actions = '<div class="acts"><button class="act act-edit" data-id="' + e.id + '">编辑</button>' +
                  '<button class="act act-del" data-id="' + e.id + '">删除</button></div>';
      }
    }

    return '<div class="entry"><div class="dot ' + m.cls + '"></div><div class="body">' +
      '<div class="meta">' + esc(metaLabel(e)) + ' <span class="tag">' + m.label + "</span>" + mark + "</div>" +
      note + "</div>" + actions + "</div>";
  }

  /** 补记的记录没有真实时刻（ts 是那天中午的占位），就不假装有 */
  function metaLabel(e) {
    if (metaMode !== "time") return e.date;
    if (e.backfilled) return "";
    const d = new Date(e.ts);
    return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  }

  function wire() {
    const emWrap = container.querySelector(".edit-moods");
    if (emWrap) {
      emWrap.querySelectorAll(".em").forEach(b => {
        b.onclick = () => {
          editMood = b.dataset.m;
          emWrap.querySelectorAll(".em").forEach(x => x.classList.toggle("sel", x === b));
        };
      });
    }

    container.querySelectorAll('[data-act="save"]').forEach(b => {
      b.onclick = async () => {
        const ta = container.querySelector(".edit-note");
        const patch = { note: ta ? ta.value.trim() : undefined };
        if (editMood) patch.mood = editMood;
        await update(b.dataset.id, patch);
        editingId = null; editMood = null;
        toast("已保存修改");
        if (onChange) onChange();
      };
    });

    container.querySelectorAll('[data-act="cancel"]').forEach(b => {
      b.onclick = () => { editingId = null; editMood = null; render(current, readonly); };
    });

    container.querySelectorAll(".act-edit").forEach(b => {
      b.onclick = () => {
        const e = current.find(x => x.id === b.dataset.id);
        editingId = b.dataset.id; editMood = e ? e.mood : null; confirmingId = null;
        render(current, readonly);
      };
    });

    container.querySelectorAll(".act-del").forEach(b => {
      b.onclick = () => { confirmingId = b.dataset.id; editingId = null; render(current, readonly); };
    });

    container.querySelectorAll(".c-no").forEach(b => {
      b.onclick = () => { confirmingId = null; render(current, readonly); };
    });

    container.querySelectorAll(".c-yes").forEach(b => {
      b.onclick = async () => {
        const removed = await remove(b.dataset.id);
        confirmingId = null;
        if (onChange) onChange();
        if (removed) {
          toastUndo("已删除这条记录", async () => {
            await restore(removed.id);
            if (onChange) onChange();
            toast("已恢复");
          });
        }
      };
    });
  }

  return { render };
}
