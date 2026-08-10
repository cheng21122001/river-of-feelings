/* share.js — 分享链接、导出、导入。数据不经过任何服务器。 */

import { all, merge, markBackup } from "./store.js";
import { toast } from "./ui.js";

export function encodeData(list) {
  return btoa(unescape(encodeURIComponent(JSON.stringify(list))));
}

export function decodeData(str) {
  try { return JSON.parse(decodeURIComponent(escape(atob(str)))); } catch (e) { return null; }
}

export function shareLink() {
  const list = all();
  if (!list.length) { toast("先记录一点什么，再分享吧"); return null; }
  return location.origin + location.pathname + "#share=" + encodeData(list);
}

export function exportFile() {
  const list = all();
  if (!list.length) { toast("还没有可以导出的记录"); return; }
  const blob = new Blob([JSON.stringify(list, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "第无数次踏入同一条河流-" + new Date().toISOString().slice(0, 10) + ".json";
  a.click();
  URL.revokeObjectURL(a.href);
  markBackup();
  toast("已导出 " + list.length + " 条");
}

export function importFile(file, onDone) {
  const rd = new FileReader();
  rd.onload = async () => {
    let data;
    try {
      data = JSON.parse(rd.result);
      if (!Array.isArray(data)) throw new Error("not an array");
    } catch (e) {
      toast("这个文件读不出来");
      return;
    }
    const n = await merge(data);
    toast(n ? "已导入 " + n + " 条" : "这些记录都已经在你的河里了");
    if (onDone) onDone();
  };
  rd.onerror = () => toast("这个文件读不出来");
  rd.readAsText(file);
}

export function copy(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text)
      .then(() => toast("链接已复制，去交给那个人吧"))
      .catch(() => fallbackCopy(text));
  } else {
    fallbackCopy(text);
  }
}

function fallbackCopy(text) {
  const ta = document.createElement("textarea");
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand("copy"); toast("链接已复制"); }
  catch (e) { prompt("复制这个链接：", text); }
  ta.remove();
}
