// Mirrors server/src/lib/styleConfig.js, introTiming.js and surahExport.js
// exactly, so the JSON sent to POST /api/export/surah needs no translation.

export type ArabicFontKey = 'noto-naskh' | 'amiri';
export type LatinFontKey = 'noto-sans' | 'inter';
export type BadgePosition =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';
export type TextPosition = 'upper-third' | 'center' | 'lower-third';
export type LogoShape = 'square' | 'circle' | 'rounded';
export type SurahBadgeVariant = 'inline' | 'stacked-title-card' | 'arabic-transliteration';
export type Resolution = '720p' | '1080p';
export type AspectRatio = '16:9' | '9:16';
export type TextRevealAnimation = 'none' | 'fade';
export type VideoFilter = 'none' | 'grayscale' | 'sepia' | 'warm' | 'cool' | 'vintage';
export type ZoomPanStyle = 'none' | 'zoom-in' | 'zoom-out' | 'pan-left' | 'pan-right';
export type TransitionStyle =
  | 'fade'
  | 'dissolve'
  | 'wipeleft'
  | 'wiperight'
  | 'slideleft'
  | 'slideright'
  | 'circleopen'
  | 'pixelize';

export const RESOLUTIONS: Resolution[] = ['720p', '1080p'];
export const ASPECT_RATIOS: AspectRatio[] = ['16:9', '9:16'];
export type BackgroundOrder = 'sequential' | 'shuffle';
export const TEXT_REVEAL_ANIMATIONS: TextRevealAnimation[] = ['none', 'fade'];
export const VIDEO_FILTERS: VideoFilter[] = ['none', 'grayscale', 'sepia', 'warm', 'cool', 'vintage'];
export const ZOOM_PAN_STYLES: ZoomPanStyle[] = ['none', 'zoom-in', 'zoom-out', 'pan-left', 'pan-right'];
export const TRANSITION_STYLES: TransitionStyle[] = [
  'fade',
  'dissolve',
  'wipeleft',
  'wiperight',
  'slideleft',
  'slideright',
  'circleopen',
  'pixelize',
];

export interface StyleConfig {
  typography: {
    arabicFont: ArabicFontKey;
    latinFont: LatinFontKey;
    arabicFontSize: number;
    translationFontSize: number;
  };
  colors: {
    arabicTextColor: string;
    translationTextColor: string;
    highlightColor: string;
    wordHighlightEnabled: boolean;
    outlineColor: string;
    outlineWidth: number;
    shadowDepth: number;
    textPosition: TextPosition;
    textRevealAnimation: TextRevealAnimation;
    scrim: { enabled: boolean; color: string; opacity: number };
    videoFilter: VideoFilter;
    backgroundBlur: number;
    backgroundZoomPan: ZoomPanStyle;
    showAyahNumbers: boolean;
    showArabicAyahNumbers: boolean;
  };
  badges: {
    watermark: { enabled: boolean; text: string; opacity: number; color: string; position: BadgePosition; fontSize: number };
    surahBadge: { enabled: boolean; position: BadgePosition; fontSize: number; variant: SurahBadgeVariant };
    channelLogo: { enabled: boolean; position: BadgePosition; size: number; shape: LogoShape; logoId: string | null };
    channelNameBadge: { enabled: boolean; text: string; position: BadgePosition; fontSize: number };
  };
}

export const DEFAULT_STYLE: StyleConfig = {
  typography: {
    arabicFont: 'noto-naskh',
    latinFont: 'noto-sans',
    arabicFontSize: 60,
    translationFontSize: 32,
  },
  colors: {
    arabicTextColor: '#FFFFFF',
    translationTextColor: '#E6E6E6',
    highlightColor: '#FFD700',
    wordHighlightEnabled: true,
    outlineColor: '#000000',
    outlineWidth: 2,
    shadowDepth: 1,
    textPosition: 'center',
    textRevealAnimation: 'none',
    scrim: { enabled: true, color: '#000000', opacity: 0.35 },
    videoFilter: 'none',
    backgroundBlur: 0,
    backgroundZoomPan: 'none',
    showAyahNumbers: false,
    showArabicAyahNumbers: false,
  },
  badges: {
    watermark: { enabled: false, text: '', opacity: 0.6, color: '#FFFFFF', position: 'bottom-center', fontSize: 22 },
    surahBadge: { enabled: true, position: 'top-left', fontSize: 22, variant: 'inline' },
    channelLogo: { enabled: false, position: 'top-right', size: 90, shape: 'circle', logoId: null },
    channelNameBadge: { enabled: false, text: '', position: 'bottom-left', fontSize: 20 },
  },
};

export const POSITIONS: BadgePosition[] = [
  'top-left',
  'top-center',
  'top-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
];
export const TEXT_POSITIONS: TextPosition[] = ['upper-third', 'center', 'lower-third'];
export const LOGO_SHAPES: LogoShape[] = ['square', 'circle', 'rounded'];

