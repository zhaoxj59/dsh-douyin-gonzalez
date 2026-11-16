// Local state: allowed.json (the friend-selection list), chats.json,
// watch-log.jsonl and reply-log.jsonl. All writes are atomic
// (temp file + rename) so a crash / restart can never leave a half
// written allowed.json — that is the exact failure mode the user hit
// in LockyBee 1.4.7 (list reads, selection does not stick).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { dataPaths } from './paths.mjs';

function ensureDir(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
}

export function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

// Atomic write: write temp in the same dir, fsync, rename over target.
export function writeJsonAtomic(file, value) {
  ensureDir(file);
  // v0.4.0 (M11): 临时名加随机后缀，同一毫秒内两次并发写不再撞同名丢更新。
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8');
  const fd = fs.openSync(tmp, 'r+');
  try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(tmp, file);
  return file;
}

export function appendJsonl(file, obj) {
  ensureDir(file);
  fs.appendFileSync(file, `${JSON.stringify(obj)}\n`, 'utf8');
}

export function readJsonl(file) {
  try {
    return fs.readFileSync(file, 'utf8')
      .split('\n').filter(Boolean)
      .map((line) => { try { return JSON.parse(line); } catch { return null; } })
      .filter(Boolean);
  } catch {
    return [];
  }
}

// --- allowed.json -------------------------------------------------------
// Shape v2: { version: 2, updatedAt: ISO, allowed: [ {id, name, kind, interests: []} ] }
// `id` is the stable Douyin friend id (not the display name). Names are
// stored only as a human label; matching is always by id.
// `interests` is per-person, user-entered on the settings page
// (comma-separated, e.g. "美食, 宠物, 游戏") and drives share picking
// in lib/share.mjs — sharing never uses a nickname to guess a person.
function cleanInterests(v) {
  if (Array.isArray(v)) return [...new Set(v.map((s) => String(s).trim()).filter(Boolean))].slice(0, 20);
  if (typeof v === 'string') return [...new Set(v.split(/[,，、\s]+/).map((s) => s.trim()).filter(Boolean))].slice(0, 20);
  return [];
}

export function loadAllowed(dataDir) {
  const { allowedFile } = dataPaths(dataDir);
  const raw = readJson(allowedFile, null);
  if (!raw || !Array.isArray(raw.allowed)) return { version: 2, updatedAt: null, allowed: [] };
  const seen = new Set();
  const allowed = [];
  for (const item of raw.allowed) {
    const id = String(item?.id ?? '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    allowed.push({
      id,
      name: String(item?.name ?? id),
      kind: item?.kind === 'group' ? 'group' : 'dm',
      interests: cleanInterests(item?.interests),
    });
  }
  return { version: 2, updatedAt: raw.updatedAt ?? null, allowed };
}

export function saveAllowed(dataDir, allowed) {
  const { allowedFile } = dataPaths(dataDir);
  const value = {
    version: 2,
    updatedAt: new Date().toISOString(),
    allowed: (allowed ?? []).map((item) => ({
      id: String(item.id).trim(),
      name: String(item.name ?? item.id),
      kind: item.kind === 'group' ? 'group' : 'dm',
      interests: cleanInterests(item?.interests),
    })).filter((item) => item.id),
  };
  writeJsonAtomic(allowedFile, value);
  // Read back immediately and verify — the settings page reports this
  // verification result, so a silent failed save is impossible.
  const back = loadAllowed(dataDir);
  const ok = back.allowed.length === value.allowed.length
    && value.allowed.every((a) => back.allowed.some((b) => b.id === a.id
      && JSON.stringify(b.interests) === JSON.stringify(a.interests)));
  return { ok, file: allowedFile, saved: value, readBack: back };
}

export function isAllowed(dataDir, conversationId) {
  const id = String(conversationId ?? '').trim();
  if (!id) return false;
  return loadAllowed(dataDir).allowed.some((a) => a.id === id);
}

// --- reply caps (v0.2.0: driven by config.json, defaults 1 / 5) --------
// Per-contact: 1 reply / day. Total: 5 replies / day. Counts come from
// reply-log.jsonl (only entries with status === 'sent' count).
// Kept as a named export for backward compatibility; canReply() now
// reads the live caps from config.json.
export const REPLY_CAPS = { perContactPerDay: 1, totalPerDay: 5 };

export function replyCounts(dataDir, today = new Date().toISOString().slice(0, 10)) {
  const { replyLogFile } = dataPaths(dataDir);
  const sent = readJsonl(replyLogFile).filter((e) => e?.status === 'sent' && String(e.at ?? '').startsWith(today));
  const perContact = new Map();
  for (const e of sent) perContact.set(e.conversationId, (perContact.get(e.conversationId) ?? 0) + 1);
  return { total: sent.length, perContact, date: today };
}

