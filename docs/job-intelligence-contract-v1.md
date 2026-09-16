# Job Intelligence Contract V1

这份契约定义 `AI_Job`、`campus-job-board`、`CareerPilot` 三个仓库之间的事实、风险规则与个人决策边界，避免同一字段在多个软件里各算一套。

## 1. AI_Job：岗位事实与底层证据源

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

### `jdEvidence`

`jdEvidence` 是从 JD 原文提取的**事实证据**，不是候选人结论。它用于让下游判断都引用同一段原文，避免三个软件重复切句后产生漂移。

当前可包含：

- `majorClauses`：专业要求的 JD 原文片段；
- `eligibilityClauses`：届别、学历、语言等资格条件原文片段；
- `technicalDuties / businessDuties`：对职责原文的闭集标签，标签不能替代原始 JD。

规则：

- 引用型字段必须来自 JD 原文；不能为了某位候选人改写事实。
- LLM 抽取如果启用，只负责结构化和引用，不负责输出“适合/不适合”。
- LLM 不可用或抽取失败时，允许退回确定性规则，但不得伪造证据。
- `CareerPilot` 的 Eligibility / Match / Deep / Company Top3 在存在 `jdEvidence` 时必须消费同一份证据。

### `discoveredAt`

- 仅表示 AI_Job 何时发现/刷新到这条记录。
- 可用于数据新鲜度审计，不等于岗位发布日期。

### 公司历史风险证据

- `AI_Job` 保存公司历史风险事件的底层证据与来源。
- 证据本身是事实/线索层，不在 AI_Job 内形成候选人匹配分、公司黑名单或“是否值得投”的最终结论。

## 2. campus-job-board：风险情报契约层

`campus-job-board` 当前是**无头风险规则发布方**，不再承担 Web 看板或候选人最终裁决。

- `risk-intelligence.json` 是对下游的正式风险契约：岗位风险规则、海外工作地点后处理、风险源声明、证据等级语义。
- `scoring.js` 是契约的被校验实现；CI 必须保证二者不漂移。
- 公司历史风险底层证据仍来自 AI_Job，由 `riskSources` 声明来源。
- A/B 为较高可信公开事件，C 仅作社区线索，D 默认隐藏。
- 公司历史风险**不自动降低 Candidate Fit，也不形成公司黑名单**。
- 本仓库不再输出候选人的 Eligibility、Match、Capability、Career Fit、Company Top3 或 S/A/B 最终投递判断。

## 3. CareerPilot：候选人决策与投递工作台

`CareerPilot` 是当前候选人侧的唯一决策与展示入口。

- 从 AI_Job 同步岗位事实并持久化，包括 JD、`jdEvidence`、发布日期、截止日期、薪资、HC 与职位链接。
- 从 campus-job-board 消费 `risk-intelligence.json`，并按契约读取 AI_Job 中的公司风险证据。
- 本地负责候选人画像、Eligibility、Match、Capability、Career Fit、Career Category、Company Top3、投递状态和复盘。
- Eligibility / Match / Deep / Company Top3 必须使用同一份上游 JD / `jdEvidence`，不得同步阶段一套、入库重算另一套。
- `first_seen` 表示 CareerPilot 本地首次收录日，**不得显示成岗位发布日期**。
- HC、薪资、发布日期只用于事实展示/筛选/投递决策，不因为“缺失”而降低候选人能力匹配分。
- 风险情报与候选人能力匹配保持分离；风险可以帮助决策，但不得悄悄改写 Capability/Career Fit。

## 4. 单向数据流

```text
公司官网 / ATS / 高校官方来源
          ↓
       AI_Job
岗位事实：届别、JD、jdEvidence、城市、发布、截止、HC、薪资、来源
公司风险：历史事件底层证据
          │
          ├──────────────────────────────→ CareerPilot
          │                                 候选人 Eligibility / Match / Capability
          │                                 Career Fit / Company Top3 / 投递 / 复盘
          │
          └→ campus-job-board
             risk-intelligence.json
             风险规则 / 风险源声明 / 证据等级
                    │
                    └────────────────────→ CareerPilot 风险展示与决策参考
```

## 5. 不变量

1. **事实只在 AI_Job 定义一次。** 下游可评价，但不能倒写成上游事实。
2. **风险规则只在 campus-job-board 发布一次。** CareerPilot 消费契约，不手抄第二套正则。
3. **候选人最终判断只在 CareerPilot 计算一次。** AI_Job 和 campus-job-board 不输出另一套个人 S/A/B 或 Match。
4. **同一岗位的同步阶段与入库重算必须使用同一份 JD / `jdEvidence`。**
5. 三个仓库任何职责变化，都必须同步更新本契约，并用各自 CI/回归测试验证接口没有漂移。
