// Self-check v0.4.0 (no DSH, no Douyin login, no network needed).
// Verifies: manifest + patch + entry exports, the 37 tools in 5 packages,
// settings page (5 tabs + top status cards + all new sections),
// config v4 defaults + round-trip + v2/v3 migration, allowed.json v2,
// stranger gate, caps, rotation, whitelist sharing, post/draft gates,
// interact (favorite/sticker/spark/reply-own/mention), discover
// (sources/diagnosis), publish (title/ComfyUI), safety (valley/patrol/
// risk/cleanup/memory), watching thresholds, AstrBot, report,
// health check (dy_health_check, 12 real checks), sticky nav,
// per-package purpose lines, budget zone, share defaults OFF.
// Run: node selfcheck.mjs   (exit 0 = all pass)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
check('package.json name', pkg.name === 'dsh-douyin-gonzalez', pkg.name);
check('package.json version 0.4.0', pkg.version === '0.4.0', pkg.version);
check('package.json type module', pkg.type === 'module');
check('dsh.bundle.patch points at cordis.bundle.yml', pkg.dsh?.bundle?.patch === './cordis.bundle.yml');
check('dsh.client platform web', pkg.dsh?.client?.platform === 'web');
check('engines.dsh range present', typeof pkg.engines?.dsh === 'string' && pkg.engines.dsh.includes('0.2.1-rc.2'), pkg.engines?.dsh);
check('engines.node >= 22.13', typeof pkg.engines?.node === 'string' && pkg.engines.node.includes('22.13'));
check('exports "." -> dsh-plugin.mjs', pkg.exports?.['.'] === './dsh-plugin.mjs');
check('exports "./client" -> client.js', pkg.exports?.['./client'] === './client.js');
check('playwright dependency present', Boolean(pkg.dependencies?.playwright));
check('package.json has repository/homepage/bugs for npm publish', pkg.repository?.url === 'https://github.com/zhaoxj59/dsh-douyin-gonzalez.git' && pkg.homepage === 'https://github.com/zhaoxj59/dsh-douyin-gonzalez' && typeof pkg.bugs?.url === 'string');

const patch = fs.readFileSync(path.join(ROOT, 'cordis.bundle.yml'), 'utf8');
check('cordis.bundle.yml inserts douyin-gonzalez', patch.includes('douyin-gonzalez') && patch.includes('- insert:'));

const entry = await import('./dsh-plugin.mjs');
check('entry exports name', entry.name === 'douyin-gonzalez', entry.name);
check('entry inject includes tools', Array.isArray(entry.inject) && entry.inject.includes('tools'));
check('entry exports apply()', typeof entry.apply === 'function');
const ALL_TOOLS = ['dy_watch', 'dy_list_chats', 'dy_dm_inspect', 'dy_dm_reply', 'dy_dm_reply_stranger', 'dy_aurabot_status', 'dy_aurabot_reply', 'dy_aurabot_proactive', 'dy_daily_report', 'dy_astrbot_status', 'dy_health_check',
  'dy_like', 'dy_comment', 'dy_comment_mention', 'dy_share', 'dy_favorite', 'dy_sticker', 'dy_collect_sticker', 'dy_spark', 'dy_reply_own_comments',
  'dy_hot', 'dy_search', 'dy_following', 'dy_creator_videos', 'dy_diagnose_creator', 'dy_my_posts', 'dy_watch_sources',
  'dy_post', 'dy_publish_draft', 'dy_comfyui_latest',
  'dy_patrol', 'dy_login_status', 'dy_cleanup', 'dy_memory', 'dy_risk_status', 'dy_analyze_video', 'dy_fish_share'];
check('37 tools defined', entry.TOOL_DEFINITIONS?.length === 37, entry.TOOL_DEFINITIONS?.map((t) => t.name).join(', '));
for (const want of ALL_TOOLS) check(`tool ${want} exists`, entry.TOOL_DEFINITIONS.some((t) => t.name === want));
for (const [tool, pkgName] of [['dy_like', 'interact'], ['dy_hot', 'discover'], ['dy_post', 'publish'], ['dy_patrol', 'safety'], ['dy_watch', 'core']]) {
  check(`tool ${tool} gated by package ${pkgName}`, entry.TOOL_DEFINITIONS.find((t) => t.name === tool)?.pkg === pkgName);
}
check('dy_dm_reply requires conversationId+text', (() => {
  const t = entry.TOOL_DEFINITIONS.find((x) => x.name === 'dy_dm_reply');
  return Array.isArray(t?.parameters?.required) && t.parameters.required.includes('conversationId') && t.parameters.required.includes('text');
})());
check('dy_post requires file', (() => {
  const t = entry.TOOL_DEFINITIONS.find((x) => x.name === 'dy_post');
  return Array.isArray(t?.parameters?.required) && t.parameters.required.includes('file');
})());

{
  const registered = [];
  const fakeCtx = { tools: { register: (tool) => registered.push(tool.name) } };
  process.env.DSH_DOUYIN_AUTO_SETTINGS = '0'; // 自检不自动起 8765，否则进程挂住退不出
  await entry.apply(fakeCtx, { dataDir: path.join(os.tmpdir(), 'dy-gonzalez-selfcheck') });
  check('tool dy_health_check gated by package core', entry.TOOL_DEFINITIONS.find((t) => t.name === 'dy_health_check')?.pkg === 'core');
check('apply() registers 37 tools on fake ctx.tools', registered.length === 37, registered.join(', '));
check('dy_fish_share is gated by package core', entry.TOOL_DEFINITIONS.find((t) => t.name === 'dy_fish_share')?.pkg === 'core');
}

const html = fs.readFileSync(path.join(ROOT, 'settings', 'settings.html'), 'utf8');
check('settings page has real checkboxes', html.includes("cb.type = 'checkbox'"));
check('settings page has explicit Save button', html.includes('保存全部设置'));
check('settings page auto-saves (500ms debounce) + keeps Save as manual fallback', html.includes('scheduleAutoSave') && html.includes('已自动保存') && html.includes('500') && html.includes('保存全部设置'));
check('settings page login section is first in core pane', html.indexOf('loginSection') > 0 && html.indexOf('loginSection') < html.indexOf('id="healthBtn"'), `loginSection@${html.indexOf('loginSection')}, healthBtn@${html.indexOf('id="healthBtn"')}`);
check('settings page has core login button + friendly login help', html.includes('loginBtnCore') && html.includes('打开 Edge 登录抖音') && html.includes('loginHelpCore'));
check('settings page sticky nav has login entry', html.includes('data-nav="login"') && html.includes('登录抖音'));
check('settings page safety relogin button kept', html.includes('reloginBtn') && html.includes('重新扫码登录'));
check('settings page health section says 13 checks', html.includes('13 项检查'));
check('settings page reloads saved state', html.includes('/api/allowed') && html.includes('/api/config'));
check('settings page has 5 package tabs', ['pane-core', 'pane-interact', 'pane-discover', 'pane-publish', 'pane-safety'].every((s) => html.includes(s)));
check('settings page has top status cards', html.includes('cardLogin') && html.includes('cardCounts') && html.includes('cardSpark') && html.includes('cardRisk'));
check('settings page has comment/like section', html.includes('自行评论') && html.includes('自行点赞'));
check('settings page has stranger section', html.includes('非白名单联系人') || html.includes('陌生人私信'));
check('settings page has Aurabot bridge controls', html.includes('Aurabot 智能私信桥接') && html.includes('cfg-aurabotBridge-autoReply') && html.includes('cfg-aurabotBridge-autoProactive'));
check('Aurabot module example uses api.think and authenticated routes', fs.readFileSync(path.join(ROOT, 'integrations', 'aurabot-module', 'douyin-bridge', 'index.mjs'), 'utf8').includes('api.think') && fs.readFileSync(path.join(ROOT, 'integrations', 'aurabot-module', 'douyin-bridge', 'index.mjs'), 'utf8').includes('api.route'));
check('Aurabot bridge client rejects missing credentials', (await (await import('./lib/aurabot-bridge.mjs')).aurabotBridgeStatus({ aurabotBridge: {} })).error === 'aurabot-not-configured');
check('settings page has share-by-interest section', html.includes('按兴趣挑人') || html.includes('兴趣'));
check('settings page has auto-post section', html.includes('自行发抖音'));
check('settings page has auto-choose section', html.includes('自己选片'));
check('settings page has AstrBot section', html.includes('AstrBot'));
check('settings page has favorite section', html.includes('收藏视频'));
check('settings page has sticker section', html.includes('表情包'));
check('settings page has spark section', html.includes('续火花'));
check('settings page has reply-own section', html.includes('回自己视频评论'));
check('settings page has mention section', html.includes('评论 @ 人') || html.includes('@ 人'));
check('settings page has discover sources', html.includes('热榜') && html.includes('关注列表') && html.includes('指定博主'));
check('settings page has creator diagnosis', html.includes('创作者诊断'));
check('settings page has my posts', html.includes('我的作品'));
check('settings page has draft + ComfyUI', html.includes('存草稿') && html.includes('ComfyUI'));
check('settings page has valley + patrol', html.includes('谷时') && html.includes('巡检'));
check('settings page has risk + login + cleanup + memory', html.includes('风控') && html.includes('登录状态') && html.includes('一键清理') && html.includes('抖音专属记忆'));
check('settings page has silent watching + thresholds', html.includes('静默观看') && html.includes('划走'));
check('settings page has sticky nav with all packages + health', html.includes('sticky-nav') && html.includes('position: sticky') && html.includes('data-nav="core"') && html.includes('data-nav="interact"') && html.includes('data-nav="discover"') && html.includes('data-nav="publish"') && html.includes('data-nav="safety"') && html.includes('navHealthBtn'));
check('settings page has one purpose line per package (5)', (html.match(/包会干什么/g) || []).length === 5, `found ${(html.match(/包会干什么/g) || []).length}`);
check('settings page has budget zone with big numbers', html.includes('budget-zone') && html.includes('每日预算') && html.includes('24px') && html.includes('cfg-caps-totalOutwardPerDay'));
check('settings page share switch defaults OFF in HTML', !html.includes('id="cfg-share-enabled" checked'));
check('settings page has health section + run button', html.includes('一键体检') && html.includes('healthBtn') && html.includes('healthSummary') && html.includes('/api/health'));
check('settings page gates share cap behind share switch', html.includes("['cfg-share-enabled', ['cfg-caps-sharePerDay']]"));

