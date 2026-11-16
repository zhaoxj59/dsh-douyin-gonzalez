import fs from 'node:fs';
import path from 'node:path';
import { dataPaths } from './paths.mjs';
import { replyTo } from './dm.mjs';
import { generateAurabotReply } from './aurabot-bridge.mjs';

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
export async function replyWithAurabot(dataDir, config, payload = {}) {
  const eventId = String(payload.eventId ?? '').trim();
  if (!eventId) return { ok: false, error: 'missing-event-id', message: '自动回复必须提供唯一 eventId。' };
  const dir = dataPaths(dataDir).dir;
  const file = path.join(dir, 'aurabot-inbound.jsonl');
  fs.mkdirSync(dir, { recursive: true });
  const rows = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean) : [];
  for (const row of rows) {
    try { const item = JSON.parse(row); if (item.eventId === eventId) return { ok: false, duplicate: true, error: 'duplicate-event', message: '该私信事件已处理，不会重复回复。', previous: item.status }; } catch {}
  }
  const append = (status, extra = {}) => fs.appendFileSync(file, JSON.stringify({ at: new Date().toISOString(), eventId, conversationId: String(payload.conversationId ?? ''), status, ...extra }) + '\n', 'utf8');
  append('processing');
  const generated = await generateAurabotReply(config, {
    eventId, conversationId: payload.conversationId, senderName: payload.senderName ?? '',
    text: payload.text, recentMessages: payload.recentMessages ?? [],
  });
  if (!generated?.ok || !String(generated.replyText ?? '').trim()) {
    append('generation-failed', { error: generated?.message ?? 'Aurabot reply empty' });
    return generated?.ok === false ? generated : { ok: false, error: 'empty-reply', message: 'Aurabot 未生成回复。' };
  }
  const sent = await replyTo(dataDir, { conversationId: payload.conversationId, text: generated.replyText });
  append(sent.sent ? 'sent' : sent.uncertain ? 'uncertain' : 'send-failed', { replyText: generated.replyText.slice(0, 500), result: sent });
  return { ...sent, replyText: generated.replyText };
}
