import fs from 'node:fs';
import path from 'node:path';
import { dataPaths } from './paths.mjs';
import { replyTo } from './dm.mjs';

const active = new Set();
export async function sendFromAurabot(dataDir, payload = {}) {
  const eventId = String(payload.eventId ?? '').trim();
  const conversationId = String(payload.conversationId ?? '').trim();
  const text = String(payload.text ?? '').trim();
  if (!eventId || !conversationId || !text) return { ok: false, error: 'missing-args', message: 'eventId、conversationId 和 text 均为必填项。' };
  if (eventId.length > 160 || conversationId.length > 200 || text.length > 2000) return { ok: false, error: 'invalid-size', message: '请求字段超过允许长度。' };
  if (active.has(eventId)) return { ok: false, duplicate: true, error: 'duplicate-in-flight', message: '该发送事件正在处理。' };
  const dir = dataPaths(dataDir).dir;
  const file = path.join(dir, 'aurabot-outbound.jsonl');
  fs.mkdirSync(dir, { recursive: true });
  const rows = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean) : [];
  for (const row of rows) {
    try { const item = JSON.parse(row); if (item.eventId === eventId) return { ok: false, duplicate: true, error: 'duplicate-event', message: '该 eventId 已处理，不会重复发送。', previous: item.status }; } catch {}
  }
  active.add(eventId);
  const append = (status, extra = {}) => fs.appendFileSync(file, JSON.stringify({ at: new Date().toISOString(), eventId, conversationId, status, ...extra }) + '\n', 'utf8');
  try {
    append('processing');
    // replyTo is the final permission and quota gate: only DSH-allowed contacts.
    const result = await replyTo(dataDir, { conversationId, text });
    append(result.sent ? 'sent' : result.uncertain ? 'uncertain' : 'failed', { result });
    return result;
  } finally { active.delete(eventId); }
}