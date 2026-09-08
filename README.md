# AI Job

面向 **2027 届校招** 的公司/岗位自动发现、可解释匹配与投递管理工具。

> 核心问题：**今天又有哪些公司开始招人？其中哪些岗位最值得我优先投？为什么？**

## 当前功能（V1.1）

- **自动公司与岗位发现**：GitHub Actions 每天扫描公开校招职位索引，识别 2027 届候选岗位
- **公司雷达**：从真实岗位池反推正在招聘的候选公司、城市、岗位族和最高匹配度
- **岗位雷达**：关键词 / 城市 / 岗位族 / 最低匹配分筛选
- **0–100 可解释匹配**：岗位方向、技能、城市、经历、语言、届别、偏好 7 个维度
- 高匹配亮点、能力缺口、排除条件风险提示
- 投递看板：推荐 → 已收藏 → 已投递 → 面试 → Offer → 淘汰
- 候选人画像：目标岗位、城市、技能、语言、经历关键词、职业偏好与硬性排除条件
- 本地存储：画像和投递状态保存在浏览器 `localStorage`
- 零第三方运行依赖：自动检索与前端均使用平台/Node 原生能力

## 自动检索架构

```text
公开校招索引 / ATS / 公司官网
           ↓
      公司与岗位发现
           ↓
  2027 届别 / 截止状态校验
           ↓
      Job Schema 标准化
           ↓
        去重 / 限流
           ↓
 src/data/live-jobs.js
           ↓
 浏览器中的个人画像精排
           ↓
   岗位雷达 / 公司雷达
```

V1.1 首个自动适配器使用 **牛客公开职位** 做广泛发现。它属于二手公开来源，因此界面会明确标记 **“二手来源，待官网核验”**，并保留原始来源链接。正式投递前应优先回到公司校招官网确认届别、截止时间、岗位状态和投递入口。

后台自动刷新无法读取浏览器 `localStorage` 中的个人画像，所以两层搜索有意分离：

- `config/search-profile.json`：后台使用的**宽搜索配置**，目标是尽量不漏掉运营、市场、GTM、电商、项目、HR、英语/海外等相邻机会。
- `src/data/profile.js` / 浏览器画像：前端使用的**个性化精排配置**，决定哪些岗位更适合当前求职者。

## 自动刷新

手动运行：

```bash
npm run refresh:jobs
```

GitHub Actions：`.github/workflows/job-refresh.yml`

- 每天 UTC 00:15（北京时间约 08:15）自动刷新
- 也可在 Actions 中手动触发
- 首次合并自动检索代码后会执行一次真实网络环境测试
- 来源临时不可用或没有新结果时，**保留上一版有效岗位池**，不会把页面清空
- 仅提交标准化摘要和来源元数据，不在仓库内复制完整 JD

## 运行

```bash
python3 -m http.server 4173
```

浏览器打开 `http://localhost:4173`。

运行全部检查：

```bash
npm run check
```

## GitHub Pages 部署

仓库已经提供 `.github/workflows/pages.yml`。GitHub Pages 首次使用需要一次性启用发布源：

1. 打开仓库 `Settings` → `Pages`。
2. 在 `Build and deployment` 下把 `Source` 选择为 `GitHub Actions`。
3. 回到 `Actions`，选择 `Deploy GitHub Pages`，点击 `Run workflow`。

## 数据与安全原则

1. 候选人画像是生成内容的唯一事实源，不虚构经历。
2. 先判断“值不值得投”，再生成材料和推进投递。
3. 正式岗位必须保留可追溯来源，二手来源明确标记并要求官网复核。
4. 自动检索只访问公开页面/公开接口，不绕过登录、验证码或访问控制。
5. 默认不替用户自动投递或发送消息。
6. 数据采集与 AI 匹配解耦，任一层都能独立升级。

## 目录

```text
.
├── config/
│   └── search-profile.json       # 后台宽搜索配置
├── index.html
├── src/
│   ├── app.js                    # 岗位雷达 / 公司雷达 / 看板
│   ├── styles.css
│   ├── discovery.css
│   ├── core/
│   │   ├── matcher.js            # 可解释匹配算法
│   │   └── storage.js            # 本地持久化
│   └── data/
│       ├── live-jobs.js          # 自动刷新真实岗位池
│       ├── jobs.js               # Demo 回退数据
│       └── profile.js            # 默认示例画像
├── scripts/
│   ├── refresh-jobs.mjs          # 自动刷新入口
│   └── job-discovery/
│       ├── core.mjs              # 标准化/届别/截止/去重
│       └── nowcoder.mjs          # 牛客公开职位适配器
├── tests/
│   ├── discovery.test.js
│   └── matcher.test.js
└── .github/workflows/
    ├── ci.yml
    ├── job-refresh.yml
    └── pages.yml
```

## Roadmap

### V1.1 — 自动发现（当前）
- [x] 自动发现公开 2027 届岗位
- [x] 届别、截止状态、标准 Schema 与去重
- [x] 公司雷达
- [x] 每日 GitHub Actions 刷新
- [ ] Moka 官方公开招聘 API 适配器
- [ ] 北森 / 公司自建校招官网适配器
- [ ] 官方来源对二手来源自动覆盖与核验

### V1.2 — JD 与简历
- JD 结构化解析
- 一岗一版简历修改建议
- 面试问题与 STAR 素材生成

### V1.3 — 智能推荐
- LLM / Embedding 语义匹配
- 证据化推荐理由
- 根据真实投递反馈自动校准推荐权重

详细规划见 [`docs/PLAN.md`](docs/PLAN.md)。

## License

MIT
