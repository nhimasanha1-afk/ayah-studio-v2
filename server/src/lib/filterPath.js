/**
 * Escapes a filesystem path for use as an FFmpeg filtergraph option value
 * (e.g. subtitles=..., fontsdir=...). Verified on Windows: a drive-letter
 * colon needs a double backslash escape to survive the filter's own
 * option-string parsing, not just the single backslash the docs imply.
 */
export function escapeForFilter(filePath) {
  return filePath.replace(/\\/g, '/').replace(/:/g, '\\\\:');
}

/**
 * Escapes a filesystem path for use inside a drawtext option (e.g.
 * fontfile=...). Verified on Windows: drawtext's own option parsing wants a
 * single backslash before the drive-letter colon, unlike subtitles'
 * filename/fontsdir which need double.
 */
export function escapeForDrawtextPath(filePath) {
  return filePath.replace(/\\/g, '/').replace(/:/g, '\\:');
}

/** Escapes literal text for use inside a quoted drawtext text='...' value. */
export function escapeDrawtextValue(text) {
  return text.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/%/g, '\\%');
}
