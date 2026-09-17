# AI Job

面向 **2027 届校招** 的岗位发现 / 情报库。

> **三库职责已经固定：**
> - `AI_Job`：负责岗位发现、来源核验、交叉取证、去重、职位级链接、届别/截止/语言/专业要求、完整 JD、薪资、岗位级 HC、招聘流程和公司历史风险等事实与证据。
> - `campus-job-board`：只发布风险情报契约，不计算个人 Match / Competition / Offer Reachability。
> - `CareerPilot`：三库中唯一的候选人最终决策与展示入口，负责 Eligibility、Match、Capability、Career Fit、Competition、Offer Reachability、First-job Value、Company Top3 和投递组合。

## AI_Job 不再做什么

本仓库不维护第二套候选人匹配算法，也不输出：

- S / A / B 等级
- 0–100 候选人匹配度
- 最终岗位方向
- 公司匹配度
- Competition / Offer Reachability
- “主投 / 冲刺 / Offer池 / 低优先 / 不建议”等最终结论
- 公司“黑名单分数”

这样可以避免三个仓库分别计算、结果冲突，也避免把历史争议直接等同于当前公司状态。

## 采集边界：宽采集、事实标注、下游裁决

AI_Job 的职责是回答“**现在有哪些可核验的 2027 届正式岗位，它们真实要求什么**”，而不是替某一位候选人提前删岗位。

因此：

- **不因当前候选人是英语专业而删除技术岗位。** 软件、算法、硬件、机械、电气、研发等岗位，只要属于有效 2027 届正式校招且来源可信，就可保留。
- **不因当前候选人缺少财务背景而删除财务/会计/审计/税务/金融/精算/法务等岗位。** 上游只保留并结构化其专业硬门槛，是否适合由 CareerPilot 的 Eligibility / Professional Domain / Direct Evidence 判断。
- **不因岗位是销售、供应链、HR 或其它当前低优先方向而删除。** 方向偏好属于候选人决策层。
- AI_Job 可以标注 `major.hardRestriction`、`education.masterRequired`、小语种硬要求、技术职责、专业职责等**事实信号**，但这些信号不能在上游变成“适合/不适合”。

上游允许直接排除的主要是候选人无关的无效记录：

1. 不是目标届次（当前为 2027 届）；
2. 已关闭或明确过期；
3. 实习、兼职等不属于正式校招目标；
4. 章节标题、伪公司、聚合页噪音等非真实岗位；
5. 无法满足生产源可信度要求的二手记录。

### 来源策略：公司官方为主，高校为补充，不做“高校独占”

AI_Job **不只保留高校校招**。生产池来源优先级为：

1. **公司官方校招官网 / ATS 的职位级岗位**：第一优先级；
2. **高校就业网官方发布 + 明确 2027 届 + 明确公司官方投递入口**：允许作为受控过渡记录，保留 `secondary` 身份和“待官网细化”标记；
3. 招聘平台、内推帖、公众号/微博等：主要用于发现和交叉取证，不能替代职位级官网核验。

高校就业网的价值是**补漏和交叉取证**，不是取代公司官方职位库。发现同一岗位的公司官方记录后，应以官方职位作为主记录，同时保留高校来源作为证据链。

## 当前核心能力

- 多源自动岗位发现
- 2027 届岗位线索识别
- 截止 / 关闭状态识别
- 公司、岗位、城市标准化
- 候选人无关噪音过滤（非 2027、实习/兼职、关闭、伪公司/章节标题等）
- 专业/学历/语言硬门槛事实提取，但**不按候选人适配删岗**
- 岗位抓取标签（仅用于发现，不作为最终岗位方向）
- 官方源 / 二手源区分
- 来源渠道归类
- 情报完整度检查
- 小语种硬要求线索识别（只提供事实，最终由 CareerPilot 判定）
- 公司发现队列 / ATS 来源发现
- 高校就业信息网自动补充与交叉取证
- 跨来源去重时保留证据链，官方职位仍作为主来源
- **完整 JD / `jdEvidence` 结构化**
- **校招月薪 / 年薪结构化情报**
- **岗位级 HC / program HC 分层**
- **公司招聘流程 / 笔试测评 / 薪酬情报**
- **公司历史风险事件与实习转正/留用线索**
- `jobs/index/jobs.json` + `jobs/by-company/*.json` 作为轻量 Query Layer
- `src/data/live-jobs.js` 作为完整历史兼容数据源

## Query Layer

