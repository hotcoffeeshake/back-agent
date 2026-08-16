# BUG：Agent 将明文凭据广播进 Matrix 聊天室（凭据泄露）

- **登记时间**：2026-08-16
- **严重度**：High（本地 demo 外泄风险低，但属于必须修的安全缺陷）
- **状态**：Open（待修复）
- **关联 demo**：echo-intel-demo / hiclaw AgentTeams（Manager + Team Leader + Worker）

## 现象
Worker 在排查文件同步（rsync）失败时，执行了 `cat agent.json` 和 `mc config`（MinIO 客户端），
这些命令的**原始输出（含明文密钥）被当作工具结果，经 message 工具广播到了 Team 房间**
`!yzjYJTyDd1v5wqyWc8`。首犯 `requirement-diagnosis`，随后 `customer-journey-leader`、`identity-memory` 跟进。

泄漏字段（已确认 RAW 明文，6 条事件）：
- Matrix agent `access_token`（可冒充该 agent 发言）
- OpenAI / embedding `api_key`
- MinIO `accessKey` + `secretKey`
- 通用 `TOKEN / ACCESS_KEY / SECRET_KEY`

## 复现路径
1. Worker 业务执行中遇到文件同步/路径问题（rsync 报错）
2. 为「诊断」，Worker 调用 `execute_shell_command` 跑 `cat agent.json` / `mc config host list`
3. 工具原始 stdout（含明文密钥）被 message 工具原样发送到 Matrix 房间
4. 明文密钥留在聊天历史

## 根因
**缺少「输出侧凭据脱敏」与「工具侧凭据读取护栏」两层防护：**

1. **输出层不打码**：copaw 框架在**自身 stdout 日志**里会自动把 `api_key` 打码（如 `0ac88***`），
   但经 message 工具发往 Matrix 房间的内容是**未脱敏的原始工具输出**，绕过了日志打码逻辑。
2. **工具层无护栏**：agent 被允许 `cat` 自身 `agent.json`、读取 `.copaw` 配置、`mc config` 列出 MinIO 密钥，
   且 system prompt 未禁止「读取/回显自身凭据文件或环境变量」。
3. **自愈不可靠**：Leader 把「不再输出 access_token/api_key」作为**房间内文字约束**下发，
   属于软约束，未落到工具/输出策略层，下一次诊断动作仍可能触发。

## 修复建议（两层都要做）
- **[P0] 输出侧统一脱敏**：在 message / taskflow send 出口前，对所有外发文本做正则表达式扫描并脱敏
  （匹配 `sk-`、`AKID`、`access_token`、`secretKey`、`api_key`、`Bearer ` 等，替换为 `***`）。
  无论来源是 LLM 生成还是工具原始输出，一律过脱敏层再广播。
- **[P0] 工具侧凭据读取护栏**：在 system prompt / tool policy 显式禁止 agent
  读取或回显自身凭据文件（`agent.json`、`.copaw/*`、`mc config`、env 中的 key/secret/token）。
  诊断文件同步问题时改用「列出目录结构 / 检查文件存在性」而非 `cat` 配置。
- **[P1] 凭据文件权限收敛**：`agent.json` 中明文 `access_token`/`api_key` 改为运行时注入的环境变量或只读 mount，
  agent 进程内可读但 `cat` 文件本身拿不到（或文件 mode 600 且 agent 用户隔离）。
- **[P1] 聊天室侧二次保险**：对 Team 房间开启 moderator 自动 redact 规则（服务端匹配密钥模式即删），
  作为最后兜底。

## 处置记录（已做 / 待做）
- [x] 已识别并定位 6 条 RAW 明文事件（见 memory 2026-08-16）
- [x] Leader 已自检并广播软约束（自愈，但不可靠）
- [ ] **admin 调 Matrix redact 清空这 6 条明文事件** —— 当前 redact 接口返回 404，
      疑似本地 homeserver（非 Synapse，可能为 tuwunel）端点路径/编码不同，需测变体（见下）
- [ ] 真实密钥轮换：OpenAI key 去服务商重置；MinIO 改 accessKey/secret；agent matrix token 靠重启容器重发
- [ ] 落地上述 P0/P1 代码修复

