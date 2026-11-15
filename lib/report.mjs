// Daily report: Markdown, generated from the LOCAL watch log only.
// No extra model call (same rule as LockyBee's daily report).
import { readJsonl } from './store.mjs';
import { dataPaths } from './paths.mjs';
import fs from 'node:fs';

export function buildDailyReport(dataDir, date = new Date().toISOString().slice(0, 10)) {
  const { watchLogFile, replyLogFile, reportFile, actionLogFile, postLogFile } = dataPaths(dataDir);
  const watched = readJsonl(watchLogFile).filter((e) => String(e.at ?? '').startsWith(date));
  const replies = readJsonl(replyLogFile).filter((e) => String(e.at ?? '').startsWith(date));
  const actions = readJsonl(actionLogFile).filter((e) => String(e.at ?? '').startsWith(date));
  const posts = readJsonl(postLogFile).filter((e) => String(e.at ?? '').startsWith(date));
  const liked = actions.filter((a) => a.type === 'like' && a.status === 'sent').length;
  const commented = actions.filter((a) => a.type === 'comment' && a.status === 'sent').length;
  const shared = actions.filter((a) => a.type === 'share' && a.status === 'sent').length;
  const favorited = actions.filter((a) => a.type === 'favorite' && a.status === 'sent').length;
  const stickered = actions.filter((a) => a.type === 'sticker' && a.status === 'sent').length;
  const sparked = actions.filter((a) => a.type === 'spark' && a.status === 'sent').length;
  const replyOwn = actions.filter((a) => a.type === 'reply-own' && a.status === 'sent').length;
  const mentioned = actions.filter((a) => a.type === 'mention' && a.status === 'sent').length;
  const lines = [
    `# 抖音日报 ${date}`,
    '',
    `- 观看视频：${watched.length} 条`,
    `- 回复私信：${replies.filter((r) => r.status === 'sent').length} 条（发送不明/失败：${replies.filter((r) => r.status !== 'sent').length} 条）`,
    `- 点赞：${liked} 次，评论：${commented} 条（@评论 ${mentioned} 条），分享：${shared} 次，发视频：${posts.filter((p) => p.status === 'sent').length} 条`,
    `- 收藏：${favorited} 次，表情包：${stickered} 次，续火花：${sparked} 次，回自己视频评论：${replyOwn} 条`,
    '',
    '## 看到的视频',
    ...(watched.length
      ? watched.map((v, i) => `${i + 1}. ${v.caption || '（无文案）'}（${v.at}）${v.choiceReason ? ` — 选片理由：${v.choiceReason}` : ''}`)
      : ['（今天还没刷）']),
    '',
    '## 回复记录',
    ...(replies.length
      ? replies.map((r) => `- ${r.at} ${r.conversationId}${r.stranger ? '（陌生人）' : ''} ${r.status}`)
      : ['（今天还没回）']),
    '',
    '## 分享 / 发视频记录',
    ...(actions.filter((a) => a.type === 'share').length || posts.length
      ? [
          ...actions.filter((a) => a.type === 'share').map((a) => `- 分享 ${a.at} ${a.videoId} → ${a.personName ?? a.personId} ${a.status}`),
          ...posts.map((p) => `- 发视频 ${p.at} ${p.file} ${p.status}`),
        ]
      : ['（今天还没分享 / 发视频）']),
    '',
  ];
  const text = lines.join('\n');
  fs.mkdirSync(dataPaths(dataDir).dir, { recursive: true });
  fs.writeFileSync(reportFile, text, 'utf8');
  return { ok: true, date, watched: watched.length, replies: replies.length, file: reportFile, text };
}
