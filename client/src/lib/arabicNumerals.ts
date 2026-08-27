// Mirrors server/src/lib/arabicNumerals.js.
const ARABIC_INDIC_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];

/** Converts a number's ASCII digits to Arabic-Indic digits (e.g. 112 -> ١١٢). */
export function toArabicIndicNumerals(n: number): string {
  return String(n)
    .split('')
    .map((ch) => (ch >= '0' && ch <= '9' ? ARABIC_INDIC_DIGITS[Number(ch)] : ch))
    .join('');
}
