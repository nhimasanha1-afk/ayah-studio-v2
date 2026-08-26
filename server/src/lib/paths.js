import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const SERVER_DIR = path.join(__dirname, '..', '..');

/**
 * Root of all persistent/regenerable state (exports, downloaded/generated
 * caches, uploads). Defaults to SERVER_DIR itself -- today's behavior,
 * everything under server/ -- so local dev and a plain `docker compose up`
 * are unaffected. Set DATA_DIR to a mounted disk's path in production
 * (e.g. Render's one-disk-one-path model) so this state survives restarts
 * and redeploys. See DEPLOYMENT.md.
 */
export const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : SERVER_DIR;

export const OUTPUT_DIR = path.join(DATA_DIR, 'output');

const DATA_ASSETS_DIR = path.join(DATA_DIR, 'assets');
export const AUDIO_DIR = path.join(DATA_ASSETS_DIR, 'audio');
export const BACKGROUNDS_DIR = path.join(DATA_ASSETS_DIR, 'backgrounds');
export const BACKGROUND_CLIPS_DIR = path.join(BACKGROUNDS_DIR, 'clips');
export const BACKGROUND_UPLOADS_DIR = path.join(BACKGROUNDS_DIR, 'uploads');
export const LOGOS_DIR = path.join(DATA_ASSETS_DIR, 'logos');
export const LOGO_UPLOADS_DIR = path.join(LOGOS_DIR, 'uploads');

// Fonts are checked-in, image-bundled assets -- never regenerable, so they
// always live with the code (SERVER_DIR), regardless of DATA_DIR.
export const FONTS_DIR = path.join(SERVER_DIR, 'assets', 'fonts');

// Scratch space (subtitle .ass files, in-flight uploads before they're
// moved into the DATA_DIR-backed asset dirs above) -- always local to the
// container, never on DATA_DIR. A real disk mount is necessarily a
// different filesystem from the container's own layer, so the resulting
// cross-device move is expected -- moveFile.js's EXDEV fallback covers it.
export const TMP_DIR = path.join(SERVER_DIR, 'tmp');
