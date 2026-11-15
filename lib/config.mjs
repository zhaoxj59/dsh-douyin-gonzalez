// v0.3.1 config: config.json in the data dir. Modular: 5 packages,
// each with ONE master switch. Off = that package's tools refuse
// (gate in dsh-plugin.mjs) and no timer / patrol from it runs.
//   core     — always on: watch, DM whitelist, auto-choose, report
//   interact — like / comment / mention / share / sticker / favorite / spark / reply-own
//   discover — hot / search / following / creators / diagnosis / my posts
//   publish  — post / draft / ComfyUI
//   safety   — valley + patrol / risk / login status / cleanup / douyin memory
// AstrBot bridge stays its own opt-in (v0.2.0), not inside a package.
// All write actions default OFF. Caps are enforced in lib code.
// v0.3.1: share defaults OFF (was ON in v0.3.0). Config version 4:
// any config file still on version 2/3 is migrated with share OFF, so
// a user who had sharing on must re-open the share switch once after
// upgrading. A v4 file keeps the user's explicit share choice.
import fs from 'node:fs';
import { dataPaths } from './paths.mjs';
import { readJson, writeJsonAtomic } from './store.mjs';

export const PACKAGES = {
  core: { label: '核心', alwaysOn: true, description: '刷抖音、回白名单私信、自主选片、日报', purpose: '这个包只负责刷抖音和回白名单私信：看片、选片、回私信、写日报，别的什么都不动。' },
  interact: { label: '互动', alwaysOn: false, description: '点赞、评论、@人、分享、表情包、收藏、续火花、回自己视频评论', purpose: '这个包负责对外动作：点赞、评论、分享、收藏、续火花——都是会动别人账号的东西，所以默认全关，要用哪个你亲手打开哪个。' },
  discover: { label: '发现', alwaysOn: false, description: '热榜、搜索、关注、指定博主、创作者诊断、我的作品', purpose: '这个包负责找新内容：热榜、搜索、关注和指定博主，只看不发。' },
  publish: { label: '发片', alwaysOn: false, description: '发视频、存草稿、标题模板、ComfyUI', purpose: '这个包负责发视频：发片、存草稿、从 ComfyUI 取成片，默认关，没给文件绝不发。' },
  safety: { label: '安全', alwaysOn: false, description: '谷时自动刷、定时巡检、风控提醒、登录状态、一键清理、抖音记忆', purpose: '这个包负责兜底：谷时、巡检、风控暂停、登录提醒和清理，出问题先停手。' },
};
export const PACKAGE_NAMES = Object.keys(PACKAGES);

export function isPackageEnabled(config, name) {
  if (name === 'core') return true;
  return Boolean(config?.packages?.[name]?.enabled);
}
export function packageGate(config, name) {
  if (isPackageEnabled(config, name)) return { ok: true };
  return { ok: false, reason: 'package-disabled', message: `「${PACKAGES[name]?.label ?? name}」包未开启：先在设置页 → ${PACKAGES[name]?.label ?? name}包 打开总开关，再开里面的小开关。` };
}

export const DEFAULT_CONFIG = {
  version: 4,
  packages: {
    core: { enabled: true },
    interact: { enabled: false },
    discover: { enabled: false },
    publish: { enabled: false },
    safety: { enabled: false },
  },
  // --- v0.2 kept verbatim (defaults unchanged) ---
  autoComment: { enabled: false, perDay: 3 },
  autoLike: { enabled: false, perDay: 10 },
  strangerReply: { enabled: false, perDay: 3 },
  caps: {
    dmReplyPerDay: 5,
    dmReplyPerContactPerDay: 1,
    sharePerDay: 3,
    likePerDay: 10,
    commentPerDay: 3,
    postPerDay: 0,
    favoritePerDay: 5,
    stickerPerDay: 5,
    sparkPerDay: 3,
    replyOwnPerDay: 10,
    replyOwnPerRun: 3,
    mentionPerDay: 3,
    // v0.3.1: 每日总闸 — 所有对外动作（点赞/评论/@/分享/收藏/
    // 表情包/续火花/回自己评论）开着的那些，每日次数合计不得超过
    // 这个数。只在体检（dy_health_check）里算，不在工具里硬拦，
    // 工具各自的单项上限照常执行。
    totalOutwardPerDay: 20,
  },
  share: { enabled: false },
  autoPost: { enabled: false, perDay: 0 },
  watch: { autoChoose: true, minutesPerRound: 10, silent: true, minimize: false, skipOverMin: 60, skimOverMin: 5, ocr: false, transcript: false, watchBeforeAct: true },
  astrbot: { enabled: false, port: 8766, token: '', webhookUrl: '' },
  // --- v0.3 interact ---
  commentMention: { enabled: false, perDay: 3, mentionName: '' },
  favorite: { enabled: false, perDay: 5 },
  sticker: { enabled: false, perDay: 5 },
  spark: { enabled: false, perDay: 3, times: ['08:00'], warnDays: 1, messages: ['在呢', '今天看了个好玩的', '火花别断呀'] },
  replyOwn: { enabled: false, perDay: 10, perRun: 3, days: 3, random: true, oncePerUser: false },
  // --- v0.3 discover ---
  discover: { sources: { feed: true, hot: false, search: false, following: false, creators: false }, keywords: [], creators: [] },
  // --- v0.3 publish ---
  publish: { draftDefault: true, titleTemplate: '大肥鱼的日常 {date}', defaultTags: '' },
  comfyui: { enabled: false, url: 'http://127.0.0.1:8188', outputDir: '' },
  // --- v0.3 safety ---
  valley: { enabled: false, noon: true, night: true, perDay: 5, pickPerRound: 2 },
  patrol: { enabled: false, intervalMin: 30, jitterPct: 20 },
  risk: { enabled: true, paused: false, lastRisk: null },
  login: { lastCheckedAt: null, loggedIn: null },
  cleanup: { enabled: true, retentionDays: 30 },
  memory: { enabled: false },
};

