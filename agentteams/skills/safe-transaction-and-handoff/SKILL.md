---
name: safe-transaction-and-handoff
description: 在明确用户确认后安全锁定设备并创建待支付订单，或生成完整人工接管包。用于交易写入、补偿处理和高风险问题升级，强制校验授权与幂等。
---

# 安全交易与人工接管

## 交易

1. 校验方案未过期、状态版本一致、确认令牌范围正确。
2. 使用 `tenant_id:conversation_id:action:state_version` 作为幂等键。
3. 调用 `hold_inventory`，成功后调用 `create_order_draft`。
4. 建单失败时调用 `release_hold`；重复请求返回首次结果。

## 接管

出现退款、改价、投诉、政策例外、低置信度、数据冲突、工具连续失败或用户要求人工时，调用 `create_handoff`。接管包必须包含诉求摘要、结构化需求、候选方案、证据、工具结果、风险和建议下一步。

不得支付、退款、改价、发布知识或跳过用户确认。
