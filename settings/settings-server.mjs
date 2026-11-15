// Local settings server for the friend-selection page.
// Run on Windows:  node settings/settings-server.mjs
// Then open:       http://127.0.0.1:8765/
// It ONLY listens on 127.0.0.1 (localhost, not the LAN / internet).
// Endpoints:
//   GET  /            -> settings.html
//   GET  /api/chats  -> chats.json (written by dy_list_chats)
//   GET  /api/allowed -> allowed.json (+ file path + updatedAt)
//   POST /api/allowed { allowed: [{id,name,kind,interests}] } -> atomic
//          write + immediate read-back verification (see lib/store.mjs).
//   GET  /api/config  -> config.json (v0.2.0 switches + caps)
//   POST /api/config { config: {...} } -> normalized + atomic write +
//          immediate read-back verification (see lib/config.mjs).
//   GET  /api/status  -> today's counts (reply/like/comment/share/post)
//   POST /api/health  -> run the 12 health checks (lib/health.mjs):
//          returns { ok, passed, failed, unknown, total, summary, checks }
//          Edge 登录那项真的去探一次；探不到报 unknown，不假装通过。
// No credentials, no Douyin login data, no cookies pass through here.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dataPaths } from '../lib/paths.mjs';
import { loadAllowed, saveAllowed, readJson, actionCounts, replyCounts } from '../lib/store.mjs';
import { loadConfig, saveConfig } from '../lib/config.mjs';
import { riskState, clearRisk, cleanupOld, readMemory } from '../lib/safety.mjs';

const PORT = Number(process.env.DSH_DOUYIN_SETTINGS_PORT ?? 8765);
const HOST = '127.0.0.1';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const HTML = fs.readFileSync(path.join(HERE, 'settings.html'), 'utf8');

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);
  const paths = dataPaths();
  if (req.method === 'GET' && url.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(HTML);
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/chats') {
    const raw = readJson(paths.chatsFile, { updatedAt: null, chats: [] });
    json(res, 200, { updatedAt: raw.updatedAt ?? null, chats: Array.isArray(raw.chats) ? raw.chats : [], file: paths.chatsFile });
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/allowed') {
    const loaded = loadAllowed();
    json(res, 200, { ...loaded, file: paths.allowedFile });
    return;
  }
  if (req.method === 'POST' && url.pathname === '/api/allowed') {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 1_000_000) req.destroy(); });
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body || '{}');
        if (!Array.isArray(parsed.allowed)) return json(res, 400, { ok: false, message: 'allowed 必须是个数组' });
        const result = saveAllowed(undefined, parsed.allowed);
        json(res, result.ok ? 200 : 500, result);
      } catch (e) {
        json(res, 400, { ok: false, message: `保存失败：${e.message}` });
      }
    });
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/config') {
    json(res, 200, { ...loadConfig(), file: dataPaths().configFile });
    return;
  }
  if (req.method === 'POST' && url.pathname === '/api/config') {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 1_000_000) req.destroy(); });
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body || '{}');
        if (!parsed.config || typeof parsed.config !== 'object') return json(res, 400, { ok: false, message: 'config 必须是个对象' });
        const result = saveConfig(undefined, parsed.config);
        json(res, result.ok ? 200 : 500, result);
      } catch (e) {
        json(res, 400, { ok: false, message: `保存失败：${e.message}` });
      }
    });
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/status') {
    const a = actionCounts();
    json(res, 200, { date: new Date().toISOString().slice(0, 10), actions: a, replies: { total: replyCounts().total }, risk: riskState(), login: loadConfig().login ?? null });
    return;
  }
  if (req.method === 'POST' && url.pathname === '/api/login/open') {
    // Browser open needs Playwright + Edge; do it lazily so the settings
    // server still starts on a machine without them.
    import('../lib/browser.mjs').then(async (b) => {
      try { json(res, 200, await b.openLogin()); } catch (e) { json(res, 500, { ok: false, message: e.message }); }
    }).catch((e) => json(res, 500, { ok: false, message: e.message }));
    return;
  }
  if (req.method === 'POST' && url.pathname === '/api/risk/clear') {
    json(res, 200, { ok: true, state: clearRisk() });
    return;
  }
  if (req.method === 'POST' && url.pathname === '/api/cleanup') {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 100000) req.destroy(); });
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body || '{}');
        json(res, 200, cleanupOld(undefined, { retentionDays: loadConfig().cleanup.retentionDays ?? 30, dryRun: parsed.dryRun !== false }));
      } catch (e) { json(res, 400, { ok: false, message: e.message }); }
    });
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/memory') {
    json(res, 200, readMemory());
    return;
  }
  if (req.method === 'POST' && url.pathname === '/api/health') {
    import('../lib/health.mjs').then(async (h) => {
      try { json(res, 200, await h.runHealthCheck(undefined, loadConfig())); } catch (e) { json(res, 500, { ok: false, message: e.message }); }
    }).catch((e) => json(res, 500, { ok: false, message: e.message }));
    return;
  }
  json(res, 404, { ok: false, message: 'not found' });
});

server.listen(PORT, HOST, () => {
  console.log(`[dsh-douyin-gonzalez] settings page: http://${HOST}:${PORT}/`);
  console.log(`[dsh-douyin-gonzalez] data dir: ${dataPaths().dir}`);
  console.log('[dsh-douyin-gonzalez] only listening on 127.0.0.1 — open it in a browser on this same computer.');
});