function clampInt(v, fallback, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}
function clampStrList(v, max = 20) {
  if (Array.isArray(v)) return [...new Set(v.map((s) => String(s).trim()).filter(Boolean))].slice(0, max);
  if (typeof v === 'string') return [...new Set(v.split(/[,，、\n]+/).map((s) => s.trim()).filter(Boolean))].slice(0, max);
  return [];
}
function clampTimes(v) {
  const list = clampStrList(v, 6);
  return list.filter((t) => /^\d{1,2}:\d{2}$/.test(t));
}

export function normalizeConfig(raw) {
  const d = DEFAULT_CONFIG;
  const r = (raw && typeof raw === 'object') ? raw : {};
  // v0.3.1 migration: only a v4 file keeps its explicit share choice.
  // v2/v3 files (share was ON by default there) migrate with share OFF.
  const shareOn = r.version === 4 ? Boolean(r.share?.enabled) : false;
  const pkg = (name) => ({ enabled: name === 'core' ? true : Boolean(r.packages?.[name]?.enabled) });
  return {
    version: 4,
    packages: { core: pkg('core'), interact: pkg('interact'), discover: pkg('discover'), publish: pkg('publish'), safety: pkg('safety') },
    autoComment: { enabled: Boolean(r.autoComment?.enabled), perDay: clampInt(r.autoComment?.perDay, d.autoComment.perDay, 0, 50) },
    autoLike: { enabled: Boolean(r.autoLike?.enabled), perDay: clampInt(r.autoLike?.perDay, d.autoLike.perDay, 0, 200) },
    strangerReply: { enabled: Boolean(r.strangerReply?.enabled), perDay: clampInt(r.strangerReply?.perDay, d.strangerReply.perDay, 0, 20) },
    caps: {
      dmReplyPerDay: clampInt(r.caps?.dmReplyPerDay, d.caps.dmReplyPerDay, 0, 50),
      dmReplyPerContactPerDay: clampInt(r.caps?.dmReplyPerContactPerDay, d.caps.dmReplyPerContactPerDay, 0, 10),
      sharePerDay: clampInt(r.caps?.sharePerDay, d.caps.sharePerDay, 0, 20),
      likePerDay: clampInt(r.caps?.likePerDay, d.caps.likePerDay, 0, 200),
      commentPerDay: clampInt(r.caps?.commentPerDay, d.caps.commentPerDay, 0, 50),
      postPerDay: clampInt(r.caps?.postPerDay, d.caps.postPerDay, 0, 10),
      favoritePerDay: clampInt(r.caps?.favoritePerDay, d.caps.favoritePerDay, 0, 50),
      stickerPerDay: clampInt(r.caps?.stickerPerDay, d.caps.stickerPerDay, 0, 50),
      sparkPerDay: clampInt(r.caps?.sparkPerDay, d.caps.sparkPerDay, 0, 20),
      replyOwnPerDay: clampInt(r.caps?.replyOwnPerDay, d.caps.replyOwnPerDay, 0, 50),
      replyOwnPerRun: clampInt(r.caps?.replyOwnPerRun, d.caps.replyOwnPerRun, 0, 20),
      mentionPerDay: clampInt(r.caps?.mentionPerDay, d.caps.mentionPerDay, 0, 20),
      totalOutwardPerDay: clampInt(r.caps?.totalOutwardPerDay, d.caps.totalOutwardPerDay, 0, 200),
    },
    share: { enabled: shareOn },
    autoPost: { enabled: Boolean(r.autoPost?.enabled), perDay: clampInt(r.autoPost?.perDay, d.autoPost.perDay, 0, 10) },
    watch: {
      autoChoose: r.watch?.autoChoose !== false,
      minutesPerRound: clampInt(r.watch?.minutesPerRound, d.watch.minutesPerRound, 1, 120),
      silent: r.watch?.silent !== false,
      minimize: Boolean(r.watch?.minimize),
      skipOverMin: clampInt(r.watch?.skipOverMin, d.watch.skipOverMin, 1, 600),
      skimOverMin: clampInt(r.watch?.skimOverMin, d.watch.skimOverMin, 1, 120),
      ocr: Boolean(r.watch?.ocr),
      transcript: Boolean(r.watch?.transcript),
      watchBeforeAct: r.watch?.watchBeforeAct !== false,
    },
    astrbot: {
      enabled: Boolean(r.astrbot?.enabled),
      port: clampInt(r.astrbot?.port, d.astrbot.port, 1024, 65535),
      token: String(r.astrbot?.token ?? ''),
      webhookUrl: String(r.astrbot?.webhookUrl ?? '').trim(),
    },
    commentMention: {
      enabled: Boolean(r.commentMention?.enabled),
      perDay: clampInt(r.commentMention?.perDay, d.commentMention.perDay, 0, 20),
      mentionName: String(r.commentMention?.mentionName ?? '').slice(0, 50),
    },
    favorite: { enabled: Boolean(r.favorite?.enabled), perDay: clampInt(r.favorite?.perDay, d.favorite.perDay, 0, 50) },
    sticker: { enabled: Boolean(r.sticker?.enabled), perDay: clampInt(r.sticker?.perDay, d.sticker.perDay, 0, 50) },
    spark: {
      enabled: Boolean(r.spark?.enabled),
      perDay: clampInt(r.spark?.perDay, d.spark.perDay, 0, 20),
      times: clampTimes(r.spark?.times ?? d.spark.times),
      warnDays: clampInt(r.spark?.warnDays, d.spark.warnDays, 0, 7),
      messages: clampStrList(r.spark?.messages ?? d.spark.messages, 20),
    },
    replyOwn: {
      enabled: Boolean(r.replyOwn?.enabled),
      perDay: clampInt(r.replyOwn?.perDay, d.replyOwn.perDay, 0, 50),
      perRun: clampInt(r.replyOwn?.perRun, d.replyOwn.perRun, 0, 20),
      days: clampInt(r.replyOwn?.days, d.replyOwn.days, 1, 30),
      random: r.replyOwn?.random !== false,
      oncePerUser: Boolean(r.replyOwn?.oncePerUser),
    },
    discover: {
      sources: {
        feed: r.discover?.sources?.feed !== false,
        hot: Boolean(r.discover?.sources?.hot),
        search: Boolean(r.discover?.sources?.search),
        following: Boolean(r.discover?.sources?.following),
        creators: Boolean(r.discover?.sources?.creators),
      },
      keywords: clampStrList(r.discover?.keywords, 20),
      creators: clampStrList(r.discover?.creators, 20),
    },
    publish: {
      draftDefault: r.publish?.draftDefault !== false,
      titleTemplate: String(r.publish?.titleTemplate ?? d.publish.titleTemplate).slice(0, 200),
      defaultTags: String(r.publish?.defaultTags ?? '').slice(0, 200),
    },
    comfyui: {
      enabled: Boolean(r.comfyui?.enabled),
      url: String(r.comfyui?.url ?? d.comfyui.url).trim() || d.comfyui.url,
      outputDir: String(r.comfyui?.outputDir ?? '').trim(),
    },
    valley: {
      enabled: Boolean(r.valley?.enabled),
      noon: r.valley?.noon !== false,
      night: r.valley?.night !== false,
      perDay: clampInt(r.valley?.perDay, d.valley.perDay, 0, 20),
      pickPerRound: clampInt(r.valley?.pickPerRound, d.valley.pickPerRound, 1, 10),
    },
    patrol: {
      enabled: Boolean(r.patrol?.enabled),
      intervalMin: clampInt(r.patrol?.intervalMin, d.patrol.intervalMin, 5, 240),
      jitterPct: clampInt(r.patrol?.jitterPct, d.patrol.jitterPct, 0, 50),
    },
    risk: {
      enabled: r.risk?.enabled !== false,
      paused: Boolean(r.risk?.paused),
      lastRisk: r.risk?.lastRisk ?? null,
    },
    login: { lastCheckedAt: r.login?.lastCheckedAt ?? null, loggedIn: typeof r.login?.loggedIn === 'boolean' ? r.login.loggedIn : null },
    cleanup: { enabled: r.cleanup?.enabled !== false, retentionDays: clampInt(r.cleanup?.retentionDays, d.cleanup.retentionDays, 1, 365) },
    memory: { enabled: Boolean(r.memory?.enabled) },
  };
}

export function loadConfig(dataDir) {
  const { configFile } = dataPaths(dataDir);
  return normalizeConfig(readJson(configFile, null));
}

export function saveConfig(dataDir, raw) {
  const { configFile } = dataPaths(dataDir);
  const value = { ...normalizeConfig(raw), updatedAt: new Date().toISOString() };
  writeJsonAtomic(configFile, value);
  const back = loadConfig(dataDir);
  const ok = JSON.stringify(back) === JSON.stringify(normalizeConfig(value));
  return { ok, file: configFile, saved: value, readBack: back };
}
