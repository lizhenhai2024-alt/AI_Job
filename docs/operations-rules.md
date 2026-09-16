# AI_Job 运维规则与经验教训

> 规则编号延续 R-BEISEN-001 体系 ｜ 创建：2026-09-16 ｜ 状态：强制（提交/推送前必须自查）

本文件沉淀 2026-09 任务周期（公司清单补充 → 岗位抓取 → 高校源接入 → 北森链接"参数错误"排查与全库修复）中实际踩过的坑，每条规则附**场景、根因、规则、检查点**。修改数据、脚本或触发刷新前，先对照本文件自查。

## 规则总览

| 编号 | 规则 | 防止的错误 |
| --- | --- | --- |
| R-BEISEN-001 | 北森 `campus/detail` 的 `jobAdId` 必须为岗位 UUID | 详情页"参数错误"（系统性坏链） |
| R-OPS-001 | 快照保留/历史恢复不得捞回无效 URL 条目 | 旧坏链每轮刷新永久存活、与新版并存 |
| R-OPS-002 | 自动生成文件的写入必须与生成器一致 | 误改内层数组导致 JS 模块语法错误 |
| R-OPS-003 | 数据/脚本修改后必须跑完整 `npm run check` | 带病产物提交或推送 |
| R-OPS-004 | 新发现/历史遗留源必须注册进 `official-sources` 或明确清理 | 未注册源永不重建，数据带病 |
| R-OPS-005 | 数据修复必须排查全部回流路径 | 修复后又被快照/桥接/历史恢复加回 |
| R-OPS-006 | 本地执行环境约定（Windows/PowerShell） | 命令转义与换行导致执行失败 |
| R-OPS-007 | 刷新/补水前后做数据质量断言对比 | 刷新后坏链增量/源缺失未被发现 |
| R-BEISEN-002 | 北森 `deadline` 采 `DisplayFields` 的 `EndTime`，哨兵值必须过滤 | 截止日期缺失/0001-01-01、2222-02-02 错误日期入库 |
| R-OPS-008 | 多 Agent 共享工作目录时，禁止 git reset/checkout/restore 他人改动 | 并行 Agent 因 reset 把对方未提交补丁抹掉/ 把对方改动 staged 混入自己 commit |
| R-OPS-010 | 快照保留岗位(`_snapshotRetained`)在 dedupe 时永远不得压过本轮新抓岗位 | 新抓字段(deadline/headCount/UUID)被旧快照覆盖丢失；publishedAt 为空或相同时旧岗位胜出 |
| R-OPS-009 | 外部 API 字段增强前必须同源实测；UUID 统计正则必须带 `(?:&|$)` 锚定 | 用 `\d+` 统计 UUID 开头数字误报；不实测就改字段导致重抓 |

---

## R-BEISEN-001：北森详情 URL 必须使用岗位 UUID

- **场景**：`https://<tenant>.zhiye.com/campus/detail?jobAdId=<id>` 打开报"参数错误"。
- **根因**：北森 SPA 详情路由 `GetJobAdInfo?jobAdId=` 只接受列表接口 `GetJobAdPageList` 响应中的 `Id` 字段（UUID，形如 `46bbf24b-…`）；数字 `JobAdId`（形如 `311177559`）一律返回 500 参数错误。
- **规则**：
  1. 抓取端 `parseBeisenRow` 取 `row.Id ?? row.JobAdId`，UUID 优先；仅在 HTML 解析模式（无 Id 字段）才回退。
  2. `scripts/check.mjs` 全量扫描 `sourceUrl` + `sourceEvidence.url`，命中 `zhiye.com/campus/detail?jobAdId=\d+` 即抛错（本地 `npm run check` 与 CI Validate 均覆盖）。
  3. 任何手动/脚本写入的北森详情 URL 必须先用浏览器或 API 验证可渲染，再入库。
- **检查点**：`docs/beisen-url-rules.md`（含例外：html 模式源、非 `campus/detail` 路由）。

