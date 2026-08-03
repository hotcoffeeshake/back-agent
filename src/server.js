import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AppError, apiEnvelope, id } from './domain.js';
import { MockBusinessMcpGateway } from './mock-mcp.js';
import { EchoService } from './orchestrator.js';
import { SqliteStore } from './store.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function json(res, status, value, headers = {}) {
  const body = JSON.stringify(value);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body), ...headers });
  res.end(body);
}

async function readBody(req) {
  const chunks = [];
  let length = 0;
  for await (const chunk of req) {
    length += chunk.length;
    if (length > 1_000_000) throw new AppError('PAYLOAD_TOO_LARGE', '请求体超过 1MB', 413);
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new AppError('INVALID_JSON', '请求体不是有效 JSON'); }
}

function bearer(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : '';
}

function securityHeaders() {
  return {
    'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY',
    'referrer-policy': 'no-referrer',
    'content-security-policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; img-src 'self' data:; connect-src 'self'"
  };
}

function actorFor(req, config, requiredRole = null) {
  const token = bearer(req);
  let actor;
  if (token === config.customerToken) actor = { actorId: 'customer_demo', actorType: 'customer', tenantId: 'tenant_demo', scopes: ['conversation:write', 'offer:confirm'] };
  else if (token === config.operatorToken) actor = { actorId: 'operator_demo', actorType: 'operator', tenantId: 'tenant_demo', scopes: ['handoff:manage', 'proposal:approve', 'audit:read'] };
  else if (token === config.webhookSecret) actor = { actorId: 'mock_cashier', actorType: 'system', tenantId: 'tenant_demo', scopes: ['payment:confirm'] };
  else throw new AppError('UNAUTHORIZED', '缺少或使用了无效访问令牌', 401);
  if (requiredRole && actor.actorType !== requiredRole) throw new AppError('FORBIDDEN', `该操作需要 ${requiredRole} 权限`, 403);
  return actor;
}

function serveStatic(res, pathname) {
  const routes = {
    '/': 'index.html', '/index.html': 'index.html', '/ops': 'ops.html', '/ops.html': 'ops.html',
    '/pay.html': 'pay.html', '/app.css': 'app.css', '/customer.js': 'customer.js', '/ops.js': 'ops.js', '/pay.js': 'pay.js'
  };
  const file = routes[pathname];
  if (!file) return false;
  const filename = path.join(rootDir, 'public', file);
  if (!fs.existsSync(filename)) return false;
  const ext = path.extname(file);
  const type = ext === '.html' ? 'text/html; charset=utf-8' : ext === '.css' ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8';
  const body = fs.readFileSync(filename);
  res.writeHead(200, { 'content-type': type, 'content-length': body.length, ...securityHeaders() });
  res.end(body);
  return true;
}

function sendSse(res, requestId, result) {
  res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache', connection: 'keep-alive', ...securityHeaders() });
  res.write(`event: accepted\ndata: ${JSON.stringify({ request_id: requestId })}\n\n`);
  res.write(`event: final\ndata: ${JSON.stringify(result)}\n\n`);
  res.end();
}

