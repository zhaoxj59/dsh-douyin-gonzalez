// v0.3.0 发现包 (discover): hot / search / following / creators / diagnosis / my posts.
// Pure planning + diagnosis here; page fetching lives in lib/browser.mjs
// (best-effort selectors, selector-mismatch instead of fake data).
import { loadConfig } from './config.mjs';
import { readJson, writeJsonAtomic } from './store.mjs';
import { dataPaths } from './paths.mjs';

export function enabledSources(dataDir, config) {
  const s = config?.discover?.sources ?? {};
  const out = [];
  if (s.feed) out.push('feed');
  if (s.hot) out.push('hot');
  if (s.search) out.push('search');
  if (s.following) out.push('following');
  if (s.creators) out.push('creators');
  return out.length ? out : ['feed'];
}
export function sourcePlan(dataDir, config) {
  const sources = enabledSources(dataDir, config);
  return {
    ok: true, sources,
    keywords: config?.discover?.keywords ?? [],
    creators: config?.discover?.creators ?? [],
    message: sources.length === 1 && sources[0] === 'feed'
      ? '只刷推荐流（发现包没开其他来源）。想多来源，在设置页 → 发现包 勾热榜 / 搜索 / 关注 / 指定博主。'
      : `已勾来源：${sources.join('、')}，但当前版本实际只刷推荐流（来源导航还没接上）。`,
  };
}

// --- 创作者诊断 (基础版): no invented traffic claims. It lays out
// the numbers the user can see (plays / likes / comments / completion)
// and lists the most likely causes for the model to judge.
export function diagnoseCreatorVideo(video) {
  const plays = Number(video.plays ?? 0);
  const likes = Number(video.likes ?? 0);
  const comments = Number(video.comments ?? 0);
  const completion = video.completionPct != null ? Number(video.completionPct) : null;
  const likeRate = plays > 0 ? likes / plays : null;
  const commentRate = plays > 0 ? comments / plays : null;
  const signals = [];
  if (plays > 0 && likeRate != null && likeRate < 0.02) signals.push('点赞率偏低（<2%）：开头可能没留住人，或标题和内容不符');
  if (plays > 0 && commentRate != null && commentRate < 0.002) signals.push('评论率偏低：内容没给人说话的理由，可在结尾加一个具体问题');
  if (completion != null && completion < 30) signals.push(`完播率 ${completion}% 偏低：前 3 秒没给钩子，或视频太长、节奏拖`);
  if (plays === 0) signals.push('播放为 0：可能还在审核，或被限流，先看创作者中心有没有违规提示');
  if (!signals.length) signals.push('这几项数没有明显短板：先看完播和点赞率的趋势，再决定改标题还是改开头');
  return {
    ok: true,
    videoId: video.videoId ?? video.id ?? '',
    title: video.title ?? video.caption ?? '',
    numbers: { plays, likes, comments, completionPct: completion, likeRate: likeRate == null ? null : +likeRate.toFixed(4), commentRate: commentRate == null ? null : +commentRate.toFixed(4) },
    signals,
    note: '这是基础版诊断：只摆数字 + 可能原因，不编流量池、不编账号分、不保证爆款。',
  };
}

// --- 我的作品: local cache written by dy_my_posts (browser read).
export function loadMyPosts(dataDir) {
  const raw = readJson(dataPaths(dataDir).myPostsFile, null);
  return Array.isArray(raw?.posts) ? raw.posts : [];
}
export function saveMyPosts(dataDir, posts) {
  writeJsonAtomic(dataPaths(dataDir).myPostsFile, { updatedAt: new Date().toISOString(), posts: posts ?? [] });
  return loadMyPosts(dataDir);
}
