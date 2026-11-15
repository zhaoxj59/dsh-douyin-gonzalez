// DSH plugin entry, v0.3.3. Modular: 5 packages, one master switch each.
//   core (always on) / interact / discover / publish / safety.
// A tool whose package is OFF returns package-disabled and does nothing.
// Write tools additionally pass the risk gate (safety.risk.paused):
// when risk is hit, ALL writes stop until the user clears it in settings.
// v0.1/v0.2 core is unchanged: watch + DM whitelist + auto-choose + report.
// v0.3.1: share defaults OFF (config v4 migration), dy_health_check added.
// v0.3.2: friendly playwright-missing error, dy_fish_share, login on the
// first page, auto-save, DSH native panel section.
import { dataPaths } from './lib/paths.mjs';
import { loadAllowed, canDoAction, alreadyActedOnVideo, logAction, rotationGate } from './lib/store.mjs';
import { loadConfig, packageGate } from './lib/config.mjs';

export const name = 'douyin-gonzalez';
export const inject = ['tools'];

// pkg: which package gates this tool. write: passes the risk gate too.
export const TOOL_DEFINITIONS = [
  // core (always on)
  { name: 'dy_watch', pkg: 'core', description: '在专用 Edge 里刷抖音一轮（默认 10 分钟），大肥鱼按人设 + 兴趣 + 观看历史自己选片，选片理由记进 watch-log.jsonl。需要先在 Edge 里手动登录抖音。', parameters: { type: 'object', properties: { minutes: { type: 'number', description: '本轮观看分钟数，默认 10' } } }, execute: 'watch' },
  { name: 'dy_list_chats', pkg: 'core', description: '读取抖音私信会话列表，写入本地 chats.json（好友互动页的勾选来源）。', parameters: { type: 'object', properties: {} }, execute: 'listChats' },
  { name: 'dy_dm_reply', pkg: 'core', description: '给一个已许可会话回一条私信。只回 allowed.json 里勾选过的会话；每人每天上限、全天上限按 config.json；发送结果不明时不自动重发。', parameters: { type: 'object', properties: { conversationId: { type: 'string' }, text: { type: 'string' } }, required: ['conversationId', 'text'] }, execute: 'dmReply' },
  { name: 'dy_dm_reply_stranger', pkg: 'core', description: '给一个陌生人回一条私信。只有在设置页显式打开“陌生人私信回复”开关时才可用，有独立的每日上限（默认 3 条），和白名单回复分开计数。默认关闭。', parameters: { type: 'object', properties: { conversationId: { type: 'string' }, text: { type: 'string' } }, required: ['conversationId', 'text'] }, execute: 'dmReplyStranger' },
  { name: 'dy_daily_report', pkg: 'core', description: '从本地观看/回复/点赞/评论/分享/发视频记录生成当天的 Markdown 日报，不额外调模型。', parameters: { type: 'object', properties: { date: { type: 'string', description: '日期 YYYY-MM-DD，默认今天' } } }, execute: 'dailyReport' },
  { name: 'dy_astrbot_status', pkg: 'core', description: '查看 AstrBot 桥的状态（是否开启、端口、今日计数）。桥默认关闭，开启也只监听 127.0.0.1 + token。', parameters: { type: 'object', properties: {} }, execute: 'astrbotStatus' },
  { name: 'dy_health_check', pkg: 'core', description: '一键体检：真跑 13 项检查（Edge 登录、看片层、白名单保存读回、危险开关、每日预算总闸、续火花到期、陌生人开关、发片、AstrBot、巡检、风控、大肥鱼记忆互通），返回通过几项、不通过哪几项，每项不通过都写原因。只读本地状态，不改任何文件；Edge 探不到时那项报 unknown，不假装通过。', parameters: { type: 'object', properties: {} }, execute: 'healthCheck' },
  { name: 'dy_fish_share', pkg: 'core', description: '把今天的抖音日报摘要分享给大肥鱼：往大肥鱼家里的 inbox.md 追加一条（只追加，不改它原有内容），同时记进抖音专属记忆。单向分享记录，不是实时对话——大肥鱼不会因此主动来聊抖音，想让它聊，得在它的会话里问它。', parameters: { type: 'object', properties: { date: { type: 'string', description: '日期 YYYY-MM-DD，默认今天' }, note: { type: 'string', description: '想顺带告诉大肥鱼的一句话，可不填' } } }, execute: 'fishShare' },
  // interact
  { name: 'dy_like', pkg: 'interact', write: true, description: '给当前正在看的视频点赞。互动包总开关 + 点赞开关 + 每日上限；同一视频只点赞一次，且同一视频一天内只做一种动作（动作轮转）。', parameters: { type: 'object', properties: { videoId: { type: 'string' } }, required: ['videoId'] }, execute: 'like' },
  { name: 'dy_comment', pkg: 'interact', write: true, description: '给当前正在看的视频发一条评论。互动包总开关 + 评论开关 + 每日上限；同一视频只评论一次，动作轮转。', parameters: { type: 'object', properties: { videoId: { type: 'string' }, text: { type: 'string' } }, required: ['videoId', 'text'] }, execute: 'comment' },
  { name: 'dy_comment_mention', pkg: 'interact', write: true, description: '发一条带 @ 的评论（@设置页里填的那个人）。@评论有独立的每日上限，和普通评论分开计数。', parameters: { type: 'object', properties: { videoId: { type: 'string' }, text: { type: 'string' } }, required: ['videoId', 'text'] }, execute: 'commentMention' },
  { name: 'dy_share', pkg: 'interact', write: true, description: '把当前视频分享给白名单里的人。按各人的兴趣匹配挑人（不是群发）；同一视频 + 同一个人只分享一次；每日分享次数按 config.json。', parameters: { type: 'object', properties: { videoId: { type: 'string' }, caption: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } } }, required: ['videoId'] }, execute: 'share' },
  { name: 'dy_favorite', pkg: 'interact', write: true, description: '收藏当前正在看的视频。互动包总开关 + 收藏开关 + 每日上限；同一视频只收藏一次，动作轮转。', parameters: { type: 'object', properties: { videoId: { type: 'string' } }, required: ['videoId'] }, execute: 'favorite' },
  { name: 'dy_sticker', pkg: 'interact', write: true, description: '给一个白名单会话发表情包：先按关键词从收藏的表情包里挑；没有收藏就发兜底文字，绝不假装发表了贴纸。贴纸本身需在 Edge 里人工点发时以挑好的为准。', parameters: { type: 'object', properties: { conversationId: { type: 'string' }, keyword: { type: 'string' } }, required: ['conversationId'] }, execute: 'sticker' },
  { name: 'dy_collect_sticker', pkg: 'interact', description: '收藏一个表情包到本地 stickers.json（名字 + 关键词），以后 dy_sticker 按关键词挑它。只写本地文件，不动抖音账号。', parameters: { type: 'object', properties: { name: { type: 'string' }, keywords: { type: 'string' } }, required: ['name'] }, execute: 'collectSticker' },
  { name: 'dy_spark', pkg: 'interact', write: true, description: '给一个白名单好友续火花：发一句一言随机文案。每天几次、几点发、快断预警天数都在设置页 → 互动包 → 续火花里设。', parameters: { type: 'object', properties: { conversationId: { type: 'string' }, lastContactAt: { type: 'string' } }, required: ['conversationId'] }, execute: 'spark' },
  { name: 'dy_reply_own_comments', pkg: 'interact', write: true, description: '回自己视频下的新评论：只看最近 N 天内的作品，每次回几条、每天最多几条、随机还是按顺序、同人只回一次，都在设置页 → 互动包里设。', parameters: { type: 'object', properties: { videoId: { type: 'string' } } }, execute: 'replyOwn' },
  // discover
  { name: 'dy_hot', pkg: 'discover', description: '读抖音热榜（不用编数据，页面读不到就报 selector-mismatch）。', parameters: { type: 'object', properties: {} }, execute: 'hot' },
  { name: 'dy_search', pkg: 'discover', description: '按关键词搜视频。', parameters: { type: 'object', properties: { keyword: { type: 'string' } }, required: ['keyword'] }, execute: 'search' },
  { name: 'dy_following', pkg: 'discover', description: '读关注的人最近发了什么。', parameters: { type: 'object', properties: {} }, execute: 'following' },
  { name: 'dy_creator_videos', pkg: 'discover', description: '读一个指定博主最近的作品（给博主主页链接）。', parameters: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] }, execute: 'creatorVideos' },
  { name: 'dy_diagnose_creator', pkg: 'discover', description: '创作者诊断（基础版）：把播放/点赞/评论/完播摆出来，列出最可能的原因让鱼分析。不编流量池、不编账号分、不保证爆款。', parameters: { type: 'object', properties: { videoId: { type: 'string' }, title: { type: 'string' }, plays: { type: 'number' }, likes: { type: 'number' }, comments: { type: 'number' }, completionPct: { type: 'number' } }, required: ['videoId'] }, execute: 'diagnose' },
  { name: 'dy_my_posts', pkg: 'discover', description: '看我自己发的作品和每条数据（读不到的数记 null，不编）。', parameters: { type: 'object', properties: {} }, execute: 'myPosts' },
  { name: 'dy_watch_sources', pkg: 'discover', description: '按设置页 → 发现包勾的来源（推荐流/热榜/搜索/关注/指定博主）刷一轮；没开其他来源就只刷推荐流。', parameters: { type: 'object', properties: { minutes: { type: 'number' } } }, execute: 'watchSources' },
  // publish
  { name: 'dy_post', pkg: 'publish', write: true, description: '发一条抖音视频。必须给本地视频文件路径 + 文案；发片包总开关 + 自动发视频开关和每日次数按 config.json（默认 0 / 关闭）。没有文件不发，每次发布都记进 post-log.jsonl。', parameters: { type: 'object', properties: { file: { type: 'string' }, caption: { type: 'string' } }, required: ['file'] }, execute: 'post' },
  { name: 'dy_publish_draft', pkg: 'publish', write: true, description: '把一条视频记为草稿（默认存草稿）：标题按模板 {date} 替换、带默认话题；只记草稿不上传，正式发布请在创作者中心点发布。', parameters: { type: 'object', properties: { file: { type: 'string' }, caption: { type: 'string' } }, required: ['file'] }, execute: 'publishDraft' },
  { name: 'dy_comfyui_latest', pkg: 'publish', description: '取 ComfyUI 输出目录里最新的 .mp4 成片（需在设置页填地址和输出目录；没装 ComfyUI 就报未配置，不编文件）。', parameters: { type: 'object', properties: {} }, execute: 'comfyuiLatest' },
  // safety
  { name: 'dy_patrol', pkg: 'safety', description: '跑一次定时巡检：看谷时窗口、记一次巡检、返回下次巡检间隔（默认 30 分钟 ±20% 抖动）。', parameters: { type: 'object', properties: {} }, execute: 'patrol' },
  { name: 'dy_login_status', pkg: 'safety', description: '查抖音登录状态：已登录 / 未登录 / 要验证码。未登录时设置页首页红字提醒。', parameters: { type: 'object', properties: {} }, execute: 'loginStatus' },
  { name: 'dy_cleanup', pkg: 'safety', description: '一键清理：删 30 天前的缩略图 / 音轨 / 老日报（天数可设）。不碰 config、allowed.json、当天日志和 Edge profile。', parameters: { type: 'object', properties: { dryRun: { type: 'boolean' } } }, execute: 'cleanup' },
  { name: 'dy_memory', pkg: 'safety', description: '抖音专属记忆（memory/YYYY-MM.md）：记一句 / 读最近的。只记抖音这边的事（看过谁、跟谁聊过、谁喜欢什么），和大肥鱼的家记忆分开。', parameters: { type: 'object', properties: { mode: { type: 'string', description: 'add 或 read' }, line: { type: 'string' } } }, execute: 'memory' },
  { name: 'dy_risk_status', pkg: 'safety', description: '看风控状态：是否暂停、为什么暂停。clear=true 时解除暂停（先去 Edge 里人工确认没事再解除）。', parameters: { type: 'object', properties: { clear: { type: 'boolean' } } }, execute: 'riskStatus' },
  { name: 'dy_analyze_video', pkg: 'safety', description: '看片分析：长视频阈值（超 60 分钟划走、超 5 分钟跳着看）、静默/最小化、OCR 与转写是否可用。看片层不可用时，依赖内容的动作先跳过，不假装看完。', parameters: { type: 'object', properties: { videoId: { type: 'string' }, durationMin: { type: 'number' }, caption: { type: 'string' } } }, execute: 'analyzeVideo' },
];

