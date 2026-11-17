// DSH -> Aurabot API client. No Aurabot runtime is bundled into DSH.
const DEFAULT_TIMEOUT_MS = 120_000;

function endpoint(config, path) {
  const raw = String(config?.aurabotBridge?.baseUrl ?? '').trim();
  const token = String(config?.aurabotBridge?.token ?? '').trim();
  if (!raw || !token) return { ok: false, error: 'aurabot-not-configured', message: '请在 DSH 设置页配置 Aurabot API 地址和桥接密钥。' };
  let url;
  try { url = new URL(raw); } catch { return { ok: false, error: 'aurabot-invalid-url', message: 'Aurabot API 地址不是有效 URL。' }; }
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) {
    return { ok: false, error: 'aurabot-insecure-url', message: '远程 Aurabot API 必须使用 HTTPS；HTTP 仅允许本机回环地址。' };
  }
  url.pathname = `/aurabot/api/ext/douyin-bridge/${path.replace(/^\/+/, '')}`;
  url.search = '';
  url.hash = '';
  return { ok: true, url: url.toString(), token };
}

async function request(config, path, payload, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const target = endpoint(config, path);
  if (!target.ok) return target;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1000, Math.min(180_000, Number(timeoutMs) || DEFAULT_TIMEOUT_MS)));
  try {
    const response = await fetch(target.url, {
      method: payload === undefined ? 'GET' : 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${target.token}`,
        ...(payload === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: payload === undefined ? undefined : JSON.stringify(payload),
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return { ok: false, error: 'aurabot-http-error', status: response.status, message: data.message || `Aurabot 返回 HTTP ${response.status}` };
    return data && typeof data === 'object' ? data : { ok: false, error: 'aurabot-invalid-response', message: 'Aurabot 返回了无效响应。' };
  } catch (error) {
    return { ok: false, error: error.name === 'AbortError' ? 'aurabot-timeout' : 'aurabot-unreachable', message: error.name === 'AbortError' ? '等待 Aurabot 超时。' : `无法连接 Aurabot：${error.message}` };
  } finally {
    clearTimeout(timer);
  }
}

export function aurabotBridgeStatus(config, timeoutMs = config?.aurabotBridge?.timeoutMs ?? DEFAULT_TIMEOUT_MS) {
  return request(config, 'health', undefined, timeoutMs);
}

export function generateAurabotReply(config, message) {
  return request(config, 'message', message);
}

export function generateAurabotProactive(config, task) {
  return request(config, 'proactive', task);
}
