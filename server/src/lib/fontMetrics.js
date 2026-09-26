import fs from 'node:fs';

/**
 * How big libass actually renders a font, relative to what a browser (and so
 * the app's live preview) renders for the same nominal size.
 *
 * A browser's font-size is the em: 60px means the glyph em-box is 60px. ASS
 * (libass) instead makes the requested size the font's whole LINE BOX
 * (ascent + descent), so the em -- and every glyph -- comes out smaller by
 * unitsPerEm / (ascent + descent). For fonts with generous line boxes that
 * is severe: Noto Naskh Arabic renders at only ~49% of the browser size,
 * Noto Sans at ~66%. That is why exported captions looked much smaller than
 * the preview at the same chosen size. Dividing the ASS font size by this
 * scale makes the exported glyphs the size the preview shows.
 *
 * Measured directly, by rendering the same string in libass at size 100 and
 * in the browser at 100px (libass width / browser width):
 *   Noto Naskh Arabic 0.486, Amiri 0.361, Noto Sans 0.652-0.660,
 *   Noto Sans Devanagari 0.543, Noto Sans Thai 0.658
 * which agrees within a few percent with libass's documented rule (it mimics
 * VSFilter and uses the OS/2 win metrics), unitsPerEm / (winAscent +
 * winDescent) -- 0.490, 0.362, 0.658, 0.525, 0.662. That rule is used for
 * every 1000-upm font. The two 2048-upm fonts do NOT follow it (libass
 * renders them larger than the rule predicts), so their measured values are
 * pinned below.
 */
const MEASURED_EM_SCALE = {
  'Inter-Regular.ttf': 0.758,
  'ScheherazadeNew-Regular.ttf': 0.838,
};

const cache = new Map();

function readTables(buf) {
  const numTables = buf.readUInt16BE(4);
  const tables = {};
  for (let i = 0; i < numTables; i++) {
    const o = 12 + i * 16;
    tables[buf.toString('ascii', o, o + 4)] = buf.readUInt32BE(o + 8);
  }
  return tables;
}

export function libassEmScale(fontFilePath) {
  if (cache.has(fontFilePath)) return cache.get(fontFilePath);
  const name = fontFilePath.split(/[\\/]/).pop();
  let scale = MEASURED_EM_SCALE[name];
  if (scale === undefined) {
    const buf = fs.readFileSync(fontFilePath);
    const tables = readTables(buf);
    const unitsPerEm = buf.readUInt16BE(tables.head + 18);
    let lineBox = 0;
    if (tables['OS/2']) {
      lineBox = buf.readUInt16BE(tables['OS/2'] + 74) + buf.readUInt16BE(tables['OS/2'] + 76);
    }
    if (!lineBox && tables.hhea) {
      lineBox = buf.readInt16BE(tables.hhea + 4) - buf.readInt16BE(tables.hhea + 6);
    }
    scale = lineBox > 0 ? unitsPerEm / lineBox : 1;
  }
  cache.set(fontFilePath, scale);
  return scale;
}