为避免下游每次加载大型 `live-jobs.js`，AI_Job 会发布轻量结构化查询层：

```text
jobs/index/jobs.json
jobs/index/companies.json
jobs/by-company/<company>.json
```

Query Layer 保留：

`company / title / graduationYear / education / major / language / location / jobDescription / jobRequirements / JD / jdEvidence / roleFamily / skills / headcount / compensation / source / officialURL / publishedAt / lastVerified / deadline`

它只搬运岗位事实，不允许出现 Match、Capability、Career Fit、Decision Score、Recommendation 等候选人决策字段。

## 薪资情报

岗位刷新完成后，会统一执行薪资结构化：

- 保留原始 `salary`
- 生成 `monthlySalary`
- 生成 `annualSalary`
- 保存结构化 `compensation`：月薪上下限、年薪上下限、薪数、来源、可信度和证据片段

规则：

- `15K-25K·14薪` → 月薪 **1.5–2.5 万**；年薪 **约 21–35 万（按14薪推算）**
- `15000-22000元/月` → 年薪只按 **12薪估算**，并明确标注“估算”
- `年薪24-36万` → 年薪直接采用来源值；月薪只做 12 个月等效估算
- `面议 / 未披露` → 显示 **未披露**，不猜数
- 二手来源披露的薪资会标记 **待官网复核**
- 年薪推算不擅自加入未披露的年终奖、股票、补贴或绩效奖金

实现：`src/core/compensation.js`、`scripts/enrich-job-compensation.mjs`。

## 公司历史风险 / 实习留用情报

`src/data/company-risk-history.js` 保存可追溯的历史事件。目前重点支持：

- 裁员 / 人员优化
- 组织重组
- 实习转正 / 留用 HC 风险
- 校招毁约 / 缩招（有证据时录入）
- 工作强度争议（有证据时录入）
- 薪酬争议（有证据时录入）

证据分级：

- **A**：公司公告、监管、法院等一手材料
- **B**：Reuters 等高可信媒体，或公司回应经媒体确认
- **C**：可追溯社区经验 / 汇总，只作面试反问和核验线索
- **D**：未经核实传闻，默认不展示

重要原则：

- 历史裁员必须标明**年份和业务范围**，不能自动外推成“现在全公司还在裁员”。
- “卡实习转正 / HC 不足 / 转正率低”等匿名经验只能作为 **C级线索**，不能写成公司事实。
- 没有已录入事件时显示“暂无已录入高可信公开风险事件”，**不写成‘无风险’**。
- 不计算公司黑名单分数；是否值得投由 `CareerPilot` 结合当前岗位和候选人画像判断。

## 五大获取渠道

1. **公司官方校招官网 / ATS 系统**  
   飞书招聘、Moka、北森、智联校招、牛客校招、公司自建招聘官网等。
2. **高校就业信息网官方简章**  
   覆盖 **985、211、双一流，以及外语/外贸/国际商务特色高校**。外语外贸特色高校优先抓取，但该优先级只决定“搜哪里、搜多深”，不参与最终岗位评分。
3. **招聘平台官方账号**  
   猎聘、51job、智联招聘、应届生求职网。
4. **牛客 / 脉脉官方内推帖**
5. **公司官方公众号 / 微博校招公告**

渠道配置见：`config/source-channels.json`。

### 高校渠道

高校目标池配置见：`config/university-sources.json`。

当前已启用并进入自动刷新链路的学校：

- 广东外语外贸大学
- 北京外国语大学
- 对外经济贸易大学
- 上海外国语大学
- 上海对外经贸大学
- 北京语言大学
- 南开大学
- 湖南大学

持续扩展队列包括：

- 北京第二外国语学院、四川外国语大学、西安外国语大学、天津外国语大学、大连外国语大学等外语外贸特色高校
- 985 / 211 / 双一流综合高校
- 财经、国际商务和商科就业信息密度较高的重点高校

高校就业网属于**学校官方发布渠道**，但不是企业职位官网。因此抓到岗位后仍标记为“待公司官网复核”；如果同一岗位随后在公司官网/ATS 被发现，则公司官方职位保留为主记录，高校链接作为交叉证据保留。

## 数据处理原则