async function runTool(toolName, args, dataDir) {
  const dir = dataDir ?? process.env.DSH_DOUYIN_DATA_DIR;
  const config = loadConfig(dir);
  const def = TOOL_DEFINITIONS.find((t) => t.name === toolName);
  if (!def) return { ok: false, error: 'unknown-tool', message: `未知工具 ${toolName}` };
  const pkgGate = packageGate(config, def.pkg);
  if (!pkgGate.ok) return { ok: false, ...pkgGate };
  if (def.write) {
    const { riskGate } = await import('./lib/safety.mjs');
    const rg = riskGate(dir, config);
    if (!rg.ok) return { ok: false, ...rg };
  }
  switch (toolName) {
    case 'dy_watch': {
      const { watchRound } = await import('./lib/browser.mjs');
      return watchRound(dir, { minutes: args?.minutes ?? config.watch.minutesPerRound ?? 10 });
    }
    case 'dy_watch_sources': {
      const { sourcePlan } = await import('./lib/discover.mjs');
      const plan = sourcePlan(dir, config);
      const { watchRound } = await import('./lib/browser.mjs');
      const res = await watchRound(dir, { minutes: args?.minutes ?? config.watch.minutesPerRound ?? 10 });
      return { ...res, sources: plan.sources, sourceMessage: plan.message };
    }
    case 'dy_list_chats': {
      const { listChats } = await import('./lib/browser.mjs');
      return listChats(dir);
    }
    case 'dy_dm_reply': {
      if (!args?.conversationId || !args?.text) return { ok: false, error: 'missing-args', message: 'dy_dm_reply 需要 conversationId 和 text。' };
      const { replyTo } = await import('./lib/dm.mjs');
      return replyTo(dir, { conversationId: args.conversationId, text: args.text });
    }
    case 'dy_dm_reply_stranger': {
      if (!args?.conversationId || !args?.text) return { ok: false, error: 'missing-args', message: 'dy_dm_reply_stranger 需要 conversationId 和 text。' };
      const { replyToStranger } = await import('./lib/dm.mjs');
      return replyToStranger(dir, { conversationId: args.conversationId, text: args.text });
    }
    case 'dy_like':
    case 'dy_comment':
    case 'dy_comment_mention':
    case 'dy_favorite': {
      const kind = toolName === 'dy_like' ? 'like' : toolName === 'dy_comment' ? 'comment' : toolName === 'dy_favorite' ? 'favorite' : 'mention';
      const videoId = args.videoId;
      if (!videoId) return { ok: false, error: 'missing-args', message: `${toolName} 需要 videoId。` };
      const rot = rotationGate(dir, videoId, kind);
      if (!rot.ok) return { ok: false, ...rot };
      if (kind === 'mention') {
        const { canMentionComment } = await import('./lib/interact.mjs');
        const mg = canMentionComment(dir, config);
        if (!mg.ok) return { ok: false, ...mg };
        const { commentCurrentVideo } = await import('./lib/browser.mjs');
        const result = await commentCurrentVideo(dir, { videoId, text: `@${mg.mentionName} ${args.text}` });
        if (result.sent) logAction(dir, { type: 'mention', status: 'sent', videoId, text: String(args.text).slice(0, 200) });
        return result;
      }
      if (kind === 'favorite') {
        const { canFavorite } = await import('./lib/interact.mjs');
        const fg = canFavorite(dir, config);
        if (!fg.ok) return { ok: false, ...fg };
        if (alreadyActedOnVideo(dir, 'favorite', videoId)) return { ok: false, reason: 'duplicate', message: '这个视频已经收藏过，不重复收藏。' };
        const { favoriteCurrentVideo } = await import('./lib/browser.mjs');
        const result = await favoriteCurrentVideo(dir, { videoId });
        if (result.sent) logAction(dir, { type: 'favorite', status: 'sent', videoId });
        return result;
      }
      const gate = canDoAction(dir, kind, { enabled: kind === 'like' ? config.autoLike.enabled : config.autoComment.enabled, cap: kind === 'like' ? config.autoLike.perDay : config.autoComment.perDay });
      if (!gate.ok) return { ok: false, ...gate };
      if (alreadyActedOnVideo(dir, kind, videoId)) return { ok: false, reason: 'duplicate', message: `这个视频已经${kind === 'like' ? '点赞' : '评论'}过，不重复。` };
      const browser = await import('./lib/browser.mjs');
      const result = kind === 'like'
        ? await browser.likeCurrentVideo(dir, { videoId })
        : await browser.commentCurrentVideo(dir, { videoId, text: args.text });
      if (result.sent) logAction(dir, { type: kind, status: 'sent', videoId, text: kind === 'comment' ? String(args.text).slice(0, 200) : undefined });
      return result;
    }
    case 'dy_share': {
      const { planShare, shareVideo } = await import('./lib/share.mjs');
      const video = { videoId: args.videoId, caption: args.caption ?? '', tags: args.tags ?? [] };
      const plan = planShare(dir, video, config);
      if (!plan.ok) return { ok: false, ...plan };
      if (!plan.recipients.length) return { ok: true, shared: 0, message: plan.message };
      const { shareCurrentVideoTo } = await import('./lib/browser.mjs');
      const results = [];
      for (const person of plan.recipients) {
        const gate = canDoAction(dir, 'share', { enabled: config.share.enabled, cap: config.caps.sharePerDay });
        if (!gate.ok) { results.push({ personId: person.id, ok: false, reason: gate.reason }); break; }
        results.push(await shareVideo(dir, video, person, (v, p) => shareCurrentVideoTo(dir, { videoId: v.videoId, personId: p.id, personName: p.name })));
      }
      return { ok: true, shared: results.filter((r) => r.sent).length, results };
    }
    case 'dy_sticker': {
      if (!args?.conversationId) return { ok: false, error: 'missing-args', message: 'dy_sticker 需要 conversationId。' };
      const { pickSticker, canSticker } = await import('./lib/interact.mjs');
      const gate = canSticker(dir, config);
      if (!gate.ok) return { ok: false, ...gate };
      if (!loadAllowed(dir).allowed.some((a) => a.id === args.conversationId)) return { ok: false, reason: 'not-allowed', message: '表情包只能发给白名单里的人。' };
      const picked = pickSticker(dir, args.keyword ?? '');
      if (picked.fallback) {
        const { sendDm } = await import('./lib/browser.mjs');
        const result = await sendDm(dir, { conversationId: args.conversationId, text: `（表情包兜底）${args.keyword ?? '你好'}` });
        if (result.sent) logAction(dir, { type: 'sticker', status: 'sent', conversationId: args.conversationId, fallback: true });
        return { ok: Boolean(result.sent), sent: Boolean(result.sent), fallback: true, message: picked.message };
      }
      logAction(dir, { type: 'sticker', status: 'planned', conversationId: args.conversationId, sticker: picked.sticker?.name ?? '' });
      return { ok: true, planned: true, sticker: picked.sticker, message: '已按关键词挑好表情包（已记进 action-log，状态 planned）：贴纸点击请在 Edge 里人工点发，插件不假装已发出。' };
    }
    case 'dy_collect_sticker': {
      if (!args?.name) return { ok: false, error: 'missing-args', message: 'dy_collect_sticker 需要 name。' };
      const { collectSticker } = await import('./lib/interact.mjs');
      return collectSticker(dir, { name: args.name, keywords: args.keywords ?? '' });
    }
    case 'dy_spark': {
      if (!args?.conversationId) return { ok: false, error: 'missing-args', message: 'dy_spark 需要 conversationId。' };
      const { sparkPlan, logSpark } = await import('./lib/interact.mjs');
      const plan = sparkPlan(dir, config, { personId: args.conversationId, lastContactAt: args.lastContactAt });
      if (!plan.ok) return { ok: false, ...plan };
      const { sendDm } = await import('./lib/browser.mjs');
      const result = await sendDm(dir, { conversationId: args.conversationId, text: plan.text });
      logSpark(dir, { conversationId: args.conversationId, status: result.sent ? 'sent' : 'failed', text: plan.text, warn: plan.warn });
      if (result.sent) logAction(dir, { type: 'spark', status: 'sent', conversationId: args.conversationId });
      return { ok: Boolean(result.sent), sent: Boolean(result.sent), warn: plan.warn, text: plan.text };
    }
    case 'dy_reply_own_comments': {
      const { pickOwnComments } = await import('./lib/interact.mjs');
      const { listOwnComments, commentCurrentVideo } = await import('./lib/browser.mjs');
      const listed = await listOwnComments(dir, { videoId: args.videoId });
      if (!listed.ok) return listed;
      const picked = pickOwnComments(dir, config, listed.comments);
      if (!picked.ok) return { ok: false, ...picked };
      const results = [];
      for (const c of picked.picked) {
        const res = await commentCurrentVideo(dir, { videoId: args.videoId ?? c.id, text: c.text ?? '' }).catch(() => ({ ok: false, uncertain: true }));
        if (res.sent) logAction(dir, { type: 'reply-own', status: 'sent', commentId: c.id, userId: c.userId });
        results.push({ commentId: c.id, sent: Boolean(res.sent) });
      }
      return { ok: true, replied: results.filter((r) => r.sent).length, results };
    }
    case 'dy_hot': { const { getHotList } = await import('./lib/browser.mjs'); return getHotList(dir); }
    case 'dy_search': {
      if (!args?.keyword) return { ok: false, error: 'missing-args', message: 'dy_search 需要 keyword。' };
      const { searchVideos } = await import('./lib/browser.mjs');
      return searchVideos(dir, { keyword: args.keyword });
    }
    case 'dy_following': { const { getFollowingFeed } = await import('./lib/browser.mjs'); return getFollowingFeed(dir); }
    case 'dy_creator_videos': {
      if (!args?.url) return { ok: false, error: 'missing-args', message: 'dy_creator_videos 需要 url。' };
      const { getCreatorVideos } = await import('./lib/browser.mjs');
      return getCreatorVideos(dir, { url: args.url });
    }
    case 'dy_diagnose_creator': {
      const { diagnoseCreatorVideo } = await import('./lib/discover.mjs');
      return diagnoseCreatorVideo(args);
    }
    case 'dy_my_posts': { const { getMyPosts } = await import('./lib/browser.mjs'); return getMyPosts(dir); }
    case 'dy_post': {
      if (!args?.file) return { ok: false, error: 'missing-args', message: 'dy_post 需要 file（本地视频文件路径）。没有文件不发。' };
      const { postVideo } = await import('./lib/post.mjs');
      const { uploadVideoFile } = await import('./lib/browser.mjs');
      return postVideo(dir, config, { file: args.file, caption: args.caption ?? '', uploadFn: ({ file, caption }) => uploadVideoFile(dir, { file, caption }) });
    }
    case 'dy_publish_draft': {
      if (!args?.file) return { ok: false, error: 'missing-args', message: 'dy_publish_draft 需要 file。' };
      const { canPost } = await import('./lib/post.mjs');
      const gate = canPost(dir, config, { file: args.file });
      if (!gate.ok) return { ok: false, ...gate };
      const { renderTitle, renderCaption, isDraft } = await import('./lib/publish.mjs');
      const { appendJsonl } = await import('./lib/store.mjs');
      const entry = { at: new Date().toISOString(), status: 'draft', file: args.file.split(/[\\/]/).pop(), caption: renderCaption(config, args.caption ?? ''), title: renderTitle(config), draft: isDraft(config) };
      appendJsonl(dataPaths(dir).postLogFile, entry);
      return { ok: true, draft: true, ...entry, message: '已记为草稿（只记草稿，不上传）：正式发布请在创作者中心点发布。' };
    }
    case 'dy_comfyui_latest': {
      const { latestComfyuiVideo } = await import('./lib/publish.mjs');
      return latestComfyuiVideo(config);
    }
    case 'dy_patrol': {
      const { inValleyWindow, nextPatrolDelayMs, recordPatrol } = await import('./lib/safety.mjs');
      if (!config.patrol.enabled) return { ok: false, reason: 'disabled', message: '定时巡检未开启（设置页 → 安全包）。' };
      const valley = inValleyWindow(config);
      const state = recordPatrol(dir);
      return { ok: true, valley, nextDelayMs: nextPatrolDelayMs(config), runsToday: state.runsToday, message: valley.ok ? `谷时窗口（${valley.window}）内，可刷。` : '不在谷时窗口内，本次巡检只记录、不刷。' };
    }
    case 'dy_login_status': {
      // v0.3.2: playwright 没装时返回中文原因 + 修法，不扔英文原文。
      try {
        const { checkLoginStatus } = await import('./lib/browser.mjs');
        const { recordLogin } = await import('./lib/safety.mjs');
        const res = await checkLoginStatus(dir);
        if (res.ok) {
          const saved = recordLogin(dir, res.loggedIn);
          const cfg = { ...config, login: saved };
          const { saveConfig } = await import('./lib/config.mjs');
          saveConfig(dir, cfg);
        }
        return res;
      } catch (e) {
        const { toFriendlyBrowserError } = await import('./lib/browser.mjs');
        return toFriendlyBrowserError(e);
      }
    }
    case 'dy_fish_share': {
      const { buildDailyReport } = await import('./lib/report.mjs');
      const { shareToFish, FISH_SHARE_TAG } = await import('./lib/fish.mjs');
      const { appendMemory } = await import('./lib/safety.mjs');
      const date = args?.date ?? new Date().toISOString().slice(0, 10);
      const report = buildDailyReport(dir, date);
      const num = (re) => Number(report.text.match(re)?.[1] ?? 0);
      const summary = {
        date,
        watched: report.watched ?? 0,
        replies: num(/回复私信：(\d+) 条/),
        liked: num(/点赞：(\d+) 次/),
        commented: num(/评论：(\d+) 条/),
        shared: num(/分享：(\d+) 次/),
        posted: num(/发视频：(\d+) 条/),
        note: args?.note ?? '',
      };
      // 同时记进抖音专属记忆（memory/YYYY-MM.md），再追加到大肥鱼 inbox。
      appendMemory(dir, `${FISH_SHARE_TAG} ${date}：看了 ${summary.watched} 条，回了 ${summary.replies} 条私信。已分享给大肥鱼。`);
      const res = shareToFish(dir, summary);
      return { ok: true, ...res, message: `已分享给大肥鱼：${res.line}` };
    }
    case 'dy_cleanup': {
      const { cleanupOld } = await import('./lib/safety.mjs');
      return cleanupOld(dir, { retentionDays: config.cleanup.retentionDays ?? 30, dryRun: Boolean(args?.dryRun) });
    }
    case 'dy_memory': {
      const { appendMemory, readMemory } = await import('./lib/safety.mjs');
      if (!config.memory.enabled) return { ok: false, reason: 'disabled', message: '抖音专属记忆未开启（设置页 → 安全包）。' };
      if (args?.mode === 'add' && args?.line) return appendMemory(dir, args.line);
      return readMemory(dir);
    }
    case 'dy_risk_status': {
      const { riskState, clearRisk } = await import('./lib/safety.mjs');
      if (args?.clear) return { ok: true, cleared: true, state: clearRisk(dir) };
      return { ok: true, ...riskState(dir) };
    }
    case 'dy_analyze_video': {
      const { analyzeVideo } = await import('./lib/watching.mjs');
      return analyzeVideo({ videoId: args.videoId, durationMin: args.durationMin ?? 0, caption: args.caption ?? '' }, config);
    }
    case 'dy_daily_report': {
      const { buildDailyReport } = await import('./lib/report.mjs');
      return buildDailyReport(dir, args?.date);
    }
    case 'dy_astrbot_status': {
      const { astrbotEnabled } = await import('./lib/astrbot.mjs');
      const { actionCounts } = await import('./lib/store.mjs');
      return { ok: true, enabled: astrbotEnabled(config), configured: Boolean(config.astrbot.enabled), port: config.astrbot.port, hasToken: Boolean(config.astrbot.token), webhookConfigured: Boolean(config.astrbot.webhookUrl), countsToday: actionCounts(dir) };
    }
    case 'dy_health_check': {
      const { runHealthCheck } = await import('./lib/health.mjs');
      return runHealthCheck(dir, config);
    }
    default:
      return { ok: false, error: 'unknown-tool', message: `未知工具 ${toolName}` };
  }
}

