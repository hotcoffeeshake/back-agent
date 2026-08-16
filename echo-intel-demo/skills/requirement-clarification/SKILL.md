---
name: requirement-clarification
title: 需求澄清
description: 将模糊表达转结构化需求；识别缺失字段并追问；判断阶段、意图、情绪、风险、允许动作和接管原因。
metadata:
  version: "0.3.0"
  maturity: demo
  reuse_tier: 跨行业通用
  applies_to_worker: 需求诊断
---

# 需求澄清

## 复用层级（V2.0 原文）

跨行业通用；跨客服/售前/售后。

## Purpose

将客户的模糊口语表达转为结构化需求画像，补齐关键缺口，识别阶段、意图、情绪、风险与接管原因。**关键字段缺失时不猜测，必须输出 CLARIFYING 状态与结构化追问**，由 Leader 经 Manager 房间向用户发起多轮澄清（≤3 轮）。

## Inputs

- 客户原始需求文本。
- 已解析的身份上下文（来自身份与记忆 Worker）。
- 目录元数据（设备类型、用途，只读）。
- **澄清历史（多轮）**：前几轮已确认字段与用户回答（由 Leader 随 spec 下发，首轮为空）。

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

1. 抽取结构化字段：设备类型、用途、时间窗、地点、预算、资质要求。**合并澄清历史中的已确认字段（用户最新回答优先），缺失项留空，不得填默认值。**
2. 关键字段（device_type / purpose / time_window / location）缺失时：置 `status=CLARIFYING`，按"影响检索范围 > 影响履约 > 影响排序"的顺序选择缺口，**每轮最多生成 2 个结构化追问**（field / question / reason），并输出整体置信度。
3. 判断客户所处阶段（售前/售中/售后）、意图（预订/咨询/比较）与情绪。
4. 评估风险与是否需转人工（高风险、低置信、超出授权、澄清轮次已达上限）。
5. 输出 RequirementProfile 与 RiskContext：字段齐全 → `status=READY`；轮次耗尽仍缺 → `status=HANDOFF`。

## Output Contract

```json
{
  "status": "READY | CLARIFYING | HANDOFF",
  "clarification": {
    "needed": true,
    "round": 1,
    "max_rounds": 3,
    "confidence": 0.55,
    "questions": [
      {"field": "time_window.start", "question": "您期望哪一天开始作业？", "reason": "影响档期实时校验"}
    ]
  },
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
    "status": {"type": "string", "enum": ["READY", "CLARIFYING", "HANDOFF"]},
    "clarification": {
      "type": "object",
      "properties": {
        "needed": {"type": "boolean"},
        "round": {"type": "integer", "minimum": 1},
        "max_rounds": {"type": "integer"},
        "confidence": {"type": "number", "minimum": 0, "maximum": 1},
        "questions": {
          "type": "array",
          "maxItems": 2,
          "items": {
            "type": "object",
            "properties": {
              "field": {"type": "string"},
              "question": {"type": "string"},
              "reason": {"type": "string"}
            },
            "required": ["field", "question"]
          }
        }
      },
      "required": ["needed", "round", "confidence"]
    },
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
  "required": ["scenario_id", "status", "clarification", "requirement_profile", "stage", "intent", "handoff_needed"]
}
```

## 依赖（Dependencies）

- 工具：search_catalog.list_devices、search_catalog.list_professionals
- 数据：目录元数据（只读）、规则（只读）、澄清历史（Leader 下发）

## 失败处理（Failure Handling）

- 关键字段缺失 → `status=CLARIFYING` + clarification.questions，不猜测字段值；**不得越过澄清直接输出 READY**。
- 澄清轮次已达 max_rounds 仍缺关键字段 → `status=HANDOFF`、handoff_needed=true，输出已收集字段与未决问题供接管包使用。
- 目录元数据不可用 → 标注 data_gap，仅基于客户文本与澄清历史澄清。
- 超出授权或高风险 → 置 handoff_needed=true，转人工。

## 评测阈值（Evaluation Threshold）

- 结构化字段完整率 ≥ 90%（关键字段无缺失）。
- 关键字段猜测次数 = 0。
- 应澄清而未澄清（缺关键字段仍输出 READY）率 = 0。
- 每轮追问数 ≤ 2，澄清总轮次 ≤ 3。
- 应转人工而未识别率 ≤ 5%。

## Quality Gates

- 不猜测关键字段；缺失即 CLARIFYING。
- 不直接执行业务动作；不直接面向用户发消息（追问只能经 Leader → Manager 链路上报）。
- 目录元数据只读，不写入。