export function createApplication(options = {}) {
  const config = {
    port: Number(options.port ?? process.env.PORT ?? 3000),
    dbFile: options.dbFile ?? process.env.DB_FILE ?? path.join(rootDir, 'data', 'echo.db'),
    customerToken: options.customerToken ?? process.env.CUSTOMER_TOKEN ?? 'demo-customer-token',
    operatorToken: options.operatorToken ?? process.env.OPERATOR_TOKEN ?? 'demo-operator-token',
    webhookSecret: options.webhookSecret ?? process.env.WEBHOOK_SECRET ?? 'demo-webhook-secret',
    confirmationSecret: options.confirmationSecret ?? process.env.CONFIRMATION_SECRET ?? 'local-confirmation-secret-change-me',
    offerTtlMs: Number(options.offerTtlMs ?? process.env.OFFER_TTL_MS ?? 60_000),
    holdTtlMs: Number(options.holdTtlMs ?? process.env.HOLD_TTL_MS ?? 900_000)
  };
  const store = new SqliteStore(config.dbFile);
  store.seed();
  const mcp = new MockBusinessMcpGateway(store, config);
  const service = new EchoService(store, mcp, config);

  const server = http.createServer(async (req, res) => {
    const requestId = id('req');
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    try {
      if (req.method === 'GET' && serveStatic(res, url.pathname)) return;
      if (req.method === 'GET' && url.pathname === '/health') return json(res, 200, { status: 'ok', service: 'echo-intelligence', runtime: 'mock' }, securityHeaders());
      if (req.method === 'GET' && url.pathname === '/v1/mcp/tools') {
        actorFor(req, config, 'operator');
        return json(res, 200, apiEnvelope({ requestId, traceId: id('trace'), result: mcp.toolManifest() }), securityHeaders());
      }

      let match;
      if (req.method === 'POST' && url.pathname === '/v1/conversations') {
        const actor = actorFor(req, config, 'customer');
        const body = await readBody(req);
        const conversation = service.createConversation({ tenantId: actor.tenantId, userId: body.user_id || actor.actorId, actorType: actor.actorType });
        return json(res, 201, apiEnvelope({ requestId, traceId: conversation.trace_id, stateVersion: conversation.state_version, result: service.publicConversation(conversation) }), securityHeaders());
      }
      if (req.method === 'POST' && (match = url.pathname.match(/^\/v1\/conversations\/([^/]+)\/messages$/))) {
        const actor = actorFor(req, config, 'customer');
        const body = await readBody(req);
        if (typeof body.text !== 'string' || !body.text.trim()) throw new AppError('INVALID_ARGUMENT', 'text 不能为空');
        const result = service.sendMessage(match[1], { text: body.text.trim(), structured: body.structured || {} }, actor);
        const envelope = apiEnvelope({ requestId, traceId: result.conversation.trace_id, stateVersion: result.conversation.state_version, result, evidence: result.evidence || [] });
        if ((req.headers.accept || '').includes('text/event-stream')) return sendSse(res, requestId, envelope);
        return json(res, 200, envelope, securityHeaders());
      }
      if (req.method === 'GET' && (match = url.pathname.match(/^\/v1\/conversations\/([^/]+)\/offers$/))) {
        const actor = actorFor(req, config, 'customer');
        const result = service.listOffers(match[1], actor);
        return json(res, 200, apiEnvelope({ requestId, traceId: result.conversation.trace_id, stateVersion: result.conversation.state_version,
          result: { offers: result.offers }, evidence: result.offers.flatMap((offer) => offer.evidence) }), securityHeaders());
      }
      if (req.method === 'POST' && (match = url.pathname.match(/^\/v1\/offers\/([^/]+)\/confirm$/))) {
        const actor = actorFor(req, config, 'customer');
        const body = await readBody(req);
        const result = service.confirmOffer(match[1], { stateVersion: body.state_version }, actor);
        return json(res, 200, apiEnvelope({ requestId, traceId: result.conversation.trace_id, stateVersion: result.conversation.state_version, result }), securityHeaders());
      }
      if (req.method === 'GET' && (match = url.pathname.match(/^\/v1\/orders\/([^/]+)$/))) {
        const actor = actorFor(req, config);
        const order = mcp.get_order_status({ order_id: match[1] });
        const conversation = store.getConversation(order.conversation_id);
        if (conversation.tenant_id !== actor.tenantId) throw new AppError('FORBIDDEN', '无权访问该订单', 403);
        return json(res, 200, apiEnvelope({ requestId, traceId: conversation.trace_id, stateVersion: conversation.state_version, result: order }), securityHeaders());
      }
      if (req.method === 'POST' && (match = url.pathname.match(/^\/v1\/orders\/([^/]+)\/payment-confirmation$/))) {
        const actor = actorFor(req, config);
        if (!['system', 'customer'].includes(actor.actorType)) throw new AppError('FORBIDDEN', '仅收银台回调可确认支付', 403);
        const result = service.confirmPayment(match[1], actor);
        return json(res, 200, apiEnvelope({ requestId, traceId: result.conversation.trace_id, stateVersion: result.conversation.state_version, result }), securityHeaders());
      }
      if (req.method === 'POST' && url.pathname === '/v1/handoffs') {
        const actor = actorFor(req, config, 'customer');
        const body = await readBody(req);
        const result = service.createHandoff({ conversationId: body.conversation_id, reason: body.reason || '用户请求人工接管' }, actor);
        return json(res, 201, apiEnvelope({ requestId, traceId: result.conversation.trace_id, stateVersion: result.conversation.state_version, result }), securityHeaders());
      }
      if (req.method === 'GET' && url.pathname === '/v1/ops/handoffs') {
        actorFor(req, config, 'operator');
        return json(res, 200, apiEnvelope({ requestId, traceId: id('trace'), result: store.listHandoffs() }), securityHeaders());
      }
      if (req.method === 'POST' && (match = url.pathname.match(/^\/v1\/handoffs\/([^/]+)\/copilot-suggestions$/))) {
        const actor = actorFor(req, config, 'operator');
        const result = service.regenerateCopilot(match[1], actor);
        const conversation = store.getConversation(result.conversation_id);
        return json(res, 200, apiEnvelope({ requestId, traceId: conversation.trace_id, stateVersion: conversation.state_version, result }), securityHeaders());
      }
      if (req.method === 'POST' && (match = url.pathname.match(/^\/v1\/handoffs\/([^/]+)\/reply$/))) {
        const actor = actorFor(req, config, 'operator');
        const body = await readBody(req);
        const result = service.sendOperatorReply(match[1], { text: body.text, suggestionId: body.suggestion_id }, actor);
        const conversation = store.getConversation(result.handoff.conversation_id);
        return json(res, 200, apiEnvelope({ requestId, traceId: conversation.trace_id, stateVersion: conversation.state_version, result }), securityHeaders());
      }
      if (req.method === 'GET' && url.pathname === '/v1/ops/proposals') {
        actorFor(req, config, 'operator');
        return json(res, 200, apiEnvelope({ requestId, traceId: id('trace'), result: store.listProposals() }), securityHeaders());
      }
      if (req.method === 'POST' && (match = url.pathname.match(/^\/v1\/improvement-proposals\/([^/]+)\/decision$/))) {
        const actor = actorFor(req, config, 'operator');
        const body = await readBody(req);
        const result = service.decideProposal(match[1], body.decision, actor);
        return json(res, 200, apiEnvelope({ requestId, traceId: id('trace'), result }), securityHeaders());
      }
      if (req.method === 'GET' && url.pathname === '/v1/ops/audit') {
        actorFor(req, config, 'operator');
        return json(res, 200, apiEnvelope({ requestId, traceId: id('trace'), result: store.listAudit(Math.min(500, Number(url.searchParams.get('limit') || 100))) }), securityHeaders());
      }
      throw new AppError('NOT_FOUND', '接口不存在', 404);
    } catch (error) {
      const appError = error instanceof AppError ? error : new AppError('INTERNAL_ERROR', '服务内部错误', 500);
      if (!(error instanceof AppError)) console.error(error);
      return json(res, appError.status, apiEnvelope({ requestId, traceId: id('trace'), error: { code: appError.code, message: appError.message, details: appError.details } }), securityHeaders());
    }
  });

  return {
    server, store, service, mcp, config,
    listen(port = config.port) { return new Promise((resolve) => server.listen(port, () => resolve(server.address()))); },
    close() { return new Promise((resolve, reject) => server.close((error) => { store.close(); error ? reject(error) : resolve(); })); }
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const app = createApplication();
  app.listen().then((address) => {
    console.log(`回声智能已启动：http://localhost:${address.port}`);
    console.log(`客户 H5：http://localhost:${address.port}/`);
    console.log(`运营台：http://localhost:${address.port}/ops`);
  });
}
