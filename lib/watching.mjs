// v0.3.0 看片 (watching): long-video thresholds + OCR / transcript
// best-effort. Honest by design: on this Linux VM there is no Windows
// OCR and no Whisper binary, so analyzeVideo() reports
// ocr: 'not-available' / transcript: 'not-available' and SKIPS the
// content-dependent action instead of pretending it watched the video.
// On Windows the same shape is returned with ocr: 'windows-ocr'
// (caller uses the OS OCR) — the gate logic is identical either way.
export function classifyDuration(durationMin, config) {
  const skipOver = config?.watch?.skipOverMin ?? 60;
  const skimOver = config?.watch?.skimOverMin ?? 5;
  if (durationMin > skipOver) return { action: 'skip', reason: `视频 ${durationMin} 分钟，超过划走阈值 ${skipOver} 分钟，直接划走` };
  if (durationMin > skimOver) return { action: 'skim', reason: `视频 ${durationMin} 分钟，超过跳着看阈值 ${skimOver} 分钟，跳着看` };
  return { action: 'watch', reason: '时长在阈值内，正常看' };
}

export function analyzeVideo(video, config) {
  const duration = classifyDuration(Number(video.durationMin ?? 0), config);
  const ocrOn = Boolean(config?.watch?.ocr);
  const transcriptOn = Boolean(config?.watch?.transcript);
  const isWindows = process.platform === 'win32';
  const ocr = !ocrOn ? { status: 'off' }
    : isWindows ? { status: 'windows-ocr', note: '用 Windows 自带 OCR 读画面文字（本机未实测，失败会报 selector-mismatch / ocr-failed，不假装读到）' }
    : { status: 'not-available', note: '这台机器没有 Windows OCR，OCR 不可用' };
  const transcript = !transcriptOn ? { status: 'off' }
    : { status: 'not-available', note: '本地 Whisper 未装：装 faster-whisper 后才能转写；没转写成功就不做依赖内容的评论/转发' };
  const watchBeforeAct = config?.watch?.watchBeforeAct !== false;
  const contentReady = !watchBeforeAct || (ocr.status !== 'not-available' && transcript.status !== 'not-available');
  // If watchBeforeAct is on and the content layer is unavailable, the
  // caller must skip the content-dependent action (not fake it).
  return {
    ok: true,
    videoId: video.videoId ?? '',
    duration,
    ocr,
    transcript,
    silent: config?.watch?.silent !== false,
    minimize: Boolean(config?.watch?.minimize),
    contentReady,
    message: contentReady
      ? '看片层就绪（或未要求先看片）。'
      : '看片层不可用（OCR/转写没装好）：依赖内容的评论/转发先跳过，别假装看完。',
  };
}
