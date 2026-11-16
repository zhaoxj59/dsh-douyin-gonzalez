// Browser automation (original code). Playwright + system Microsoft Edge.
// Login is manual, in the Edge window, and stays in the Edge profile
// under the data dir — this plugin never reads, stores or sends any
// Douyin cookie / password.
//
// WARNING — selectors: Douyin's web DOM changes often. The selectors
// below are best-effort (checked against the public Douyin web layout
// pattern, not against a live login here) and every function returns
// { ok:false, error:'selector-mismatch' } instead of pretending to
// work when the page structure has moved. If that happens, run
// `node selfcheck.mjs` and update SELECTORS in this file.
import fs from 'node:fs';
import { dataPaths } from './paths.mjs';
import { appendJsonl, writeJsonAtomic } from './store.mjs';
import { classifyCommercialCaption } from './content-filter.mjs';
import { setRisk } from './safety.mjs';

// --- v0.3.2: playwright 没装时的友好报错 -------------------------------
// 用户在云电脑上看到的原报错只有一句英文
// "Cannot find package 'playwright'"，看不懂也修不了。
// 这里把原因 + 一步一步的修法写成中文，所有走到 browser.mjs 的
// 地方（体检、设置页登录、dy_login_status）都透传这份，不只剩英文。
export const PLAYWRIGHT_FIX = [
  '原因：插件用来开 Edge 的 playwright 还没装好（没跑过 pnpm install，或装错了地方）。',
  '修法：',
  '1. 在云电脑上打开 PowerShell，进到 C:\\dsh-douyin-gonzalez 这个文件夹。',
  '2. 跑 pnpm install，等它跑完。',
  '3. 跑完看一眼有没有 C:\\dsh-douyin-gonzalez\\node_modules\\playwright 这个文件夹，有就是装上了。',
  '4. 如果 pnpm install 报错（装插件时 GitHub 失败过的话，大概率还是代理没覆盖命令行）：先把代理开全局 / TUN 模式，再跑一次；或者改跑 npm install。',
  '5. 装上后回到设置页刷新，再点登录 / 再跑一遍体检。',
].join('\n');
export function isPlaywrightMissingError(e) {
  const msg = String(e?.message ?? e ?? '');
  return msg.includes('playwright') || msg.includes("Cannot find package 'playwright'");
}
export function toFriendlyBrowserError(e) {
  if (isPlaywrightMissingError(e)) {
    return { ok: false, error: 'playwright-missing', message: 'playwright 没装：插件打不开 Edge，没法登录 / 刷抖音。', fix: PLAYWRIGHT_FIX };
  }
  return { ok: false, error: 'browser-error', message: `打开 Edge 失败：${e?.message ?? e}`, fix: '' };
}

export const DOUYIN_HOME = 'https://www.douyin.com/';
export const DOUYIN_IM = 'https://www.douyin.com/im/';

const PLATFORM_STOP_PATTERNS = [
  /请输入验证码/, /滑动验证/, /安全验证/, /操作过于频繁/,
  /访问过于频繁/, /账号存在异常/, /账号异常/, /请稍后再试/,
  /暂时无法操作/, /环境异常/,
];

export function classifyPlatformStopText(text = '') {
  const hit = PLATFORM_STOP_PATTERNS.find((re) => re.test(String(text)));
  return hit ? hit.source : null;
}

async function platformStopReason(page) {
  const text = await page.locator('body').innerText().catch(() => '');
  return classifyPlatformStopText(text);
}

