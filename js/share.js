/* share.js — 导出与导入备份文件。
   共享链接那套（生成、读取、接进自己的河）已整体撤除：
   有了云同步之后，跨设备就是登录，不需要把整条河编码进网址。
*/

import { all, merge, markBackup } from "./store.js";
import { toast } from "./ui.js";

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
