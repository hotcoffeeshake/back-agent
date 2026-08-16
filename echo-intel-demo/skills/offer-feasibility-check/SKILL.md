---
name: offer-feasibility-check
title: 可执行方案校验
description: 实时核验设备、专业人员、资质、价格和档期，确认方案是否可执行。
metadata:
  version: "0.2.0"
  maturity: demo
  reuse_tier: 行业适配层
  applies_to_worker: 方案生成
---

# 可执行方案校验

## 复用层级（V2.0 原文）

行业适配层；租赁履约/实时供给。

## Purpose

实时核验设备、专业人员、资质、价格和档期，确认候选方案是否可执行，并输出可执行方案率。这是「可执行方案率 ≥80%」这一成功标准的直接判定 Skill。

## Inputs

- 候选设备、专业人员、时间窗。
- 实时库存、档期、资质、报价数据。

### Input Schema（JSON Schema, schema_version: 1.0）

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "schema_version": "1.0",
  "type": "object",
  "properties": {
    "candidates": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "device_id": {"type": "string"},
          "professional_id": {"type": "string"},
          "time_window": {"type": "object"}
        },
        "required": ["device_id", "professional_id"]
      }
    },
    "real_time_data": {
      "type": "object",
      "properties": {
        "stock": {"type": "object"},
        "availability": {"type": "object"},
        "credentials": {"type": "object"},
        "price": {"type": "object"}
      }
    }
  },
  "required": ["candidates"]
}
```

## Procedure

1. 核验设备库存（设备是否在库/可用）。
2. 核验专业人员档期（时间窗内是否可约）。
3. 核验资质（证照是否齐全/有效）。
4. 核验价格（报价是否有效、是否在预算内）。
5. 四条件同时成立才判定 feasible=true，否则列出不成立原因。
6. 汇总 feasible_count 与 total_count，计算 feasible_rate。

## Output Contract

```json
{
  "results": [
    {
      "offer_id": "",
      "device_id": "",
      "professional_id": "",
      "feasible": true,
      "reason": "",
      "evidence": []
    }
  ],
  "feasible_count": 0,
  "total_count": 0,
  "feasible_rate": 0.0
}
```

### Output Schema（JSON Schema, schema_version: 1.0）

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "schema_version": "1.0",
  "type": "object",
  "properties": {
    "results": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "offer_id": {"type": "string"},
          "device_id": {"type": "string"},
          "professional_id": {"type": "string"},
          "feasible": {"type": "boolean"},
          "reason": {"type": "string"},
          "evidence": {"type": "array", "items": {"type": "string"}}
        },
        "required": ["offer_id", "feasible"]
      }
    },
    "feasible_count": {"type": "integer", "minimum": 0},
    "total_count": {"type": "integer", "minimum": 0},
    "feasible_rate": {"type": "number", "minimum": 0, "maximum": 1}
  },
  "required": ["results", "feasible_count", "total_count", "feasible_rate"]
}
```

## 依赖（Dependencies）

- 工具：search_catalog.check_credentials、check_availability.check_stock、check_availability.check_availability、calculate_quote.get_price

## 失败处理（Failure Handling）

- 库存/档期/资质/价格任一数据过期 → 不声称可执行，标注 data_gap。
- 数据缺失 → 降置信度并建议补采，不硬猜。
- 校验服务不可用 → 置 feasible=false 并转人工，不用缓存伪造结果。

## 评测阈值（Evaluation Threshold）

- 可执行方案率 ≥ 80%。
- 过期动态事实被声称可执行的次数 = 0。
- 无证据判定次数 = 0。

## Quality Gates

- 不声称过期动态事实。
- 无确认/令牌不得写入。
- 每一判定绑定证据引用。