export function canReply(dataDir, conversationId, { stranger = false } = {}) {
  if (!stranger && !isAllowed(dataDir, conversationId)) {
    return { ok: false, reason: 'not-allowed', message: '该会话不在许可名单里（allowed.json），不回。先在好友互动页勾选并保存。' };
  }
  // Strangers go through their own gate in lib/dm.mjs; here we only
  // apply the counts. Allowed-list replies use caps.dmReply*.
  let caps = REPLY_CAPS;
  try {
    // Dynamic import avoided here (sync API): read config.json directly.
    const { configFile } = dataPaths(dataDir);
    const raw = readJson(configFile, null);
    if (raw?.caps) {
      caps = {
        perContactPerDay: Number(raw.caps.dmReplyPerContactPerDay ?? 1),
        totalPerDay: stranger
          ? Number(raw.caps?.strangerPerDay ?? raw.strangerReply?.perDay ?? 3)
          : Number(raw.caps.dmReplyPerDay ?? 5),
      };
    } else if (stranger && raw?.strangerReply) {
      caps = { perContactPerDay: 1, totalPerDay: Number(raw.strangerReply.perDay ?? 3) };
    }
  } catch { /* defaults */ }
  const counts = replyCounts(dataDir);
  // Stranger replies are counted separately: only stranger entries.
  const relevantTotal = stranger
    ? readJsonl(dataPaths(dataDir).replyLogFile).filter((e) => e?.status === 'sent' && e?.stranger === true && String(e.at ?? '').startsWith(counts.date)).length
    : counts.total;
  if (relevantTotal >= caps.totalPerDay) {
    return { ok: false, reason: 'total-cap', message: `今日${stranger ? '陌生人' : ''}回复已达上限 ${caps.totalPerDay} 条。` };
  }
  if (!stranger && (counts.perContact.get(String(conversationId)) ?? 0) >= caps.perContactPerDay) {
    return { ok: false, reason: 'per-contact-cap', message: `该联系人今日已回过 ${caps.perContactPerDay} 条，不再重复回。` };
  }
  return { ok: true, counts };
}

// --- generic daily action counters (like / comment / share / post) ------
// Counts come from action-log.jsonl (like/comment/share) and
// post-log.jsonl (post). Only entries with status === 'sent' count.
export function actionCounts(dataDir, today = new Date().toISOString().slice(0, 10)) {
  const { actionLogFile, postLogFile } = dataPaths(dataDir);
  const actions = readJsonl(actionLogFile).filter((e) => e?.status === 'sent' && String(e.at ?? '').startsWith(today));
  const posts = readJsonl(postLogFile).filter((e) => e?.status === 'sent' && String(e.at ?? '').startsWith(today));
  const byType = {};
  for (const e of actions) byType[e.type] = (byType[e.type] ?? 0) + 1;
  byType.post = posts.length;
  return { date: today, byType, like: byType.like ?? 0, comment: byType.comment ?? 0, share: byType.share ?? 0, post: posts.length };
}

export function logAction(dataDir, entry) {
  const { actionLogFile } = dataPaths(dataDir);
  appendJsonl(actionLogFile, { at: new Date().toISOString(), ...entry });
}

// canDo('like'|'comment'|'share'|'post', cap): switch + cap gate.
// The caller passes the config value; this function only counts.
export function canDoAction(dataDir, type, { enabled, cap }) {
  if (!enabled) return { ok: false, reason: 'disabled', message: `${type} 未开启（设置页里打开开关才能用）。` };
  const counts = actionCounts(dataDir);
  const used = counts.byType[type] ?? 0;
  if (used >= cap) return { ok: false, reason: 'cap', message: `今日${type}已达上限 ${cap} 次（已用 ${used} 次）。` };
  return { ok: true, used, cap };
}

// Share dedup: same video + same person is shared at most once, forever.
// The key is videoId + personId (both stable ids, never nicknames).
export function alreadyShared(dataDir, videoId, personId) {
  const { actionLogFile } = dataPaths(dataDir);
  return readJsonl(actionLogFile).some(
    (e) => e?.type === 'share' && e?.status === 'sent' && e?.videoId === videoId && e?.personId === personId,
  );
}

// Same-video no-repeat for like / comment: one like / one comment per
// video, ever (checked against action-log).
export function alreadyActedOnVideo(dataDir, type, videoId) {
  const { actionLogFile } = dataPaths(dataDir);
  return readJsonl(actionLogFile).some(
    (e) => e?.type === type && e?.status === 'sent' && e?.videoId === videoId,
  );
}

export function logReply(dataDir, entry) {
  const { replyLogFile } = dataPaths(dataDir);
  appendJsonl(replyLogFile, { at: new Date().toISOString(), ...entry });
}

// --- v0.3.0 helpers ------------------------------------------------------
// Action rotation (feature 11): same video may get only ONE action
// type per day (like / comment / share / favorite) — never farm one video.
export function alreadyActedAnyToday(dataDir, videoId, today = new Date().toISOString().slice(0, 10)) {
  const { actionLogFile } = dataPaths(dataDir);
  const hit = readJsonl(actionLogFile).find((e) => e?.status === 'sent' && e?.videoId === videoId && String(e.at ?? '').startsWith(today));
  return hit ? hit.type : null;
}
export function rotationGate(dataDir, videoId, type) {
  const other = alreadyActedAnyToday(dataDir, videoId);
  if (other && other !== type) {
    return { ok: false, reason: 'rotation', message: `这个视频今天已经做过「${other}」了，按动作轮转规则今天不再做「${type}」。` };
  }
  return { ok: true };
}
// Generic state file (risk / patrol): plain JSON, atomic write.
export function readState(file, fallback) { return readJson(file, fallback); }
export function writeState(file, value) { return writeJsonAtomic(file, value); }

