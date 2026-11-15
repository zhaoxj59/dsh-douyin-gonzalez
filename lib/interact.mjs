// v0.3.0 互动包 (interact): favorite / sticker / spark / reply-own / mention.
// Pure logic here (gates, picking, dedup); the browser step is injected
// by the caller so this module never touches the DOM itself.
import { loadConfig } from './config.mjs';
import { loadAllowed, actionCounts, logAction, readJsonl, appendJsonl, readJson, writeJsonAtomic } from './store.mjs';
import { dataPaths } from './paths.mjs';

// --- 收藏视频: gate + dedup (same video once, daily cap) ---
export function canFavorite(dataDir, config) {
  if (!config?.favorite?.enabled) return { ok: false, reason: 'disabled', message: '自动收藏未开启。' };
  const counts = actionCounts(dataDir);
  if ((counts.byType.favorite ?? 0) >= (config.favorite.perDay ?? config.caps?.favoritePerDay ?? 5)) {
    return { ok: false, reason: 'cap', message: `今日收藏已达上限 ${config.favorite.perDay ?? 5} 次。` };
  }
  return { ok: true };
}

// --- 表情包/贴纸: pick by keyword from the collected set; if the
// user has no collected stickers, fall back to a keyword text line
// (never pretend a sticker was sent when none exists).
export function loadStickers(dataDir) {
  const { stickersFile } = dataPaths(dataDir);
  const raw = readJson(stickersFile, null);
  return Array.isArray(raw?.stickers) ? raw.stickers : [];
}
export function saveStickers(dataDir, stickers) {
  const { stickersFile } = dataPaths(dataDir);
  writeJsonAtomic(stickersFile, { updatedAt: new Date().toISOString(), stickers });
  return loadStickers(dataDir);
}
export function collectSticker(dataDir, { name, keywords = '' }) {
  if (!name) return { ok: false, reason: 'missing-args', message: '收藏表情包需要一个名字。' };
  const all = loadStickers(dataDir);
  if (all.some((s) => s.name === name)) return { ok: false, reason: 'duplicate', message: `表情包「${name}」已经收藏过了。` };
  all.push({ name, keywords: String(keywords) });
  saveStickers(dataDir, all);
  return { ok: true, name, count: all.length };
}
export function pickSticker(dataDir, keyword = '') {
  const all = loadStickers(dataDir);
  const kw = String(keyword).toLowerCase();
  const hit = all.find((s) => String(s.keywords ?? s.name ?? '').toLowerCase().includes(kw) && kw)
    ?? all[Math.floor(Math.random() * all.length)] ?? null;
  if (hit) return { ok: true, sticker: hit, fallback: false };
  return { ok: true, sticker: null, fallback: true, message: '没有收藏的表情包，按关键字兜底发文字（没假装发表情包）。' };
}
export function canSticker(dataDir, config) {
  if (!config?.sticker?.enabled) return { ok: false, reason: 'disabled', message: '表情包未开启。' };
  const counts = actionCounts(dataDir);
  if ((counts.byType.sticker ?? 0) >= (config.sticker.perDay ?? config.caps?.stickerPerDay ?? 5)) {
    return { ok: false, reason: 'cap', message: `今日表情包已达上限 ${config.sticker.perDay ?? 5} 次。` };
  }
  return { ok: true };
}

// --- 续火花: per-person plan. messages are random one-liners so the
// same text is not sent every day. warnDays = warn when a spark is
// about to break (needs the last-contact date from the caller).
export function sparkPlan(dataDir, config, { personId, personName, lastContactAt } = {}) {
  if (!config?.spark?.enabled) return { ok: false, reason: 'disabled', message: '续火花未开启。' };
  const counts = actionCounts(dataDir);
  if ((counts.byType.spark ?? 0) >= (config.spark.perDay ?? config.caps?.sparkPerDay ?? 3)) {
    return { ok: false, reason: 'cap', message: `今日续火花已达上限 ${config.spark.perDay ?? 3} 次。` };
  }
  const allowed = loadAllowed(dataDir).allowed.find((a) => a.id === personId);
  if (!allowed) return { ok: false, reason: 'not-allowed', message: '续火花只能发给白名单里的人。' };
  const msgs = config.spark.messages?.length ? config.spark.messages : ['在呢'];
  const text = msgs[Math.floor(Math.random() * msgs.length)];
  let warn = false;
  if (lastContactAt) {
    const days = (Date.now() - new Date(lastContactAt).getTime()) / 86400000;
    warn = days >= (config.spark.warnDays ?? 1);
  }
  return { ok: true, personId, personName: personName ?? allowed.name, text, warn, times: config.spark.times ?? [] };
}
export function logSpark(dataDir, entry) {
  appendJsonl(dataPaths(dataDir).sparkLogFile, { at: new Date().toISOString(), ...entry });
}

// --- 回自己视频评论: pick N comments from own videos in the last
// `days` days; random or in order; oncePerUser = same person once.
// The caller supplies the candidate comments (read from the page);
// this function only decides WHICH ones may be replied to.
export function pickOwnComments(dataDir, config, candidates) {
  if (!config?.replyOwn?.enabled) return { ok: false, reason: 'disabled', message: '回自己视频评论未开启。' };
  const today = new Date().toISOString().slice(0, 10);
  const repliedToday = readJsonl(dataPaths(dataDir).actionLogFile)
    .filter((e) => e?.type === 'reply-own' && e?.status === 'sent' && String(e.at ?? '').startsWith(today));
  const cap = config.replyOwn.perDay ?? config.caps?.replyOwnPerDay ?? 10;
  if (repliedToday.length >= cap) return { ok: false, reason: 'cap', message: `今日回自己视频评论已达上限 ${cap} 条。` };
  const perRun = Math.min(config.replyOwn.perRun ?? config.caps?.replyOwnPerRun ?? 3, cap - repliedToday.length);
  const cutoff = Date.now() - (config.replyOwn.days ?? 3) * 86400000;
  let list = (candidates ?? []).filter((c) => !c.at || new Date(c.at).getTime() >= cutoff)
    .filter((c) => !repliedToday.some((r) => r.commentId === c.id));
  if (config.replyOwn.oncePerUser) {
    const seen = new Set(repliedToday.map((r) => r.userId));
    list = list.filter((c) => !seen.has(c.userId));
  }
  if (config.replyOwn.random) list = [...list].sort(() => Math.random() - 0.5);
  return { ok: true, picked: list.slice(0, perRun), remainingToday: cap - repliedToday.length };
}

// --- 评论 @人: mention comment has its OWN cap, separate from the
// plain-comment cap. mentionName empty = plain comment.
export function canMentionComment(dataDir, config) {
  if (!config?.commentMention?.enabled) return { ok: false, reason: 'disabled', message: '评论 @ 人未开启。' };
  const counts = actionCounts(dataDir);
  const cap = config.commentMention.perDay ?? config.caps?.mentionPerDay ?? 3;
  if ((counts.byType.mention ?? 0) >= cap) return { ok: false, reason: 'cap', message: `今日 @ 评论已达上限 ${cap} 条。` };
  if (!config.commentMention.mentionName) return { ok: false, reason: 'no-mention-name', message: '没填要 @ 的人（设置页 → 互动包 → 评论 @ 人里填名字）。' };
  return { ok: true, mentionName: config.commentMention.mentionName };
}
export function logInteractAction(dataDir, entry) { logAction(dataDir, entry); }