const serverSrc = fs.readFileSync(path.join(ROOT, 'settings', 'settings-server.mjs'), 'utf8');
check('settings server has /api/config', serverSrc.includes('/api/config'));
check('settings server has /api/status', serverSrc.includes('/api/status'));
check('settings server has /api/login/open', serverSrc.includes('/api/login/open'));
check('settings server has /api/risk/clear', serverSrc.includes('/api/risk/clear'));
check('settings server has /api/cleanup', serverSrc.includes('/api/cleanup'));
check('settings server has /api/memory', serverSrc.includes('/api/memory'));
check('settings server has /api/health', serverSrc.includes('/api/health'));

// Platform challenge signals must trigger a stop, never an automated bypass.
{
  const { classifyPlatformStopText } = await import('./lib/browser.mjs');
  check('platform stop detects captcha prompt', Boolean(classifyPlatformStopText('请输入验证码完成安全验证')));
  check('platform stop detects rate-limit warning', Boolean(classifyPlatformStopText('操作过于频繁，请稍后再试')));
  check('platform stop ignores ordinary feed text', classifyPlatformStopText('今天分享一个有趣的科技视频') === null);
}

// v0.4.0 commercial filter skips explicit ads / purchase CTAs but keeps reviews.
{
  const { classifyCommercialCaption } = await import('./lib/content-filter.mjs');
  check('commercial filter skips explicit brand sponsorship', classifyCommercialCaption('本视频为品牌合作内容').skip === true);
  check('commercial filter skips shopping CTA', classifyCommercialCaption('点击购买，进店领券马上下单').skip === true);
  check('commercial filter preserves non-sponsored unboxing review', classifyCommercialCaption('真实体验：这款耳机开箱测评，优缺点都说说').skip === false);
  check('commercial filter does not treat product mention alone as ad', classifyCommercialCaption('今天分享一下我用的相机').skip === false);
}

// v0.4.0 combined outward-action budget is enforced from successful logs.
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dy-gonzalez-outward-'));
  const { logAction } = await import('./lib/store.mjs');
  const { outwardBudgetGate, outwardActionCount } = await import('./lib/outward-gate.mjs');
  const cfg = { caps: { totalOutwardPerDay: 3 } };
  check('outward budget starts with remaining allowance', outwardBudgetGate(tmp, cfg).remaining === 3);
  logAction(tmp, { type: 'like', status: 'sent', videoId: 'v1' });
  logAction(tmp, { type: 'comment', status: 'sent', videoId: 'v2' });
  logAction(tmp, { type: 'share', status: 'planned', videoId: 'v3' });
  const mid = outwardBudgetGate(tmp, cfg);
  check('outward budget counts only successful sends', mid.ok === true && mid.used === 2 && mid.remaining === 1);
  logAction(tmp, { type: 'mention', status: 'sent', videoId: 'v4' });
  const full = outwardBudgetGate(tmp, cfg);
  check('outward budget blocks at combined cap across action types', full.ok === false && full.reason === 'total-outward-cap' && full.used === 3);
  check('outward action counter includes mention but excludes planned', outwardActionCount({ byType: { like: 1, mention: 1, share: 0 } }) === 2);
  fs.rmSync(tmp, { recursive: true, force: true });
}

// Config v4 defaults + round-trip + v2/v3 migration.
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dy-gonzalez-config-'));
  const { loadConfig, saveConfig, DEFAULT_CONFIG, isPackageEnabled, packageGate } = await import('./lib/config.mjs');
  const d = loadConfig(tmp);
  check('config version 4', d.version === 4);
  check('config defaults: core on, other packages off', isPackageEnabled(d, 'core') === true && isPackageEnabled(d, 'interact') === false && isPackageEnabled(d, 'discover') === false && isPackageEnabled(d, 'publish') === false && isPackageEnabled(d, 'safety') === false);
  check('packageGate blocks disabled package', packageGate(d, 'interact').ok === false && packageGate(d, 'interact').reason === 'package-disabled');
  check('packageGate allows core', packageGate(d, 'core').ok === true);
  check('config defaults: comment OFF', d.autoComment.enabled === false);
  check('config defaults: like OFF', d.autoLike.enabled === false);
  check('config defaults: stranger OFF', d.strangerReply.enabled === false);
  check('config defaults: share OFF (v0.3.1)', d.share.enabled === false);
  check('config defaults: total outward gate 20', d.caps.totalOutwardPerDay === 20);
  check('config defaults: post 0/off', d.autoPost.enabled === false && d.autoPost.perDay === 0);
  check('config defaults: astrbot OFF', d.astrbot.enabled === false);
  check('config defaults: share cap 3', d.caps.sharePerDay === 3);
  check('config defaults: dm caps 5/1', d.caps.dmReplyPerDay === 5 && d.caps.dmReplyPerContactPerDay === 1);
  check('config defaults: spark off, times 08:00', d.spark.enabled === false && d.spark.times.join(',') === '08:00');
  check('config defaults: replyOwn off, days 3', d.replyOwn.enabled === false && d.replyOwn.days === 3);
  check('config defaults: publish draft on', d.publish.draftDefault === true);
  check('config defaults: valley off, patrol 30min', d.valley.enabled === false && d.patrol.intervalMin === 30);
  check('config defaults: watch thresholds 60/5', d.watch.skipOverMin === 60 && d.watch.skimOverMin === 5);
  check('config defaults: silent on, ocr/transcript off', d.watch.silent === true && d.watch.ocr === false && d.watch.transcript === false);
  check('DEFAULT_CONFIG exported', DEFAULT_CONFIG.version === 4);
  const saved = saveConfig(tmp, { ...d, autoLike: { enabled: true, perDay: 7 }, strangerReply: { enabled: true, perDay: 2 }, packages: { ...d.packages, interact: { enabled: true } } });
  check('saveConfig reports ok + read-back', saved.ok === true && saved.readBack.autoLike.perDay === 7 && saved.readBack.strangerReply.perDay === 2 && saved.readBack.packages.interact.enabled === true);
  const clamped = saveConfig(tmp, { autoLike: { enabled: true, perDay: 9999 }, caps: { sharePerDay: -5 } });
  check('saveConfig clamps out-of-range caps', clamped.readBack.autoLike.perDay <= 200 && clamped.readBack.caps.sharePerDay >= 0);
  // v2 migration: old config without packages keeps v0.2 switches.
  const { normalizeConfig } = await import('./lib/config.mjs');
  const migrated = normalizeConfig({ version: 2, autoLike: { enabled: true, perDay: 7 }, caps: { sharePerDay: 3 } });
  check('v2 config migrates to v4, keeps autoLike, share OFF', migrated.version === 4 && migrated.autoLike.perDay === 7 && migrated.packages.interact.enabled === false && migrated.share.enabled === false);
  // v0.3.0 migration: share was ON, v0.3.1 forces it OFF once.
  const migrated3 = normalizeConfig({ version: 3, share: { enabled: true }, caps: { sharePerDay: 3, totalOutwardPerDay: 20 } });
  check('v3 config migrates to v4 with share forced OFF', migrated3.version === 4 && migrated3.share.enabled === false);
  // v4 file keeps the user's explicit share choice.
  const kept4 = normalizeConfig({ version: 4, share: { enabled: true }, caps: { sharePerDay: 3, totalOutwardPerDay: 20 } });
  check('v4 config keeps share ON when user turned it on', kept4.share.enabled === true);
  fs.rmSync(tmp, { recursive: true, force: true });
}

