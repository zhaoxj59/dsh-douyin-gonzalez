// Local settings server for the friend-selection page.
// Run on Windows:  node settings/settings-server.mjs
// Then open:       http://127.0.0.1:8765/
// It ONLY listens on 127.0.0.1 (localhost, not the LAN / internet).
// Endpoints:
//   GET  /            -> settings.html
//   GET  /api/token   -> 设置服务 token（POST /api/* 要带 X-Douyin-Token
//          请求头；只反射回环源，互联网页面读不到）。
//   GET  /api/chats  -> chats.json (written by dy_list_chats)
//   GET  /api/allowed -> allowed.json (+ file path + updatedAt)
//   POST /api/allowed { allowed: [{id,name,kind,interests}] } -> atomic
//          write + immediate read-back verification (see lib/store.mjs).
//   GET  /api/config  -> config.json (v0.2.0 switches + caps)
//   POST /api/config { config: {...} } -> normalized + atomic write +
//          immediate read-back verification (see lib/config.mjs).
//   GET  /api/status  -> today's counts (reply/like/comment/share/post)
//   POST /api/health  -> run the 13 health checks (lib/health.mjs):
//          returns { ok, passed, failed, unknown, total, summary, checks }
//          Edge 登录那项真的去探一次；探不到报 unknown，不假装通过。
//          playwright 没装时 Edge 那项带中文原因 + 修法。
// No credentials, no Douyin login data, no cookies pass through here.
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dataPaths } from '../lib/paths.mjs';
import { loadAllowed, saveAllowed, readJson, actionCounts, replyCounts, isBlocked } from '../lib/store.mjs';
import { loadConfig, saveConfig } from '../lib/config.mjs';
import { aurabotBridgeStatus } from '../lib/aurabot-bridge.mjs';
import { riskState, clearRisk, cleanupOld, readMemory } from '../lib/safety.mjs';

const PORT = Number(process.env.DSH_DOUYIN_SETTINGS_PORT ?? 8765);
const HOST = '127.0.0.1';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const HTML = fs.readFileSync(path.join(HERE, 'settings.html'), 'utf8');

