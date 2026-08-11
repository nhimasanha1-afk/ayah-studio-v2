import fs from 'node:fs';
import staticFfmpegPath from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';

// ffmpeg-static/ffprobe-static download one fixed pre-built binary per
// platform from eugeneware/ffmpeg-static's GitHub releases. Confirmed via a
// real "No such filter: 'drawtext'" failure in production that the Linux
// build is missing --enable-libharfbuzz, which drawtext requires (its
// configuration string has --enable-libfreetype and --enable-fontconfig,
// but not libharfbuzz) -- and every badge/watermark/intro/outro text in
// this app uses drawtext, so that binary can't render our real output on
// Linux. When a full-featured system ffmpeg/ffprobe is installed (see the
// Dockerfile's apt-get install), prefer it; the downloaded static binary
// remains the fallback for local dev (e.g. Windows, with no apt package to
// prefer).
const SYSTEM_FFMPEG_PATH = '/usr/bin/ffmpeg';
const SYSTEM_FFPROBE_PATH = '/usr/bin/ffprobe';

function resolveBinary(systemPath, fallbackPath) {
  try {
    if (fs.statSync(systemPath).isFile()) return systemPath;
  } catch {
    // not present -- fall through to the bundled static binary
  }
  return fallbackPath;
}

export const ffmpegPath = resolveBinary(SYSTEM_FFMPEG_PATH, staticFfmpegPath);
export const ffprobePath = resolveBinary(SYSTEM_FFPROBE_PATH, ffprobeStatic.path);