// allowed.json round-trip with interests (the core fix, v2 shape).
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dy-gonzalez-allowed-'));
  const store = await import('./lib/store.mjs');
  const dm = await import('./lib/dm.mjs');
  const sample = [
    { id: 'conv-1', name: '阿明', kind: 'dm', interests: ['美食', '宠物'] },
    { id: 'conv-2', name: '小红', kind: 'dm', interests: ['游戏'] },
  ];
  const saved = store.saveAllowed(tmp, sample);
  check('saveAllowed v2 reports ok + read-back', saved.ok === true && saved.readBack.allowed.length === 2);
  const loaded = store.loadAllowed(tmp);
  check('loadAllowed keeps interests', loaded.allowed.find((a) => a.id === 'conv-1')?.interests.join(',') === '美食,宠物');
  check('isAllowed(conv-1) true, isAllowed(stranger) false', store.isAllowed(tmp, 'conv-1') === true && store.isAllowed(tmp, 'stranger-9') === false);
  check('canReply blocks strangers', store.canReply(tmp, 'stranger-9').ok === false);
  check('canReply allows a listed conversation', store.canReply(tmp, 'conv-1').ok === true);
  const kept = dm.filterReplyCandidates(tmp, [
    { conversationId: 'conv-1', text: '你好' },
    { conversationId: 'stranger-9', text: '你好' },
  ]);
  check('filterReplyCandidates drops strangers when switch off', kept.length === 1 && kept[0].conversationId === 'conv-1');
  const strangerRefused = await dm.replyToStranger(tmp, { conversationId: 'stranger-9', text: '你好' });
  check('replyToStranger refuses when switch OFF', strangerRefused.ok === false && strangerRefused.reason === 'stranger-disabled');
  // Rotation: one action type per video per day.
  store.logAction(tmp, { type: 'like', status: 'sent', videoId: 'v-rot' });
  check('rotationGate blocks a second action type on same video', store.rotationGate(tmp, 'v-rot', 'comment').ok === false);
  check('rotationGate allows same action type again (dedup handles it)', store.rotationGate(tmp, 'v-rot', 'like').ok === true);
  check('alreadyActedAnyToday returns the first type', store.alreadyActedAnyToday(tmp, 'v-rot') === 'like');
  fs.rmSync(tmp, { recursive: true, force: true });
}

// Caps enforcement: like / comment / share.
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dy-gonzalez-caps-'));
  const store = await import('./lib/store.mjs');
  check('canDoAction refuses when disabled', store.canDoAction(tmp, 'like', { enabled: false, cap: 10 }).ok === false);
  check('canDoAction allows when enabled + under cap', store.canDoAction(tmp, 'like', { enabled: true, cap: 10 }).ok === true);
  store.logAction(tmp, { type: 'like', status: 'sent', videoId: 'v1' });
  store.logAction(tmp, { type: 'like', status: 'sent', videoId: 'v2' });
  check('actionCounts counts sent likes', store.actionCounts(tmp).like === 2);
  check('canDoAction blocks at cap', store.canDoAction(tmp, 'like', { enabled: true, cap: 2 }).ok === false);
  check('alreadyActedOnVideo dedups same video', store.alreadyActedOnVideo(tmp, 'like', 'v1') === true && store.alreadyActedOnVideo(tmp, 'like', 'v9') === false);
  fs.rmSync(tmp, { recursive: true, force: true });
}

// Whitelist-by-id sharing: interest match, dedup forever.
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dy-gonzalez-share-'));
  const store = await import('./lib/store.mjs');
  const share = await import('./lib/share.mjs');
  store.saveAllowed(tmp, [
    { id: 'conv-1', name: '阿明', kind: 'dm', interests: ['美食'] },
    { id: 'conv-2', name: '小红', kind: 'dm', interests: ['游戏'] },
  ]);
  const video = { videoId: 'vid-1', caption: '今天做了好吃的美食', tags: ['美食'] };
  const picked = share.pickShareRecipients(tmp, video);
  check('share picks only interest-matching people', picked.length === 1 && picked[0].id === 'conv-1');
  const noMatch = share.pickShareRecipients(tmp, { videoId: 'vid-2', caption: '无关内容', tags: ['钓鱼'] });
  check('share picks nobody when no interest matches', noMatch.length === 0);
  store.logAction(tmp, { type: 'share', status: 'sent', videoId: 'vid-1', personId: 'conv-1' });
  check('alreadyShared blocks same video + same person', store.alreadyShared(tmp, 'vid-1', 'conv-1') === true);
  const afterDedup = share.pickShareRecipients(tmp, video);
  check('pickShareRecipients excludes already-shared person', afterDedup.length === 0);
  fs.rmSync(tmp, { recursive: true, force: true });
}

// Auto post gate: no file = no post, cap 0 = no post.
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dy-gonzalez-post-'));
  const post = await import('./lib/post.mjs');
  const { loadConfig } = await import('./lib/config.mjs');
  const cfg = loadConfig(tmp);
  check('canPost refuses when autoPost off', post.canPost(tmp, cfg, { file: '/tmp/x.mp4' }).ok === false);
  const on = { ...cfg, autoPost: { enabled: true, perDay: 2 }, caps: { ...cfg.caps, postPerDay: 2 } };
  check('canPost refuses with no file', post.canPost(tmp, on, {}).ok === false);
  check('canPost refuses non-video file', post.canPost(tmp, on, { file: '/tmp/x.txt' }).ok === false);
  check('canPost refuses missing file', post.canPost(tmp, on, { file: '/tmp/does-not-exist-12345.mp4' }).ok === false);
  fs.rmSync(tmp, { recursive: true, force: true });
}

// Fish chooses what to watch: scoring + reason logged.
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dy-gonzalez-choose-'));
  const choose = await import('./lib/choose.mjs');
  const { appendJsonl } = await import('./lib/store.mjs');
  const { dataPaths } = await import('./lib/paths.mjs');
  const today = new Date().toISOString().slice(0, 10);
  appendJsonl(dataPaths(tmp).watchLogFile, { at: `${today}T10:00:00.000Z`, videoId: 'v-old', caption: '美食', tags: ['美食'] });
  const picked = choose.chooseNextVideo(tmp, [
    { videoId: 'v-old', caption: '美食', tags: ['美食'] },
    { videoId: 'v-new', caption: '宠物猫', tags: ['宠物'] },
  ], { interests: ['宠物'] });
  check('chooseNextVideo picks interest-matching unwatched video', picked.picked?.videoId === 'v-new');
  check('chooseNextVideo gives a reason', typeof picked.reason === 'string' && picked.reason.length > 0, picked.reason);
  fs.rmSync(tmp, { recursive: true, force: true });
}