// v0.4.0: 设置服务 token（H1）。POST /api/* 必须带 X-Douyin-Token
// 请求头，token 存在数据目录 settings-token.txt，设置页同源取
// （GET /api/token）；DSH 面板在回环源上时也能取到，拿不到时
// 面板的写按钮会提示去设置页操作。
let serverDataDir = null;
let loginRefreshPromise = null;
let cachedToken = null;
function settingsToken() {
  if (cachedToken) return cachedToken;
  const { tokenFile } = dataPaths(serverDataDir);
  try {
    const saved = fs.readFileSync(tokenFile, 'utf8').trim();
    if (saved) { cachedToken = saved; return cachedToken; }
  } catch { /* 还没有 token 文件，下面生成一个 */ }
  cachedToken = crypto.randomBytes(24).toString('hex');
  try {
    fs.mkdirSync(path.dirname(tokenFile), { recursive: true });
    fs.writeFileSync(tokenFile, `${cachedToken}\n`, 'utf8');
  } catch { /* token 本轮内存里仍可用 */ }
  return cachedToken;
}
function isLoopbackOrigin(origin) {
  if (!origin) return false;
  try {
    const u = new URL(origin);
    return (u.hostname === '127.0.0.1' || u.hostname === 'localhost' || u.hostname === '[::1]')
      && (u.protocol === 'http:' || u.protocol === 'https:');
  } catch { return false; }
}
function setCors(req, res) {
  // v0.4.0: 不再放行 *。只反射回环源（本机 DSH 前端 / 设置页），
  // 互联网页面拿不到响应，也读不到 /api/token。
  const origin = req?.headers?.origin;
  if (origin && isLoopbackOrigin(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Douyin-Token');
  res.setHeader('Vary', 'Origin');
}
function json(req, res, code, obj) {
  setCors(req, res);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}
function requireToken(req, res) {
  if (req.headers['x-douyin-token'] === settingsToken()) return true;
  json(req, res, 401, { ok: false, error: 'unauthorized', message: '设置服务 token 不对或没带：请从设置页（同源）打开，或重启 DSH 后刷新面板再试。' });
  return false;
}

const server = http.createServer((req, res) => {
  // v0.4.0 (H4): 畸形请求行曾让 new URL() 抛错、打崩整个 DSH 进程
  // （设置服务跑在宿主进程内）。解析失败直接回 400。
  let url;
  try { url = new URL(req.url, `http://${HOST}:${PORT}`); } catch (e) { return json(req, res, 400, { ok: false, error: 'bad-request', message: `请求解析失败：${e.message}` }); }
  if (req.method === 'OPTIONS') { setCors(req, res); res.writeHead(204); res.end(); return; }
  const paths = dataPaths();
  if (req.method === 'GET' && url.pathname === '/') {
    setCors(req, res);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(HTML);
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/token') {
    // 只反射回环源：本机设置页（同源）和本机 DSH 面板能读到 token，
    // 互联网页面发请求也读不到响应。
    setCors(req, res);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ token: settingsToken() }));
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/chats') {
    const raw = readJson(paths.chatsFile, { updatedAt: null, chats: [] });
    json(req, res, 200, { updatedAt: raw.updatedAt ?? null, chats: Array.isArray(raw.chats) ? raw.chats : [], file: paths.chatsFile });
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/allowed') {
    const loaded = loadAllowed();
    json(req, res, 200, { ...loaded, file: paths.allowedFile });
    return;
  }
  if (req.method === 'POST' && url.pathname === '/api/allowed') {
    if (!requireToken(req, res)) return;
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 1_000_000) req.destroy(); });
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body || '{}');
        if (!Array.isArray(parsed.allowed)) return json(req, res, 400, { ok: false, message: 'allowed 必须是个数组' });
        const result = saveAllowed(undefined, parsed.allowed);
        json(req, res, result.ok ? 200 : 500, result);
      } catch (e) {
        json(req, res, 400, { ok: false, message: `保存失败：${e.message}` });
      }
    });
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/config') {
    json(req, res, 200, { ...loadConfig(), file: dataPaths().configFile });
    return;
  }
  if (req.method === 'POST' && url.pathname === '/api/config') {
    if (!requireToken(req, res)) return;
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 1_000_000) req.destroy(); });
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body || '{}');
        if (!parsed.config || typeof parsed.config !== 'object') return json(req, res, 400, { ok: false, message: 'config 必须是个对象' });
        const result = saveConfig(undefined, parsed.config);
        json(req, res, result.ok ? 200 : 500, result);
      } catch (e) {
        json(req, res, 400, { ok: false, message: `保存失败：${e.message}` });
      }
    });
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/status') {
    const a = actionCounts();
    json(req, res, 200, { date: new Date().toISOString().slice(0, 10), actions: a, replies: { total: replyCounts().total }, risk: riskState(), login: loadConfig().login ?? null });
    return;
  }
  if (req.method === 'POST' && url.pathname === '/api/login/open') {
    if (!requireToken(req, res)) return;
    // Browser open needs Playwright + Edge; do it lazily so the settings
    // server still starts on a machine without them.
    // v0.3.2: playwright 没装时返回中文原因 + 修法（error + fix），
    // 不只剩 "Cannot find package 'playwright'" 一句英文。
    import('../lib/browser.mjs').then(async (b) => {
      try { json(req, res, 200, await b.openLogin()); }
      catch (e) { const f = b.toFriendlyBrowserError(e); json(req, res, 500, { ...f, fix: f.fix }); }
    }).catch((e) => json(req, res, 500, { ok: false, error: 'browser-error', message: e.message, fix: '' }));
    return;
  }
  if (req.method === 'POST' && url.pathname === '/api/login/refresh') {
    if (!requireToken(req, res)) return;
    // v0.4.1: 面板 / 设置页的“刷新状态”真去 Edge 里探一次登录并存下来；
    // 以前只读 config.json 里的旧值，登上后永远刷不回已登录。
    // 并发刷新共用同一次探测；探失败不改存量状态。
    if (!loginRefreshPromise) {
      loginRefreshPromise = import('../lib/browser.mjs').then(async (b) => {
        try { return await b.refreshLoginStatus(); }
        catch (e) { const f = b.toFriendlyBrowserError(e); return { ...f }; }
      }).catch((e) => ({ ok: false, error: 'browser-error', message: e.message, fix: '' }));
    }
    const pending = loginRefreshPromise;
    pending.then((result) => {
      if (loginRefreshPromise === pending) loginRefreshPromise = null;
      json(req, res, result.ok ? 200 : 500, result);
    });
    return;
  }
  if (req.method === 'POST' && url.pathname === '/api/risk/clear') {
    if (!requireToken(req, res)) return;
    json(req, res, 200, { ok: true, state: clearRisk() });
    return;
  }
  if (req.method === 'POST' && url.pathname === '/api/cleanup') {
    if (!requireToken(req, res)) return;
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 100000) req.destroy(); });
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body || '{}');
        json(req, res, 200, cleanupOld(undefined, { retentionDays: loadConfig().cleanup.retentionDays ?? 30, dryRun: parsed.dryRun !== false }));
      } catch (e) { json(req, res, 400, { ok: false, message: e.message }); }
    });
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/memory') {
    json(req, res, 200, readMemory());
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/aurabot/contacts') {
    if (!requireToken(req, res)) return;
    const loaded = loadAllowed();
    json(req, res, 200, { ok: true, allowed: (loaded.allowed ?? []).filter((contact) => !isBlocked(undefined, contact.id)) });
    return;
  }
  if (req.method === 'POST' && url.pathname === '/api/aurabot/send') {
    if (!requireToken(req, res)) return;
    let body = '';
    req.on('data', (chunk) => { body += chunk; if (body.length > 20000) req.destroy(); });
    req.on('end', async () => {
      try {
        const parsed = JSON.parse(body || '{}');
        const { sendFromAurabot } = await import('../lib/aurabot-send.mjs');
        const result = await sendFromAurabot(undefined, parsed);
        json(req, res, result.ok ? 200 : result.duplicate ? 409 : 400, result);
      } catch (error) {
        json(req, res, 400, { ok: false, error: 'aurabot-send-failed', message: error.message });
      }
    });
    return;
  }
  if (req.method === 'POST' && url.pathname === '/api/aurabot/test') {
    if (!requireToken(req, res)) return;
    const config = loadConfig();
    aurabotBridgeStatus(config, config.aurabotBridge?.timeoutMs).then((result) => {
      json(req, res, result.ok ? 200 : 502, { ...result, testedAt: new Date().toISOString() });
    }).catch((error) => {
      json(req, res, 502, { ok: false, error: 'aurabot-health-failed', message: error.message, testedAt: new Date().toISOString() });
    });
    return;
  }
  if (req.method === 'POST' && url.pathname === '/api/health') {
    if (!requireToken(req, res)) return;
    import('../lib/health.mjs').then(async (h) => {
      try { json(req, res, 200, await h.runHealthCheck(undefined, loadConfig())); } catch (e) { json(req, res, 500, { ok: false, message: e.message }); }
    }).catch((e) => json(req, res, 500, { ok: false, message: e.message }));
    return;
  }
  json(req, res, 404, { ok: false, message: 'not found' });
});

