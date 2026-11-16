import crypto from 'node:crypto';

const MAX_TIMEOUT = 180000;
function bridgeConfig(env = process.env) {
  return {
    baseUrl: String(env.DSH_AURABOT_BASE_URL ?? '').trim().replace(/\/+$/, ''),
    token: String(env.DSH_AURABOT_TOKEN ?? '').trim(),
    timeoutMs: Math.max(5000, Math.min(MAX_TIMEOUT, Number(env.DSH_AURABOT_TIMEOUT_MS) || 60000)),
  };
}

export function aurabotBridgeStatus(env = process.env) {
  const cfg = bridgeConfig(env);
  return {
    configured: Boolean(cfg.baseUrl && cfg.token),
    baseUrl: cfg.baseUrl ? cfg.baseUrl.replace(/(\/ext\/douyin-bridge).*/, '$1') : '',
    tokenConfigured: Boolean(cfg.token),
  };
}

export async function requestAurabot(task, payload, env = process.env) {
  const cfg = bridgeConfig(env);
  if (!cfg.baseUrl || !cfg.token) {
    return { ok: false, error: 'aurabot-not-configured', message: 'Aurabot 桥接未配置。请设置 DSH_AURABOT_BASE_URL 和 DSH_AURABOT_TOKEN。' };
  }
  if (!['message', 'draft', 'proactive', 'health'].includes(task)) {
    return { ok: false, error: 'invalid-task', message: '不支持的 Aurabot 任务。' };
  }
  const eventId = payload?.event_id || crypto.randomUUID();
  try {
    const response = await fetch(cfg.baseUrl + '/' + task, {
      method: 'POST',
      headers: {
        authorization: 'Bearer ' + cfg.token,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ ...payload, event_id: eventId }),
      signal: AbortSignal.timeout(cfg.timeoutMs),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.ok === false) {
      return {
        ok: false,
        error: body.error || 'aurabot-api-error',
        message: body.message || body.error || `Aurabot API 返回 HTTP ${response.status}`,
        status: response.status,
      };
    }
    return { ok: true, ...body };
  } catch (error) {
    return {
      ok: false,
      error: error.name === 'TimeoutError' ? 'aurabot-timeout' : 'aurabot-unreachable',
      message: error.name === 'TimeoutError' ? 'Aurabot 思考超时；未发送私信。' : `无法连接 Aurabot：${error.message}`,
    };
  }
}