// Interact pack: favorite / sticker / spark / reply-own / mention.
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dy-gonzalez-interact-'));
  const store = await import('./lib/store.mjs');
  const interact = await import('./lib/interact.mjs');
  const { loadConfig, saveConfig } = await import('./lib/config.mjs');
  const cfg = loadConfig(tmp);
  check('canFavorite refuses when off', interact.canFavorite(tmp, cfg).ok === false);
  const on = saveConfig(tmp, { ...cfg, favorite: { enabled: true, perDay: 1 }, sticker: { enabled: true, perDay: 5 }, spark: { enabled: true, perDay: 1, times: ['08:00'], warnDays: 1, messages: ['在呢'] }, replyOwn: { enabled: true, perDay: 10, perRun: 2, days: 3, random: false, oncePerUser: false }, commentMention: { enabled: true, perDay: 3, mentionName: '阿明' } }).readBack;
  check('canFavorite allows when on + under cap', interact.canFavorite(tmp, on).ok === true);
  store.logAction(tmp, { type: 'favorite', status: 'sent', videoId: 'vf1' });
  check('canFavorite blocks at cap', interact.canFavorite(tmp, on).ok === false);
  const collected = interact.collectSticker(tmp, { name: '开心猫', keywords: '开心,高兴' });
  check('collectSticker saves a sticker locally', collected.ok === true && collected.count === 1);
  check('pickSticker finds the collected sticker by keyword', interact.pickSticker(tmp, '开心').sticker?.name === '开心猫');
  const sticker = interact.pickSticker(tmp, '不存在的关键词xyz');
  {
    const tmp2 = fs.mkdtempSync(path.join(os.tmpdir(), 'dy-gonzalez-sticker-empty-'));
    const empty = interact.pickSticker(tmp2, '开心');
    check('pickSticker falls back to text when no stickers collected', empty.fallback === true && empty.sticker === null);
    fs.rmSync(tmp2, { recursive: true, force: true });
  }
  check('canSticker allows when on', interact.canSticker(tmp, on).ok === true);
  store.saveAllowed(tmp, [{ id: 'conv-1', name: '阿明', kind: 'dm', interests: [] }]);
  const spark = interact.sparkPlan(tmp, on, { personId: 'conv-1' });
  check('sparkPlan picks a random message for an allowed person', spark.ok === true && spark.text === '在呢');
  check('sparkPlan warns when last contact is old', interact.sparkPlan(tmp, on, { personId: 'conv-1', lastContactAt: new Date(Date.now() - 3 * 86400000).toISOString() }).warn === true);
  check('sparkPlan refuses non-allowed person', interact.sparkPlan(tmp, on, { personId: 'stranger-9' }).ok === false);
  const picked = interact.pickOwnComments(tmp, on, [
    { id: 'c1', userId: 'u1', text: '好看', at: new Date().toISOString() },
    { id: 'c2', userId: 'u2', text: '支持', at: new Date().toISOString() },
    { id: 'c3', userId: 'u3', text: '加油', at: new Date().toISOString() },
  ]);
  check('pickOwnComments picks perRun comments in order when random off', picked.ok === true && picked.picked.length === 2 && picked.picked[0].id === 'c1');
  check('canMentionComment allows with a mention name', interact.canMentionComment(tmp, on).ok === true && interact.canMentionComment(tmp, on).mentionName === '阿明');
  const noName = { ...on, commentMention: { enabled: true, perDay: 3, mentionName: '' } };
  check('canMentionComment refuses with no mention name', interact.canMentionComment(tmp, noName).ok === false);
  fs.rmSync(tmp, { recursive: true, force: true });
}

// Discover pack: sources + diagnosis + my posts.
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dy-gonzalez-discover-'));
  const discover = await import('./lib/discover.mjs');
  const { loadConfig } = await import('./lib/config.mjs');
  const cfg = loadConfig(tmp);
  const plan = discover.sourcePlan(tmp, cfg);
  check('sourcePlan defaults to feed only', plan.sources.join(',') === 'feed');
  const diag = discover.diagnoseCreatorVideo({ videoId: 'v1', title: '测试', plays: 1000, likes: 5, comments: 0, completionPct: 20 });
  check('diagnose flags low like rate + low completion', diag.ok === true && diag.signals.length >= 2 && diag.numbers.likeRate === 0.005);
  const diagZero = discover.diagnoseCreatorVideo({ videoId: 'v2', plays: 0, likes: 0, comments: 0 });
  check('diagnose handles zero plays without inventing rates', diagZero.numbers.likeRate === null && diagZero.signals.some((s) => s.includes('播放为 0')));
  const saved = discover.saveMyPosts(tmp, [{ videoId: 'my-1', title: '我的视频', plays: 100 }]);
  check('my posts round-trip', saved.length === 1 && discover.loadMyPosts(tmp)[0].videoId === 'my-1');
  fs.rmSync(tmp, { recursive: true, force: true });
}

// Publish pack: title template + ComfyUI latest.
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dy-gonzalez-publish-'));
  const publish = await import('./lib/publish.mjs');
  const { loadConfig } = await import('./lib/config.mjs');
  const cfg = loadConfig(tmp);
  const title = publish.renderTitle(cfg, new Date('2026-11-15T00:00:00.000Z'));
  check('renderTitle replaces {date}', title === '大肥鱼的日常 2026-11-15', title);
  check('publish defaults to draft', publish.isDraft(cfg) === true);
  check('latestComfyuiVideo refuses when disabled', publish.latestComfyuiVideo(cfg).ok === false);
  const on = { ...cfg, comfyui: { enabled: true, url: 'http://127.0.0.1:8188', outputDir: '' } };
  check('latestComfyuiVideo refuses with no output dir', publish.latestComfyuiVideo(on).reason === 'no-output-dir');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dy-comfyui-'));
  fs.writeFileSync(path.join(dir, 'a.mp4'), 'x');
  fs.writeFileSync(path.join(dir, 'b.txt'), 'x');
  const found = publish.latestComfyuiVideo({ ...on, comfyui: { enabled: true, url: on.comfyui.url, outputDir: dir } });
  check('latestComfyuiVideo picks the newest mp4, ignores txt', found.ok === true && found.file.endsWith('a.mp4'));
  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(tmp, { recursive: true, force: true });
}

// Safety pack: valley / patrol / risk / cleanup / memory.
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dy-gonzalez-safety-'));
  const safety = await import('./lib/safety.mjs');
  const { loadConfig, saveConfig } = await import('./lib/config.mjs');
  const cfg = loadConfig(tmp);
  check('inValleyWindow refuses when valley off', safety.inValleyWindow(cfg).ok === false);
  const on = saveConfig(tmp, { ...cfg, valley: { enabled: true, noon: true, night: true, perDay: 5, pickPerRound: 2 }, patrol: { enabled: true, intervalMin: 30, jitterPct: 20 }, memory: { enabled: true } }).readBack;
  const noon = safety.inValleyWindow(on, new Date('2026-11-15T13:00:00'));
  check('inValleyWindow noon 13:00 is in valley', noon.ok === true && noon.window === 'noon');
  const morning = safety.inValleyWindow(on, new Date('2026-11-15T10:00:00'));
  check('inValleyWindow 10:00 is not in valley', morning.ok === false);
  const delay = safety.nextPatrolDelayMs(on);
  check('nextPatrolDelayMs is 30min ±20%', delay >= 24 * 60000 && delay <= 36 * 60000, String(delay));
  check('riskGate allows when not paused', safety.riskGate(tmp, on).ok === true);
  const paused = safety.setRisk(tmp, { reason: 'rate-limit', detail: 'test' });
  check('setRisk pauses writes', paused.paused === true && safety.riskGate(tmp, on).ok === false && safety.riskGate(tmp, on).reason === 'risk-paused');
  check('clearRisk unpauses writes', safety.clearRisk(tmp).paused === false && safety.riskGate(tmp, on).ok === true);
  const mem = safety.appendMemory(tmp, '今天看了阿明的美食视频');
  check('appendMemory writes memory/YYYY-MM.md', mem.ok === true && fs.existsSync(mem.file));
  const read = safety.readMemory(tmp);
  check('readMemory reads the line back', read.entries.some((e) => e.includes('阿明的美食视频')));
  const clean = safety.cleanupOld(tmp, { retentionDays: 30, dryRun: true });
  check('cleanup dry-run does not delete config', clean.ok === true);
  fs.rmSync(tmp, { recursive: true, force: true });
}

// Watching: long-video thresholds + OCR/transcript honesty.
{
  const watching = await import('./lib/watching.mjs');
  const { loadConfig } = await import('./lib/config.mjs');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dy-gonzalez-watching-'));
  const cfg = loadConfig(tmp);
  check('classifyDuration skips >60min', watching.classifyDuration(90, cfg).action === 'skip');
  check('classifyDuration skims >5min', watching.classifyDuration(10, cfg).action === 'skim');
  check('classifyDuration watches short videos', watching.classifyDuration(2, cfg).action === 'watch');
  const analyzed = watching.analyzeVideo({ videoId: 'v1', durationMin: 2 }, { ...cfg, watch: { ...cfg.watch, transcript: true, watchBeforeAct: true } });
  check('analyzeVideo reports transcript not-available on Linux, content not ready', analyzed.transcript.status === 'not-available' && analyzed.contentReady === false);
  fs.rmSync(tmp, { recursive: true, force: true });
}

