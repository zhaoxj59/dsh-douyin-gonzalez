// v0.3.0 安全包 (safety): valley windows + patrol timing / risk pause /
// login status / cleanup / douyin-only memory. Pure logic; no browser.
import fs from 'node:fs';
import path from 'node:path';
import { dataPaths } from './paths.mjs';
import { readJson, writeJsonAtomic, readJsonl, appendJsonl } from './store.mjs';

// --- 谷时: noon 12-14, night 00:30-08:30 (configurable on/off) ---
export function inValleyWindow(config, now = new Date()) {
  if (!config?.valley?.enabled) return { ok: false, reason: 'disabled', message: '谷时自动刷未开启。' };
  const mins = now.getHours() * 60 + now.getMinutes();
  const noon = config.valley.noon && mins >= 12 * 60 && mins < 14 * 60;
  const night = config.valley.night && mins >= 30 && mins < 8 * 60 + 30;
  return { ok: noon || night, window: noon ? 'noon' : (night ? 'night' : 'none'), perDay: config.valley.perDay ?? 5, pickPerRound: config.valley.pickPerRound ?? 2 };
}

// --- 定时巡检: interval ± jitter. Returns the next delay in ms.
export function nextPatrolDelayMs(config) {
  const base = (config?.patrol?.intervalMin ?? 30) * 60000;
  const jitter = (config?.patrol?.jitterPct ?? 20) / 100;
  const delta = base * jitter * (Math.random() * 2 - 1);
  return Math.max(60000, Math.round(base + delta));
}
export function patrolState(dataDir) {
  return readJson(dataPaths(dataDir).patrolFile, { lastRunAt: null, runsToday: 0 });
}
export function recordPatrol(dataDir) {
  const s = patrolState(dataDir);
  const today = new Date().toISOString().slice(0, 10);
  const runsToday = String(s.lastRunAt ?? '').startsWith(today) ? (s.runsToday ?? 0) + 1 : 1;
  writeJsonAtomic(dataPaths(dataDir).patrolFile, { lastRunAt: new Date().toISOString(), runsToday });
  return { lastRunAt: new Date().toISOString(), runsToday };
}

// --- 风控: when risk is hit, pause ALL write actions until the user
// clears it. Reads/writes risk-state.json; the gate is checked by
// dsh-plugin.mjs before any write tool runs.
export function riskState(dataDir) {
  return readJson(dataPaths(dataDir).riskStateFile, { paused: false, lastRisk: null, at: null });
}
export function setRisk(dataDir, { reason, detail = '' }) {
  const state = { paused: true, lastRisk: reason, detail: String(detail).slice(0, 500), at: new Date().toISOString() };
  writeJsonAtomic(dataPaths(dataDir).riskStateFile, state);
  appendJsonl(dataPaths(dataDir).riskLogFile, { at: state.at, type: 'risk', reason, detail: state.detail });
  return state;
}
export function clearRisk(dataDir) {
  const state = { paused: false, lastRisk: null, at: new Date().toISOString() };
  writeJsonAtomic(dataPaths(dataDir).riskStateFile, state);
  appendJsonl(dataPaths(dataDir).riskLogFile, { at: state.at, type: 'risk-cleared' });
  return state;
}
export function riskGate(dataDir, config) {
  if (!config?.risk?.enabled) return { ok: true };
  const s = riskState(dataDir);
  if (s.paused) {
    return { ok: false, reason: 'risk-paused', message: `风控暂停中（${s.lastRisk ?? '限流/验证码'}，${s.at ?? ''}）：所有写动作已停手，不自动重发。去 Edge 里人工确认没事后，在设置页 → 安全包 点“解除风控暂停”。` };
  }
  return { ok: true };
}

// --- 登录状态: stored by dy_login_status (browser probe); the
// settings page shows it in red when loggedIn === false.
export function recordLogin(dataDir, loggedIn) {
  return { lastCheckedAt: new Date().toISOString(), loggedIn: Boolean(loggedIn) };
}

// --- 一键清理: delete thumbs / media / old reports older than
// retentionDays. Returns what was removed; never touches config,
// allowed.json, logs for today, or the Edge profile.
export function cleanupOld(dataDir, { retentionDays = 30, dryRun = false } = {}) {
  const { dir, thumbsDir, mediaDir } = dataPaths(dataDir);
  const cutoff = Date.now() - retentionDays * 86400000;
  const removed = [];
  const sweep = (folder, exts) => {
    if (!fs.existsSync(folder)) return;
    for (const name of fs.readdirSync(folder)) {
      const file = path.join(folder, name);
      try {
        const st = fs.statSync(file);
        if (!st.isFile()) continue;
        if (exts && !exts.has(path.extname(name).toLowerCase())) continue;
        if (st.mtimeMs < cutoff) { if (!dryRun) fs.unlinkSync(file); removed.push(file); }
      } catch { /* keep going */ }
    }
  };
  sweep(thumbsDir, null);
  sweep(mediaDir, new Set(['.pcm', '.wav', '.mp3', '.json']));
  // Old daily reports: reportFile is today's; out/ dir if present.
  const outDir = path.join(dir, 'out');
  sweep(outDir, new Set(['.md']));
  return { ok: true, removed: removed.length, files: removed.slice(0, 20), retentionDays, dryRun };
}

// --- 抖音专属记忆: memory/YYYY-MM.md, one line per event.
// Separate from dsh-fish memory on purpose (this is only Douyin).
export function appendMemory(dataDir, line) {
  const { memoryDir } = dataPaths(dataDir);
  const now = new Date();
  const file = path.join(memoryDir, `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}.md`);
  fs.mkdirSync(memoryDir, { recursive: true });
  const text = `- ${now.toISOString().slice(0, 10)} ${String(line).slice(0, 500)}\n`;
  fs.appendFileSync(file, text, 'utf8');
  return { ok: true, file };
}
export function readMemory(dataDir, months = 2) {
  const { memoryDir } = dataPaths(dataDir);
  if (!fs.existsSync(memoryDir)) return { ok: true, entries: [] };
  const files = fs.readdirSync(memoryDir).filter((f) => f.endsWith('.md')).sort().slice(-months);
  const entries = [];
  for (const f of files) {
    for (const line of fs.readFileSync(path.join(memoryDir, f), 'utf8').split('\n').filter(Boolean)) entries.push(line);
  }
  return { ok: true, files, entries: entries.slice(-100) };
}
