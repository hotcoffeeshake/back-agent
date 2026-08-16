---
name: requirement-clarification
title: 需求澄清
description: 将模糊表达转结构化需求；识别缺失字段并追问；判断阶段、意图、情绪、风险、允许动作和接管原因。
metadata:
  version: "0.2.0"
  maturity: demo
  reuse_tier: 跨行业通用
  applies_to_worker: 需求诊断
---

# 需求澄清

## 复用层级（V2.0 原文）

跨行业通用；跨客服/售前/售后。

## Purpose

将客户的模糊口语表达转为结构化需求画像，补齐关键缺口，识别阶段、意图、情绪、风险与接管原因。

## Inputs

- 客户原始需求文本。
- 已解析的身份上下文（来自身份与记忆 Worker）。
- 目录元数据（设备类型、用途，只读）。

### Input Schema（JSON Schema, schema_version: 1.0）

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "schema_version": "1.0",
  "type": "object",
  "properties": {
    "request_text": {"type": "string", "description": "客户原始需求文本"},
    "identity": {
      "type": "object",
      "properties": {
        "customer_id": {"type": "string"},
        "merchant_id": {"type": "string"},
        "channel_id": {"type": "string"}
      },
      "required": ["customer_id", "merchant_id", "channel_id"]
    },
    "scenario_id": {"type": "string", "description": "如 req_xx"}
  },
  "required": ["request_text", "identity", "scenario_id"]
}
```

## Procedure

1. 抽取结构化字段：设备类型、用途、时间窗、地点、预算、资质要求。
2. 识别缺失字段并生成追问项，不猜测关键字段。
3. 判断客户所处阶段（售前/售中/售后）、意图（预订/咨询/比较）与情绪。
4. 评估风险与是否需转人工（高风险、低置信、超出授权）。
5. 输出 RequirementProfile 与 RiskContext。

## Output Contract

```json
{
  "requirement_profile": {
    "device_type": "",
    "purpose": "",
    "time_window": {"start": "", "end": ""},
    "location": "",
    "budget": 0,
    "credential_required": []
  },
  "stage": "",
  "intent": "",
  "risk_context": [],
  "missing_fields": [],
  "handoff_needed": false
}
```

### Output Schema（JSON Schema, schema_version: 1.0）

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "schema_version": "1.0",
  "type": "object",
  "properties": {
    "scenario_id": {"type": "string"},
    "requirement_profile": {
      "type": "object",
      "properties": {
        "device_type": {"type": "string"},
        "purpose": {"type": "string"},
        "time_window": {
          "type": "object",
          "properties": {
            "start": {"type": "string"},
            "end": {"type": "string"}
          },
          "required": ["start", "end"]
        },
        "location": {"type": "string"},
        "budget": {"type": "number"},
        "credential_required": {"type": "array", "items": {"type": "string"}}
      },
      "required": ["device_type", "purpose", "time_window", "location"]
    },
    "stage": {"type": "string", "enum": ["售前", "售中", "售后"]},
    "intent": {"type": "string", "enum": ["预订", "咨询", "比较"]},
    "risk_context": {"type": "array", "items": {"type": "string"}},
    "missing_fields": {"type": "array", "items": {"type": "string"}},
    "handoff_needed": {"type": "boolean"}
  },
  "required": ["scenario_id", "requirement_profile", "stage", "intent", "handoff_needed"]
}
```

## 依赖（Dependencies）

- 工具：catalog.list_devices、catalog.list_professionals
- 数据：目录元数据（只读）、规则（只读）

## 失败处理（Failure Handling）

- 关键字段缺失 → 输出 missing_fields 并追问，不猜测字段值。
- 目录元数据不可用 → 标注 data_gap，仅基于客户文本澄清。
- 超出授权或高风险 → 置 handoff_needed=true，转人工。

## 评测阈值（Evaluation Threshold）

- 结构化字段完整率 ≥ 90%（关键字段无缺失）。
- 关键字段猜测次数 = 0。
- 应转人工而未识别率 ≤ 5%。

## Quality Gates

- 不猜测关键字段。
- 不直接执行业务动作。
- 目录元数据只读，不写入。
