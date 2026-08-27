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