```text
公司官网 / ATS + 高校就业网 + 其它发现渠道
    ↓
保留原始来源与职位链接
    ↓
2027 届 / 截止 / 关闭 / 正式岗位校验
    ↓
Job Schema 标准化
    ↓
候选人无关噪音过滤
    ↓
专业 / 学历 / 语言 / JD / HC / 薪资事实结构化
    ↓
跨来源核实 / 去重 / 来源证据保留
    ↓
live-jobs.js
    ↓
Query Layer：jobs/index/jobs.json + jobs/by-company/*.json
    ↓
CareerPilot：唯一候选人最终决策

AI_Job 公司风险底层证据
    ↓
campus-job-board：risk-intelligence.json 风险规则契约
    ↓
CareerPilot：风险展示与决策参考
```

### 来源规则

- **企业官方职位级来源优先。**
- 高校就业网、招聘平台、内推帖、公众号/微博可作为发现入口和补充证据。
- 学校官方发布 ≠ 企业官方职位。
- 二手或公告级来源不能替代职位级官网核验。
- 同一岗位多源出现时，应保留交叉证据，而不是简单丢掉所有重复来源信息。
- 投递链接优先指向公司官方校招官网 / 官方 ATS 的具体职位页面。

## 项目结构

```text
.
├── docs/
│   ├── job-intelligence-contract-v1.md # 三库事实/风险/决策边界契约
│   ├── operations-rules.md             # 运维规则与经验教训（提交/推送前必读）
│   ├── beisen-url-rules.md             # R-BEISEN-001 北森详情 URL 规则
│   └── PLAN.md                         # 项目计划
├── config/
│   ├── source-channels.json            # 五大获取渠道与核验策略
│   ├── university-sources.json         # 985/211/双一流/外语外贸高校目标池
│   ├── search-profile.json             # 后台宽搜索配置
│   └── official-sources.json           # 公司官方来源配置
├── jobs/
│   ├── index/jobs.json                 # 轻量全量查询索引
│   ├── index/companies.json            # 公司索引
│   └── by-company/*.json               # 按公司轻量岗位文件
├── src/
│   ├── app.js                          # 基础岗位 / 公司 / 来源情报 UI
│   ├── intelligence-enhancements.js    # 薪资与公司历史情报 UI
│   ├── core/
│   │   ├── source-provenance.js        # 来源渠道、证据、情报完整度
│   │   ├── compensation.js             # 月薪 / 年薪标准化
│   │   ├── company-risk.js             # 公司历史风险证据查询
│   │   └── company-intake.js           # 添加公司到发现队列
│   └── data/
│       ├── live-jobs.js                # 自动刷新真实岗位池
│       ├── company-risk-history.js     # 历史裁员 / 实习留用等证据库
│       └── source-channels.js          # 前端五大渠道定义
├── scripts/
│   ├── build-query-layer.mjs           # 发布轻量 Query Layer
│   ├── enrich-jd-evidence.mjs          # JD 证据结构化
│   ├── enrich-job-compensation.mjs     # 岗位刷新后的薪资结构化
│   └── job-discovery/
│       ├── university.mjs              # 高校就业网通用发现适配器
│       ├── refresh-university-jobs.mjs
│       └── dedupe.mjs
└── tests/
```

## 自动刷新

```bash
npm run refresh:jobs
npm run check
```

自动刷新顺序：

```text
公司官网 / ATS / 牛客等主发现
        ↓
高校就业信息网补充发现
        ↓
岗位粒度校验 + 资格/语言/专业等信号标注（不按候选人适配删岗）
        ↓
多源去重 + 证据合并
        ↓
完整 JD / jdEvidence / HC / 薪资结构化
        ↓
live-jobs.js
        ↓
Query Layer
```

GitHub Actions 每日自动刷新岗位池。只有岗位池或来源健康状态实际变化时才提交新的数据文件。

## 设计底线

1. **发现准确性** 与 **最终判断准确性** 分开治理。
2. `AI_Job` 宁可多保留可核验的 2027 届正式岗位，也不因当前候选人专业、经历或偏好擅自删岗。
3. 技术、财务、审计、金融、法务等专业岗位的硬门槛应被结构化为事实，而不是在上游静默消失。
4. `campus-job-board` 只发布风险情报契约；`CareerPilot` 是唯一最终候选人裁决层。
5. 公司官方职位级来源优先；高校就业网用于补漏和交叉取证，不做唯一来源。
6. 正式岗位必须可追溯；来源不充分就明确标记“待官网复核”。
7. 薪资不披露就不猜；推算值必须显式标记。
8. 历史“黑点”必须有来源、有日期、有范围；社区传闻不得冒充事实。
9. 不虚构岗位、JD、候选人经历、官方投递地址或公司历史事件。

## License

MIT