## R-OPS-001：快照保留不得捞回无效 URL 条目

- **场景**：补水 run 后旧坏链依然存在，且与新版有效链接并存（本次 368 条数字 URL + 428 条 UUID 同时存在于 live-jobs.js）。
- **根因**：`refresh-jobs.mjs` 的 provider 级健康判定 `isSourceRefreshUnhealthy`：任一源 `errors>0` → 整个 provider 判 unhealthy → `retainedJobsForUnhealthySources` 把补水前该 provider **全部**旧条目原样保留。beisen 有 2 个源抓取错误时，所有历史北森条目（含坏链）被捞回。只要每轮存在任意源错误，坏链永久存活。
- **规则**：
  1. 快照保留过滤条件必须排除无效 URL 条目：`existing.filter(job => unhealthy.has(providerOfJob(job)) && !hasNumericBeisenDetailUrl(job))`（已实现于 `scripts/job-discovery/snapshot-retention.mjs`）。
  2. provider 级 unhealthy 判定是"保留最后已知快照"的兜底，不是"保留全部历史"——保留前必须按条目质量过滤。
- **检查点**：`hasNumericBeisenDetailUrl` 与 R-BEISEN-001 正则保持一致，二者同步维护。

## R-OPS-002：自动生成文件的写入必须与生成器一致

- **场景**：一次性数据修复脚本重写 `live-jobs.js` 时，用 `json.replace(']', '];', 1)` 把数组闭合标记插到了**第一个** `]` 之后（内层 `sourceEvidence` 数组），导致 JS 模块 `SyntaxError: Unexpected token ';'`。
- **根因**：`refresh-jobs.mjs` 的 `asModule` 用 `replace(/\n]$/, '\n];')` 只匹配**数组闭合位置**（换行 + 右括号 + 行尾）；手写脚本若用全局/首个替换，会误伤内层嵌套数组。
- **规则**：
  1. 修改自动生成文件（`live-jobs.js`、`source-health.js`、`company-requests.js` 等）时，**复用原生成器的序列化函数**（`asModule`/`healthModule`/`build-company-requests.mjs`），不要重写。
  2. 必须写一次性脚本时，用 `replace('\n]', '\n];')`（行尾锚定），禁止 `replace(']', '];', 1)` 之类。
  3. 写入后立即 `node --check <file>` 验证模块可解析。
- **检查点**：`git diff` 确认只有目标条目变化；`node --check` 通过。

## R-OPS-003：数据/脚本修改后必须跑完整 `npm run check`

- **场景**：数据修复后未立即验证，check 报 `SyntaxError`（见 R-OPS-002）才发现文件已损坏。
- **根因**：文件存在/非空 ≠ 正确；`npm run check` 是唯一覆盖静态校验（54 文件、schema、provenance、registry 一致性）+ 210 单元测试的完整门禁。
- **规则**：
  1. 任何对 `src/data/*`、`config/*`、`scripts/*` 的修改，提交前必须 `npm run check` 全绿（lint + 静态 + 210 tests）。
  2. 修改生成逻辑后，重跑生成，再跑 check，顺序不可颠倒。
  3. check 报红时**不得 push**；先修到全绿。
- **检查点**：`npm run check` 输出 `Static checks passed` 与 `# pass 210 # fail 0`。

## R-OPS-004：新发现/历史遗留源必须注册或明确清理

