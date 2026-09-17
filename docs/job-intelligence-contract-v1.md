# Job Intelligence Contract V1.2

这份契约定义 `AI_Job`、`campus-job-board`、`CareerPilot` 三个仓库之间的事实、风险规则与候选人决策边界。

## 1. AI_Job：英语专业本科校招事实与证据源

`AI_Job` 面向 2027 届英语专业本科生构建岗位情报池，不是企业全部校招岗位的全量镜像。

### 采集范围

最终生产池在入库前排除：

- 明显技术专业岗位：软件、算法、前后端、嵌入式、硬件、芯片、电子、电气、机械、结构、工艺、材料、仿真、控制、自动化、研发/开发/技术工程师等；
- 财务、会计、审计、税务、出纳、司库、投融资、投资分析、证券、基金、精算等专业财会金融岗位；
- 法务、律师、法律顾问、知识产权等专业法律岗位；
- 医学、药学、临床、化学/生物专业研发、土木/建筑等明显专业岗位；
- 标题不明显专业，但 JD 硬性限定上述专业背景，且没有英语/语言/市场/管理/国际商务等候选人友好专业作为可选范围的岗位。

以下情况不能因专业词出现而误删：

- 专业不限 / 不限专业；
- 英语、外语、语言类、翻译、新闻传播、市场营销、国际商务、国贸、管理类、人文社科等可投；
- 技术/财务类专业仅为“优先 / 加分”而非硬门槛；
- 项目管理、海外业务、GTM、市场、品牌、运营、跨境电商、供应链、HR、销售/BD、客户成功、国际物流等英语专业可能进入的方向。

AI_Job 可以做**范围过滤**，但不得进一步输出个人 Match / Capability / Career Fit / Competition / Offer Reachability / 主投优先级。

### 来源边界

AI_Job 不实行“只保留高校校招”。生产源优先级：

1. 公司官方校招官网 / ATS 职位级岗位；
2. 高校就业网官方发布、明确 2027 届且带公司官方投递入口的受控过渡记录；
3. 其它二手渠道主要用于发现和交叉取证，不能替代公司官方职位级来源。

高校渠道负责补漏和交叉取证，不取代公司官方岗位池。

### `publishedAt` / `deadline`

- `publishedAt` 是招聘来源实际披露的发布日期；禁止用 `discoveredAt`、同步时间或首次入库时间冒充。
- `deadline` 只记录岗位或招聘页面明确披露的截止日期。
- 来源未披露时保持空值，不猜测。

### `compensation`

- 只解析来源页/JD明确披露的薪资。
- 月薪转年薪必须明确标记估算。
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
  confidence: 'high',
  evidence: '招聘人数：3-5人'
}
```

规则：

- 仅在 ATS 结构化字段或正文明确出现招聘人数 / 需求人数 / HC / 招聘名额等证据时记录。
- `scope='job'` 表示具体岗位 HC；`scope='program'` 表示整届校招/项目规模。
- program 级 HC 永远不能当作岗位 HC。
- 公司员工总数、岗位列表数量、历史招聘人数不能推断为当前岗位 HC。
- HC 未披露不是负面证据。

### `jdEvidence`

`jdEvidence` 是从 JD 原文提取的事实证据，不是候选人结论。可包含：

- `majorClauses`
- `eligibilityClauses`
- `technicalDuties / businessDuties`
- 其它可回溯到原始 JD 的结构化字段

LLM 如启用，只负责结构化和引用，不负责输出“适合/不适合”。

### 候选人决策字段禁止上游输出

AI_Job 不得输出：

- Match / Capability / Career Fit
- Competition Score / 竞争强度评级
- Offer Reachability / Offer 概率
- S/A/B、主投/冲刺/Offer池
- Company Top-3 或“是否值得投”

这些结论统一由 CareerPilot 计算。

### 公司历史风险证据

AI_Job 保存公司历史风险事件的底层证据与来源；证据本身不形成候选人匹配分、公司黑名单或投递结论。

## 2. campus-job-board：风险情报契约层

`campus-job-board` 是无头风险规则发布方，不承担候选人最终裁决。

- `risk-intelligence.json` 是正式风险契约。
- `scoring.js` 是历史兼容和契约校验实现，不是最终排序引擎。
- 公司历史风险底层证据来自 AI_Job。
- 公司历史风险不自动降低 Candidate Fit，也不形成公司黑名单。
- 竞争激烈、专业不限、热门岗位、岗位 HC 多/少不是“风险事件”。

## 3. CareerPilot：唯一候选人决策与展示入口

CareerPilot 负责：

- Eligibility Gate
- Match / Capability / Career Fit
- Competition Intensity
- Direct Evidence
- Offer Reachability（相对指数，不冒充真实录取概率）
- First-job Value
- Company Top-3
- 主投 / 冲刺 / Offer池 / 低优先级
- 投递状态和复盘

CareerPilot 必须遵守：

1. Eligibility、Match、Competition、Offer Reachability 使用同一份 JD / `jdEvidence`。
2. 直接业务证据 > 可迁移证据 > 兴趣。
3. “专业不限”只表示资格开放，不能自动加 Offer 分。
4. 只有岗位级官方 HC 可作为上下文；program HC 不参与岗位加分。
5. 缺失 HC、薪资、发布日期等事实字段不降低候选人能力匹配。
6. Offer Reachability 不显示成“xx%录取概率”，除非有官方真实录取数据。
7. 风险情报与能力匹配分离。

## 4. 单向数据流

```text
公司官网 / ATS ───────────────┐
高校就业网 / 其它发现渠道 ─────┤
                              ↓
                           AI_Job
          英语专业本科岗位范围过滤 + 岗位事实/证据
                              │
                              ├────────────→ CareerPilot
                              │               最终候选人决策
                              │
                              └→ campus-job-board
                                 risk-intelligence.json
                                      │
                                      └────→ CareerPilot 风险参考
```

## 5. 不变量

1. AI_Job 是面向英语专业本科生的受控岗位池，不是全专业职位镜像。
2. 明显技术、财会金融、法律、医学等专业岗和硬性专业门槛岗位在生产池入库前排除。
3. 公司官方职位级来源优先，高校渠道是补充而不是唯一来源。
4. 事实字段只在 AI_Job 定义；下游可评价，不能倒写成上游事实。
5. 风险规则只在 campus-job-board 发布；CareerPilot 消费契约。
6. 候选人最终判断只在 CareerPilot 计算。
7. 同一岗位同步与入库重算必须使用同一份 JD / `jdEvidence`。
8. HC 必须保留 `job/program` scope。
9. 三库职责变化必须同步更新本契约并用 CI/回归测试验证。
