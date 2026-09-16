# Job Intelligence Contract V1.1

这份契约定义 `AI_Job`、`campus-job-board`、`CareerPilot` 三个仓库之间的事实、风险规则与候选人决策边界，避免同一字段在多个软件里各算一套。

## 1. AI_Job：岗位事实与底层证据源

`AI_Job` 负责发现公司、识别官方招聘源、抓取 2027 届岗位，并输出可追溯的岗位事实。下游不得用本地猜测覆盖这些字段。

### `publishedAt` / `deadline`

- `publishedAt` 是招聘来源实际披露的发布日期；禁止用 `discoveredAt`、同步时间、首次入库时间冒充。
- `deadline` 只记录岗位或招聘页面明确披露的截止日期。
- 来源未披露时保持空值，不猜测。

### `compensation`

- 只解析来源页/JD明确披露的薪资。
- 月薪转年薪必须明确标记估算，不能把历史届次、社区爆料或候选人期望薪资混入事实字段。
- “面议 / 未披露”保持未知。

### `headcount`

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

- 仅在 ATS 结构化字段或正文明确出现招聘人数 / 需求人数 / HC / 招聘名额等证据时记录。
- `scope='job'` 表示具体岗位 HC；`scope='program'` 表示整届校招/招聘项目规模。
- **program 级 HC 永远不能当作岗位 HC。**
- 公司员工总数、岗位列表数量、历史招聘人数不能推断为当前岗位 HC。
- HC 未披露不是负面证据，不得因此降低候选人匹配、竞争或 Offer 可达性。

### `jdEvidence`

`jdEvidence` 是从 JD 原文提取的事实证据，不是候选人结论。当前可包含：

- `majorClauses`：专业要求原文；
- `eligibilityClauses`：届别、学历、语言等资格条件原文；
- `technicalDuties / businessDuties`：职责证据；
- 其它以后增加的结构化字段，也必须能回溯到原始 JD。

规则：引用字段必须来自原文；LLM 如启用，只负责结构化和引用，不负责输出“适合/不适合”。

### Competition / Offer Reachability 的事实输入边界

AI_Job 可以向下游提供影响判断的**事实输入**，例如：

- 专业是否不限、是否限定某类专业；
- 英语/小语种是否必须或优先；
- 岗位职责与技术门槛原文；
- 官方披露的岗位级 HC；
- 城市、来源、发布日期、截止日期、薪资。

AI_Job **不得**输出以下候选人结论：

- Competition Score / 竞争强度评级；
- Offer 概率、Offer Reachability；
- Match / Capability / Career Fit；
- S/A/B、主投/冲刺/Offer池；
- Company Top-3 或“是否值得投”。

这些结论都依赖具体候选人画像，统一由 CareerPilot 计算。尤其禁止把“专业不限”直接等价为“容易拿 Offer”，也禁止把“招聘人数多”直接等价为“竞争小”。

### `discoveredAt`

仅表示 AI_Job 何时发现/刷新该记录，可用于新鲜度审计，不等于岗位发布日期。

### 公司历史风险证据

AI_Job 保存公司历史风险事件的底层证据与来源；证据本身是事实/线索，不在 AI_Job 内形成候选人匹配分、公司黑名单或投递结论。

## 2. campus-job-board：风险情报契约层

`campus-job-board` 是无头风险规则发布方，不承担候选人最终裁决。

- `risk-intelligence.json` 是正式风险契约：岗位风险规则、海外工作地点后处理、风险源声明、证据等级语义。
- `scoring.js` 是历史兼容和契约校验实现，不是当前候选人最终排序引擎。
- 公司历史风险底层证据来自 AI_Job。
- 公司历史风险不自动降低 Candidate Fit，也不形成公司黑名单。
- **竞争激烈、专业不限、热门岗位、岗位 HC 多/少不是“风险事件”，不得塞进风险扣分。**

## 3. CareerPilot：唯一候选人决策与展示入口

CareerPilot 负责：

- Eligibility Gate；
- Match / Capability / Career Fit；
- Competition Intensity；
- Offer Reachability（只能是相对可达性指数/等级，不冒充真实录取概率）；
- First-job Value / 成长性；
- Company Top-3；
- 主投 / 冲刺 / Offer池 / 低优先级；
- 投递状态和复盘。

CareerPilot 必须遵守：

1. Eligibility、Match、Deep、Competition、Offer Reachability 使用同一份 JD / `jdEvidence`。
2. 直接业务证据 > 可迁移证据 > 兴趣；“愿意学”不能当成已经做过。
3. “专业不限”只表示资格开放，竞争池通常更宽，不能自动加 Offer 分。
4. 招聘人数仅在有**岗位级官方证据**时作为上下文；不能单独决定 Offer 可达性，program HC 不参与岗位加分。
5. 缺失 HC、薪资、发布日期等事实字段不降低候选人能力匹配。
6. Offer Reachability 是横向决策指数，不显示成“xx%录取概率”，除非有官方真实投递/录取数据。
7. 风险情报与能力匹配分离；风险可以辅助决策，但不能悄悄改写 Capability/Career Fit。

## 4. 单向数据流

```text
公司官网 / ATS / 高校官方来源
          ↓
       AI_Job
岗位事实：届别、JD、jdEvidence、城市、发布、截止、岗位级HC、薪资、来源
公司风险：历史事件底层证据
          │
          ├──────────────────────────────→ CareerPilot
          │                                 Eligibility / Match / Capability
          │                                 Career Fit / Competition / Offer Reachability
          │                                 First-job Value / Top3 / 投递 / 复盘
          │
          └→ campus-job-board
             risk-intelligence.json
             风险规则 / 风险源声明 / 证据等级
                    │
                    └────────────────────→ CareerPilot 风险展示与决策参考
```

## 5. 不变量

1. **事实只在 AI_Job 定义一次。** 下游可评价，不能倒写成上游事实。
2. **风险规则只在 campus-job-board 发布一次。** CareerPilot 消费契约，不手抄第二套正则。
3. **候选人最终判断只在 CareerPilot 计算一次。** AI_Job 和 campus-job-board 不输出第二套 S/A/B、竞争或 Offer 结论。
4. **同一岗位同步阶段与入库重算必须使用同一份 JD / `jdEvidence`。**
5. HC 必须保留 `job/program` scope；program 规模不能冒充岗位名额。
6. 三个仓库任何职责变化，都必须同步更新本契约，并用 CI/回归测试验证接口没有漂移。