- **场景**：中国人寿/太平/新东方/人保/泰康/蜜雪冰城 6 个北森域名不在 `official-sources.json` 的 beisen 列表，但 live-jobs.js 里存在它们的岗位（历史抓取或高校桥接产物）——刷新从不覆盖 → 坏链永不修复。
- **根因**：`refresh-jobs.mjs` 的 provider 抓取由 `sourceConfigured(provider)` 驱动，只抓 `official-sources` 注册的源。**未注册源 = 不抓取 = 旧数据永不更新**。
- **规则**：
  1. 高校就业网/聚合站发现的官方 ATS 入口，要么注册进 `official-sources.json`（纳入标准抓取，自动重建有效 URL），要么明确从 live-jobs 清理；**不得任其以"官方身份"滞留**。
  2. 注册前核验：域名归属、2027 届在招、抓取契约（API 或 html 模式）可用。
  3. 金融/军工/审计/咨询等用户默认排除行业的新源，直接清理岗位、不注册、不引入抓取。
- **检查点**：`git grep` 该域名是否同时出现在 `official-sources.json` 与 live-jobs 条目；`source-health.js` 是否覆盖。

## R-OPS-005：数据修复必须排查全部回流路径

- **场景**：清除 368 条坏链后，若无快照过滤（R-OPS-001），下一轮 refresh 在 beisen unhealthy 时会原样捞回。
- **根因**：live-jobs.js 是"重建 + 保留"模型，存在多条旧数据回流路径：provider 快照保留（snapshot-retention）、历史提交恢复（findHistoricalProviderJobs）、高校桥接（university-official-bridge）、固化列表（granularity）。
- **规则**：
  1. 做任何数据清理前，先枚举该数据的全部写入路径，逐一确认清理后不会被加回。
  2. 清理与防回流**同 commit**：只删数据不修路径，等于没修。
- **检查点**：清理后跑一次（模拟或真实）refresh，确认坏链数量不反弹。

## R-OPS-006：本地执行环境约定（Windows/PowerShell）

- **场景**：任务中多次因环境差异执行失败。
- **根因**：Windows PowerShell 与 Unix shell 行为不同。
- **规则**：
  1. PowerShell **不支持 `&&`**：连续命令用 `;` 或分多次调用。
  2. `python -c "内嵌多行代码"` 在 PowerShell 下引号/正则转义极易失败：**改为写临时 `.py` 文件再执行**（`scripts/tmp-*.py`，用后删除）。
  3. `tail`、`grep` 等 Unix 命令不可用；用 `Select-Object -Last`、`Select-String` 或 Read/Grep 工具。
  4. 仓库文件为 LF；Git 会提示 CRLF 转换 warning，属正常，无需处理。
  5. 一次性分析脚本命名 `scripts/tmp-*.py`，交付前删除（`Remove-Item scripts\tmp-*.py -Force`）。
- **检查点**：命令执行前按上表自查；失败先看是否环境差异，再换等价写法。

## R-OPS-007：刷新/补水前后做数据质量断言对比

- **场景**：补水 run（34994152218）成功后坏链仍存在，因没有"刷新前后坏链计数对比"暴露回归。
- **根因**：刷新成功（exit 0 + source-health 生成）≠ 数据质量达标；`source-health` 只报告抓取健康，不校验 URL 有效性。
- **规则**：
  1. 每次 refresh/补水后，至少断言：北森数字 `jobAdId` 计数（应为 0）、beisen kept 数、总条目数、公司数——与上一轮对比，异常即告警。
  2. `scripts/check.mjs` 的 R-BEISEN-001 就是该断言的落地；CI 与本地 `npm run check` 必须保持为强制门禁。
  3. 大型数据操作后，用独立于生成路径的方式回读验证（如 node --check + 抽样条目核对）。
- **检查点**：刷新后 `npm run check` 全绿 + `git diff --stat` 确认预期规模变化。

---
## R-BEISEN-002：北森 `deadline` 必须采 `EndTime` 并过滤哨兵值

