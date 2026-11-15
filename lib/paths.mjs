// Data-dir resolution. Original code, written for this plugin.
// Douyin login lives ONLY in the Edge profile; no cookie / password is
// ever written by this plugin. All local state is plain JSON/JSONL here.
import { homedir } from 'node:os';
import path from 'node:path';

export function resolveDataDir(override) {
  if (override) return path.resolve(override);
  if (process.env.DSH_DOUYIN_DATA_DIR) return path.resolve(process.env.DSH_DOUYIN_DATA_DIR);
  return path.join(homedir(), '.dsh', 'douyin-duty');
}

export function dataPaths(dataDir) {
  const dir = resolveDataDir(dataDir);
  return {
    dir,
    allowedFile: path.join(dir, 'allowed.json'),
    configFile: path.join(dir, 'config.json'),
    chatsFile: path.join(dir, 'chats.json'),
    watchLogFile: path.join(dir, 'watch-log.jsonl'),
    replyLogFile: path.join(dir, 'reply-log.jsonl'),
    actionLogFile: path.join(dir, 'action-log.jsonl'),
    postLogFile: path.join(dir, 'post-log.jsonl'),
    reportFile: path.join(dir, 'daily-report.md'),
    edgeProfileDir: path.join(dir, 'edge-profile'),
    // v0.3.0 (safety / interact / discover / publish)
    memoryDir: path.join(dir, 'memory'),
    sparkLogFile: path.join(dir, 'spark-log.jsonl'),
    riskLogFile: path.join(dir, 'risk-log.jsonl'),
    riskStateFile: path.join(dir, 'risk-state.json'),
    favoritesFile: path.join(dir, 'favorites.json'),
    stickersFile: path.join(dir, 'stickers.json'),
    myPostsFile: path.join(dir, 'my-posts.json'),
    patrolFile: path.join(dir, 'patrol-state.json'),
    thumbsDir: path.join(dir, 'thumbs'),
    mediaDir: path.join(dir, 'media'),
  };
}
