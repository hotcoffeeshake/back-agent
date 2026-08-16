# 任务：身份识别与记忆调取（identity-memory）

## 背景

echo-intel-demo Team 正在处理一条预约需求（scenario_id: req_01）：
- 客户：杭州绿田农业
- 联系人：王经理
- 渠道：官网 IM
- 需求原文：明天在杭州用农业无人机做 3 小时的植保作业，大概 200 亩地。

你是本环节 Worker（identity-memory）。请先读取 shared/tasks/req_01/spec.md（若存在）以及你的 Worker 任务参与技能，按团队标准流程执行身份识别环节。

## 执行要求

1. 通过工具网关调用身份与记忆相关工具获取数据：
   POST http://host.docker.internal:18089/tools/req_01/identity-memory.{function_name}
   Content-Type: application/json
   按你的 Worker 技能中定义的工具函数名调用（识别客户身份、调取历史会话与记忆、确认授权范围）。若网关不可达或返回异常，如实记录在结果中。
2. 识别客户身份（杭州绿田农业 / 王经理），调取历史会话与记忆，确认授权范围。
3. 输出本环节结论：身份识别结果（客户身份、历史记忆摘要、授权范围确认）。

## 预期结果

在 shared/tasks/req01-plant-protection-20260815-200110-01/ 下产出本环节结果文件（如 result_identity.md），并发布 result.md，包含：
- STATUS: SUCCESS（或 SUCCESS_WITH_NOTES / BLOCKED / REVISION_NEEDED）
- SUMMARY: 身份识别结果摘要（客户身份、历史记忆、授权范围）
- DELIVERABLES: 本环节产出文件路径

完成后在团队房间 @customer-journey-leader:matrix-local.hiclaw.io:18080 通知我。