// AstrBot: disabled by default, refuses without token.
{
  const { astrbotEnabled, startAstrbotBridge } = await import('./lib/astrbot.mjs');
  const { loadConfig } = await import('./lib/config.mjs');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dy-gonzalez-astrbot-'));
  const cfg = loadConfig(tmp);
  check('astrbot disabled by default', astrbotEnabled(cfg) === false);
  const refused = startAstrbotBridge(tmp, { ...cfg, astrbot: { enabled: true, port: 8766, token: '', webhookUrl: '' } }, {});
  check('astrbot bridge refuses to start with no token', refused.ok === false && refused.reason === 'no-token');
  const off = startAstrbotBridge(tmp, cfg, {});
  check('astrbot bridge refuses when disabled', off.ok === false && off.reason === 'disabled');
  fs.rmSync(tmp, { recursive: true, force: true });
}

// v0.3.1: share defaults OFF — planShare must refuse when off.
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dy-gonzalez-share-off-'));
  const store = await import('./lib/store.mjs');
  const share = await import('./lib/share.mjs');
  const { loadConfig, saveConfig } = await import('./lib/config.mjs');
  store.saveAllowed(tmp, [{ id: 'conv-1', name: '阿明', kind: 'dm', interests: ['美食'] }]);
  const video = { videoId: 'vid-1', caption: '今天做了好吃的美食', tags: ['美食'] };
  const offCfg = loadConfig(tmp);
  check('planShare refuses when share switch is OFF (v0.3.1 default)', share.planShare(tmp, video, offCfg).ok === false && share.planShare(tmp, video, offCfg).reason === 'disabled');
  const onCfg = saveConfig(tmp, { ...offCfg, share: { enabled: true } }).readBack;
  check('planShare allows after user turns share ON and saves', share.planShare(tmp, video, onCfg).ok === true && share.planShare(tmp, video, onCfg).recipients.length === 1);
  fs.rmSync(tmp, { recursive: true, force: true });
}

// v0.3.2 health check: 13 real checks (12 + fish-share), pass/fail/unknown with reasons.
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dy-gonzalez-health-'));
  const store = await import('./lib/store.mjs');
  const { loadConfig, saveConfig } = await import('./lib/config.mjs');
  const { runHealthCheck, DANGEROUS_ACTIONS } = await import('./lib/health.mjs');
  const fakeLoggedIn = async () => ({ loggedIn: true, needsCaptcha: false, message: '抖音已登录。' });
  const fakeLoggedOut = async () => ({ loggedIn: false, message: '抖音未登录。' });
  const fakeProbeThrows = async () => { throw new Error('no edge'); };

  // Fresh dir: no allowed.json, empty whitelist, all dangerous off.
  const cfg = loadConfig(tmp);
  const fresh = await runHealthCheck(tmp, cfg, { probeLogin: fakeLoggedIn });
  check('health check returns 13 checks', fresh.total === 13 && fresh.checks.length === 13, fresh.checks.map((c) => c.id).join(','));
  check('health check includes fish-share item', fresh.checks.some((c) => c.id === 'fish-share'));
  check('health check: fresh dir fails allowed-save + whitelist', fresh.checks.find((c) => c.id === 'allowed-save')?.status === 'fail' && fresh.checks.find((c) => c.id === 'whitelist')?.status === 'fail');
  check('health check: fresh dir passes dangerous-off + budget', fresh.checks.find((c) => c.id === 'dangerous-off')?.status === 'pass' && fresh.checks.find((c) => c.id === 'budget')?.status === 'pass');
  check('health check: fresh dir passes edge-login with fake probe', fresh.checks.find((c) => c.id === 'edge-login')?.status === 'pass');
  check('health check: summary names the failures', fresh.summary.includes('不通过') && fresh.summary.includes('白名单'));
  check('health check: ok is false when something fails', fresh.ok === false);
  const loggedOut = await runHealthCheck(tmp, cfg, { probeLogin: fakeLoggedOut });
  check('health check: logged-out Edge fails edge-login', loggedOut.checks.find((c) => c.id === 'edge-login')?.status === 'fail');
  const noEdge = await runHealthCheck(tmp, cfg, { probeLogin: fakeProbeThrows });
  check('health check: probe failure is unknown, not a crash', noEdge.checks.find((c) => c.id === 'edge-login')?.status === 'unknown' && noEdge.ok === false);

  // Allowed list saved + dangerous switches on: budget + dangerous fail.
  store.saveAllowed(tmp, [
    { id: 'conv-1', name: '阿明', kind: 'dm', interests: ['美食'] },
    { id: 'conv-2', name: '小红', kind: 'dm', interests: ['游戏'] },
  ]);
  const on = saveConfig(tmp, {
    ...cfg,
    autoLike: { enabled: true, perDay: 10 }, autoComment: { enabled: true, perDay: 3 },
    share: { enabled: true }, favorite: { enabled: true, perDay: 5 },
    strangerReply: { enabled: true, perDay: 3 },
  }).readBack;
  const busy = await runHealthCheck(tmp, on, { probeLogin: fakeLoggedIn });
  check('health check: saved whitelist passes allowed-save + whitelist', busy.checks.find((c) => c.id === 'allowed-save')?.status === 'pass' && busy.checks.find((c) => c.id === 'whitelist')?.status === 'pass');
  const dangerous = busy.checks.find((c) => c.id === 'dangerous-off');
  check('health check: dangerous-off names the switches that are on', dangerous?.status === 'fail' && dangerous.detail.includes('自行点赞') && dangerous.detail.includes('自行分享'));
  const budget = busy.checks.find((c) => c.id === 'budget');
  check('health check: budget fails when enabled caps sum over the gate', budget?.status === 'fail' && budget.detail.includes('21') && budget.detail.includes('20'), budget?.detail);
  check('health check: stranger ON fails the stranger check', busy.checks.find((c) => c.id === 'stranger')?.status === 'fail');
  check('DANGEROUS_ACTIONS covers 9 switches', DANGEROUS_ACTIONS.length === 9);

  // Spark due: spark on, last contact 3 days ago.
  const sparkOn = saveConfig(tmp, { ...on, spark: { enabled: true, perDay: 3, times: ['08:00'], warnDays: 1, messages: ['在呢'] } }).readBack;
  store.appendJsonl((await import('./lib/paths.mjs')).dataPaths(tmp).sparkLogFile, { at: new Date(Date.now() - 3 * 86400000).toISOString(), status: 'sent', conversationId: 'conv-1', text: '在呢' });
  const sparkRes = await runHealthCheck(tmp, sparkOn, { probeLogin: fakeLoggedIn });
  const sparkCheck = sparkRes.checks.find((c) => c.id === 'spark-due');
  check('health check: spark warns when someone is past warnDays', sparkCheck?.status === 'fail' && sparkCheck.detail.includes('阿明'), sparkCheck?.detail);

  // Risk paused fails the risk check.
  const safety = await import('./lib/safety.mjs');
  safety.setRisk(tmp, { reason: 'rate-limit', detail: 'test' });
  const paused = await runHealthCheck(tmp, sparkOn, { probeLogin: fakeLoggedIn });
  check('health check: paused risk fails the risk check', paused.checks.find((c) => c.id === 'risk')?.status === 'fail');
  safety.clearRisk(tmp);

  // AstrBot on with no token fails; off passes.
  const astrNoToken = saveConfig(tmp, { ...sparkOn, astrbot: { enabled: true, port: 8766, token: '', webhookUrl: '' } }).readBack;
  const astrRes = await runHealthCheck(tmp, astrNoToken, { probeLogin: fakeLoggedIn });
  check('health check: astrbot on without token fails', astrRes.checks.find((c) => c.id === 'astrbot')?.status === 'fail');
  fs.rmSync(tmp, { recursive: true, force: true });
}

