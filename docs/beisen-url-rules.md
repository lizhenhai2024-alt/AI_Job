# 北森（zhiye.com）岗位详情 URL 规则

> 规则编号：R-BEISEN-001 ｜ 创建：2026-09-16 ｜ 状态：强制（check.mjs 校验）

## 背景

2026-09-16 用户反馈长城电源「项目管理工程师」岗位链接打开报**参数错误**：

- 链接：`https://gwpst.zhiye.com/campus/detail?jobAdId=311177559`
- 现象：页面渲染「职位详情 / 参数错误」

## 根因

北森招聘官网是 SPA（JavaScript 渲染）。岗位详情页打开时调用：

```
GET /api/JobAd/GetJobAdInfo?jobAdId=<id>&category=2&displayFields=[...]
```

该接口要求 `jobAdId` 必须是岗位的 **UUID**（列表接口 `GetJobAdPageList` 响应中的 `Id` 字段，形如 `46bbf24b-65b4-4fc2-a57e-6ad8e7be63fa`）。

若传入**数字 JobAdId**（`GetJobAdPageList` 响应中的 `JobAdId` 字段，形如 `311177559`），接口返回 `500 参数错误`，详情页即显示「参数错误」。

已抽验证实为**系统性行为**（非个别站点）：科大讯飞、优衣库、新东方、长城电源等站点的数字 `jobAdId` 详情链接全部返回参数错误。

## 规则

1. **北森 `campus/detail` 详情 URL 的 `jobAdId` 参数必须使用岗位 UUID**（`row.Id`），禁止使用数字 `JobAdId`。
2. 代码位置：`scripts/job-discovery/beisen.mjs` `parseBeisenRow()`

   ```js
   // 北森详情接口 GetJobAdInfo 需要岗位 UUID（row.Id）；数字 JobAdId 会导致详情页"参数错误"
   const rawId = String(row.Id ?? row.JobAdId ?? '');
   ```

   `row.Id` 缺失时（HTML 解析场景）才回退 `row.JobAdId`。
3. 自动校验：`scripts/check.mjs` 扫描 `live-jobs.js` 中所有 `zhiye.com/campus/detail?jobAdId=<纯数字>` 的 URL，命中即失败（工作流 Validate 步骤与本地 `npm run check` 均覆盖）。

## 例外

- **HTML 解析模式源**（`official-sources.json` 中 `mode: "html"` 的北森源）：从 HTML 锚点提取的 `jobAdId` 无法保证为 UUID，若页面自身使用数字 ID，其详情链接由 `DetailUrl` 原样保留。
  - 当前 html 模式北森源：中芯国际（`smics.zhiye.com`）、国贸股份（`itg.zhiye.com`，使用 `gmkgxzxq?jobId=` 特殊系统，不走 `campus/detail` 标准路径）。
- 其余 URL 形态（`/campus` 列表页、`gmkgxzxq` 等）不受本规则约束。

## 排查速查

| 现象 | 可能原因 | 处理 |
| --- | --- | --- |
| 详情页「参数错误」 | 数字 `jobAdId` | 换用 UUID（`GetJobAdPageList` 的 `Id` 字段） |
| 详情页空白 | SPA 未加载/懒加载 | 等待渲染或检查浏览器控制台 |
| 岗位不存在 | 岗位下线 | 重新调 `GetJobAdPageList` 确认 `Status` |

## 验证记录

- 2026-09-16：修复 `beisen.mjs`（UUID 优先）并修补 `live-jobs.js` 长城电源条目；单元验证 `parseBeisenRow` 输出 UUID 链接；`npm run check` 210/210 通过（提交 `7dba5bb`）。
- 2026-09-16：全量扫描 `live-jobs.js`，583 个唯一北森 URL 中 579 个为数字 `jobAdId`，确认系统性坏链，触发全量重抓修复。
