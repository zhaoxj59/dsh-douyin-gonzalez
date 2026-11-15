// v0.2.0 feature 5: auto post to Douyin.
// Hard gates — posting is the most dangerous action in this plugin:
//   1. autoPost.enabled must be ON in config.json AND perDay > 0.
//   2. The caller MUST pass an explicit local file path + a count.
//      There is no "post whatever you find" mode: no file = no post.
//   3. The file must exist, be a video file, and be under 2 GB.
//   4. Daily post cap (caps.postPerDay / autoPost.perDay) is enforced.
//   5. Every attempt (sent / failed / uncertain) is logged to
//      post-log.jsonl with the file name (never the file contents).
// The actual upload goes through the browser module (best-effort
// selectors, selector-mismatch instead of pretending to work).
import fs from 'node:fs';
import path from 'node:path';
import { dataPaths } from './paths.mjs';
import { appendJsonl, readJsonl } from './store.mjs';

const VIDEO_EXTS = new Set(['.mp4', '.mov', '.webm', '.mkv', '.avi']);

export function postsToday(dataDir, today = new Date().toISOString().slice(0, 10)) {
  const { postLogFile } = dataPaths(dataDir);
  return readJsonl(postLogFile).filter((e) => e?.status === 'sent' && String(e.at ?? '').startsWith(today)).length;
}

export function canPost(dataDir, config, { file } = {}) {
  if (!config?.autoPost?.enabled) return { ok: false, reason: 'disabled', message: '自动发视频未开启（设置页里打开开关并设好每日次数）。' };
  const cap = Math.min(config.autoPost.perDay ?? 0, config.caps?.postPerDay ?? 0);
  if (cap <= 0) return { ok: false, reason: 'cap-zero', message: '每日发视频次数是 0，等于没开。先在设置页把次数设成 ≥1。' };
  if (!file) return { ok: false, reason: 'no-file', message: '发视频必须给一个本地视频文件路径，没有文件不发。' };
  const ext = path.extname(String(file)).toLowerCase();
  if (!VIDEO_EXTS.has(ext)) return { ok: false, reason: 'not-video', message: `文件不是视频格式（${ext}），只接受 mp4 / mov / webm / mkv / avi。` };
  let size = -1;
  try { size = fs.statSync(file).size; } catch { return { ok: false, reason: 'file-missing', message: `找不到文件：${file}` }; }
  if (size > 2 * 1024 * 1024 * 1024) return { ok: false, reason: 'too-big', message: '文件超过 2 GB，不发。' };
  const used = postsToday(dataDir);
  if (used >= cap) return { ok: false, reason: 'cap', message: `今日发视频已达上限 ${cap} 条（已发 ${used} 条）。` };
  return { ok: true, used, cap, file, size };
}

export async function postVideo(dataDir, config, { file, caption = '', uploadFn }) {
  const gate = canPost(dataDir, config, { file });
  if (!gate.ok) return { ok: false, ...gate };
  const { postLogFile } = dataPaths(dataDir);
  const result = await uploadFn({ file, caption });
  const entry = {
    at: new Date().toISOString(),
    status: result?.sent ? 'sent' : (result?.uncertain ? 'uncertain' : 'failed'),
    file: path.basename(String(file)),
    caption: String(caption).slice(0, 200),
    error: result?.message ?? result?.error ?? undefined,
  };
  appendJsonl(postLogFile, entry);
  if (result?.sent) return { ok: true, sent: true, file: entry.file, logFile: postLogFile };
  return { ok: false, sent: false, uncertain: Boolean(result?.uncertain), message: result?.message ?? '发布失败，未自动重发。' };
}