- **场景**：2027 校招许多列岗位有具体投递截止日期（如 `2026-11-30`），但 parseBeisenRow 当时 `deadline: ''` 直接丢弃。
- **根因**：北森 `GetJobAdPageList` 响应中 `EndTime` 就是投递截止时间标签，但**DisplayFields 必须包含 `EndTime` 才会返回真实值**；`0001-01-01T00:00:00` / `2222-02-02T00:00:00` 为无效哨兵值（EndTimeInt=0 时代表长期有效/未设截止）。
- **规则**：
  1. `fetchApiPage` 的 `DisplayFields` 必须包含 `EndTime`，否则不返回；
  2. `parseBeisenRow` 的 `deadline = normalizeDate(row.EndTime)`；`normalizeDate` 必须过滤年份 <2000 或 >2100 的哨兵值（0001-01-01/2222-02-02 等）为空；
  3. `refresh-jobs.mjs` 已支持 `isClosed` 过滤：deadline 显示投递截止后关闭职位。
- **检查点**：live-jobs 中 beisen 职位 `deadline` 有值率；refresh 后抽样验证（如 `泰康保险|2026-11-30`）。

## R-OPS-008：多 Agent 共享工作目录时的 git 协作纪律

- **场景**：本轮 OrganizerAgent 在同一 AI_Job_clone 目录并行运行，其 git 操作把 MainAgent 的 beisen.mjs 字段补丁、university-official-bridge.mjs 排除规则在工作树上抹掉（reset/checkout），并把 moka.mjs 等 staged 混入它的 commit 区，导致数据一度回退。
- **根因**：多 Agent 共享工作目录时 git 不是单主写的；`git add -A` / `git reset --hard` / `git checkout --` / `git stash` 都会吞没或搞乱他人的未提交改动。
- **规则**：
  1. 共享目录下，**任何一个 Agent 不得执行 `git reset --hard`、`git checkout --`、`git restore`、`git stash` 等会抹掉工作树的命令**（除非明确只针对自己新写文件）。
  2. commit 前必须 `git status --short` 核对，只 add 自己的目标文件，**禁止 `git add -A`/`git add .`** 以免混入他人改动。
  3. 多 Agent 并行工作应分配不同文件/目录；必须抹掉工作树时，先 `git diff` 分类保存自己与他人改动，重建后再重放。
  4. **两个 Agent 同时在同一个 repo 执行业务时，commit/push 由 MainAgent 统一执行**，子 Agent 只写文件。
- **检查点**：已小人在同时运行时 `git status` 多次核对；commit 前重新 `git diff --cached --stat` 确认只有目标文件。

## R-OPS-009：字段增强前必须同源实测；UUID 统计正则必须带锚定

- **场景**：本轮统计北森"数字 URL"时用 `/zhiye\.com\/campus\/detail\?jobAdId=\d+/`，把以数字开头的 UUID（如 `5c7c0dc7-...`）误计为数字 jobAdId（虚报 2769 条）；同时没有先实测就改 beisen.mjs 字段，导致一次重抓（哨兵值未清、DisplayFields 行为未知）。
- **根因**：北森 API 必须同源（同域名内 fetch 才通过 CORS）；DisplayFields 决定返回哪些字段的真实值；UUID 正则未带锚定时 `\d+` 会同时匹配 UUID 开头的数字。
- **规则**：
  1. 对北森/Moka 等外部 API 做字段增强前，**必须先用浏览器同源实测**（先分别导航到目标域名页面再 fetch），确认响应字段名与有效值分布，再改代码。
  2. 统计/校验北森 URL 时，正则必须用 `jobAdId=\d+(?:&|$)` 锚定（同 R-BEISEN-001/check.mjs），**禁止 `\d+` 结尾无锚定的写法**。
  3. 多源合并（snapshot-retention + 新抓取）时，抓取后必须核对 discoveredAt/company 分布，区分新旧，避免把历史数据当作新状态。
- **检查点**：最终数据 `R-BEISEN-001 违规: 0` 与 deadline/HC 有值率对比。

---

## 修改数据/脚本的标准操作流程