// v0.3.4：插件加载时自动起设置服务，不用再手动跑 npm run settings。
// 直接跑 node settings/settings-server.mjs 时照旧直接监听；被插件
// import 时只导出 startSettingsServer，由插件在 apply() 里调。
// 端口已被占（服务已在跑）时不报错，返回 null，面板直接用现成的。
// v0.4.0 (M12): 插件传自己的 dataDir 进来（写进环境变量，
// 本进程内所有不带 dataDir 的调用都跟到同一份目录）；不传时
// 仍用环境变量 / 默认目录。
export function startSettingsServer(dataDir, port = PORT) {
  // Backward compat: old callers passed a port number as the first arg
  // (e.g. selfcheck startSettingsServer(18766)); a number means port.
  if (typeof dataDir === 'number') { port = dataDir; dataDir = null; }
  if (dataDir) process.env.DSH_DOUYIN_DATA_DIR = dataDir;
  return new Promise((resolve) => {
    server.once('error', (e) => {
      console.log(`[dsh-douyin-gonzalez] settings server not started (${e.code ?? e.message}) — panel will use the already-running one, or run: npm run settings`);
      resolve(null);
    });
    server.listen(port, HOST, () => {
      console.log(`[dsh-douyin-gonzalez] settings page: http://${HOST}:${port}/`);
      console.log(`[dsh-douyin-gonzalez] data dir: ${dataPaths().dir}`);
      console.log(`[dsh-douyin-gonzalez] settings token file: ${dataPaths().tokenFile} (POST /api/* 需要 X-Douyin-Token 请求头)`);
      console.log('[dsh-douyin-gonzalez] only listening on 127.0.0.1 — open it in a browser on this same computer.');
      resolve(server);
    });
  });
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) startSettingsServer();
