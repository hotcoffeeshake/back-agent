# 回声智能 MVP

面向多商户设备租赁平台的成交与履约客服。仓库包含可运行的客户 H5、运营台、状态机、Mock MCP、Agent/Skill 配置、人工客服 Copilot、知识审批闭环和自动化测试。

## 本地运行

要求 Node.js 22.5+，无需安装第三方依赖。

```bash
npm start
```

- 客户 H5：`http://localhost:3000/`
- 运营台：`http://localhost:3000/ops`
- 健康检查：`http://localhost:3000/health`

演示访问令牌已写入本地前端。部署前必须从环境变量设置随机的 `CUSTOMER_TOKEN`、`OPERATOR_TOKEN`、`WEBHOOK_SECRET` 和 `CONFIRMATION_SECRET`，并由网关或登录系统注入，不能继续将令牌放在浏览器代码中。

## 演示路径

1. 在客户 H5 保留默认 Smart Filters，发送“我要为会议租一套投影设备”。
2. 选择实时校验后的方案，确认锁定并创建待支付订单。
3. 进入模拟收银台确认支付，验证 `CONFIRMED` 终态。
4. 新开页面点击“转人工”，再打开运营台。
5. 运营台展示完整接管包和三条 Copilot 话术；选择或编辑后由人工确认发送。
6. 人工解决后自动形成知识提案，查看 Diff 与回测并审批。

## 验证

```bash
npm test
npm run check
```

## 目录

- `src/`：状态机、SQLite Repository、Agent 编排、Mock MCP 和 HTTP/SSE API。
- `public/`：客户 H5、运营台和模拟收银台。
- `agentteams/`：Team Leader、五个 Worker 和七个可导入 Skill。
- `contracts/`：业务 OpenAPI、MCP OpenAPI 和共享上下文 JSON Schema。
- `docs/IMPLEMENTATION.md`：架构、安全边界、阿里云部署映射与验收说明。
- `test/`：关键业务和安全测试。

本地 SQLite 与 Mock MCP 只用于演示。生产环境保持接口不变，将 Repository 替换为 RDS/Tair，将 Mock MCP 替换为 SAE 内的业务 MCP Gateway，并按 `agentteams/manifest.yaml` 配置 AgentTeams。
