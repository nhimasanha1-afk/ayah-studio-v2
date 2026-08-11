// Mirrors server/src/lib/translationFonts.js -- keep in sync. Maps
// Quran.com's `language_name` values to the Unicode script actually used
// in that translation's text, verified by fetching real sample verses and
// inspecting codepoints (not guessed from the language name -- e.g. Kurdish
// here is Arabic script, Kazakh is Cyrillic, while Uzbek/Azeri are Latin).
const LANGUAGE_SCRIPTS: Record<string, string> = {
  dari: 'arabic',
  kurdish: 'arabic',
  pashto: 'arabic',
  persian: 'arabic',
  sindhi: 'arabic',
  'uighur, uyghur': 'arabic',
  urdu: 'arabic',
  assamese: 'bengali',
  bengali: 'bengali',
  bulgarian: 'cyrillic',
  chechen: 'cyrillic',
  kazakh: 'cyrillic',
  russian: 'cyrillic',
  tajik: 'cyrillic',
  tatar: 'cyrillic',
  ukrainian: 'cyrillic',
  hindi: 'devanagari',
  marathi: 'devanagari',
  nepali: 'devanagari',
  amharic: 'ethiopic',
  gujarati: 'gujarati',
  chinese: 'han',
  korean: 'hangul',
  hebrew: 'hebrew',
  japanese: 'kana',
  kannada: 'kannada',
  'central khmer': 'khmer',
  malayalam: 'malayalam',
  bambara: 'nko',
  'sinhala, sinhalese': 'sinhala',
  tamil: 'tamil',
  telugu: 'telugu',
  divehi: 'thaana',
  'divehi, dhivehi, maldivian': 'thaana',
  thai: 'thai',
};

const RTL_SCRIPTS = new Set(['arabic', 'hebrew', 'thaana', 'nko']);

/** Resolves a Quran.com `language_name` to the script its translation text is actually written in. Defaults to 'latin'. */
export function scriptForLanguage(languageName: string | undefined | null): string {
  const key = String(languageName ?? '').trim().toLowerCase();
  return LANGUAGE_SCRIPTS[key] ?? 'latin';
}

export function isRtlScript(script: string): boolean {
  return RTL_SCRIPTS.has(script);
}

// One font per non-Latin/non-Cyrillic/non-Arabic script -- mirrors
// server/src/lib/styleConfig.js's TRANSLATION_SCRIPT_FONTS. Font files
// live in client/public/fonts/ with @font-face declarations in index.css.
export const TRANSLATION_SCRIPT_FONTS: Record<string, { family: string }> = {
  bengali: { family: 'Noto Sans Bengali' },
  devanagari: { family: 'Noto Sans Devanagari' },
  ethiopic: { family: 'Noto Sans Ethiopic' },
  gujarati: { family: 'Noto Sans Gujarati' },
  han: { family: 'Noto Sans SC' },
  hangul: { family: 'Noto Sans KR' },
  hebrew: { family: 'Noto Sans Hebrew' },
  kana: { family: 'Noto Sans JP' },
  kannada: { family: 'Noto Sans Kannada' },
  khmer: { family: 'Noto Sans Khmer' },
  malayalam: { family: 'Noto Sans Malayalam' },
  nko: { family: 'Noto Sans NKo' },
  sinhala: { family: 'Noto Sans Sinhala' },
  tamil: { family: 'Noto Sans Tamil' },
  telugu: { family: 'Noto Sans Telugu' },
  thaana: { family: 'Noto Sans Thaana' },
  thai: { family: 'Noto Sans Thai' },
};
