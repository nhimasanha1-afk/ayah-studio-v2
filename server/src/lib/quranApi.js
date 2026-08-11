const QURAN_API_BASE = 'https://api.quran.com/api/v4';
const QDC_API_BASE = 'https://api.qurancdn.com/api/qdc';

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Request failed (${res.status} ${res.statusText}): ${url}`);
  }
  return res.json();
}

export async function fetchChapter(chapterId) {
  const { chapter } = await getJson(`${QURAN_API_BASE}/chapters/${chapterId}?language=en`);
  return chapter;
}

/** Verses with Uthmani Arabic text and one translation, in verse order. */
export async function fetchVerses(chapterId, translationId) {
  const url = `${QURAN_API_BASE}/verses/by_chapter/${chapterId}?language=en&translations=${translationId}&fields=text_uthmani&per_page=300`;
  const { verses } = await getJson(url);
  return verses;
}

/** Real word-by-word timing + audio URL for a reciter/chapter, from the qdc segments endpoint. */
export async function fetchReciterAudioFile(reciterId, chapterId) {
  const url = `${QDC_API_BASE}/audio/reciters/${reciterId}/audio_files?chapter=${chapterId}&segments=true`;
  const { audio_files } = await getJson(url);
  if (!audio_files || audio_files.length === 0) {
    throw new Error(`No audio file found for reciter ${reciterId}, chapter ${chapterId}`);
  }
  return audio_files[0];
}

/** Strips Quran.com's translation footnote markup (e.g. <sup foot_note=...>1</sup>) and other HTML. */
export function stripTranslationMarkup(html) {
  return html
    .replace(/<sup[^>]*>.*?<\/sup>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
