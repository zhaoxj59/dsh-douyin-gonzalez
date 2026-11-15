// v0.2.0 feature 6: let the fish choose what to watch.
// Scoring is transparent and logged, not a black box:
//   +3  caption/tags overlap a recorded interest (from watch history
//       interests, or the persona interests passed in)
//   +2  author / topic seen before and watched to the end
//   -5  video already watched today (never re-watch the same video)
//   -3  same author seen 3+ times today (avoid one-author loops)
// The model still makes the final call — this function only ranks
// candidates and records the REASON in watch-log.jsonl, so the user
// can audit why a video was picked.
import { readJsonl } from './store.mjs';
import { dataPaths } from './paths.mjs';

export function scoreCandidate(candidate, { interests = [], history = [] }) {
  const text = `${candidate.caption ?? ''} ${candidate.author ?? ''} ${(candidate.tags ?? []).join(' ')}`.toLowerCase();
  let score = 0;
  const reasons = [];
  for (const interest of interests) {
    if (interest && text.includes(String(interest).toLowerCase())) {
      score += 3;
      reasons.push(`命中兴趣「${interest}」+3`);
    }
  }
  const seenToday = history.filter((h) => h.videoId === candidate.videoId);
  if (seenToday.length) {
    score -= 5;
    reasons.push('今天已看过 -5');
  }
  const authorToday = history.filter((h) => h.author && candidate.author && h.author === candidate.author).length;
  if (authorToday >= 3) {
    score -= 3;
    reasons.push(`同一作者今天已看 ${authorToday} 条 -3`);
  } else if (authorToday > 0) {
    score += 2;
    reasons.push('看过的作者 +2');
  }
  return { ...candidate, score, reasons };
}

export function chooseNextVideo(dataDir, candidates, { interests = [] } = {}) {
  const { watchLogFile } = dataPaths(dataDir);
  const history = readJsonl(watchLogFile).filter((e) => String(e.at ?? '').startsWith(new Date().toISOString().slice(0, 10)));
  const ranked = (candidates ?? []).map((c) => scoreCandidate(c, { interests, history }));
  ranked.sort((a, b) => b.score - a.score);
  const picked = ranked[0] ?? null;
  return {
    picked,
    ranked: ranked.map((r) => ({ videoId: r.videoId, caption: r.caption, score: r.score, reasons: r.reasons })),
    reason: picked ? picked.reasons.join('；') || '无兴趣命中，按顺序取第一条' : '无候选视频',
  };
}

// Interests learned from actual watch history: captions of videos
// watched to the end, counted. The fish's persona interests are
// passed in by the caller (from config / persona), not invented here.
export function interestsFromHistory(dataDir) {
  const { watchLogFile } = dataPaths(dataDir);
  const counts = new Map();
  for (const e of readJsonl(watchLogFile)) {
    for (const tag of (e.tags ?? [])) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([tag]) => tag);
}