1. `git status` 确认工作树基线；`git log origin/main --oneline -3` 确认远程最新。
2. 改数据：优先复用生成器脚本；改逻辑：先读被改文件全文。
3. 写入后 `node --check`（模块）或直接 `npm run check`（全量）。
4. `git diff` 自查：只应有目标文件、目标内容变化。
5. `npm run check` 全绿 → commit（描述含规则编号，如 `[R-BEISEN-001]`）→ push。
6. 一次性临时脚本（`scripts/tmp-*.py`）交付前删除。

## 事故时间线（2026-09）

| 时间 | 事件 | 对应规则 |
| --- | --- | --- |
| 09-16 | 长城电源「项目管理工程师」链接参数错误 → 定位北森数字 jobAdId × UUID | R-BEISEN-001 |
| 09-16 | 全库扫描：368 条数字坏链（10 家公司）+ 428 条 UUID 并存 | R-BEISEN-001 / R-OPS-001 |
| 09-16 | 补水 run 有源错误 → 快照保留捞回全部旧北森条目 | R-OPS-001 / R-OPS-005 |
| 09-16 | 数据修复脚本误替换内层 `]` → live-jobs.js SyntaxError → check 抓出 | R-OPS-002 / R-OPS-003 |
| 09-16 | 未注册 6 域名（人寿/太平/新东方/人保/泰康/蜜雪）坏链永不重建 | R-OPS-004 |
| 09-16 | 取消金融/教育/茶饮排除 → 6 个北森源恢复采集（人寿/太平/新东方/人保/泰康/蜜雪） | R-OPS-004 / 用户政策变更 |
| 09-16 | 并行 Organizer git 操作回退 MainAgent 的 beisen/moka/桥接补丁 → 提炼 R-OPS-008 | R-OPS-008 |
| 09-16 | 北森 EndTime 截止日期采集 + HeadCount 标准化（623/3507 条），UUID 统计正则锚定修正 | R-BEISEN-002 / R-OPS-009 |

## R-OPS-010：快照保留岗位永远不压过本轮新抓岗位

- **场景**：北森等 provider 被 `isSourceRefreshUnhealthy` 判 unhealthy（任意源 `errors>0`）后，本轮新抓岗位（含 deadline/headCount/新 UUID 链接）与从 existing/历史捞回的旧快照岗位同 key 或同 id 去重时，旧岗位胜出，**新抓字段与坏链清理成果全部丢失**（2026-09-16 实测：beisen 新抓 5756 条含 HC/截止日期，最终 live-jobs.js 中 headCount 落库为 0）。
- **根因**：`dedupePreferOfficial`/`dedupeById` 的 chooseNext 只比较 rank 与 `publishedAt`；当新抓岗位 `publishedAt` 为空（部分北森源 PostDate 缺失）或与旧快照相同时，`>` 不成立，保留先入 map 的 previous。若 previous 是旧快照（输入顺序或遍历时序导致），新抓岗位被丢弃。
- **规则**：
  1. refresh-jobs.mjs 在生成 `retainedSourceJobs`（existing 保留 + historical 捞回）时，给每条岗位打 `_snapshotRetained: true` 标记（`cleanForStorage` 会剔除 `_` 前缀字段，不会污染存储）。
  2. dedupe（`dedupe.mjs` 的 `preferFresh` + refresh-jobs.mjs 本地 dedupe）判定：`next` 带 `_snapshotRetained` 且 `prev` 不带 → 永不选择 next；`prev` 带而 `next` 不带 → 必须选择 next。快照岗位仅在无同名新抓岗位时兜底保留。
  3. `findHistoricalProviderJobs` 捞回的历史岗位必须再过 `hasNumericBeisenDetailUrl` 过滤（R-BEISEN-001 全路径覆盖，不仅 existing 层）。
- **检查点**：刷新后回读 live-jobs.js 统计（`headCount`/`deadline` 覆盖数、数字 URL 数、discoveredAt 是否为当轮），不能只看 provider 的 keptJobs；字段增强后必须验证"写盘层"字段存在，而不仅是抓取层。