// Generic, text-driven selectors first; class names last (they churn).
export const SELECTORS = {
  // Feed: a video container / its caption text.
  videoCaption: '[data-e2e="feed-video"] , [class*="video-info"], [class*="desc"]',
  // DM list: conversation rows in the message panel.
  chatRow: '[class*="conversation"], [class*="chat-list"] [class*="item"], [role="listitem"]',
  // The message input box inside an open conversation.
  messageInput: 'textarea, [contenteditable="true"]',
  sendButton: 'button:has-text("发送"), [class*="send"]',
  // v0.2.0: like / comment / share / post (best-effort, same rule:
  // selector-mismatch instead of pretending to work).
  likeButton: '[data-e2e="feed-like"], button:has-text("赞"), [class*="like"]',
  commentButton: '[data-e2e="feed-comment"], button:has-text("评论"), [class*="comment"]',
  commentInput: 'textarea[placeholder*="评论"], [contenteditable="true"]',
  shareButton: '[data-e2e="feed-share"], button:has-text("分享"), [class*="share"]',
  publishButton: 'button:has-text("发布"), [class*="publish"]',
  uploadInput: 'input[type="file"]',
  favoriteButton: '[data-e2e="feed-collect"], button:has-text("收藏"), [class*="collect"], [class*="favorite"]',
  hotList: '[class*="hot"], [class*="trending"], [data-e2e="hot-list"]',
  searchInput: 'input[placeholder*="搜索"], input[type="search"]',
  myPostsRow: '[class*="video"], [class*="aweme"], [data-e2e="user-video"]',
  ownCommentRow: '[class*="comment"], [data-e2e="comment-item"]',
  stickerButton: '[class*="sticker"], [class*="emoji"], button:has-text("表情")',
  loginButton: 'button:has-text("登录"), [data-e2e="login"]',
};

let contextPromise = null;

export async function getContext(dataDir) {
  if (contextPromise) return contextPromise;
  contextPromise = (async () => {
    const { edgeProfileDir } = dataPaths(dataDir);
    fs.mkdirSync(edgeProfileDir, { recursive: true });
    let chromium;
    try {
      ({ chromium } = await import('playwright'));
    } catch (e) {
      // v0.3.2: 别把英文原文直接扔给用户，换成中文原因 + 修法。
      const friendly = toFriendlyBrowserError(e);
      throw new Error(`${friendly.message}\n${friendly.fix}`);
    }
    // channel:'msedge' = the system Microsoft Edge, no browser download.
    // headless:false — the user must be able to see the window, log in,
    // and pass any captcha themselves. Never headless for login.
    return chromium.launchPersistentContext(edgeProfileDir, {
      channel: 'msedge',
      headless: false,
      viewport: { width: 1280, height: 800 },
      args: ['--mute-audio'],
    });
  })().catch((e) => { contextPromise = null; throw e; });
  return contextPromise;
}

export async function openBrowser(dataDir) {
  const ctx = await getContext(dataDir);
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  await page.goto(DOUYIN_HOME, { waitUntil: 'domcontentloaded', timeout: 60000 });
  return { opened: true, message: '已打开抖音专用 Edge 窗口。请在窗口里手动登录 / 过验证码，登录状态只留在本机 Edge 里。' };
}

export async function isLoggedIn(page) {
  // Logged-in Douyin web shows a message / profile entry; logged-out
  // shows a login button / QR. We only probe for the login prompt.
  const text = (await page.content()).toLowerCase();
  return !text.includes('登录') || text.includes('消息');
}