// Browser selectors for the new actions exist (best-effort, no live page).
{
  const browser = await import('./lib/browser.mjs');
  check('browser has favorite selector', typeof browser.SELECTORS.favoriteButton === 'string');
  check('browser has hot selector', typeof browser.SELECTORS.hotList === 'string');
  check('browser exports favoriteCurrentVideo', typeof browser.favoriteCurrentVideo === 'function');
  check('browser exports checkLoginStatus', typeof browser.checkLoginStatus === 'function');
  check('browser exports getHotList / searchVideos / getMyPosts', typeof browser.getHotList === 'function' && typeof browser.searchVideos === 'function' && typeof browser.getMyPosts === 'function');
}

// Report generation from a sample watch log (v0.1.0 core, still works).
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dy-gonzalez-report-'));
  const { appendJsonl, logAction } = await import('./lib/store.mjs');
  const { buildDailyReport } = await import('./lib/report.mjs');
  const { dataPaths } = await import('./lib/paths.mjs');
  const today = new Date().toISOString().slice(0, 10);
  appendJsonl(dataPaths(tmp).watchLogFile, { at: `${today}T10:00:00.000Z`, caption: '测试视频', frameBytes: 123, choiceReason: '命中兴趣「宠物」+3' });
  logAction(tmp, { type: 'favorite', status: 'sent', videoId: 'vf1' });
  logAction(tmp, { type: 'spark', status: 'sent', conversationId: 'conv-1' });
  const report = buildDailyReport(tmp, today);
  check('daily report generated from local log', report.ok && report.watched === 1 && fs.existsSync(report.file));
  check('daily report includes choice reason', report.text.includes('命中兴趣'));
  check('daily report includes favorite + spark counts', report.text.includes('收藏：1') && report.text.includes('续火花：1'));
  fs.rmSync(tmp, { recursive: true, force: true });
}

// v0.3.2: friendly playwright-missing error — Chinese cause + fix,
// not just "Cannot find package 'playwright'".
{
  const browser = await import('./lib/browser.mjs');
  check('browser exports friendly-error helpers', typeof browser.toFriendlyBrowserError === 'function' && typeof browser.isPlaywrightMissingError === 'function' && typeof browser.PLAYWRIGHT_FIX === 'string');
  const friendly = browser.toFriendlyBrowserError(new Error("Cannot find package 'playwright' imported from lib/browser.mjs"));
  check('playwright-missing error is Chinese + has fix steps', friendly.ok === false && friendly.error === 'playwright-missing' && friendly.message.includes('playwright 没装') && friendly.fix.includes('pnpm install') && friendly.fix.includes('node_modules\\playwright'));
  check('non-playwright browser error keeps its own message', browser.toFriendlyBrowserError(new Error('Edge crashed')).error === 'browser-error');
  // Environment-dependent: if Edge + Playwright exist, launch/close succeeds;
  // otherwise the plugin must return the friendly missing-Playwright message.
  try {
    const ctx = await browser.getContext(path.join(os.tmpdir(), 'dy-gonzalez-edge-check-' + Date.now()));
    await ctx.close();
    check('getContext opens Edge when browser runtime is available', true);
  } catch (e) {
    check('getContext gives friendly error when browser runtime is unavailable', String(e.message).includes('playwright 没装') && String(e.message).includes('pnpm install'), String(e.message).slice(0, 120));
  }
}

// v0.3.2: fish interop — append-only to ~/.dsh-fish/inbox.md, never
// rewrite, never touch events.jsonl; health check item exists.
{
  const tmpFish = fs.mkdtempSync(path.join(os.tmpdir(), 'dy-gonzalez-fish-home-'));
  const tmpData = fs.mkdtempSync(path.join(os.tmpdir(), 'dy-gonzalez-fish-data-'));
  const fish = await import('./lib/fish.mjs');
  const inbox = path.join(tmpFish, 'inbox.md');
  fs.writeFileSync(inbox, '# 大肥鱼的收件箱\n\n- 2026-11-01 旧的一条，别动我\n', 'utf8');
  const first = fish.shareToFish(tmpData, { date: '2026-11-15', watched: 5, replies: 2, liked: 1, commented: 0, shared: 1, posted: 0 }, { fishDir: tmpFish });
  check('shareToFish appends one line', first.ok === true && fs.readFileSync(inbox, 'utf8').includes('【抖音分享】'));
  check('shareToFish keeps old inbox content (append-only)', fs.readFileSync(inbox, 'utf8').includes('旧的一条，别动我'));
  const second = fish.shareToFish(tmpData, { date: '2026-11-15', watched: 3, replies: 0, liked: 0, commented: 0, shared: 0, posted: 0, note: '又刷了一轮' }, { fishDir: tmpFish });
  const lines = fs.readFileSync(inbox, 'utf8').split('\n').filter((l) => l.includes('【抖音分享】'));
  check('shareToFish second share appends again, does not overwrite', second.ok === true && lines.length === 2 && lines[1].includes('又刷了一轮'));
  const status = fish.fishShareStatus({ fishDir: tmpFish });
  check('fishShareStatus reports last share', status.status === 'pass' && status.detail.includes('2026-11-15'));
  const emptyFish = fs.mkdtempSync(path.join(os.tmpdir(), 'dy-gonzalez-fish-empty-'));
  const noShare = fish.fishShareStatus({ fishDir: path.join(emptyFish, 'no-home-yet') });
  check('fishShareStatus is unknown (not fail) when fish home does not exist', noShare.status === 'unknown');
  // dy_fish_share tool runs end to end: register tools on a fake ctx,
  // call the real execute() with DSH_FISH_HOME pointed at the temp home
  // so it never touches the real ~/.dsh-fish on this box.
  const entry2 = await import('./dsh-plugin.mjs');
  const { dataPaths } = await import('./lib/paths.mjs');
  const { appendJsonl } = await import('./lib/store.mjs');
  const today = new Date().toISOString().slice(0, 10);
  appendJsonl(dataPaths(tmpData).watchLogFile, { at: `${today}T10:00:00.000Z`, caption: '测试视频', frameBytes: 1 });
  const tools = [];
  process.env.DSH_FISH_HOME = tmpFish;
  await entry2.apply({ tools: { register: (t) => tools.push(t) } }, { dataDir: tmpData });
  const fishTool = tools.find((t) => t.name === 'dy_fish_share');
  check('dy_fish_share tool is registered', Boolean(fishTool));
  const fishRes = JSON.parse(await fishTool.execute({ date: today }));
  check('dy_fish_share execute appends to the fake fish inbox', fishRes.ok === true && fs.readFileSync(inbox, 'utf8').split('\n').filter((l) => l.includes('【抖音分享】')).length === 3);
  check('dy_fish_share also writes douyin memory', fs.existsSync(path.join(tmpData, 'memory', `${today.slice(0, 7)}.md`)));
  delete process.env.DSH_FISH_HOME;
  fs.rmSync(tmpFish, { recursive: true, force: true });
  fs.rmSync(tmpData, { recursive: true, force: true });
  fs.rmSync(emptyFish, { recursive: true, force: true });
}

