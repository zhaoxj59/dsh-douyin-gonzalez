// v0.2.0 feature 4: whitelist sharing, by Douyin friend id.
// Sharing picks SPECIFIC people from allowed.json, scored by how
// well the video matches each person's recorded `interests`
// (stored in allowed.json, edited on the settings page).
// Rules, all enforced here:
//   - Only people in allowed.json, matched by stable id — never by
//     nickname, never broadcast to "everyone".
//   - Same video + same person: shared at most once, forever
//     (see alreadyShared in lib/store.mjs).
//   - Daily share cap from config (caps.sharePerDay, default 3).
//   - A video with no interest match is shared to nobody; the
//     function returns an empty list and says why, instead of
//     guessing a recipient.
import { loadAllowed, alreadyShared, actionCounts, logAction } from './store.mjs';

export function scoreRecipient(video, person) {
  const text = `${video.caption ?? ''} ${(video.tags ?? []).join(' ')}`.toLowerCase();
  let score = 0;
  const matched = [];
  for (const interest of (person.interests ?? [])) {
    if (interest && text.includes(String(interest).toLowerCase())) {
      score += 3;
      matched.push(interest);
    }
  }
  return { ...person, score, matched };
}

export function pickShareRecipients(dataDir, video, { maxRecipients = 3 } = {}) {
  const allowed = loadAllowed(dataDir).allowed;
  const scored = allowed
    .map((p) => scoreRecipient(video, p))
    .filter((p) => p.score > 0)
    .filter((p) => !alreadyShared(dataDir, video.videoId ?? video.caption ?? '', p.id))
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, maxRecipients);
}

// Dry-run first: returns who WOULD be shared to, without sending.
// The tool dy_share calls this, then shareVideo() for each recipient.
export function planShare(dataDir, video, config) {
  if (!config?.share?.enabled) return { ok: false, reason: 'disabled', message: '分享未开启。' };
  const counts = actionCounts(dataDir);
  if (counts.share >= config.caps.sharePerDay) {
    return { ok: false, reason: 'cap', message: `今日分享已达上限 ${config.caps.sharePerDay} 次。` };
  }
  const recipients = pickShareRecipients(dataDir, video);
  if (!recipients.length) {
    return { ok: true, recipients: [], message: '这个视频和白名单里任何人的兴趣都不匹配，不分享给任何人。' };
  }
  return { ok: true, recipients, remainingToday: config.caps.sharePerDay - counts.share };
}

export async function shareVideo(dataDir, video, person, sendFn) {
  if (alreadyShared(dataDir, video.videoId ?? video.caption ?? '', person.id)) {
    return { ok: false, reason: 'duplicate', message: `这个视频已经分享给 ${person.name} 过，不重复分享。` };
  }
  const result = await sendFn(video, person);
  if (result?.sent) {
    logAction(dataDir, {
      type: 'share', status: 'sent',
      videoId: video.videoId ?? video.caption ?? '',
      personId: person.id, personName: person.name,
      matchedInterests: person.matched ?? [],
    });
    return { ok: true, sent: true, personId: person.id };
  }
  logAction(dataDir, {
    type: 'share', status: result?.uncertain ? 'uncertain' : 'failed',
    videoId: video.videoId ?? video.caption ?? '', personId: person.id,
    error: result?.message ?? 'unknown',
  });
  return { ok: false, sent: false, uncertain: Boolean(result?.uncertain), message: result?.message ?? '分享失败，未自动重发。' };
}
