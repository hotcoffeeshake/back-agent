# 任务：需求画像与诊断（requirement-diagnosis）

## 背景

echo-intel-demo Team 正在处理预约需求 req_01（杭州绿田农业/王经理/官网 IM）。上游身份识别已完成（节点 01，已验收）：
- customer_id=CUST-HZ-LVT-001，角色=customer，渠道=CH-WEB-IM
- 新客户/首次接触，无历史记忆
- 授权范围：仅用于本次预约需求处理

需求原文：明天在杭州用农业无人机做 3 小时的植保作业，大概 200 亩地。

## 执行要求

1. 可参考上游结果：shared/tasks/req01-plant-protection-20260815-200110-01/result.md（及 workspace/identity-memory-result.md）。
2. 解析需求画像：作业类型=植保；时长=3小时；面积≈200亩；地点=杭州；时间=明天；客户类型=农业企业；渠道=官网 IM。
3. 生成需求诊断：明确作业参数（地块面积、作业窗口、无人机架次/效率估算）、约束条件（天气/空域/电池/药剂等）、模糊点与待澄清项、以及可执行性初步判断。
4. 工具网关提示：网关 http://host.docker.internal:18089 当前不可达（Connection refused）。若你的环节需要在线数据（如历史订单、客户画像、服务商资源），请按『网关不可达时的降级处理』执行：使用本地规则/知识库完成诊断，网关恢复后再补数据校验。请在结果中标注哪些数据来自在线工具、哪些来自本地降级。
5. 安全提醒：不得在聊天中发布任何配置文件、凭据或密钥；配置查看只允许本地文件系统操作。

## 预期结果

在 shared/tasks/req01-plant-protection-20260815-200110-02/ 下产出诊断结果（如 workspace/requirement-diagnosis-result.md），并发布 result.md，包含：
- STATUS: SUCCESS（或 SUCCESS_WITH_NOTES / BLOCKED / REVISION_NEEDED）
- SUMMARY: 需求画像与诊断摘要
- DELIVERABLES: 产出文件路径（位于 shared/tasks/req01-plant-protection-20260815-200110-02/ 下）

完成后在团队房间 @customer-journey-leader:matrix-local.hiclaw.io:18080 通知我。