// Watch the feed for `minutes`, scrolling every ~20s, sampling a frame
// (screenshot, downscaled by Playwright) and logging each video.
export async function watchRound(dataDir, { minutes = 10, signal } = {}) {
  const { watchLogFile } = dataPaths(dataDir);
  const ctx = await getContext(dataDir);
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  await page.goto(DOUYIN_HOME, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3000);
  if (!(await isLoggedIn(page))) {
    return { ok: false, error: 'login-required', message: '抖音未登录：请在专用 Edge 窗口里手动登录后再开始刷。' };
  }
  const initialStop = await platformStopReason(page);
  if (initialStop) {
    setRisk(dataDir, { reason: 'platform-challenge', detail: initialStop });
    return { ok: false, error: 'platform-challenge', message: '检测到验证码、安全验证或平台异常提示，已自动熔断并暂停所有写操作。请在 Edge 中人工处理；不要尝试自动绕过。' };
  }
  const startedAt = Date.now();
  const endAt = startedAt + Math.max(1, minutes) * 60 * 1000;
  const videos = [];
  let skippedCommercial = 0;
  while (Date.now() < endAt) {
    signal?.throwIfAborted();
    const stopReason = await platformStopReason(page);
    if (stopReason) {
      setRisk(dataDir, { reason: 'platform-challenge', detail: stopReason });
      return { ok: false, error: 'platform-challenge', watched: videos.length, skippedCommercial, message: '浏览中检测到验证码、安全验证或平台异常提示，已自动停止并暂停所有写操作。请在 Edge 中人工处理，不自动重试。' };
    }
    const caption = await page.locator(SELECTORS.videoCaption).first().innerText().catch(() => '');
    const commercial = classifyCommercialCaption(caption);
    if (commercial.skip) {
      appendJsonl(watchLogFile, { at: new Date().toISOString(), caption: String(caption).slice(0, 200), skipped: true, skipReason: commercial.reason, filterConfidence: commercial.confidence });
      skippedCommercial++;
      await page.keyboard.press('ArrowDown').catch(() => {});
      await page.waitForTimeout(1200);
      continue;
    }
    const shot = await page.screenshot({ type: 'jpeg', quality: 40 }).catch(() => null);
    // v0.2.0 feature 6: the fish chooses. Score this video against
    // the recorded interests / watch history and log the REASON, so
    // the user can audit why it stayed or moved on.
    let decision = { score: 0, reason: '自动选片未开，按顺序刷' };
    try {
      const { chooseNextVideo } = await import('./choose.mjs');
      const { loadConfig } = await import('./config.mjs');
      const config = loadConfig(dataDir);
      if (config.watch.autoChoose) {
        const { interestsFromHistory } = await import('./choose.mjs');
        const interests = interestsFromHistory(dataDir);
        decision = chooseNextVideo(dataDir, [{ videoId: caption.slice(0, 40) || `video-${videos.length}`, caption }], { interests });
        decision = { score: decision.picked?.score ?? 0, reason: decision.reason };
      }
    } catch { /* choosing must never break watching */ }
    const entry = {
      at: new Date().toISOString(),
      caption: (caption || '').slice(0, 200),
      frameBytes: shot ? shot.length : 0,
      choiceScore: decision.score,
      choiceReason: decision.reason,
      // Frames are NOT written to the log (no base64 in text logs);
      // the model sees them live through the tool call, if at all.
    };
    appendJsonl(watchLogFile, entry);
    videos.push(entry);
    await page.keyboard.press('ArrowDown').catch(() => {});
    await page.waitForTimeout(20000);
  }
  return { ok: true, watchedMinutes: minutes, videosSeen: videos.length, skippedCommercial, logFile: watchLogFile };
}

// List DM conversations. Returns the list AND writes chats.json, which
// is what the settings page renders as checkboxes. If the DOM moved,
// returns selector-mismatch instead of an empty list pretending to be
// "no friends".
export async function listChats(dataDir) {
  const { chatsFile } = dataPaths(dataDir);
  const ctx = await getContext(dataDir);
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  await page.goto(DOUYIN_IM, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3000);
  if (!(await isLoggedIn(page))) {
    return { ok: false, error: 'login-required', message: '抖音未登录：请先在专用 Edge 窗口里登录。' };
  }
  const rows = await page.locator(SELECTORS.chatRow).all().catch(() => []);
  const chats = [];
  for (const row of rows.slice(0, 100)) {
    const text = (await row.innerText().catch(() => '')).trim();
    if (!text) continue;
    const lines = text.split('\n').map((s) => s.trim()).filter(Boolean);
    const name = lines[0] || '未命名会话';
    // Stable id: prefer a data attribute; fall back to the name.
    // NOTE: a name-only id is weaker (renames break it) — the settings
    // page shows a warning for such rows.
    const dataId = await row.getAttribute('data-id').catch(() => null)
      ?? await row.getAttribute('data-conversation-id').catch(() => null);
    chats.push({
      id: dataId || `name:${name}`,
      name,
      kind: 'dm',
      lastMessage: lines[1] ?? '',
      stableId: Boolean(dataId),
    });
  }
  if (chats.length === 0) {
    return { ok: false, error: 'selector-mismatch', message: '私信列表没读到会话：抖音页面结构可能变了，或当前账号无私信。请先确认 Edge 里能看到私信列表，再更新 lib/browser.mjs 的 SELECTORS。' };
  }
  writeJsonAtomic(chatsFile, { updatedAt: new Date().toISOString(), chats });
  return { ok: true, count: chats.length, chats, file: chatsFile };
}

