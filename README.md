# 第无数次踏入同一条河流

一个记录心情的 PWA。每天选「快乐 / 平静 / 不妙」，写一句话（或者不写）。
记录汇成一条河，也汇成一张一年的日历。

- 数据只存在你自己的设备里（IndexedDB），不上传任何服务器
- 装到主屏后完全离线可用
- 换设备靠导出/导入一个 JSON 文件

## 装到手机上

用手机浏览器打开网址 → 分享 → **添加到主屏幕**。之后它全屏运行，没有地址栏，断网也能记。

## 本地跑

```
python3 -m http.server 5173
```

然后打开 http://localhost:5173

## 结构

```
index.html              外壳：河 / 历 / 我 三页 + 底部导航
app.css
js/store.js             IndexedDB、从旧版 localStorage 迁移、导入导出
js/river.js             canvas 河流动画
js/calendar.js          年度网格（12 个月方阵）
js/digest.js            月度小结文案（纯本地计算，不调模型）
js/entries.js           记录卡片：编辑、删除、撤销
js/share.js             分享链接 / 导出 / 导入
js/ui.js                toast、底部抽屉
js/app.js               启动、路由、各页装配
sw.js                   离线缓存
tools/make-icons.mjs    生成图标（node tools/make-icons.mjs）
artifact.html           旧版单文件存档，不再维护
```

## 改完之后

**改了任何静态文件，必须把 `sw.js` 顶部的 `VERSION` 加一**，否则用户的浏览器会一直用缓存里的旧版本，你的改动不会生效。

## 数据格式

```js
{ id, date: "YYYY-MM-DD", ts, mood: "happy"|"calm"|"low", note, editedTs?, backfilled? }
```

和旧版单文件版本完全一致，老的导出文件和分享链接都还能导进来。
