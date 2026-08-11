const QURAN_API_BASE = 'https://api.quran.com/api/v4';

export interface Chapter {
  id: number;
  name_simple: string;
  name_arabic: string;
  revelation_place: string;
  verses_count: number;
  translated_name: { name: string };
}

export interface Reciter {
  id: number;
  reciter_name: string;
  style: string | null;
  translated_name: { name: string };
}

export interface Translation {
  id: number;
  name: string;
  author_name: string;
  language_name: string;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Request failed (${res.status} ${res.statusText}): ${url}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchChapters(): Promise<Chapter[]> {
  const data = await getJson<{ chapters: Chapter[] }>(`${QURAN_API_BASE}/chapters?language=en`);
  return data.chapters;
}

export async function fetchReciters(): Promise<Reciter[]> {
  const data = await getJson<{ recitations: Reciter[] }>(`${QURAN_API_BASE}/resources/recitations?language=en`);
  return data.recitations;
}

export async function fetchTranslations(): Promise<Translation[]> {
  // `language=en` only controls what language Quran.com's own resource
  // NAME labels come back in -- it does not restrict which languages'
  // translations are returned. Quran.com genuinely offers ~126 translations
  // across ~69 languages here; don't filter them down.
  const data = await getJson<{ translations: Translation[] }>(`${QURAN_API_BASE}/resources/translations?language=en`);
  return data.translations;
}

export interface PreviewVerse {
  textUthmani: string;
  translationText: string;
}

function stripTranslationMarkup(html: string): string {
  return html
    .replace(/<sup[^>]*>.*?<\/sup>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Fetches just verse 1 of a chapter, for a lightweight (non-timed) preview -- not the full export data. */
export async function fetchFirstVerse(chapterId: number, translationId: number): Promise<PreviewVerse> {
  const data = await getJson<{ verses: { text_uthmani: string; translations: { text: string }[] }[] }>(
    `${QURAN_API_BASE}/verses/by_chapter/${chapterId}?language=en&translations=${translationId}&fields=text_uthmani&per_page=1`
  );
  const verse = data.verses[0];
  return {
    textUthmani: verse.text_uthmani.trim(),
    translationText: stripTranslationMarkup(verse.translations[0]?.text ?? ''),
  };
}