export const FONT_REGISTRY: {
  arabic: Record<ArabicFontKey, { family: string; label: string }>;
  latin: Record<LatinFontKey, { family: string; label: string }>;
} = {
  arabic: {
    'noto-naskh': { family: 'Noto Naskh Arabic', label: 'Noto Naskh Arabic' },
    amiri: { family: 'Amiri', label: 'Amiri' },
  },
  latin: {
    'noto-sans': { family: 'Noto Sans', label: 'Noto Sans' },
    inter: { family: 'Inter', label: 'Inter' },
  },
};

// Mirrors server/src/lib/videoComposition.js's buildAudioFilterComplex
// audioSyncOffsetMs/volumeMultiplier -- both apply to the main recitation
// audio only (never Bismillah), independent of caption timing.
export interface AudioSyncConfig {
  offsetMs: number;
  volumeMultiplier: number;
}

export const DEFAULT_AUDIO_SYNC: AudioSyncConfig = {
  offsetMs: 0,
  volumeMultiplier: 1,
};

// Mirrors server/src/lib/surahExport.js's captionTiming.displayDelayMs --
// shifts ONLY caption timing, the intentional mirror of audioSync.offsetMs
// which shifts only audio.
export interface CaptionTimingConfig {
  displayDelayMs: number;
}

export const DEFAULT_CAPTION_TIMING: CaptionTimingConfig = {
  displayDelayMs: 0,
};

// Mirrors server/src/lib/surahExport.js's outro handling -- a fixed block
// of extra time appended after the main content with a centered text card.
export interface OutroConfig {
  enabled: boolean;
  durationMs: number;
  line1: string;
  line2: string;
  // Optional override shown behind the card instead of the main background,
  // for this window only. Shares the exact same id space as
  // BackgroundConfig.clipIds (curated library id, or an uploaded video's
  // clipId) plus uploaded card image ids (see backendApi.ts's
  // uploadCardImage) -- null means "use the main background" (unchanged
  // behavior).
  cardBackgroundClipId: string | null;
  // Opacity (0-1) of the black scrim drawn over the card background so the
  // text stays readable. Was a hardcoded 0.55; a custom card image/video can
  // need more or less darkening to stay legible, so this is user-adjustable.
  overlayOpacity: number;
}

export const DEFAULT_OUTRO: OutroConfig = {
  enabled: false,
  durationMs: 4000,
  line1: 'JazakAllah Khair for watching',
  line2: '',
  cardBackgroundClipId: null,
  overlayOpacity: 0.55,
};

// Mirrors server/src/lib/introTiming.js's computeIntroTimingWindow inputs.
export interface IntroConfig {
  introCardEnabled: boolean;
  bismillahTextEnabled: boolean;
  bismillahAudioEnabled: boolean;
  introCardDurationMs: number;
  // Same override as OutroConfig.cardBackgroundClipId, but for the intro window.
  cardBackgroundClipId: string | null;
  // Same adjustable darkening scrim as OutroConfig.overlayOpacity, drawn
  // full-frame over whatever's showing during the intro window (the custom
  // card background, or the main rotation if none is set).
  overlayOpacity: number;
}

export const DEFAULT_INTRO: IntroConfig = {
  introCardEnabled: false,
  bismillahTextEnabled: false,
  bismillahAudioEnabled: false,
  introCardDurationMs: 6000,
  cardBackgroundClipId: null,
  overlayOpacity: 0.55,
};

// Mirrors server/src/lib/surahExport.js's resolveBackground input shape.
export interface BackgroundConfig {
  clipIds: string[];
  order: BackgroundOrder;
  slotDurationSeconds: number;
  transitionDurationSeconds: number;
  transitionStyle: TransitionStyle;
}

export const DEFAULT_BACKGROUND: BackgroundConfig = {
  clipIds: [],
  order: 'sequential',
  slotDurationSeconds: 8,
  transitionDurationSeconds: 1,
  transitionStyle: 'fade',
};

// Mirrors server/src/lib/backgroundVideoUpload.js's persistBackgroundVideoUpload
// result -- an uploaded clip isn't in the curated BackgroundLibrary, so its
// display title has to be tracked client-side once uploaded.
export interface UploadedBackgroundClip {
  id: string;
  title: string;
}

// Mirrors server/src/lib/cardImageUpload.js's persistCardImageUpload result
// -- an uploaded intro/outro card background image, tracked client-side
// once uploaded the same way an uploaded background video is.
export interface UploadedCardImage {
  id: string;
  title: string;
}

// Mirrors server/src/lib/backgroundLibrary.js entries. sourcePageUrl/license/
// attribution are only present for clips whose source exposes that metadata
// (e.g. Wikimedia) -- omitted rather than fabricated for sources that don't
// (e.g. Mixkit has no public per-file license API).
export interface BackgroundClip {
  id: string;
  title: string;
  url: string;
  sourcePageUrl?: string;
  license?: string;
  attribution?: string;
}

export type BackgroundLibrary = Record<string, BackgroundClip[]>;
