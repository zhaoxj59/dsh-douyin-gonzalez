// v0.2.0 feature 7: AstrBot interoperability (opt-in, off by default).
// Two directions, both local-only unless the user configures a webhook:
//
//  A) AstrBot -> this plugin (inbound, local HTTP):
//     The bridge listens ONLY on 127.0.0.1, on config.astrbot.port
//     (default 8766), and requires the local token in the
//     `X-Douyin-Token` header (or ?token=). No token configured =
//     bridge refuses to start (a bridge with no auth is worse than
//     no bridge).
//       GET  /astrbot/status              -> { ok, enabled, counts }
//       POST /astrbot/watch   { minutes }  -> triggers dy_watch
//       POST /astrbot/dm-reply { conversationId, text } -> dy_dm_reply
//       POST /astrbot/report  { date }     -> dy_daily_report
//     The handlers are injected by dsh-plugin.mjs (runTool), so this
//     module never imports the browser itself and never bypasses the
//     allowlist / caps — AstrBot calls go through the exact same
//     gates as the fish's own tool calls.
//
//  B) This plugin -> AstrBot (outbound events, optional):
//     If config.astrbot.webhookUrl is set, sendEvent() POSTs a JSON
//     event to it (watched / dm_replied / shared / posted). Failures
//     are logged and swallowed — a dead webhook must never break
//     watching or replying.
//
// AstrBot itself is NOT assumed to be installed. Everything here is
// off unless the user turns it on in settings and sets a token.
import http from 'node:http';

export function astrbotEnabled(config) {
  return Boolean(config?.astrbot?.enabled) && Boolean(config?.astrbot?.token);
}

export function startAstrbotBridge(dataDir, config, handlers) {
  if (!config?.astrbot?.enabled) return { ok: false, reason: 'disabled', message: 'AstrBot 桥未开启。' };
  if (!config.astrbot.token) return { ok: false, reason: 'no-token', message: 'AstrBot 桥开了但没设 token，拒绝启动（无认证的本地接口比没有更危险）。请在设置页填一个 token 再启动。' };
  const port = config.astrbot.port ?? 8766;
  const token = config.astrbot.token;
  const server = http.createServer(async (req, res) => {
    const send = (code, obj) => {
      res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(obj));
    };
    // v0.4.0 (H4): 畸形请求行曾让 new URL() 抛错（async 回调里是
    // 未捕获拒绝，默认也会打崩进程）。解析失败直接回 400。
    let url;
    try { url = new URL(req.url, 'http://127.0.0.1'); } catch (e) { return send(400, { ok: false, error: 'bad-request', message: e.message }); }
    const given = req.headers['x-douyin-token'] ?? url.searchParams.get('token');
    if (given !== token) return send(401, { ok: false, error: 'unauthorized', message: 'token 不对。' });
    let body = {};
    try {
      const text = await new Promise((resolve) => {
        let b = '';
        req.on('data', (c) => { b += c; if (b.length > 1_000_000) req.destroy(); });
        req.on('end', () => resolve(b));
      });
      body = text ? JSON.parse(text) : {};
    } catch { return send(400, { ok: false, error: 'bad-json' }); }
    try {
      if (req.method === 'GET' && url.pathname === '/astrbot/status') {
        return send(200, { ok: true, ...(await handlers.status()) });
      }
      if (req.method === 'POST' && url.pathname === '/astrbot/watch') {
        return send(200, await handlers.watch(body.minutes ?? 10));
      }
      if (req.method === 'POST' && url.pathname === '/astrbot/dm-reply') {
        if (!body.conversationId || !body.text) return send(400, { ok: false, error: 'missing-args' });
        return send(200, await handlers.dmReply(body.conversationId, body.text));
      }
      if (req.method === 'POST' && url.pathname === '/astrbot/report') {
        return send(200, await handlers.report(body.date));
      }
      return send(404, { ok: false, error: 'not-found' });
    } catch (e) {
      return send(500, { ok: false, error: 'handler-error', message: e.message });
    }
  });
  server.listen(port, '127.0.0.1');
  return { ok: true, port, message: `AstrBot 桥已启动：http://127.0.0.1:${port}/astrbot/status（仅本机 + token）。` };
}

export async function sendEvent(config, event) {
  const url = config?.astrbot?.webhookUrl;
  if (!config?.astrbot?.enabled || !url) return { ok: false, reason: 'no-webhook' };
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'dsh-douyin-gonzalez', at: new Date().toISOString(), ...event }),
      signal: AbortSignal.timeout(5000),
    });
    return { ok: res.ok, status: res.status };
  } catch (e) {
    return { ok: false, reason: 'webhook-failed', message: e.message };
  }
}