## Redact 待解决（技术债）
- 调用 `POST /_matrix/client/v3/rooms/{room}/redact/{eventId}` 返回 404
- 疑因：本地 homeserver 端点差异。需验证的变体：
  - 去掉 `/_matrix/client/v3` 前缀用 `/_matrix/client/r0/...`
  - event_id 是否需 URL-encode（含 `$`、`:`、`/`）
  - 是否需 `redact` 在 `/_matrix/client/v3/rooms/{roomId}/redact/{eventId}` 之外另带 `txnId`
  - 或改用 Element Web 客户端手动 redact（右键消息 → Remove）
- 涉事 6 条事件 ID：
  - requirement-diagnosis: `$XVSoshKmRr5YXC_SGcpIKOPimMNV8oRaiNwMIMJflVE`、`$ecle9iZnz5vmaQVu7tq0r4re5Sw4iCTR3gJRIGHrKFA`、`$-Zx4PP8_LxbJgCgjzavogWNrjvhnO4C4CNTBPPrv_XY`
  - customer-journey-leader: `$3t9cpPdptZF4WSBVoybxdrUhVMwJfn1n1RtEWWsTswU`、`$rTOI9yCr1Bt3Ciudm10uLSr_G-b9ra9AhqFafUot6zU`
  - identity-memory: `$iwPs21xlvqjWxMSI5rcsxHsp46g5gbFy25flZrqnI1o`

## 进展更新（2026-08-16 优化实施）

### 已落地的 P0 修复（审计/协同分离）
- 5 个 agent 的 copaw `config.json` 已统一置 `show_tool_details:false` + `channels.matrix.filter_tool_messages:true`，
  **工具调用/结果/文件同步输出不再渲染进 Matrix 房间**（仅留本地 `copaw.log`）。这同时根治了「房间被当 stdout」的
  消息膨胀（闭环 1 单场景 804 条）与「cat 密钥进房间」的传输层泄露——即使 agent 读了密钥，输出也不再进房间。
- 各 agent `AGENTS.md` 已追加「消息经济性政策」章节（房间只发协同信号；工具/同步/诊断写本地审计日志；绝不读/发凭据）。
- 启用 `security.file_guard`（sensitive_files 拦截读取凭据文件）。
- 全部 5 容器重启验证：`matrix_relogin` 重连成功、无崩溃；重启自带的 `mc mirror` 文件同步未灌入房间。

> 注：file_guard 仅拦 `read_file` 类工具，**拦不住 shell `cat`**；本修复的传输层根治点是 `show_tool_details:false`（输出不进房间）。

### 新发现：审计层自身密钥卫生缺口（本地日志明文）
- 冒烟测试重启时，copaw 启动日志 `copaw_worker.sync` 会把 `openclaw.json` **原始内容**（含明文 embedding `apiKey`
  `0ac8821bcb6aa639...`，copaw 在 agent.json 等处会自动打码为 `0ac88***`，但 openclaw.json 此处**未打码**）完整打到本地 `copaw.log`。
- 影响：密钥留在**本地审计日志**而非聊天室——不触发房间泄露，但与「审计层自身应脱敏」原则相悖；
  若 `copaw.log` 被纳入 `proof-flow1-loop/` 等证据文件夹，需先脱敏（已对 proof 文件夹做正则脱敏，确认无明文）。
- 建议（P1）：copaw 对 `openclaw.json` / `config.json` 等含密钥文件做日志级打码（与 agent.json 一致）。

### 待办（更新）
- [x] P0 输出侧根治：`show_tool_details:false` + `filter_tool_messages:true` 已落地（替代原「正则脱敏出口」方案，更彻底）
- [x] 工具侧护栏：`file_guard` 启用 + AGENTS.md 消息经济性政策
- [ ] **redact 6 条历史明文事件**：本地 homeserver send/redact 接口仍 404/405（端点差异），待用 Element 手动 Remove 或放弃（密钥已轮换/本地无外网暴露）
- [ ] P1：凭据注入方式收敛（env/只读 mount，替代 agent.json 明文）
- [ ] P1：copaw 对 openclaw.json 日志级打码