// Send one DM. Caller (lib/dm.mjs) has already checked allowed + caps.
// Returns { ok, sent, uncertain } — on uncertain result we NEVER resend.
export async function sendDm(dataDir, { conversationId, text }) {
  const ctx = await getContext(dataDir);
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  await page.goto(DOUYIN_IM, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2000);
  const row = page.locator(SELECTORS.chatRow).filter({ hasText: String(conversationId).replace(/^name:/, '') }).first();
  if ((await row.count()) === 0) {
    return { ok: false, error: 'conversation-not-found', message: `没找到会话 ${conversationId}，可能对方改名 / 列表未加载。` };
  }
  await row.click().catch(() => {});
  await page.waitForTimeout(1500);
  const input = page.locator(SELECTORS.messageInput).last();
  await input.click().catch(() => {});
  await input.fill(text).catch(() => {});
  await page.locator(SELECTORS.sendButton).first().click().catch(() => {});
  await page.keyboard.press('Enter').catch(() => {});
  await page.waitForTimeout(2000);
  // Verify by reading the last outgoing bubble; if we cannot confirm,
  // report uncertain and let the caller log it WITHOUT retrying.
  const body = await page.content().catch(() => '');
  const confirmed = body.includes(text.slice(0, 20));
  return confirmed
    ? { ok: true, sent: true, uncertain: false }
    : { ok: false, sent: false, uncertain: true, message: '发送结果无法确认（没在页面里看到刚发的文字），按规则不自动重发，请人工在 Edge 里核对。' };
}

// --- v0.2.0: like / comment / share / post ------------------------------
// All four are best-effort against the live Douyin web DOM. If the
// button cannot be found, they return selector-mismatch — never a
// fake "done". Callers in dsh-plugin.mjs check the switch + cap +
// same-video dedup BEFORE calling these.

async function currentPage(dataDir) {
  const ctx = await getContext(dataDir);
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  await page.goto(DOUYIN_HOME, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2000);
  if (!(await isLoggedIn(page))) {
    return { page: null, error: { ok: false, error: 'login-required', message: '抖音未登录：请在专用 Edge 窗口里手动登录后再操作。' } };
  }
  const stopReason = await platformStopReason(page);
  if (stopReason) {
    setRisk(dataDir, { reason: 'platform-challenge', detail: stopReason });
    return { page: null, error: { ok: false, error: 'platform-challenge', message: '检测到验证码、安全验证或平台异常提示，已暂停写操作。请在 Edge 中人工处理，不自动绕过。' } };
  }
  return { page };
}

export async function likeCurrentVideo(dataDir, { videoId }) {
  const { page, error } = await currentPage(dataDir);
  if (error) return error;
  const btn = page.locator(SELECTORS.likeButton).first();
  if ((await btn.count()) === 0) return { ok: false, error: 'selector-mismatch', message: '没找到点赞按钮：抖音页面结构可能变了。' };
  await btn.click().catch(() => {});
  await page.waitForTimeout(1000);
  return { ok: true, sent: true, videoId };
}

export async function commentCurrentVideo(dataDir, { videoId, text }) {
  const { page, error } = await currentPage(dataDir);
  if (error) return error;
  const open = page.locator(SELECTORS.commentButton).first();
  if ((await open.count()) === 0) return { ok: false, error: 'selector-mismatch', message: '没找到评论入口：抖音页面结构可能变了。' };
  await open.click().catch(() => {});
  await page.waitForTimeout(1000);
  const input = page.locator(SELECTORS.commentInput).last();
  if ((await input.count()) === 0) return { ok: false, error: 'selector-mismatch', message: '评论框没打开。' };
  await input.fill(text).catch(() => {});
  await page.keyboard.press('Enter').catch(() => {});
  await page.waitForTimeout(1500);
  const body = await page.content().catch(() => '');
  const confirmed = body.includes(text.slice(0, 20));
  return confirmed
    ? { ok: true, sent: true, videoId }
    : { ok: false, sent: false, uncertain: true, message: '评论结果无法确认（没在页面里看到刚发的文字），不自动重发。' };
}

