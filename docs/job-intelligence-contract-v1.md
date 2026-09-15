# Job Intelligence Contract V1

这份契约定义 `AI_Job`、`campus-job-board`、`CareerPilot` 三个仓库之间的事实字段和职责边界，避免同一字段在三个软件里各算一套。

## 1. AI_Job：岗位事实源

`AI_Job` 负责发现公司、识别官方招聘源、抓取 2027 届岗位，并输出可追溯的岗位事实。下游不得用本地猜测覆盖这些字段。

### `publishedAt`

- 含义：招聘来源实际披露的岗位发布日期，格式 `YYYY-MM-DD`。
- 可来自 `datePosted / PostDate / publishDate / publishedDate` 等官方字段。
- **禁止**用 `discoveredAt`、同步时间、首次入库时间冒充发布日期。
- 来源未披露时保持空字符串。

### `deadline`

- 含义：该岗位或招聘页面明确披露的截止日期。
- 未披露保持空字符串。

### `compensation`

- 只解析来源页/JD明确披露的薪资。
- 月薪转年薪只在规则允许时计算，并通过 `annualEstimated` 明确标记估算。
- “面议 / 未披露”不猜测。
- `monthlySalary`、`annualSalary` 是兼容展示字段；结构化事实以 `compensation` 为准。

### `headcount`

结构：

```js
{
  disclosed: true,
  min: 3,
  max: 5,
  scope: 'job',       // job | program
  display: '3–5人',
  sourceLabel: '企业官方JD/ATS',
  confidence: 'high', // high | medium | none
  evidence: '招聘人数：3-5人'
}
```

规则：

- 仅在 ATS 结构化字段或正文明确出现“招聘人数 / 需求人数 / HC / 招聘名额 / 计划招聘”等证据时记录。
- `scope='job'` 表示具体岗位 HC。
- `scope='program'` 表示整届校招/招聘项目规模，**不得当作该岗位 HC**。
- 公司员工总数、岗位列表数量、历史招聘人数不能推断为当前岗位 HC。
- `headcountDisplay`、`headcountScope` 是兼容展示字段。

### `discoveredAt`

- 仅表示 AI_Job 何时发现/刷新到这条记录。
- 可用于数据新鲜度审计，不等于岗位发布日期。

## 2. campus-job-board：评价与情报层

- 从 AI_Job 消费 `publishedAt / deadline / compensation / headcount`，不重复抓取和猜测岗位事实。
- 负责 Eligibility、适配度、投递优先级、风险情报展示等看板逻辑。
- 公司历史风险仍来自 AI_Job 的证据库，由 campus-job-board 定义证据等级和展示规则。
- `company-hc-salary.js` 只可作为**公司校招规模 / 市场薪资参考**，不是岗位事实；不能覆盖岗位级 `headcount` 或 `compensation`。

## 3. CareerPilot：个人决策与投递工作台

- 从 AI_Job 同步岗位事实并持久化，避免每次列表展示重新解析原始 JSON。
- 从 campus-job-board 同步风险规则/证据。
- 本地负责候选人画像、Eligibility、Match、Capability、Career Fit、Company Top3、投递状态和复盘。
- `first_seen` 表示 CareerPilot 本地首次收录日，**不得显示成岗位发布日期**。
- HC、薪资、发布日期只用于事实展示/筛选/投递决策，不因为“缺失”而降低候选人能力匹配分。

## 4. 单向数据流

```text
公司官网 / ATS / 高校官方来源
          ↓
       AI_Job
岗位事实：届别、JD、城市、发布、截止、HC、薪资、来源证据
          ↓
  ┌───────┴────────┐
  ↓                ↓
campus-job-board  CareerPilot
评价/风险/看板      个人匹配/Top3/投递/复盘
  ↓                ↑
风险规则与证据快照 ──┘
```

原则：**事实只在上游定义一次，评价可在下游按使用场景计算；任何下游推断都不能倒写成上游事实。**
