# AI Job

面向 **2027 届校招** 的公司/岗位自动发现、官方来源核验、可解释匹配与投递管理工具。

> 核心问题：**今天又有哪些公司开始招人？其中哪些岗位最值得我优先投？为什么？**

## 当前能力（V1.2）

- **多源自动岗位发现**：GitHub Actions 每天自动刷新公开校招岗位。
- **官方源优先**：已接入 Moka、北森、安克官方公开 API、EcoFlow 官方校招页；牛客用于广泛发现。
- **公司雷达**：从岗位池反推正在招聘的公司、城市、岗位族和最高匹配度。
- **岗位雷达**：关键词 / 城市 / 岗位族 / S/A/B 优先级 / 最低匹配分筛选。
- **0–100 可解释匹配**：岗位方向、技能、城市、经历、语言、届别、偏好 7 个维度。
- **S/A/B 投递分层**：匹配分与来源可信度共同决定优先级，而不是只看单一百分数。
- 高匹配亮点、能力缺口、排除条件与风险提示。
- 投递看板：推荐 → 已收藏 → 已投递 → 面试 → Offer → 淘汰。
- 候选人画像：目标岗位、城市、技能、语言、经历关键词、职业偏好与硬性排除条件。
- 本地存储：画像和投递状态保存在浏览器 `localStorage`。

## S / A / B 优先级

| 档位 | 规则 | 含义 |
|---|---|---|
| **S** | 匹配分 ≥ 85、无硬性排除、且已由官方招聘来源核验 | 优先投递 |
| **A** | 匹配分 ≥ 70、无硬性排除 | 建议投递；若为二手来源，先回官网核验 |
| **B** | 低于 A 档，或存在明显方向/城市/能力缺口或硬性风险 | 备选观察 |

S 档故意要求 **官方来源**。即使二手来源岗位匹配分很高，也不会在官网核验前进入 S 档。

## 自动检索架构

```text
牛客公开职位（广泛发现）
Moka 官方校招门户
北森 zhiye 官方校招门户
安克创新官方公开 API
EcoFlow 官方 2027 校招页
          ↓
    各数据源适配器
          ↓
2027 届别 / 截止 / 风险过滤
          ↓
    统一 Job Schema
          ↓
官方来源优先去重与核验
          ↓
 src/data/live-jobs.js
          ↓
浏览器个人画像 7 维匹配
          ↓
   S / A / B 精排
          ↓
岗位雷达 / 公司雷达 / 投递看板
```

### 当前数据源

- **牛客公开职位**：1000 页级深扫，用于扩大公司和岗位发现范围；标记为二手来源。
- **Moka**：公开公司校招门户，浏览器读取前端渲染/SSR 岗位。
- **北森 zhiye**：匿名公开职位接口；个别站点支持 HTML fallback。
- **安克创新**：`career.anker-in.com` 背后的官方公开 Lark Hire API，支持游标分页和职位详情读取。
- **EcoFlow**：`jobs.ecoflow.com/602892` 官方 2027 校招页面，通过浏览器发现公开职位详情。

后台自动刷新无法读取浏览器 `localStorage` 中的个人画像，因此“发现”和“匹配”有意分离：

- `config/search-profile.json`：后台**宽搜索配置**，目标是尽量不漏运营、市场、GTM、电商、项目、HR、英语/海外等相邻机会。
- `src/data/profile.js` / 浏览器画像：前端**个性化精排配置**，决定哪些岗位真正值得当前求职者优先投递。

## 自动刷新

手动运行：

```bash
npm run refresh:jobs
```

GitHub Actions：`.github/workflows/job-refresh.yml`

- 每天 UTC 00:15（北京时间约 08:15）自动刷新。
- 也可在 Actions 中手动触发。
- 单个数据源临时失败不会拖垮其他来源。
- 如果本轮没有任何新鲜有效结果，保留上一版岗位池，不会把页面清空。
- 自动提交标准化摘要和来源元数据，不在仓库内复制完整 JD。

## 本地运行

```bash
python3 -m http.server 4173
```

浏览器打开 `http://localhost:4173`。

运行全部检查：

```bash
npm run check
```

## GitHub Pages

仓库提供 `.github/workflows/pages.yml`。首次启用：

1. 打开仓库 `Settings` → `Pages`。
2. `Build and deployment` → `Source` 选择 `GitHub Actions`。
3. 回到 `Actions` → `Deploy GitHub Pages` → `Run workflow`。

## 数据与安全原则

1. 候选人画像是匹配和后续材料生成的唯一事实源，不虚构经历。
2. 先判断“值不值得投”，再生成材料和推进投递。
3. 每条岗位保留来源；官方来源优先，二手来源明确标记待官网核验。
4. 自动检索只访问公开页面/公开接口，不绕过登录、验证码或访问控制。
5. 默认不替用户自动投递或发送消息。
6. 数据采集与匹配解耦，任何一个数据源失败都不应破坏整个系统。

## 目录

```text
.
├── config/
│   ├── search-profile.json
│   └── official-sources.json
├── index.html
├── src/
│   ├── app.js
│   ├── styles.css
│   ├── discovery.css
│   ├── core/
│   │   ├── matcher.js
│   │   └── storage.js
│   └── data/
│       ├── live-jobs.js
│       ├── jobs.js
│       └── profile.js
├── scripts/
│   ├── refresh-jobs.mjs
│   └── job-discovery/
│       ├── core.mjs
│       ├── nowcoder.mjs
│       ├── moka.mjs
│       ├── beisen.mjs
│       ├── anker.mjs
│       └── ecoflow.mjs
├── tests/
└── .github/workflows/
    ├── ci.yml
    ├── job-refresh.yml
    └── pages.yml
```

## Roadmap

### V1.0 — 求职决策闭环 ✅
- 岗位雷达、7 维匹配、画像、投递看板、本地持久化。

### V1.1 — 自动发现 ✅
- 牛客深扫、公司雷达、2027 届别/截止/去重、每日 Actions 刷新。
- Moka 与北森官方招聘源。
- 官方来源优先覆盖二手来源。

### V1.2 — 官方源与投递优先级 ✅
- 安克创新官方公开 API。
- EcoFlow 官方 2027 校招源。
- 安克游标分页。
- S/A/B 来源感知投递分层。
- 单数据源失败隔离与回归测试。

### V1.3 — JD 与求职材料
- JD 结构化解析。
- 一岗一版简历修改建议。
- 面试问题与 STAR 素材生成。

### V1.4 — 推荐反馈闭环
- LLM / Embedding 语义匹配。
- 证据化推荐理由。
- 根据真实投递/面试结果校准权重。
- 新增高匹配岗位通知与岗位失效监控。

详细规划见 [`docs/PLAN.md`](docs/PLAN.md)。

## License

MIT
