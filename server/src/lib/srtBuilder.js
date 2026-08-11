function formatSrtTime(ms) {
  const totalMs = Math.max(0, Math.round(ms));
  const milliseconds = totalMs % 1000;
  const totalSeconds = Math.floor(totalMs / 1000);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(milliseconds).padStart(3, '0')}`;
}

function srtEntry(index, startMs, endMs, lines) {
  return `${index}\n${formatSrtTime(startMs)} --> ${formatSrtTime(endMs)}\n${lines.join('\n')}\n`;
}

/**
 * Builds an .srt file from the same caption data (and, when applicable,
 * the same intro/Bismillah window) already computed for the burned-in
 * video captions -- no separate timing calculation. Captions are per verse
 * (Arabic + translation on two lines), which reads far better as an .srt
 * track than one entry per word would.
 *
 * The Bismillah entry follows the same visibility rule as the video: it's
 * only included when showBismillahText is true, regardless of whether
 * Bismillah audio is playing -- text visibility and audio playback stay
 * independent everywhere in this pipeline, including here.
 */
export function buildSrt(captionData, introWindow) {
  const entries = [];
  let index = 1;

  if (introWindow && introWindow.windowMs > 0 && introWindow.showBismillahText && introWindow.bismillahText) {
    entries.push(srtEntry(index++, 0, introWindow.windowMs, [introWindow.bismillahText]));
  }

  for (const verse of captionData.verses) {
    if (verse.startMs == null || verse.endMs == null) continue;
    const lines = [verse.arabicText];
    if (verse.translationText) lines.push(verse.translationText);
    entries.push(srtEntry(index++, verse.startMs, verse.endMs, lines));
  }

  return entries.join('\n');
}
