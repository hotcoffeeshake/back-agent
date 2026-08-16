---
name: order-lifecycle-service
title: 订单生命周期服务
description: 支付后受控锁档、建单、幂等与失败补偿；查询订单、变更、取消、履约异常与后续动作。
metadata:
  version: "0.2.0"
  maturity: demo
  reuse_tier: 跨交易场景
  applies_to_worker: 方案生成
---

# 订单生命周期服务

## 复用层级（V2.0 原文）

跨交易场景；交易编排/异常补偿。

## Purpose

支付后受控锁档、建单、幂等与失败补偿；查询订单、变更、取消、履约异常与后续动作。

> 本 Demo 为售前方案推荐闭环，**不触发支付/锁档写入**。此 Skill 口径完整保留以对齐 V2.0，但 Demo 阶段仅定义契约，不执行交易副作用。

## Inputs

- 已确认的可执行方案。
- 支付回执与审批令牌。
- 幂等键与状态版本。

### Input Schema（JSON Schema, schema_version: 1.0）

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "schema_version": "1.0",
  "type": "object",
  "properties": {
    "confirmed_offer": {"type": "object", "description": "已确认的可执行方案"},
    "payment_receipt": {"type": "object", "description": "支付回执"},
    "approval_token": {"type": "string", "description": "审批令牌（L2/L3 必需）"},
    "idempotency_key": {"type": "string"},
    "state_version": {"type": "integer"}
  },
  "required": ["confirmed_offer", "idempotency_key", "state_version"]
}
```

## Procedure

1. 核验支付回执、报价与风险，签发一次性令牌。
2. 携带 Idempotency-Key 与 state_version 执行锁档、锁专业人员档期、创建订单草稿。
3. 任一子步骤失败时按 Saga 调用 release_hold 补偿。
4. 补偿失败进入恢复队列，人工日清账。
5. 查询订单、变更、取消与履约异常状态。

## Output Contract

```json
{
  "order_id": "",
  "status": "draft/locked/confirmed",
  "holds": [{"resource_id": "", "state": "held/released"}],
  "compensation": [],
  "idempotency_key": ""
}
```

### Output Schema（JSON Schema, schema_version: 1.0）

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "schema_version": "1.0",
  "type": "object",
  "properties": {
    "order_id": {"type": "string"},
    "status": {"type": "string", "enum": ["draft", "locked", "confirmed"]},
    "holds": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "resource_id": {"type": "string"},
          "state": {"type": "string", "enum": ["held", "released"]}
        },
        "required": ["resource_id", "state"]
      }
    },
    "compensation": {"type": "array", "items": {"type": "object"}},
    "idempotency_key": {"type": "string"}
  },
  "required": ["order_id", "status", "idempotency_key"]
}
```

## 依赖（Dependencies）

- 工具：无（本 Demo 不触发支付/锁档写入，属闭环 2，超出售前范围）
- 数据：审批令牌、幂等键、状态版本、补偿队列

## 失败处理（Failure Handling）

- 无有效审批令牌 → 100% 阻断，不写入。
- 锁档部分成功 → Saga 补偿 release_hold。
- 补偿失败 → 进入恢复队列，SLO 告警，人工日清账。

## 评测阈值（Evaluation Threshold）

- 重复订单 = 0。
- 超卖 = 0。
- 幂等冲突正确返回已知结果率 = 100%。

## Quality Gates

- 无确认/令牌不得写入。
- 写请求必须携带 Idempotency-Key 与 state_version。
- 补偿失败必须进入恢复队列并告警。
