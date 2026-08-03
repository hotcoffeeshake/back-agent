import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { AppError, nowIso, parseJson } from './domain.js';

export class SqliteStore {
  constructor(filename = ':memory:') {
    if (filename !== ':memory:') fs.mkdirSync(path.dirname(filename), { recursive: true });
    this.db = new DatabaseSync(filename);
    this.db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
    this.migrate();
  }

  migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, user_id TEXT NOT NULL, actor_type TEXT NOT NULL,
        state TEXT NOT NULL, state_version INTEGER NOT NULL DEFAULT 1, trace_id TEXT NOT NULL,
        requirement_profile TEXT NOT NULL DEFAULT '{}', risk_flags TEXT NOT NULL DEFAULT '[]',
        tool_failures INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL,
        redacted_content TEXT NOT NULL, metadata TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL,
        FOREIGN KEY(conversation_id) REFERENCES conversations(id)
      );
      CREATE TABLE IF NOT EXISTS merchants (
        id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, name TEXT NOT NULL, rating REAL NOT NULL,
        service_area TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1
      );
      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY, merchant_id TEXT NOT NULL, category TEXT NOT NULL, name TEXT NOT NULL,
        description TEXT NOT NULL, daily_price REAL NOT NULL, stock INTEGER NOT NULL,
        evidence TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1,
        FOREIGN KEY(merchant_id) REFERENCES merchants(id)
      );
      CREATE TABLE IF NOT EXISTS offers (
        id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, product_id TEXT NOT NULL, merchant_id TEXT NOT NULL,
        quantity INTEGER NOT NULL, total_price REAL NOT NULL, currency TEXT NOT NULL, available INTEGER NOT NULL,
        valid_until TEXT NOT NULL, evidence TEXT NOT NULL, reasons TEXT NOT NULL, status TEXT NOT NULL,
        created_at TEXT NOT NULL, FOREIGN KEY(conversation_id) REFERENCES conversations(id)
      );
      CREATE TABLE IF NOT EXISTS holds (
        id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, offer_id TEXT NOT NULL, product_id TEXT NOT NULL,
        quantity INTEGER NOT NULL, status TEXT NOT NULL, expires_at TEXT NOT NULL, idempotency_key TEXT UNIQUE NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, offer_id TEXT NOT NULL, hold_id TEXT NOT NULL,
        status TEXT NOT NULL, payment_url TEXT NOT NULL, total_price REAL NOT NULL, currency TEXT NOT NULL,
        idempotency_key TEXT UNIQUE NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS handoffs (
        id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, status TEXT NOT NULL, reason TEXT NOT NULL,
        packet TEXT NOT NULL, suggestions TEXT NOT NULL DEFAULT '[]', assigned_to TEXT,
        resolution TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS proposals (
        id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, conversation_id TEXT, title TEXT NOT NULL,
        diff TEXT NOT NULL, regression TEXT NOT NULL, status TEXT NOT NULL, decision_by TEXT,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT, trace_id TEXT NOT NULL, actor_type TEXT NOT NULL,
        actor_id TEXT NOT NULL, action TEXT NOT NULL, resource_type TEXT NOT NULL, resource_id TEXT NOT NULL,
        detail TEXT NOT NULL, created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS idempotency (
        key TEXT PRIMARY KEY, response TEXT NOT NULL, created_at TEXT NOT NULL
      );
    `);
  }

  close() { this.db.close(); }

  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  seed() {
    const count = this.db.prepare('SELECT COUNT(*) AS count FROM products').get().count;
    if (count > 0) return;
    const merchant = this.db.prepare('INSERT INTO merchants VALUES (?, ?, ?, ?, ?, ?)');
    merchant.run('m_aurora', 'tenant_demo', '极光会展设备', 4.8, '上海市', 1);
    merchant.run('m_sonic', 'tenant_demo', '声影租赁', 4.6, '上海市,苏州市', 1);
    merchant.run('m_focus', 'tenant_demo', '焦点影像', 4.9, '上海市', 1);
    const product = this.db.prepare('INSERT INTO products VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    product.run('p_projector_pro', 'm_aurora', '投影设备', '极光 8000 流明工程投影套装', '适合 100-300 人会议、路演与展会，含幕布和基础安装。', 1280, 5, JSON.stringify({ doc_id: 'doc_aurora_projector_v3', version: '3.0', title: '极光工程投影套装说明' }), 1);
    product.run('p_projector_std', 'm_sonic', '投影设备', '声影 5000 流明商务投影套装', '适合 30-100 人室内会议，支持 HDMI，无线投屏需另配。', 680, 8, JSON.stringify({ doc_id: 'doc_sonic_projector_v2', version: '2.1', title: '声影商务投影产品页' }), 1);
    product.run('p_audio_event', 'm_sonic', '音响设备', '活动双音箱无线麦套装', '适合 100 人以内活动，包含调音台、双无线麦。', 560, 10, JSON.stringify({ doc_id: 'doc_sonic_audio_v4', version: '4.0', title: '活动音响套装说明' }), 1);
    product.run('p_camera_live', 'm_focus', '摄影设备', '直播双机位摄影套装', '含两台相机、镜头、三脚架与采集卡，不含摄影师。', 1680, 4, JSON.stringify({ doc_id: 'doc_focus_live_v1', version: '1.4', title: '直播摄影套装说明' }), 1);
  }

  createConversation(row) {
    this.db.prepare(`INSERT INTO conversations
      (id, tenant_id, user_id, actor_type, state, state_version, trace_id, requirement_profile, risk_flags, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(row.id, row.tenantId, row.userId, row.actorType, row.state, row.stateVersion, row.traceId, '{}', '[]', row.createdAt, row.createdAt);
    return this.getConversation(row.id);
  }

  getConversation(id) {
    const row = this.db.prepare('SELECT * FROM conversations WHERE id = ?').get(id);
    if (!row) throw new AppError('CONVERSATION_NOT_FOUND', '会话不存在', 404);
    return this.hydrateConversation(row);
  }

  hydrateConversation(row) {
    return { ...row, requirement_profile: parseJson(row.requirement_profile, {}), risk_flags: parseJson(row.risk_flags, []) };
  }

  updateConversation(id, expectedVersion, patch) {
    const current = this.getConversation(id);
    if (current.state_version !== expectedVersion) throw new AppError('STATE_VERSION_CONFLICT', '会话已更新，请刷新后重试', 409);
    const next = {
      state: patch.state ?? current.state,
      profile: patch.requirementProfile ?? current.requirement_profile,
      flags: patch.riskFlags ?? current.risk_flags,
      failures: patch.toolFailures ?? current.tool_failures,
      version: current.state_version + 1,
      updatedAt: nowIso()
    };
    const result = this.db.prepare(`UPDATE conversations SET state=?, state_version=?, requirement_profile=?,
      risk_flags=?, tool_failures=?, updated_at=? WHERE id=? AND state_version=?`)
      .run(next.state, next.version, JSON.stringify(next.profile), JSON.stringify(next.flags), next.failures, next.updatedAt, id, expectedVersion);
    if (result.changes !== 1) throw new AppError('STATE_VERSION_CONFLICT', '会话状态写入冲突', 409);
    return this.getConversation(id);
  }

  addMessage(row) {
    this.db.prepare('INSERT INTO messages VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(row.id, row.conversationId, row.role, row.content, row.redactedContent, JSON.stringify(row.metadata || {}), row.createdAt);
  }

  listMessages(conversationId) {
    return this.db.prepare('SELECT * FROM messages WHERE conversation_id=? ORDER BY created_at, id').all(conversationId)
      .map((row) => ({ ...row, metadata: parseJson(row.metadata, {}) }));
  }

  searchProducts(tenantId, category, location) {
    return this.db.prepare(`SELECT p.*, m.name AS merchant_name, m.rating, m.service_area
      FROM products p JOIN merchants m ON m.id=p.merchant_id
      WHERE m.tenant_id=? AND p.category=? AND p.active=1 AND m.active=1
      AND (m.service_area LIKE ? OR ? LIKE '%' || m.service_area || '%')
      ORDER BY m.rating DESC, p.daily_price ASC LIMIT 3`)
      .all(tenantId, category, `%${location}%`, location)
      .map((row) => ({ ...row, evidence: parseJson(row.evidence, {}) }));
  }

  getProduct(id) {
    const row = this.db.prepare(`SELECT p.*, m.name AS merchant_name, m.rating, m.service_area
      FROM products p JOIN merchants m ON m.id=p.merchant_id WHERE p.id=?`).get(id);
    if (!row) throw new AppError('PRODUCT_NOT_FOUND', '设备不存在', 404);
    return { ...row, evidence: parseJson(row.evidence, {}) };
  }

  activeHeldQuantity(productId, startAt = nowIso()) {
    return this.db.prepare(`SELECT COALESCE(SUM(quantity),0) AS qty FROM holds
      WHERE product_id=? AND status='ACTIVE' AND expires_at>?`).get(productId, startAt).qty;
  }

  insertOffer(offer) {
    this.db.prepare(`INSERT INTO offers VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(offer.id, offer.conversationId, offer.productId, offer.merchantId, offer.quantity,
        offer.totalPrice, offer.currency, offer.available ? 1 : 0, offer.validUntil,
        JSON.stringify(offer.evidence), JSON.stringify(offer.reasons), offer.status, offer.createdAt);
  }

  listOffers(conversationId, validOnly = false) {
    const sql = `SELECT o.*, p.name AS product_name, m.name AS merchant_name
      FROM offers o JOIN products p ON p.id=o.product_id JOIN merchants m ON m.id=o.merchant_id
      WHERE o.conversation_id=? ${validOnly ? "AND o.valid_until>? AND o.status='ACTIVE' AND o.available=1" : ''}
      ORDER BY o.total_price ASC`;
    const rows = validOnly ? this.db.prepare(sql).all(conversationId, nowIso()) : this.db.prepare(sql).all(conversationId);
    return rows.map((row) => ({ ...row, available: Boolean(row.available), evidence: parseJson(row.evidence, []), reasons: parseJson(row.reasons, []) }));
  }

  getOffer(id) {
    const row = this.db.prepare(`SELECT o.*, p.name AS product_name, m.name AS merchant_name
      FROM offers o JOIN products p ON p.id=o.product_id JOIN merchants m ON m.id=o.merchant_id WHERE o.id=?`).get(id);
    if (!row) throw new AppError('OFFER_NOT_FOUND', '方案不存在', 404);
    return { ...row, available: Boolean(row.available), evidence: parseJson(row.evidence, []), reasons: parseJson(row.reasons, []) };
  }

  getIdempotent(key) {
    const row = this.db.prepare('SELECT response FROM idempotency WHERE key=?').get(key);
    return row ? parseJson(row.response) : null;
  }

  putIdempotent(key, response) {
    this.db.prepare('INSERT OR IGNORE INTO idempotency VALUES (?, ?, ?)').run(key, JSON.stringify(response), nowIso());
  }

  insertHold(hold) {
    this.db.prepare('INSERT INTO holds VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(hold.id, hold.conversationId, hold.offerId, hold.productId, hold.quantity, hold.status,
        hold.expiresAt, hold.idempotencyKey, hold.createdAt);
  }

  updateHoldStatus(id, status) { this.db.prepare('UPDATE holds SET status=? WHERE id=?').run(status, id); }

  insertOrder(order) {
    this.db.prepare('INSERT INTO orders VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(order.id, order.conversationId, order.offerId, order.holdId, order.status, order.paymentUrl,
        order.totalPrice, order.currency, order.idempotencyKey, order.createdAt, order.createdAt);
  }

  getOrder(id) {
    const row = this.db.prepare('SELECT * FROM orders WHERE id=?').get(id);
    if (!row) throw new AppError('ORDER_NOT_FOUND', '订单不存在', 404);
    return row;
  }

  updateOrder(id, status) {
    this.db.prepare('UPDATE orders SET status=?, updated_at=? WHERE id=?').run(status, nowIso(), id);
    return this.getOrder(id);
  }

  insertHandoff(handoff) {
    this.db.prepare('INSERT INTO handoffs VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(handoff.id, handoff.conversationId, handoff.status, handoff.reason, JSON.stringify(handoff.packet),
        JSON.stringify(handoff.suggestions || []), null, null, handoff.createdAt, handoff.createdAt);
  }

  getHandoff(id) {
    const row = this.db.prepare('SELECT * FROM handoffs WHERE id=?').get(id);
    if (!row) throw new AppError('HANDOFF_NOT_FOUND', '人工接管任务不存在', 404);
    return { ...row, packet: parseJson(row.packet, {}), suggestions: parseJson(row.suggestions, []) };
  }

  listHandoffs() { return this.db.prepare('SELECT * FROM handoffs ORDER BY created_at DESC').all().map((row) => ({ ...row, packet: parseJson(row.packet, {}), suggestions: parseJson(row.suggestions, []) })); }
  updateHandoffSuggestions(id, suggestions) { this.db.prepare('UPDATE handoffs SET suggestions=?, updated_at=? WHERE id=?').run(JSON.stringify(suggestions), nowIso(), id); return this.getHandoff(id); }
  resolveHandoff(id, actorId, resolution) { this.db.prepare("UPDATE handoffs SET status='RESOLVED', assigned_to=?, resolution=?, updated_at=? WHERE id=?").run(actorId, resolution, nowIso(), id); return this.getHandoff(id); }

  insertProposal(proposal) {
    this.db.prepare('INSERT INTO proposals VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(proposal.id, proposal.tenantId, proposal.conversationId, proposal.title, JSON.stringify(proposal.diff),
        JSON.stringify(proposal.regression), proposal.status, null, proposal.createdAt, proposal.createdAt);
  }
  listProposals() { return this.db.prepare('SELECT * FROM proposals ORDER BY created_at DESC').all().map((r) => ({ ...r, diff: parseJson(r.diff, {}), regression: parseJson(r.regression, {}) })); }
  getProposal(id) { const row=this.db.prepare('SELECT * FROM proposals WHERE id=?').get(id); if(!row) throw new AppError('PROPOSAL_NOT_FOUND','改进提案不存在',404); return {...row,diff:parseJson(row.diff,{}),regression:parseJson(row.regression,{})}; }
  decideProposal(id, status, actorId) { this.db.prepare('UPDATE proposals SET status=?, decision_by=?, updated_at=? WHERE id=?').run(status, actorId, nowIso(), id); return this.getProposal(id); }

  audit(entry) {
    this.db.prepare(`INSERT INTO audit_logs (trace_id,actor_type,actor_id,action,resource_type,resource_id,detail,created_at)
      VALUES (?,?,?,?,?,?,?,?)`).run(entry.traceId, entry.actorType, entry.actorId, entry.action,
      entry.resourceType, entry.resourceId, JSON.stringify(entry.detail || {}), nowIso());
  }
  listAudit(limit = 100) { return this.db.prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT ?').all(limit).map((r) => ({ ...r, detail: parseJson(r.detail, {}) })); }
}
