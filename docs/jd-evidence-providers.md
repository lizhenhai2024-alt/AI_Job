# JD Evidence 多 Provider 配置

AI_Job 的 JD Evidence 增强只处理公开招聘 JD，用于抽取专业/学历/届别原文与职责类别；候选人适配、Match、Career Fit 仍由 CareerPilot 计算。

## 默认路由

当前 GitHub Actions / headless 默认路由：

```text
Gemini / gemini-3.5-flash-lite
        ↓ 503、限流、模型不可用或未配置
Gemini / gemini-3.1-flash-lite
        ↓ 失败
Gemini / gemini-2.5-flash-lite
        ↓ 失败
DeepSeek / deepseek-flash
        ↓ 失败或达到付费上限
本地正则 jdEvidence
```

`OPENCODE_ZEN_API_KEY` 仍被程序识别，但 `zen-free / mimo-v2.5-free` **不再进入默认 headless 路由**。2026-09 在 GitHub Actions 实测其免费模型通过通用 Chat Completions API 返回 `MissingSessionID` / `OpenCode's free tier can only be used in OpenCode`。因此不能把 Zen 免费层当作无人值守 GitHub Actions 的可靠免费 API。预设仍保留，便于未来官方改变限制后重新启用。

Provider 不改变 `jdEvidence` 的事实契约。LLM 返回的专业/资格条款仍必须是 JD 原文子串；职责标签仍受 `policy.mjs` 闭集约束。

## GitHub Actions Secrets

仓库：`lizhenhai2024-alt/AI_Job`

路径：`Settings → Secrets and variables → Actions → Repository secrets`

建议配置：

| Secret | 用途 | 是否必需 |
| --- | --- | --- |
| `GEMINI_API_KEY` | Gemini API Free Tier；同一 Key 自动尝试三个 Flash-Lite 模型 | **建议** |
| `JD_EVIDENCE_API_KEY` | DeepSeek 付费兜底 | 可选 |
| `OPENCODE_ZEN_API_KEY` | 保留给未来 Zen headless free-tier 或显式实验 | 当前生产不使用 |

不要把 Key 写入 JS、JSON、README、`.env` 并提交到仓库。

## 生产参数

`refresh-campus-jobs.yml` 当前默认：

```text
JD_EVIDENCE_PROVIDER_ORDER=gemini-free,gemini-free-31,gemini-free-25,deepseek
JD_EVIDENCE_MAX_CALLS=1500
JD_EVIDENCE_PAID_MAX_CALLS=200
JD_EVIDENCE_CONCURRENCY=4
JD_EVIDENCE_ONLY_WEAK=1
```

`MAX_CALLS` 是单轮最多处理的待增强岗位数。每个岗位可在前一个 Provider/模型失败时切换到下一个。三个 Gemini 预设共用一个 `GEMINI_API_KEY`；DeepSeek 有独立 `PAID_MAX_CALLS=200` 上限，避免 Gemini 免费层临时故障时整批意外转为付费调用。

当前生产策略只对 **岗位说明(jobDescription) 与任职要求(jobRequirements) 都完整** 的岗位调用 LLM：单字段至少 40 个有效字符，两字段合计至少 120 个有效字符。完整 JD 会全部执行 AI 事实分析，不再因为正则已经抽到专业原文而跳过；JD 不完整的岗位保留正则解析，等待官网后续补全。缓存按 `岗位ID + JD哈希 + 模型` 复用，JD 没变化就不会重复占用额度。

## Provider 健康保护

- 401 / 403 / 404：本轮立即熔断该 Provider/模型。
- 连续 3 次 429：本轮熔断，自动切到下一模型。
- Gemini 单请求超时 15s；DeepSeek 20s。
- Gemini 503/高负载不会中断刷新，而是继续尝试下一个 Flash-Lite 模型。
- 所有 LLM Provider 都失败时，保留正则结果；岗位刷新不因模型服务不可用而中断。
- GitHub Actions Summary 会显示 Provider 顺序、是否配置 Key、尝试/成功/失败、熔断状态，以及当前池中各 Provider 的 LLM 证据数量。

## Smoke Test

配置 Secret 后运行：

```text
Actions → Smoke test JD evidence providers → Run workflow
```

Smoke Test 默认只测试生产链：

```text
gemini-3.5-flash-lite → gemini-3.1-flash-lite → gemini-2.5-flash-lite → DeepSeek（若配置）
```

Zen free 不再作为默认 smoke 的失败条件，因为它当前依赖 OpenCode session，不能代表 GitHub Actions 的可用性。

## 自定义顺序

可设置：

```text
JD_EVIDENCE_PROVIDER_ORDER=gemini-free-31,gemini-free-25,deepseek
```

如需显式重新试验 Zen，可手工加入 `zen-free`，但当前不建议用于生产。

旧变量 `JD_EVIDENCE_PRESET=deepseek` 仍兼容；仅设置它而没有设置 `JD_EVIDENCE_PROVIDER_ORDER` 时，会退化成单 Provider 模式。

## 官方接口参考

- OpenCode Zen: https://opencode.ai/docs/zen
- Gemini OpenAI compatibility: https://ai.google.dev/gemini-api/docs/openai
- Gemini API models: https://ai.google.dev/gemini-api/docs/models
- Gemini API pricing / Free Tier: https://ai.google.dev/gemini-api/docs/pricing

免费模型、Free Tier 配额和数据政策可能由服务商调整。生产代码因此把“免费 Provider”当优先路由，而不是把“永远零费用”作为业务假设。

## 隐私边界

JD Evidence 阶段只允许发送公开招聘 JD，不发送简历、姓名、联系方式、候选人画像或投递记录。候选人信息只留在 CareerPilot 的本地决策层。