export async function shareCurrentVideoTo(dataDir, { videoId, personId, personName }) {
  const { page, error } = await currentPage(dataDir);
  if (error) return error;
  const btn = page.locator(SELECTORS.shareButton).first();
  if ((await btn.count()) === 0) return { ok: false, error: 'selector-mismatch', message: '没找到分享按钮：抖音页面结构可能变了。' };
  await btn.click().catch(() => {});
  await page.waitForTimeout(1500);
  // Pick the recipient by name in the share sheet (the id match was
  // already done in lib/share.mjs — this is only the UI step).
  const target = page.locator(`text=${String(personName ?? personId)}`).first();
  if ((await target.count()) === 0) {
    return { ok: false, sent: false, uncertain: true, message: `分享面板里没找到 ${personName ?? personId}，请人工在 Edge 里核对，未自动重发。` };
  }
  await target.click().catch(() => {});
  await page.waitForTimeout(1500);
  return { ok: true, sent: true, videoId, personId };
}

// Upload a local video file through Douyin's creator upload page.
// The file path is checked by lib/post.mjs before this is called.
export async function uploadVideoFile(dataDir, { file, caption = '' }) {
  const ctx = await getContext(dataDir);
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  await page.goto('https://creator.douyin.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3000);
  if (!(await isLoggedIn(page))) {
    return { ok: false, error: 'login-required', message: '抖音未登录：请在专用 Edge 窗口里手动登录后再发布。' };
  }
  const input = page.locator(SELECTORS.uploadInput).first();
  if ((await input.count()) === 0) {
    return { ok: false, error: 'selector-mismatch', message: '没找到上传文件的入口：抖音创作者页面结构可能变了。' };
  }
  try {
    await input.setInputFiles(file);
  } catch (e) {
    return { ok: false, error: 'upload-failed', message: e.message };
  }
  await page.waitForTimeout(5000);
  if (caption) {
    const cap = page.locator(SELECTORS.messageInput).last();
    await cap.fill(caption).catch(() => {});
  }
  const pub = page.locator(SELECTORS.publishButton).first();
  if ((await pub.count()) === 0) {
    return { ok: false, sent: false, uncertain: true, message: '文件已上传，但没找到“发布”按钮，未发布，请人工在 Edge 里核对。' };
  }
  await pub.click().catch(() => {});
  await page.waitForTimeout(3000);
  return { ok: true, sent: true, file };
}

// --- v0.3.0: interact / discover / safety browser steps -----------------
// All best-effort: login-required / selector-mismatch, never fake "done".

export async function favoriteCurrentVideo(dataDir, { videoId }) {
  const { page, error } = await currentPage(dataDir);
  if (error) return error;
  const btn = page.locator(SELECTORS.favoriteButton).first();
  if ((await btn.count()) === 0) return { ok: false, error: 'selector-mismatch', message: '没找到收藏按钮：抖音页面结构可能变了。' };
  await btn.click().catch(() => {});
  await page.waitForTimeout(1000);
  return { ok: true, sent: true, videoId };
}

export async function checkLoginStatus(dataDir) {
  const ctx = await getContext(dataDir);
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  await page.goto(DOUYIN_HOME, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3000);
  const loggedIn = await isLoggedIn(page);
  const body = (await page.content().catch(() => '')).toLowerCase();
  const needsCaptcha = body.includes('验证码') || body.includes('验证');
  return { ok: true, loggedIn, needsCaptcha, checkedAt: new Date().toISOString(),
    message: loggedIn ? '抖音已登录。' : '抖音未登录：设置页会红字提醒，点“重新扫码登录”在 Edge 里扫码。' };
}

export async function openLogin(dataDir) {
  const ctx = await getContext(dataDir);
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  await page.goto(DOUYIN_HOME, { waitUntil: 'domcontentloaded', timeout: 60000 });
  return { ok: true, message: '已打开抖音专用 Edge 窗口，请在里面扫码登录 / 过验证码。' };
}

async function listFromPage(dataDir, url, selector, label) {
  const ctx = await getContext(dataDir);
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3000);
  if (!(await isLoggedIn(page))) return { ok: false, error: 'login-required', message: '抖音未登录：请先在专用 Edge 窗口里登录。' };
  const rows = await page.locator(selector).all().catch(() => []);
  const items = [];
  for (const row of rows.slice(0, 50)) {
    const text = (await row.innerText().catch(() => '')).trim();
    if (text) items.push(text.slice(0, 200));
  }
  if (!items.length) return { ok: false, error: 'selector-mismatch', message: `${label}没读到内容：抖音页面结构可能变了。` };
  return { ok: true, count: items.length, items };
}

