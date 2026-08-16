---
name: order-lifecycle-service
title: 订单生命周期服务
description: 支付后受控锁档、建单、幂等与失败补偿；查询订单、变更、取消、履约异常与后续动作。
metadata:
  version: "0.3.0"
  maturity: demo
  reuse_tier: 跨交易场景
  applies_to_worker: 方案生成
---

# 订单生命周期服务

## 复用层级（V2.0 原文）

跨交易场景；交易编排/异常补偿。

## Purpose

支付后受控锁档、建单、幂等与失败补偿；查询订单、变更、取消、履约异常与后续动作。

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

1. 读取 `tenant_id / conversation_id / offer_id / state_version / confirmation_token / idempotency_key`。
2. 调 `hold_inventory` 锁定 `device_id` 与 `time_window`，同一资源并发时返回 `oversell_blocked`。
3. 调 `create_order_draft` 创建草稿单（状态 `pending_payment`）。
4. 调 `get_order_status` 校验状态一致性，异常场景触发 `release_hold`。
5. 按闭环 3 流程调用 `create_handoff`，并在后续流程中轮询 `get_order_status`。

## Output Contract

```json
{
  "order_id": "",
  "status": "draft/locked/confirmed/pending_payment",
  "holds": [{"resource_id": "", "state": "held/released/na"}],
  "compensation": [],
  "idempotency_key": "",
  "policy": {}
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
    "status": {"type": "string", "enum": ["draft", "locked", "confirmed", "pending_payment"]},
    "holds": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "resource_id": {"type": "string"},
          "state": {"type": "string", "enum": ["held", "released", "na"]}
        },
        "required": ["resource_id", "state"]
      }
    },
    "compensation": {"type": "array", "items": {"type": "object"}},
    "idempotency_key": {"type": "string"},
    "policy": {"type": "object"}
  },
  "required": ["order_id", "status", "idempotency_key"]
}
```

## 依赖（Dependencies）

- 工具：hold_inventory、release_hold、create_order_draft、get_order_status、get_policy、create_handoff

## 失败处理（Failure Handling）

- 无有效审批令牌 → 100% 阻断，不写入。
- 同资源并发超卖 → 立即返回 `oversell_blocked`。
- 锁档部分成功 → Saga 调用 release_hold。
- 无法补偿成功 → 进入恢复队列并告警。

## 评测阈值（Evaluation Threshold）

- 重复订单 = 0。
- 超卖 = 0。
- 幂等冲突正确返回已知结果率 = 100%。
- `hold_inventory` 与 `create_order_draft` 无令牌率 = 100% 阻断。

## Quality Gates

- 无确认/令牌不得写入。
- 写请求必须携带 Idempotency-Key 与 state_version。
- 补偿失败必须进入恢复队列并告警。
