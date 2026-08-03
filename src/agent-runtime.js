import { AppError, id } from './domain.js';

// AgentTeams 的外部接入 API 仍需在目标账号中确认；业务服务只依赖此适配器接口。
export class AgentRuntimeAdapter {
  async dispatch() { throw new AppError('NOT_IMPLEMENTED', 'Agent Runtime 未实现', 501); }
}

export class AgentTeamsRuntimeAdapter extends AgentRuntimeAdapter {
  constructor({ endpoint, token, timeoutMs = 15_000, fetchImpl = fetch }) {
    super(); this.endpoint = endpoint; this.token = token; this.timeoutMs = timeoutMs; this.fetchImpl = fetchImpl;
  }

  async dispatch({ conversationId, traceId, actor, state, context, message }) {
    if (!this.endpoint || !this.token) throw new AppError('AGENTTEAMS_NOT_CONFIGURED', '未配置 AgentTeams 接入端点或令牌', 503);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(this.endpoint, {
        method: 'POST', signal: controller.signal,
        headers: { authorization: `Bearer ${this.token}`, 'content-type': 'application/json', 'x-trace-id': traceId },
        body: JSON.stringify({ request_id: id('agentreq'), conversation_id: conversationId, actor, state, context, message })
      });
      if (!response.ok) throw new AppError('AGENTTEAMS_CALL_FAILED', `AgentTeams 返回 ${response.status}`, 502);
      const result = await response.json();
      if (!result || typeof result !== 'object') throw new AppError('AGENTTEAMS_INVALID_RESPONSE', 'AgentTeams 返回结构无效', 502);
      return result;
    } catch (error) {
      if (error.name === 'AbortError') throw new AppError('AGENTTEAMS_TIMEOUT', 'AgentTeams 调用超时', 504);
      throw error;
    } finally { clearTimeout(timeout); }
  }
}
