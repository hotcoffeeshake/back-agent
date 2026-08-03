---
name: executable-offer-validation
description: 将设备候选实时校验为带有效期的可执行报价。用于候选产生后核验库存、租期、配送范围、价格和政策；动态事实只能来自 MCP 工具。
---

# 可执行方案校验

1. 对每个候选调用 `check_availability` 和 `calculate_quote`，政策说明调用 `get_policy`。
2. 仅当库存满足、服务范围覆盖、报价不超预算且无政策例外时设置 `executable=true`。
3. 报价写入 `valid_until`，默认有效 60 秒；过期后必须重新校验。
4. 返回不可用的明确原因，不用替代型号或历史数据伪装成实时结果。
5. 只生成 `ExecutableOffer`；不得锁库存或创建订单。

只读工具连续失败两次、数据互相冲突或全部候选不可执行时转人工。
