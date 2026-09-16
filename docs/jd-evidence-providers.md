# JD Evidence 多 Provider 配置

AI_Job 的 JD Evidence 增强只处理公开招聘 JD，用于抽取专业/学历/届别原文与职责类别；候选人适配、Match、Career Fit 仍由 CareerPilot 计算。

## 默认路由

```text
OpenCode Zen / mimo-v2.5-free
        ↓ 失败、限流或未配置
Gemini / gemini-3.8-flash
        ↓ 失败、限流或未配置
DeepSeek / deepseek-flash
        ↓ 失败或达到付费上限
本地正则 jdEvidence
```

Provider 不改变 `jdEvidence` 的事实契约。LLM 返回的专业/资格条款仍必须是 JD 原文子串；职责标签仍受 `policy.mjs` 闭集约束。

## GitHub Actions Secrets

仓库：`lizhenhai2024-alt/AI_Job`

路径：`Settings → Secrets and variables → Actions → Repository secrets`

建议配置：

| Secret | 用途 | 是否必需 |
| --- | --- | --- |
| `OPENCODE_ZEN_API_KEY` | OpenCode Zen 免费模型 | 建议 |
| `GEMINI_API_KEY` | Gemini API Free Tier | 建议 |
| `JD_EVIDENCE_API_KEY` | DeepSeek 付费兜底 | 可选 |

不要把 Key 写入 JS、JSON、README、`.env` 并提交到仓库。

## 生产参数

`refresh-campus-jobs.yml` 当前默认：

```text
JD_EVIDENCE_PROVIDER_ORDER=zen-free,gemini-free,deepseek
JD_EVIDENCE_MAX_CALLS=1500
JD_EVIDENCE_PAID_MAX_CALLS=200
JD_EVIDENCE_CONCURRENCY=4
JD_EVIDENCE_ONLY_WEAK=1
```

`MAX_CALLS` 是单轮最多处理的待增强岗位数。每个岗位可在前一个 Provider 失败时切换到下一个 Provider。DeepSeek 有独立 `PAID_MAX_CALLS=200` 上限，避免免费 Provider 故障时整批意外转为付费调用。

默认只对“正则没有抽到专业原文”的弱证据岗位调用 LLM；已有强正则证据的岗位跳过。缓存按 `岗位ID + JD哈希 + 模型` 复用，JD 没变化就不会重复占用额度。

## Provider 健康保护

- 401 / 403 / 404：本轮立即熔断该 Provider。
- 连续 3 次 429：本轮熔断，自动切到下一 Provider。
- 每个 Provider 有请求超时：Zen 12s、Gemini 15s、DeepSeek 20s。
- 所有 LLM Provider 都失败时，保留正则结果；岗位刷新不因模型服务不可用而中断。
- GitHub Actions Summary 会显示 Provider 顺序、是否配置 Key、尝试/成功/失败、熔断状态，以及当前池中各 Provider 的 LLM 证据数量。

## 自定义顺序

可设置：

```text
JD_EVIDENCE_PROVIDER_ORDER=gemini-free,zen-free,deepseek
```

旧变量 `JD_EVIDENCE_PRESET=deepseek` 仍兼容；仅设置它而没有设置 `JD_EVIDENCE_PROVIDER_ORDER` 时，会退化成单 Provider 模式。

## 官方接口参考

- OpenCode Zen: https://opencode.ai/docs/zen
- Gemini OpenAI compatibility: https://ai.google.dev/gemini-api/docs/openai
- Gemini API pricing / Free Tier: https://ai.google.dev/gemini-api/docs/pricing

免费模型、Free Tier 配额和数据政策可能由服务商调整。生产代码因此把“免费 Provider”当优先路由，而不是把“永远零费用”作为业务假设。

## 隐私边界

JD Evidence 阶段只允许发送公开招聘 JD，不发送简历、姓名、联系方式、候选人画像或投递记录。候选人信息只留在 CareerPilot 的本地决策层。