## R-BEISEN-002：北森截止日期 deadline 采集（EndTime + 哨兵值过滤）

- **场景**：用户要求岗位采集发布日期与截止日期；beisen.mjs 原 `deadline: ''` 恒空。
- **根因**：北森 `GetJobAdPageList` 返回字段由 `DisplayFields` 决定（传空数组时所有字段值为 null/占位）；`EndTime` 未在 DisplayFields 中 → 不返回 → deadline 无法采集。
- **规则**：
  1. `fetchApiPage` 的 `DisplayFields` 必须包含 `EndTime`（连同 `PostDate`、`HeadCount`、`Salary`）。
  2. `parseBeisenRow` 的 `deadline: normalizeDate(row.EndTime)`，`headCount: Number(row.HeadCount) > 0 ? Number(row.HeadCount) : ''`；`normalizeDate` 必须过滤哨兵值（`0001-01-01`、`2222-02-02` 及 `year<2000 || year>2100`）→ 返回空串表示未设截止。
  3. 实测确认：有效 `EndTime` 形如 `2027-06-30T00:00:00`（截止日期）；哨兵值 `endInt=0` 且 EndTime 为 `0001-01-01` 或 `2222-02-02`。
- **检查点**：刷新后统计 `liveJobs.filter(j => j.deadline).length` 应 >0（beisen 覆盖约 600+ 条）；`j.headCount` 数字字段应被 `src/core/headcount.js` 的 structuredHeadcount 消费。
## R-OPS-011：聚合平台接入——SSR 占位内容识别，岗位公司以详情页为准

- **场景**：接入猎聘校园（campus.liepin.com）时，15 个项目页均返回相同 25 个 lptjob 链接——这些是全网热门校招岗位占位（common-hot-links-content），**不是当前项目的专属岗位**；信立泰 9 条"项目岗位"实际也来自公共热门位（岗位真实、公司正确，但与项目无关）。若用项目页公司名做岗位归属，会把无关岗位错挂到富冶/浙商等公司。
- **根因**：猎聘项目详情页 SSR 只有 meta 描述（项目名）+ 公共热门链接区，无项目专属岗位列表；岗位列表为前端 JS 动态加载，SSR 层无法区分"专属岗位"与"热门推荐位"。
- **规则**：
  1. 聚合平台接入时，先对 2-3 个目标页面做**页面语义层探测**（同页多个链接块是否共享/占位），识别"专属内容"与"公共推荐位"，**不得把占位内容当作目标内容抓取**。
  2. 岗位的 company/城市/薪资等字段**一律以岗位详情页自身为准**（如猎聘 title 页"【城市 岗位】-公司名"），项目页公司名仅作发现线索，不得用于岗位归属。
  3. 占位热门岗位若确为有效校招岗位（真实详情页），可入库，但**不得声称与某项目/公司关联**；报告与描述中标注来源为平台热门位。
- **检查点**：入库岗位公司名与岗位详情页 title 一致；同一项目页不产生重复岗位；README/报告不出现"X 公司项目岗位"字样（除非验证过专属列表）。

## R-OPS-012：校验规则必须随数据渠道形态演进（渠道差异化）

- **场景**：接入猎聘后 npm run check 失败——live job provenance/cohort validation failed：check.mjs 要求**所有** live 岗位 graduationYear === '2027'，而猎聘岗位页面用"应届 本科"而非"2027届"字样，graduationYear 为空。
- **根因**：校验规则写死于"全库都是官网直采且标届次"的旧形态；新增 secondary 聚合渠道后数据形态变化，规则未同步。
- **规则**：
  1. 渠道差异化：**primary（官网直采）必须 2027 届**；**secondary（聚合渠道）允许 graduationYear 为空**（页面"应届"不标届次），但所有岗位都必须有 sourceUrl + verification。
  2. 新增数据渠道后，**先跑 npm run check 观察校验是否与新形态冲突**，冲突时修改校验规则而非放宽数据质量（sourceUrl/verification 仍强制）。
  3. 二次渠道岗位的届次字段为空时，靠岗位标题/描述中的"2027届/27届"关键词自动标注，不做无依据兜底。
