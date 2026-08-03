import crypto from 'node:crypto';

export const STATES = Object.freeze({
  RECEIVED: 'RECEIVED',
  CLARIFYING: 'CLARIFYING',
  REQUIREMENTS_READY: 'REQUIREMENTS_READY',
  SEARCHING: 'SEARCHING',
  VALIDATING: 'VALIDATING',
  OFFERED: 'OFFERED',
  USER_CONFIRMED: 'USER_CONFIRMED',
  HELD: 'HELD',
  DRAFT_ORDER_CREATED: 'DRAFT_ORDER_CREATED',
  AWAITING_PAYMENT: 'AWAITING_PAYMENT',
  CONFIRMED: 'CONFIRMED',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'CANCELLED',
  HUMAN_HANDOFF: 'HUMAN_HANDOFF',
  FAILED: 'FAILED'
});

export const REQUIRED_REQUIREMENTS = [
  'category', 'purpose', 'quantity', 'location', 'startAt', 'endAt', 'budget'
];

export const TERMINAL_STATES = new Set([
  STATES.CONFIRMED, STATES.EXPIRED, STATES.CANCELLED, STATES.HUMAN_HANDOFF, STATES.FAILED
]);

export class AppError extends Error {
  constructor(code, message, status = 400, details = undefined) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function id(prefix) {
  return `${prefix}_${crypto.randomUUID().replaceAll('-', '')}`;
}

export function nowIso() {
  return new Date().toISOString();
}

export function parseJson(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

export function ensureObject(value, field = 'body') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new AppError('INVALID_ARGUMENT', `${field} 必须是对象`);
  }
  return value;
}

export function requireString(value, field, { max = 2000 } = {}) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new AppError('INVALID_ARGUMENT', `${field} 不能为空`);
  }
  const clean = value.trim();
  if (clean.length > max) throw new AppError('INVALID_ARGUMENT', `${field} 超过 ${max} 字符`);
  return clean;
}

export function redactPii(text = '') {
  return String(text)
    .replace(/1[3-9]\d{9}/g, '[手机号已脱敏]')
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[邮箱已脱敏]')
    .replace(/\b\d{17}[\dXx]\b/g, '[身份证已脱敏]');
}

export function missingRequirements(profile) {
  return REQUIRED_REQUIREMENTS.filter((field) => {
    const value = profile?.[field];
    return value === undefined || value === null || value === '';
  });
}

export function normalizeRequirementPatch(input = {}, source = 'user') {
  const allowed = new Set([
    ...REQUIRED_REQUIREMENTS, 'deliveryRequired', 'installationRequired', 'qualificationRequired'
  ]);
  const patch = {};
  for (const [key, raw] of Object.entries(input || {})) {
    if (!allowed.has(key) || raw === undefined || raw === null || raw === '') continue;
    let value = raw;
    if (key === 'quantity') value = Number.parseInt(raw, 10);
    if (key === 'budget') value = Number(raw);
    if (key === 'quantity' && (!Number.isInteger(value) || value < 1 || value > 1000)) {
      throw new AppError('INVALID_ARGUMENT', 'quantity 必须是 1 到 1000 的整数');
    }
    if (key === 'budget' && (!Number.isFinite(value) || value <= 0 || value > 10_000_000)) {
      throw new AppError('INVALID_ARGUMENT', 'budget 必须是有效的正数');
    }
    if (['startAt', 'endAt'].includes(key)) {
      const date = new Date(raw);
      if (Number.isNaN(date.getTime())) throw new AppError('INVALID_ARGUMENT', `${key} 不是有效时间`);
      value = date.toISOString();
    }
    if (typeof value === 'string') value = value.trim().slice(0, 500);
    patch[key] = { value, source, confidence: source === 'user_form' ? 1 : 0.9 };
  }
  return patch;
}

export function flattenProfile(profile = {}) {
  return Object.fromEntries(Object.entries(profile).map(([key, item]) => [key, item?.value ?? item]));
}

export function validateTimeRange(profile) {
  if (!profile.startAt || !profile.endAt) return;
  const start = new Date(profile.startAt);
  const end = new Date(profile.endAt);
  if (start >= end) throw new AppError('INVALID_TIME_RANGE', '结束时间必须晚于开始时间');
}

export function extractRequirementsFromText(text) {
  const patch = {};
  const categoryMap = [
    ['投影', '投影设备'], ['音响', '音响设备'], ['相机', '摄影设备'], ['摄影', '摄影设备'],
    ['无人机', '无人机'], ['发电机', '发电设备'], ['叉车', '工程设备']
  ];
  for (const [word, category] of categoryMap) {
    if (text.includes(word)) { patch.category = category; break; }
  }
  const quantity = text.match(/(\d+)\s*(台|套|个)/);
  if (quantity) patch.quantity = Number(quantity[1]);
  const budget = text.match(/(?:预算|不超过|控制在)\s*(\d+(?:\.\d+)?)\s*(万|元)?/);
  if (budget) patch.budget = Number(budget[1]) * (budget[2] === '万' ? 10_000 : 1);
  const isoDates = [...text.matchAll(/20\d{2}[-/]\d{1,2}[-/]\d{1,2}(?:[ T]\d{1,2}:\d{2})?/g)]
    .map((match) => match[0].replaceAll('/', '-'));
  if (isoDates[0]) patch.startAt = isoDates[0];
  if (isoDates[1]) patch.endAt = isoDates[1];
  const location = text.match(/(?:在|送到|地点(?:是|：|:)?)[\s]*([\u4e00-\u9fa5A-Za-z0-9·路区市县镇街号]{2,24})/);
  if (location) patch.location = location[1];
  const purposeWords = ['会议', '婚礼', '路演', '展会', '拍摄', '施工', '培训', '直播', '活动'];
  const purpose = purposeWords.find((word) => text.includes(word));
  if (purpose) patch.purpose = purpose;
  return normalizeRequirementPatch(patch, 'user_message');
}

export function detectRisk(text) {
  const lower = String(text).toLowerCase();
  const reasons = [];
  if (/(人工|真人|投诉|退款|退钱|改价|赔偿)/.test(text)) reasons.push('HUMAN_REQUEST_OR_HIGH_RISK');
  if (/(忽略.*指令|system prompt|开发者指令|越权|管理员权限)/i.test(lower)) reasons.push('PROMPT_INJECTION');
  return reasons;
}

export function hmacToken(secret, payload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

export function verifyHmacToken(secret, token) {
  const [encoded, signature] = String(token || '').split('.');
  if (!encoded || !signature) throw new AppError('INVALID_CONFIRMATION_TOKEN', '确认令牌无效', 403);
  const expected = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    throw new AppError('INVALID_CONFIRMATION_TOKEN', '确认令牌签名无效', 403);
  }
  const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  if (Date.now() > payload.exp) throw new AppError('CONFIRMATION_TOKEN_EXPIRED', '确认令牌已过期', 409);
  return payload;
}

export function apiEnvelope({ requestId, traceId, stateVersion = 0, result = null, evidence = [], error = null }) {
  return { request_id: requestId, trace_id: traceId, state_version: stateVersion, result, evidence, error };
}
