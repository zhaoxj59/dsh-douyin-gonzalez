// v0.3.0 发片包 (publish): draft + title template + ComfyUI latest file.
// Posting itself stays in lib/post.mjs (hard gates); this module only
// prepares WHAT to post and WHERE it came from.
import fs from 'node:fs';
import path from 'node:path';

const VIDEO_EXTS = new Set(['.mp4', '.mov', '.webm', '.mkv', '.avi']);

export function renderTitle(config, date = new Date()) {
  const tpl = config?.publish?.titleTemplate ?? '大肥鱼的日常 {date}';
  const d = date.toISOString().slice(0, 10);
  return tpl.replaceAll('{date}', d);
}
export function renderCaption(config, caption = '') {
  const tags = String(config?.publish?.defaultTags ?? '').trim();
  const base = String(caption ?? '').trim();
  return [base, tags].filter(Boolean).join(' ');
}
export function isDraft(config) {
  return config?.publish?.draftDefault !== false;
}

// ComfyUI: pick the newest video in the output dir. Optional —
// ComfyUI not installed = this returns not-configured, never fakes a file.
export function latestComfyuiVideo(config) {
  if (!config?.comfyui?.enabled) return { ok: false, reason: 'disabled', message: 'ComfyUI 未开启（设置页 → 发片包）。' };
  const dir = String(config.comfyui.outputDir ?? '').trim();
  if (!dir) return { ok: false, reason: 'no-output-dir', message: '没填 ComfyUI 输出目录，先填目录再取最新成片。' };
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch {
    return { ok: false, reason: 'dir-missing', message: `找不到 ComfyUI 输出目录：${dir}` };
  }
  const videos = entries
    .filter((e) => e.isFile() && VIDEO_EXTS.has(path.extname(e.name).toLowerCase()))
    .map((e) => ({ file: path.join(dir, e.name), mtime: fs.statSync(path.join(dir, e.name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  if (!videos.length) return { ok: false, reason: 'no-video', message: `ComfyUI 输出目录里没有视频文件：${dir}` };
  return { ok: true, file: videos[0].file, url: config.comfyui.url };
}