- **检查点**：npm run check 全绿；primary 岗位 graduationYear 仍 100% 为 '2027'。

## R-OPS-013：平台级抓取必须带重试；刷新失败后验证"入库"而非退出码

- **场景**：首次完整刷新中 liepin 报 fetch failed（单独跑同一 URL 正常）——完整刷新 22 个 provider 并发时偶发网络失败；脚本 exit=0 但猎聘 0 条入库。
- **根因**：并发抓取下单次 fetch 偶发连接失败；fetchText 无重试；刷新脚本对 provider 级失败仅记录不重试。
- **规则**：
  1. 所有平台级抓取函数（fetchText 等）**必须带重试**（至少 1 次 + 指数退避 800ms 起），防止并发/限流偶发失败。
  2. 刷新完成后**必须回读 live-jobs.js 验证目标渠道岗位数**（filter 按 source 统计 > 0），不能只看 provider 日志的 kept 数或脚本退出码。
  3. 失败渠道（unhealthySources）在下次刷新前要确认是否为偶发；若连续两次失败则排查反爬/接口变更。
- **检查点**：刷新后按 source 统计入库数；unhealthy 渠道数不超过 3 且目标渠道不在其中。
## R-OPS-014：并发刷新管线必须有 task 级超时兜底；慢响应平台抓取要带时间预算

- **场景**：2026-09-16 完整刷新时 zhaopin 单 task 报 "task timeout after 600000ms"（kept=928 已抓到但 fn() 在 10 分钟未 settle）；更早一次刷新整管线 "Detected unsettled top-level await" exit 13——某 provider 的 Promise 永不 settle 时 Promise.all(workers) 永不返回，整个刷新直接失败。
- **根因**：并发刷新（MAX_CONCURRENCY=3）下，智联等平台对并发请求响应极慢/限流（单请求可挂数十秒）；fetchText 的 15s AbortController 对某些 TCP 层挂起不生效；runWithConcurrency 无 task 级超时。
- **规则**：
  1. runWithConcurrency 每个 task 必须带超时兜底（withTimeout，10 分钟）——超时记 rejected，不拖垮其他 task。
  2. 慢响应平台（智联/反爬严格平台）的 discoverJobs 必须带**整体时间预算**（如 8 分钟）超预算提前返回已发现部分 + 请求间隔（250ms）降限流。
  3. 刷新失败后必须区分"provider 失败"与"管线挂起"：挂起是结构性问题（超时兜底缺失），失败是渠道问题（重试/时间预算）。
- **检查点**：unhealthySources 中不应含"已加时间预算"的慢平台；刷新日志无 "unsettled top-level await"。

## R-OPS-015：薪资归一化必须覆盖中文金额单位（万/千），不能用"数字>=1000"猜单位

- **场景**：智联列表页薪资 "1-1.8万" 被 normalizeSalary 输出为 "1-1.8k"（实为 10-18k）；"7000-9000元" 正常输出 "7-9k"。"数字>=1000" 的单位推断对"万"单位失效（1<1000）。
- **根因**：正则捕获单位时丢弃了"万/千"信息，仅按数值大小猜测元/千。
- **规则**：
  1. 薪资/金额归一化正则必须**捕获并消费单位**（万→×10000，千→×1000），不允许按数值大小猜测。
  2. 归一化后必须抽查代表性样本（外资/高薪岗）验证格式（如 SGS "1-1.8万"→"10-20k"），不能只看总量覆盖。
  3. 跨渠道统一薪资展示格式（X-Yk），入库前归一，避免源格式混杂。
- **检查点**：live-jobs 中 source=智联招聘 的 salary 无 "1-1.8k" 类错误；测试含 "1-1.8万"→"10-18k" 用例。
