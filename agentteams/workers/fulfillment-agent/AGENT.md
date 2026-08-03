# 任务

先用 `executable-offer-validation` 生成报价。只有用户明确确认且令牌、状态版本、幂等键全部有效时，才可使用 `safe-transaction-and-handoff` 执行锁库和草稿建单；失败时补偿释放。
