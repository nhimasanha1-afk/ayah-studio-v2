// Maps Quran.com's `language_name` values (from /resources/translations)
// to the Unicode script actually used in that translation's text --
// verified by fetching a real sample verse per language and inspecting its
// codepoints, NOT guessed from the language name. That verification caught
// real surprises: Kurdish here is Arabic script (not Latin), Kazakh is
// Cyrillic (not Latin), while Uzbek and Azeri ARE Latin. Anything not
// listed defaults to 'latin' -- this covers the ~35 languages that
// genuinely are Latin script (French, Spanish, Indonesian, Turkish, etc.)
// without needing an explicit entry for each.
const LANGUAGE_SCRIPTS = {
  // Arabic script (RTL)
  dari: 'arabic',
  kurdish: 'arabic',
  pashto: 'arabic',
  persian: 'arabic',
  sindhi: 'arabic',
  'uighur, uyghur': 'arabic',
  urdu: 'arabic',
  // Bengali
  assamese: 'bengali',
  bengali: 'bengali',
  // Cyrillic (the bundled Noto Sans already covers this)
  bulgarian: 'cyrillic',
  chechen: 'cyrillic',
  kazakh: 'cyrillic',
  russian: 'cyrillic',
  tajik: 'cyrillic',
  tatar: 'cyrillic',
  ukrainian: 'cyrillic',
  // Devanagari
  hindi: 'devanagari',
  marathi: 'devanagari',
  nepali: 'devanagari',
  // Ethiopic
  amharic: 'ethiopic',
  // Gujarati
  gujarati: 'gujarati',
  // Han (Chinese)
  chinese: 'han',
  // Hangul (Korean)
  korean: 'hangul',
  // Hebrew (RTL)
  hebrew: 'hebrew',
  // Kana + Han (Japanese)
  japanese: 'kana',
  // Kannada
  kannada: 'kannada',
  // Khmer
  'central khmer': 'khmer',
  // Malayalam
  malayalam: 'malayalam',
  // N'Ko (RTL)
  bambara: 'nko',
  // Sinhala
  'sinhala, sinhalese': 'sinhala',
  // Tamil
  tamil: 'tamil',
  // Telugu
  telugu: 'telugu',
  // Thaana (RTL)
  divehi: 'thaana',
  'divehi, dhivehi, maldivian': 'thaana',
  // Thai
  thai: 'thai',
};

const RTL_SCRIPTS = new Set(['arabic', 'hebrew', 'thaana', 'nko']);

/** Resolves a Quran.com `language_name` to the script its translation text is actually written in. Defaults to 'latin'. */
export function scriptForLanguage(languageName) {
  const key = String(languageName ?? '').trim().toLowerCase();
  return LANGUAGE_SCRIPTS[key] ?? 'latin';
}

export function isRtlScript(script) {
  return RTL_SCRIPTS.has(script);
}
