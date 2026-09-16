# HotJob（hotjob.cn）岗位详情 URL 与 API 规则

> 规则编号：R-HOTJOB-001 ｜ 创建：2026-09-16 ｜ 状态：强制（新生成/修改 HotJob 岗位链接必须遵守）

## 背景

2026-09-16 用户反馈**创维集团岗位链接错误**（看板点开空白/卡死）。排查发现全库 828 条 HotJob 岗位的 sourceUrl 全部使用了平台**已废弃的 `pb/posDetail.html` 路由**：

- 旧格式：`https://{host}/{tenant}/pb/posDetail.html?postId=X&postType=campus`
- HotJob 平台已改版（`pb/` 前缀 → `mc/` 前缀）：`pb/posList.html` 返回 404、`pb/school.html` 跳转"官网不存在"、`pb/posDetail.html` 打开卡"正在加载中..."
- 正确路由为 `mc/` 前缀，岗位详情为 `mc/detail`

岗位数据本身完全有效（828 条 postId 逐条 API 验证通过、标题全部匹配），坏的是**链接路由**。

## 根因（两层）

**1. URL 生成代码仍输出废弃路由**：`scripts/job-discovery/hotjob.mjs` `parseHotjobDetail()` 生成 sourceUrl 时使用 `${base}/${tenantKey}/pb/posDetail.html?postId=...&postType=campus`——**每次刷新都会重新生成坏链**（不只是历史数据问题）。

**2. 平台改版无感知**：HotJob 平台从 `pb/`（旧版 SPA）迁移到 `mc/`（新版 SPA），旧路由整体下线但未做重定向，存量数据与生成代码全部命中废弃路由。

## 规则

### 1. 详情 URL 格式（强制）

```
新格式：https://{host}/{tenant}/mc/detail?postId={postId}&recruitType={recruitType}
```

- `recruitType` 映射：`campus=1`、`society=2`、`intern=12`、`overseas=13`
- **禁止**生成/写入 `pb/posDetail.html`、`pb/posList.html`、`pb/school.html` 等 `pb/` 前缀路由
- 代码位置：`scripts/job-discovery/hotjob.mjs` `parseHotjobDetail()` sourceUrl 生成处
- 涉及自定义域名（荣耀 `career.honor.com` 等）同样适用（路由结构相同，仅 host 不同）

### 2. 详情 API 调用（强制）

```
POST {base}/wecruit/positionInfo/listPositionDetail/{tenant}?iSaJAx=isAjax&request_locale=zh_CN&t={ts}
headers: content-type: application/x-www-form-urlencoded;charset=UTF-8
         user-agent（浏览器 UA）
         referer: {base}/{tenant}/pb/school.html（同域即可）
         origin: {base}
body: postId={postId}        // 只能传 postId
```

- **tenant 大小写敏感**：保持 URL 原样（`SU` + 小写十六进制），**禁止 toUpperCase**——全大写返回 `state=500`
- **body 禁止附加 `recruitType`**：返回 `{"Exception":{"message":"parameter error: recruitType=campus"}}`
- 无 `wecruit` 前缀的路由返回 405 nginx
- 列表 API：`POST /wecruit/positionInfo/listPosition/{tenant}`（body 含 `recruitType: 1` 等）

### 3. 响应结构双形态判定（强制）

HotJob 详情 API 的响应结构**因请求环境而异**：

| 请求环境 | 响应形态 | 示例 |
|---|---|---|
| node fetch（无 cookie、无 XHR header） | state 在 **data 内** | `{"data":{...,"state":"200","type":"success"}}` |
| 浏览器环境 / 带 XHR header | state 在**顶层** | `{"data":{...},"state":"200","type":"success"}` |

**判定必须双兼容**：`String(payload?.state ?? payload?.data?.state) === '200'`，且最好同时校验 `payload.data.postName` 存在（岗位名即岗位有效的直接证据）。

代码位置：`scripts/job-discovery/hotjob.mjs` `postForm()`、`scripts/fetch-jd-batch.mjs` / `scripts/fetch-jd-batch-retry.mjs` `fetchHotjob()`。

### 4. 源入口 URL（强制）

HotJob 官方源的 `source.url` / `schoolUrl` 默认值必须用 `mc/` 路由：

```
https://wecruit.hotjob.cn/{tenant}/mc/index          // 官网首页
https://wecruit.hotjob.cn/{tenant}/mc/position/campus // 校招职位列表
```

代码位置：`scripts/job-discovery/hotjob.mjs` `pageUrl()`、`scripts/discover-company-sources.mjs`、`scripts/process-company-intake.mjs`。

## 例外

- **hztp 形态源**（如伊利 `yili.hotjob.cn/wt/yili/web/index/CompyiliPageindex_campus`）：不走 `SU{tenant}/mc/` 路由，使用 `{base}/{corpPath}/web/index/CompyiliPageindex_campus` 形态（列表页本身即岗位入口，无独立详情路由），`parseHotjobHztpDetail` 保持原样。
- **平台详情页渲染问题**（2026-09-16 观察）：HotJob 新版详情页前端 JS 当前与 API 响应结构不匹配，直接打开 `mc/detail` 可能显示"内部处理中，请稍后再试..."（平台侧 bug，与数据无关）；官网列表页 `mc/position/campus` 可正常浏览岗位。平台修复后 `mc/detail` 可直接使用。

## 排查速查

| 现象 | 可能原因 | 处理 |
| --- | --- | --- |
| 详情页空白/卡"正在加载中..." | `pb/posDetail.html` 废弃路由 | 换 `mc/detail?postId=X&recruitType=1` |
| 详情页"官网不存在，无法继续访问" | `pb/school.html` 废弃路由 | 换 `mc/index` 或 `mc/position/campus` |
| API 返回 `state=500` | tenant 被 toUpperCase | 保持 URL 原样（SU + 小写 hex） |
| API 返回 `parameter error: recruitType=xxx` | body 附加了 recruitType | 只传 `postId` |
| 详情页"内部处理中" | HotJob 平台详情页 JS 渲染 bug | 从官网列表页进入；等待平台修复 |
| 岗位不存在 | postId 失效（岗位下线） | 重新调列表 API 确认 |

## 验证记录

- 2026-09-16：全库 828 条 HotJob 岗位（hotjob.cn 727 + 荣耀 101）逐条 API 验证 postId 全部有效、标题全部匹配；sourceUrl 统一迁移 `pb/posDetail.html` → `mc/detail?postId=X&recruitType=1`；`hotjob.mjs` sourceUrl 生成、`postForm` 判定、`pageUrl`/`schoolUrl` 默认值同步修正；`npm run check` 通过、npm test 286/286 全绿；推送 commit `44eec10`（数据）+ 本次规则落地 commit。
- 2026-09-16：浏览器实测创维 `mc/index`（官网首页）、`mc/position/campus`（校招列表）正常显示岗位；`pb/` 全系路由 404/跳转"官网不存在"。
