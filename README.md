# 第无数次踏入同一条河流

一个记录心情的 PWA。每天选「快乐 / 平静 / 不妙」，写一句话（或者不写）。
记录汇成一条河，也汇成一张一年的日历。

- 本地优先：记录存在设备上（IndexedDB），装到主屏后完全离线可用
- 登录后跨设备同步（Supabase）；不登录也能用，只是不出这台设备

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
js/store.js             IndexedDB、从旧版 localStorage 迁移
js/calendar.js          年度网格（12 个月方阵）
js/digest.js            月份名、「历」页顶部那行数字
js/entries.js           记录卡片：编辑、删除、撤销
js/ui.js                toast、底部抽屉
js/app.js               启动、路由、各页装配
js/config.js            Supabase URL 与 anon key（公开值，靠 RLS 保护）
js/cloud.js             登录、拉取、上传
js/sync.js              何时同步、怎么合并
js/daily-store.js       日课记录：IndexedDB daily store
js/schedule.js          排班表（存 localStorage，不同步）
js/daily.js             日课界面：河页打卡、我页统计与排班表
js/vendor/supabase.js   Supabase 客户端（本地放置，CDN 版离线时用不了）
docs/daily_logs.sql     日课表的建表语句与行级权限
sw.js                   离线缓存
tools/make-icons.mjs    生成图标（node tools/make-icons.mjs）
artifact.html           旧版单文件存档，不再维护
```

## 同步是怎么合的

- 顺序固定「先拉后推」。拉下来的**不覆盖**本地未推送的改动，随后本地改动被推上去覆盖云端——同一条记录在两台设备都改过时，**后同步的那台赢**。不比较两台设备的钟。
- 删除不真删，只把 `deleted` 标成 true（墓碑）。否则在 A 设备删掉一条，B 设备一同步又会把它捞回来。
- 每条记录带一个本地 `dirty` 标记，推送成功才清掉。断网期间照记，联网后自动补传。
- 首次登录会把这台设备已有的记录全部标为待传，并入该账号；换成另一个账号登录则先清空本地再全量拉，避免把上一个人的记录混进去。

数据库那张表的建表语句和行级权限策略见 `docs/`（或 Supabase 项目里的 SQL Editor 历史）。**行级权限是安全的关键**：anon key 是公开值，谁都能拿到，但策略限定「只能读写 `auth.uid()` 等于自己的行」，所以拿到 key 也读不到别人的记录。

心情和日课是两条独立的流水线，合并规则完全相同。换账号时两套数据必须一起清空重拉——漏掉任何一套都会让上一个账号的记录残留在新账号里。

## 改完之后

**改了任何静态文件，必须把 `sw.js` 顶部的 `VERSION` 加一**，否则用户的浏览器会一直用缓存里的旧版本，你的改动不会生效。

## 数据格式

```js
{ id, date: "YYYY-MM-DD", ts, mood: "happy"|"calm"|"low", note, editedTs?, backfilled? }
```

和旧版单文件版本完全一致。

日课记录：

```js
{ id, date: "YYYY-MM-DD", ts, item: "vocab"|"reading"|"writing"|"spanish"|"fitness"|"movie",
  editedTs?, deleted?, dirty? }
```

一条记录只说明「这一天这个项目做了」。没有时长、没有备注——刻意的，不把一天折算成数字。

排班表存在 `localStorage` 的 `river_daily_schedule`，**不同步**——一份 7×5 的小配置，换设备重填比加一条同步流水线便宜。