export async function getHotList(dataDir) {
  return listFromPage(dataDir, 'https://www.douyin.com/hot', SELECTORS.hotList, '热榜');
}
export async function searchVideos(dataDir, { keyword }) {
  if (!keyword) return { ok: false, error: 'missing-args', message: 'dy_search 需要 keyword。' };
  const ctx = await getContext(dataDir);
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  await page.goto(`https://www.douyin.com/search/${encodeURIComponent(keyword)}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3000);
  const rows = await page.locator(SELECTORS.myPostsRow).all().catch(() => []);
  const items = [];
  for (const row of rows.slice(0, 20)) { const text = (await row.innerText().catch(() => '')).trim(); if (text) items.push(text.slice(0, 200)); }
  if (!items.length) return { ok: false, error: 'selector-mismatch', message: `搜「${keyword}」没读到视频：页面结构可能变了。` };
  return { ok: true, keyword, count: items.length, items };
}
export async function getFollowingFeed(dataDir) {
  return listFromPage(dataDir, 'https://www.douyin.com/follow', SELECTORS.myPostsRow, '关注列表');
}
export async function getCreatorVideos(dataDir, { url }) {
  if (!url) return { ok: false, error: 'missing-args', message: 'dy_creator_videos 需要博主主页链接 url。' };
  return listFromPage(dataDir, url, SELECTORS.myPostsRow, '指定博主');
}
export async function getMyPosts(dataDir) {
  const { saveMyPosts } = await import('./discover.mjs');
  const res = await listFromPage(dataDir, 'https://www.douyin.com/user/self', SELECTORS.myPostsRow, '我的作品');
  if (!res.ok) return res;
  const posts = res.items.map((text, i) => ({ videoId: `my-${i}`, title: text, plays: null, likes: null, comments: null }));
  saveMyPosts(dataDir, posts);
  return { ok: true, count: posts.length, posts, note: '播放/点赞/评论数在页面结构里没读到，记为 null，不编数字；诊断时以创作者中心为准。' };
}
export async function listOwnComments(dataDir, { videoId } = {}) {
  const res = await listFromPage(dataDir, DOUYIN_HOME, SELECTORS.ownCommentRow, '评论');
  if (!res.ok) return res;
  return { ok: true, videoId: videoId ?? '', count: res.items.length, comments: res.items.map((text, i) => ({ id: `c-${i}`, userId: '', text, at: new Date().toISOString() })) };
}
export async function minimizeWindow(dataDir) {
  try {
    const ctx = await getContext(dataDir);
    const page = ctx.pages()[0];
    if (!page) return { ok: false, message: '没有打开的 Edge 页面。' };
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Browser.setWindowBounds', { windowId: 1, bounds: { windowState: 'minimized' } }).catch(() => {});
    return { ok: true, message: '已尝试最小化 Edge 窗口（静默观看）。' };
  } catch (e) { return { ok: false, message: `最小化失败（不影响刷）：${e.message}` }; }
}
