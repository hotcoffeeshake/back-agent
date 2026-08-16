---
name: service-response-assist
title: 客服响应辅助
description: 为人工提供推荐话术、政策依据、风险提示和动作预览；生成完整接管包。
metadata:
  version: "0.2.0"
  maturity: demo
  reuse_tier: 渠道适配层
  applies_to_worker: 方案生成
---

# 客服响应辅助

## 复用层级（V2.0 原文）

渠道适配层；仅建议，不发送。

## Purpose

为人工客服提供可编辑的推荐话术、政策依据、风险提示与动作预览，并在需要接管时生成完整接管包。

## Inputs

- 方案生成结果（候选、报价、可执行性判定）。
- 政策与规则（只读）。
- 需求画像与风险上下文。

### Input Schema（JSON Schema, schema_version: 1.0）

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "schema_version": "1.0",
  "type": "object",
  "properties": {
    "offer_result": {"type": "object", "description": "方案生成结果（候选/报价/可执行性）"},
    "policies": {"type": "object", "description": "政策与规则（只读）"},
    "requirement_profile": {"type": "object", "description": "需求画像"},
    "risk_context": {"type": "array", "items": {"type": "string"}}
  },
  "required": ["offer_result"]
}
```

## Procedure

1. 基于方案结果生成推荐话术，每条绑定政策依据或证据引用。
2. 对高风险或低置信方案附加风险提示。
3. 生成受控动作预览（仅预览，不执行、不发送）。
4. 需接管时生成完整接管包（需求、证据、风险、已执行动作、待决事项、失败原因）。

## Output Contract

```json
{
  "suggestions": [{"text": "", "policy_ref": "", "evidence_ref": ""}],
  "risk_warnings": [],
  "action_preview": [],
  "handoff_package": {
    "requirement": "",
    "evidence": [],
    "risks": [],
    "pending": [],
    "failure_reason": ""
  }
}
```

### Output Schema（JSON Schema, schema_version: 1.0）

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "schema_version": "1.0",
  "type": "object",
  "properties": {
    "suggestions": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "text": {"type": "string"},
          "policy_ref": {"type": "string"},
          "evidence_ref": {"type": "string"}
        },
        "required": ["text"]
      }
    },
    "risk_warnings": {"type": "array", "items": {"type": "string"}},
    "action_preview": {"type": "array", "items": {"type": "object"}},
    "handoff_package": {
      "type": "object",
      "properties": {
        "requirement": {"type": "string"},
        "evidence": {"type": "array", "items": {"type": "string"}},
        "risks": {"type": "array", "items": {"type": "string"}},
        "pending": {"type": "array", "items": {"type": "string"}},
        "failure_reason": {"type": "string"}
      },
      "required": ["requirement"]
    }
  },
  "required": ["suggestions", "handoff_package"]
}
```

## 依赖（Dependencies）

- 数据：方案结果、政策规则、证据索引

## 失败处理（Failure Handling）

- 无政策依据 → 不生成承诺性话术，仅提供中性回应。
- 证据不足 → 在话术中标注证据缺失，不虚构依据。
- 生成失败 → 回退到模板话术并转人工。

## 评测阈值（Evaluation Threshold）

- Copilot 建议采纳或编辑后采纳率 ≥ 60%。
- 无依据承诺次数 = 0。
- 接管包完整率 ≥ 99%。

## Quality Gates

- 仅建议，不代替人工发送。
- 话术必须绑定政策或证据，无依据不承诺。
