/* share.js — 导出与导入备份文件。
   「生成共享链接」的功能已经撤掉（有了云同步之后它只会让人困惑），
   但读取链接的能力留着——以前发出去的链接还能打开。
*/

import { all, merge, markBackup } from "./store.js";
import { toast } from "./ui.js";

export function decodeData(str) {
  try { return JSON.parse(decodeURIComponent(escape(atob(str)))); } catch (e) { return null; }
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