export async function apply(ctx, config = {}) {
  const dataDir = config.dataDir ?? process.env.DSH_DOUYIN_DATA_DIR;
  const paths = dataPaths(dataDir);
  console.log(`[dsh-douyin-gonzalez] loaded v0.3.3. data dir: ${paths.dir}`);

  let defineTool = null;
  try { ({ defineTool } = await import('@deepseek-ai/dsh-tools')); } catch { defineTool = null; }

  const tools = ctx?.tools;
  if (!tools || typeof tools.register !== 'function') {
    console.log('[dsh-douyin-gonzalez] ctx.tools not available; tools not registered (host half still loaded).');
    return;
  }
  for (const def of TOOL_DEFINITIONS) {
    const execute = async (args) => JSON.stringify(await runTool(def.name, args ?? {}, dataDir), null, 2);
    const tool = defineTool
      ? defineTool({ name: def.name, description: def.description, parameters: def.parameters, output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] }, execute })
      : { name: def.name, description: def.description, parameters: def.parameters, output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] }, execute };
    tools.register(tool);
  }
  console.log(`[dsh-douyin-gonzalez] allowed conversations: ${loadAllowed(dataDir).allowed.length}`);
  console.log(`[dsh-douyin-gonzalez] packages: ${Object.entries(loadConfig(dataDir).packages).map(([k, v]) => `${k}=${v.enabled ? 'on' : 'off'}`).join(', ')}`);

  try {
    const { startAstrbotBridge } = await import('./lib/astrbot.mjs');
    const cfg = loadConfig(dataDir);
    if (cfg.astrbot.enabled) {
      const started = startAstrbotBridge(dataDir, cfg, {
        status: async () => { const { actionCounts } = await import('./lib/store.mjs'); return { enabled: true, port: cfg.astrbot.port, countsToday: actionCounts(dataDir) }; },
        watch: (minutes) => runTool('dy_watch', { minutes }, dataDir),
        dmReply: (conversationId, text) => runTool('dy_dm_reply', { conversationId, text }, dataDir),
        report: (date) => runTool('dy_daily_report', { date }, dataDir),
      });
      console.log(`[dsh-douyin-gonzalez] astrbot bridge: ${started.ok ? started.message : `${started.reason} — ${started.message}`}`);
    }
  } catch (e) {
    console.log(`[dsh-douyin-gonzalez] astrbot bridge failed to start (plugin still works): ${e.message}`);
  }
}
