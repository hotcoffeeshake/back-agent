---
name: identity-memory-resolution
title: 身份与记忆解析
description: 识别客户、商户、渠道身份；在授权范围内读取历史会话与客户记忆。
metadata:
  version: "0.2.0"
  maturity: demo
  reuse_tier: 渠道适配层
  applies_to_worker: 身份与记忆
---

# 身份与记忆解析

## 复用层级（V2.0 原文）

渠道适配层；跨渠道身份与人工接管。

## Purpose

识别客户、商户、渠道身份，在授权范围内读取历史会话与客户记忆，并提出记忆更新建议。

## Inputs

- 客户原始需求文本。
- 渠道与商户上下文（channel_id、merchant_id）。
- 客户授权范围（consent_scope）。

### Input Schema（JSON Schema, schema_version: 1.0）

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "schema_version": "1.0",
  "type": "object",
  "properties": {
    "request_text": {"type": "string", "description": "客户原始需求文本"},
    "context": {
      "type": "object",
      "properties": {
        "channel_id": {"type": "string"},
        "merchant_id": {"type": "string"}
      },
      "required": ["channel_id", "merchant_id"]
    },
    "consent_scope": {"type": "string", "description": "客户授权范围"}
  },
  "required": ["request_text", "context"]
}
```

## Procedure

1. 从需求与上下文解析 customer_id、merchant_id、channel_id、role。
2. 校验身份是否在授权范围内，超出范围不得召回历史会话或记忆。
3. 读取授权范围内的历史会话与客户记忆摘要。
4. 生成记忆更新建议（只提案，不落地写入）。
5. 身份无法唯一确认时标记为匿名并建议转人工。

## Output Contract

```json
{
  "actor": {"customer_id": "", "merchant_id": "", "channel_id": "", "role": ""},
  "identity_resolved": true,
  "memory_summary": "",
  "memory_suggestions": [],
  "consent_scope": ""
}
```

### Output Schema（JSON Schema, schema_version: 1.0）

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "schema_version": "1.0",
  "type": "object",
  "properties": {
    "actor": {
      "type": "object",
      "properties": {
        "customer_id": {"type": "string"},
        "merchant_id": {"type": "string"},
        "channel_id": {"type": "string"},
        "role": {"type": "string", "enum": ["customer", "merchant", "agent", "anonymous"]}
      },
      "required": ["customer_id", "merchant_id", "channel_id", "role"]
    },
    "identity_resolved": {"type": "boolean"},
    "memory_summary": {"type": "string"},
    "memory_suggestions": {"type": "array", "items": {"type": "string"}},
    "consent_scope": {"type": "string"}
  },
  "required": ["actor", "identity_resolved", "consent_scope"]
}
```

## 依赖（Dependencies）

- 工具：无（本 Demo 身份从需求消息解析）
- 数据：身份目录、授权范围、历史会话与记忆存储

## 失败处理（Failure Handling）

- 身份无法唯一确认 → 标记匿名，不召回记忆，转人工确认。
- 超出授权范围 → 不召回任何记忆，仅返回授权提示。
- 记忆读取失败 → 返回空记忆并标注 data_gap，不阻塞后续 Worker。

## 评测阈值（Evaluation Threshold）

- 身份识别准确率 ≥ 95%。
- 跨用户记忆召回次数 = 0（安全红线）。
- 未授权敏感信息保存次数 = 0。

## Quality Gates

- 不跨用户召回记忆。
- 不保存未经授权的敏感信息。
- 记忆只提案不落地写入。