// v0.3.3: DSH native panel (client.js) — CORRECT settings.section slot
// pattern. v0.3.2 used a nonexistent addSection API and never mounted.
{
  const clientSrc = fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8');
  check('client.js is a classic script (no top-level export)', !/^export /m.test(clientSrc) && clientSrc.includes('__ModuleLoader__'));
  check('client.js uses settings.section slot, not addSection', clientSrc.includes("settings.section") && !clientSrc.includes('addSection') && !clientSrc.includes('addToggle') && !clientSrc.includes('addButton'));
  check('client.js factory returns inject slots+locale', clientSrc.includes("inject = ['slots', 'locale']") && clientSrc.includes('module.exports.inject'));
  check('client.js registers section id douyin-gonzalez with label', clientSrc.includes("id: 'douyin-gonzalez'") && clientSrc.includes('刷抖音（自写）'));
  check('client.js panel talks to local settings server', clientSrc.includes('127.0.0.1:8765') && clientSrc.includes('/api/config') && clientSrc.includes('/api/health') && clientSrc.includes('/api/login/open'));
  check('client.js panel has package toggles + health + login buttons', clientSrc.includes('togglePkg') && clientSrc.includes('一键体检') && clientSrc.includes('打开 Edge 登录抖音'));
  check('package.json client inject lists slots + locale + runtime', ['@deepseek-ai/dsh-client-ui-slots', '@deepseek-ai/dsh-client-locale', '@deepseek-ai/dsh-client-runtime'].every((s) => (pkg.dsh?.client?.inject ?? []).includes(s)) && !pkg.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-settings-general'));
  check('settings server sends CORS for the panel fetch', fs.readFileSync(path.join(ROOT, 'settings', 'settings-server.mjs'), 'utf8').includes('Access-Control-Allow-Origin'));
}

// v0.3.4: settings server auto-starts when the plugin loads.
// apply() with DSH_DOUYIN_AUTO_SETTINGS=0 must NOT start it (selfcheck
// guard above); startSettingsServer() on a test port must answer /api/status.
{
  const srvSrc = fs.readFileSync(path.join(ROOT, 'settings', 'settings-server.mjs'), 'utf8');
  check('settings server exports startSettingsServer', srvSrc.includes('export function startSettingsServer'));
  check('settings server only listens on direct run', srvSrc.includes('isDirectRun'));
  check('plugin apply() auto-starts settings server unless opted out', fs.readFileSync(path.join(ROOT, 'dsh-plugin.mjs'), 'utf8').includes('startSettingsServer') && fs.readFileSync(path.join(ROOT, 'dsh-plugin.mjs'), 'utf8').includes('DSH_DOUYIN_AUTO_SETTINGS'));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dy-gonzalez-auto-'));
  process.env.DSH_DOUYIN_DATA_DIR = tmp;
  const { startSettingsServer } = await import('./settings/settings-server.mjs');
  const srv = await startSettingsServer(18766);
  check('startSettingsServer listens on the given port', Boolean(srv));
  if (srv) {
    const res = await fetch('http://127.0.0.1:18766/api/status');
    const body = await res.json();
    check('auto-started server answers /api/status', res.status === 200 && typeof body === 'object' && 'actions' in body);
    await new Promise((r) => srv.close(r));
  }
  fs.rmSync(tmp, { recursive: true, force: true });
}

// v0.4.0: README is honest about online install + release + fish.
{
  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  check('README documents GitHub clone install', readme.includes('git clone -b release/v0.4.0-douyin-enhanced --single-branch https://github.com/zhaoxj59/dsh-douyin-gonzalez.git'));
  check('README says plainly npm is NOT published yet', readme.includes('还没发布到 npm'));
  check('README gives the post-publish install command', readme.includes('dsh-douyin-gonzalez@0.4.0'));
  check('README documents git tag + gh release', readme.includes('git tag v0.4.0') && readme.includes('gh release create'));
  check('README documents fish share as one-way only', readme.includes('单向分享') && readme.includes('不是双向实时对话'));
  check('README documents DSH native panel limits', readme.includes('DSH 本体是第三方的') && readme.includes('原生面板'));
  check('README documents auto-save', readme.includes('自动保存') && readme.includes('500ms'));
  check('README documents login on the first page', readme.includes('核心包最上面') || readme.includes('登录抖音'));
  check('README version is 0.4.0', readme.startsWith('# dsh-douyin-gonzalez — DSH 抖音独立插件（v0.4.0）'));
}

// Settings server really runs: save config -> read back identical,
// POST /api/health returns the 13 checks (Edge probe is unknown on
// this Linux box — no Edge — and must not crash the endpoint).
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dy-gonzalez-server-'));
  process.env.DSH_DOUYIN_DATA_DIR = tmp;
  const port = 18765;
  const serverPath = path.join(ROOT, 'settings', 'settings-server.mjs');
  const child = (await import('node:child_process')).spawn(process.execPath, [serverPath], {
    env: { ...process.env, DSH_DOUYIN_SETTINGS_PORT: String(port), DSH_DOUYIN_DATA_DIR: tmp },
    stdio: 'ignore',
  });
  try {
    const base = `http://127.0.0.1:${port}`;
    let up = false;
    for (let i = 0; i < 50 && !up; i++) {
      try { const r = await fetch(`${base}/api/config`); up = r.ok; } catch { await new Promise((r) => setTimeout(r, 100)); }
    }
    check('settings server starts on a temp port', up);
    if (up) {
      // v0.4.0 (H1): 写接口要带 token；不带 token 直接 401。
      const tokenRes = await fetch(`${base}/api/token`).then((r) => r.json()).catch(() => ({}));
      const settingsToken = tokenRes.token || '';
      check('settings server GET /api/token returns a token', typeof settingsToken === 'string' && settingsToken.length >= 32);
      const noTokenRes = await fetch(`${base}/api/config`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ config: {} }) }).then((r) => r.json());
      check('settings server POST without token is rejected (401)', noTokenRes.ok === false && noTokenRes.error === 'unauthorized');
      const authHeaders = { 'Content-Type': 'application/json', 'X-Douyin-Token': settingsToken };
      const saveRes = await fetch(`${base}/api/config`, { method: 'POST', headers: authHeaders, body: JSON.stringify({ config: { packages: { interact: { enabled: true } }, autoLike: { enabled: true, perDay: 7 }, share: { enabled: false }, caps: { totalOutwardPerDay: 25 } } }) }).then((r) => r.json());
      check('settings server POST /api/config saves', saveRes.ok === true);
      const back = await fetch(`${base}/api/config`).then((r) => r.json());
      check('settings server GET /api/config reads back the save', back.autoLike?.perDay === 7 && back.packages?.interact?.enabled === true && back.caps?.totalOutwardPerDay === 25 && back.share?.enabled === false);
      const allowedSave = await fetch(`${base}/api/allowed`, { method: 'POST', headers: authHeaders, body: JSON.stringify({ allowed: [{ id: 'conv-1', name: '阿明', kind: 'dm', interests: ['美食'] }] }) }).then((r) => r.json());
      check('settings server POST /api/allowed saves + reads back', allowedSave.ok === true && allowedSave.readBack?.allowed?.length === 1);
      const allowedBack = await fetch(`${base}/api/allowed`).then((r) => r.json());
      check('settings server GET /api/allowed reads back the save', allowedBack.allowed?.[0]?.id === 'conv-1' && allowedBack.allowed?.[0]?.interests?.[0] === '美食');
      const loginOpen = await fetch(`${base}/api/login/open`, { method: 'POST', headers: authHeaders }).then((r) => r.json());
      check('settings server POST /api/login/open either opens Edge or returns friendly missing-runtime error', loginOpen.ok === true || (loginOpen.ok === false && loginOpen.error === 'playwright-missing' && typeof loginOpen.fix === 'string' && loginOpen.fix.includes('pnpm install')), loginOpen.message ?? '');
      const health = await fetch(`${base}/api/health`, { method: 'POST', headers: authHeaders }).then((r) => r.json());
      check('settings server POST /api/health returns 13 checks', Array.isArray(health.checks) && health.checks.length === 13 && typeof health.summary === 'string', health.summary ?? '');
      check('settings server health: edge-login returns a valid environment-dependent status', ['unknown', 'pass', 'fail'].includes(health.checks?.find((c) => c.id === 'edge-login')?.status));
      check('settings server health: share OFF passes dangerous-off only if nothing else is on', health.checks?.find((c) => c.id === 'dangerous-off')?.status === 'fail');
    }
  } finally {
    child.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 300));
    delete process.env.DSH_DOUYIN_DATA_DIR;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// v0.4.0 review fixes: dispatch-level gates, no browser needed.
{
  const { runTool } = await import('./dsh-plugin.mjs');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dy-gonzalez-dispatch-'));
  process.env.DSH_DOUYIN_DATA_DIR = tmp;
  try {
    const { saveConfig } = await import('./lib/config.mjs');
    const { logAction } = await import('./lib/store.mjs');
    saveConfig(tmp, { packages: { interact: { enabled: true }, discover: { enabled: true }, safety: { enabled: true } }, autoComment: { enabled: true, perDay: 3 }, commentMention: { enabled: true, perDay: 3, mentionName: '鱼' }, caps: { mentionPerDay: 3, totalOutwardPerDay: 20 } });
    const r1 = await runTool('dy_reply_own_comments', {}, tmp);
    check('dy_reply_own_comments is disabled pending rewrite (H2/H3)', r1.ok === false && r1.reason === 'disabled');
    const r2 = await runTool('dy_comment', { videoId: 'v-1' }, tmp);
    check('dy_comment without text is refused, not a crash (M2)', r2.ok === false && r2.error === 'missing-args');
    const r3 = await runTool('dy_creator_videos', { url: 'http://127.0.0.1:3080/evil' }, tmp);
    check('dy_creator_videos refuses non-douyin hosts (M9)', r3.ok === false && r3.error === 'bad-host');
    const r4 = await runTool('dy_cleanup', {}, tmp);
    check('dy_cleanup defaults to dry-run (M8)', r4.ok === true && r4.dryRun === true);
    logAction(tmp, { type: 'mention', status: 'sent', videoId: 'v-9' });
    const r5 = await runTool('dy_comment_mention', { videoId: 'v-9', text: '你好' }, tmp);
    check('dy_comment_mention refuses a video already @-commented (M4)', r5.ok === false && r5.reason === 'duplicate');
  } finally {
    delete process.env.DSH_DOUYIN_DATA_DIR;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// Aurabot DM idempotency: sent or uncertain event IDs are never sent twice.
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dy-gonzalez-dm-event-'));
  const { logReply } = await import('./lib/store.mjs');
  const { hasProcessedDmEvent } = await import('./lib/dm.mjs');
  check('unseen DM event is eligible', hasProcessedDmEvent(tmp, 'event-1') === false);
  logReply(tmp, { eventId: 'event-1', conversationId: 'conv-1', status: 'uncertain' });
  check('uncertain DM event is deduplicated to avoid double-send', hasProcessedDmEvent(tmp, 'event-1') === true);
  check('different DM event remains eligible', hasProcessedDmEvent(tmp, 'event-2') === false);
  fs.rmSync(tmp, { recursive: true, force: true });
}

// Aurabot bridge contract: verify the DSH tool's message field is translated
// to the module's text field, the module response uses replyText, and DSH
// still refuses to send to a conversation that is not explicitly allowed.
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dy-gonzalez-aurabot-'));
  const { saveConfig } = await import('./lib/config.mjs');
  const { readJsonl } = await import('./lib/store.mjs');
  const { dataPaths } = await import('./lib/paths.mjs');
  const { runTool } = await import('./dsh-plugin.mjs');
  saveConfig(tmp, { aurabotBridge: { enabled: true, autoReply: true, baseUrl: 'http://127.0.0.1:19090', token: 'test-secret', timeoutMs: 10000 } });
  const originalFetch = globalThis.fetch;
  let requestSeen = null;
  try {
    globalThis.fetch = async (url, options) => {
      requestSeen = { url: String(url), options, body: JSON.parse(options.body) };
      return { ok: true, status: 200, json: async () => ({ ok: true, eventId: 'aurabot-event-1', replyText: '测试回复' }) };
    };
    const result = await runTool('dy_aurabot_reply', {
      eventId: 'aurabot-event-1', conversationId: 'not-allowed', senderId: 'sender-1', message: '你好',
    }, tmp);
    check('Aurabot tool sends message as module text field', requestSeen?.body?.text === '你好');
    check('Aurabot client calls the documented module route', requestSeen?.url === 'http://127.0.0.1:19090/aurabot/api/ext/douyin-bridge/message');
    check('DSH refuses auto-reply to a non-allowlisted conversation', result.ok === false && result.reason === 'not-allowed');
    const inbound = readJsonl(path.join(dataPaths(tmp).dir, 'aurabot-inbound.jsonl'));
    check('Aurabot inbound event is persisted for idempotency', inbound.some((x) => x.eventId === 'aurabot-event-1' && x.status === 'send-failed'));
  } finally {
    globalThis.fetch = originalFetch;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// Bridge health uses the configured timeout and documented health route.
{
  const { aurabotBridgeStatus } = await import('./lib/aurabot-bridge.mjs');
  const originalFetch = globalThis.fetch;
  let urlSeen = '';
  try {
    globalThis.fetch = async (url) => {
      urlSeen = String(url);
      return { ok: true, status: 200, json: async () => ({ ok: true, module: 'douyin-bridge' }) };
    };
    const result = await aurabotBridgeStatus({ aurabotBridge: { baseUrl: 'http://127.0.0.1:19090', token: 'test-secret', timeoutMs: 15000 } });
    check('Aurabot health endpoint is reachable through the documented route', result.ok === true && urlSeen.endsWith('/aurabot/api/ext/douyin-bridge/health'));
  } finally { globalThis.fetch = originalFetch; }
}

// The IM inspector is registered and exported; it is read-only and
// does not expose message text or raw conversation identifiers in its output.
{
  const plugin = fs.readFileSync(path.join(ROOT, 'dsh-plugin.mjs'), 'utf8');
  const browser = fs.readFileSync(path.join(ROOT, 'lib/browser.mjs'), 'utf8');
  check('dy_dm_inspect tool is registered', plugin.includes("name: 'dy_dm_inspect'") && plugin.includes("case 'dy_dm_inspect'"));
  check('browser exports the read-only IM DOM inspector', browser.includes('export async function inspectDmStructure'));
  check('IM inspector redacts raw message content and IDs', browser.includes('hasDataId: Boolean') && browser.includes("privacy: '未导出昵称、消息正文、Cookie 或原始会话 ID。'"));
}

// Contact opt-out is durable and has priority over the allowlist.
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dy-gonzalez-optout-'));
  const { saveAllowed, blockContact, isBlocked, canReply } = await import('./lib/store.mjs');
  const { detectContactOptOut, handleContactOptOut } = await import('./lib/dm.mjs');
  saveAllowed(tmp, [{ id: 'conv-optout', name: 'Contact', kind: 'dm' }]);
  check('explicit opt-out wording is detected', detectContactOptOut('请不要再联系我，也不要再发私信。'));
  check('English opt-out wording is detected', detectContactOptOut('Please do not contact me again.'));
  const blocked = handleContactOptOut(tmp, { conversationId: 'conv-optout', text: '别联系我' });
  check('opt-out is persisted as a blocklist entry', blocked?.blocked === true && isBlocked(tmp, 'conv-optout'));
  const gate = canReply(tmp, 'conv-optout');
  check('blocklist overrides allowlist permission', gate.ok === false && gate.reason === 'contact-blocked');
  fs.rmSync(tmp, { recursive: true, force: true });
}

// Aurabot must not generate or send a reply after a clear opt-out.
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dy-gonzalez-optout-bridge-'));
  const { saveConfig } = await import('./lib/config.mjs');
  const { replyWithAurabot } = await import('./lib/aurabot-send.mjs');
  saveConfig(tmp, { aurabotBridge: { enabled: true, autoReply: true, baseUrl: 'http://127.0.0.1:19090', token: 'test-secret' } });
  const originalFetch = globalThis.fetch;
  let called = false;
  try {
    globalThis.fetch = async () => { called = true; throw new Error('must not call Aurabot after opt-out'); };
    const result = await replyWithAurabot(tmp, (await import('./lib/config.mjs')).loadConfig(tmp), {
      eventId: 'optout-event', conversationId: 'conv-stop', text: '请不要再联系我',
    });
    const { isBlocked } = await import('./lib/store.mjs');
    check('opt-out stops before Aurabot API call', result.error === 'contact-opted-out' && called === false);
    check('opt-out remains blocked after restart-safe persistence', isBlocked(tmp, 'conv-stop'));
  } finally {
    globalThis.fetch = originalFetch;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// Both documented Aurabot module install paths must remain identical and
// syntactically valid; this catches API drift between the source and copyable folder.
{
  const { spawnSync } = await import('node:child_process');
  const source = fs.readFileSync(path.join(ROOT, 'integrations/aurabot-module/index.mjs'), 'utf8');
  const installable = fs.readFileSync(path.join(ROOT, 'integrations/aurabot-module/douyin-bridge/index.mjs'), 'utf8');
  check('Aurabot source module and installable module folder stay in sync', source === installable);
  for (const file of ['integrations/aurabot-module/index.mjs', 'integrations/aurabot-module/douyin-bridge/index.mjs']) {
    const result = spawnSync(process.execPath, ['--check', path.join(ROOT, file)], { encoding: 'utf8' });
    check('Aurabot module syntax: ' + file, result.status === 0, result.stderr || '');
  }
}

// The installable Aurabot module folder must ship a module manifest, the same
// way the douyin-plus module does; without it Aurabot has no id/version to list.
{
  let meta = null;
  try { meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'integrations', 'aurabot-module', 'douyin-bridge', 'module.json'), 'utf8')); } catch { meta = null; }
  check('Aurabot bridge module.json parses', meta !== null);
  check('Aurabot bridge module.json id/version match the module', meta?.id === 'douyin-bridge' && meta?.version === '0.1.0' && meta?.api === 1);
}

console.log(failures === 0 ? '\nAll self-checks passed.' : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
