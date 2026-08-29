import { useEffect, useMemo, useRef, useState } from 'react';
import { useBackgroundLibrary, usePreviewData } from '../lib/hooks';
import { badgePositionStyle, introTextTopPct, scrimStyle } from '../lib/previewLayout';
import { FONT_REGISTRY } from '../lib/types';
import { isRtlScript, scriptForLanguage, TRANSLATION_SCRIPT_FONTS } from '../lib/translationFonts';
import { toArabicIndicNumerals } from '../lib/arabicNumerals';
import { useExportConfigStore } from '../state/exportConfigStore';

/** Mirrors server/src/lib/assBuilder.js's resolveTranslationFontFamily. */
function resolveTranslationFontFamily(latinFont: 'noto-sans' | 'inter', script: string): string {
  if (script === 'latin' || script === 'cyrillic') return FONT_REGISTRY.latin[latinFont].family;
  if (script === 'arabic') return FONT_REGISTRY.arabic['noto-naskh'].family;
  return TRANSLATION_SCRIPT_FONTS[script]?.family ?? FONT_REGISTRY.latin[latinFont].family;
}

const LOGO_SHAPE_RADIUS: Record<string, string> = {
  square: '0',
  rounded: '18%',
  circle: '50%',
};

function formatTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Mirrors server/src/lib/assBuilder.js's ﴿N﴾ ornate-parenthesis marker --
    plain text in the line's own font, since these are ordinary glyphs in
    both bundled Arabic fonts (unlike the old U+06DD circle ligature, which
    needed a special font and didn't shape the same way in Chrome). */
function AyahNumberBadge({ verseNumber }: { verseNumber: number }) {
  return <span style={{ marginInlineStart: '0.2em' }}>{'﴿' + toArabicIndicNumerals(verseNumber) + '﴾'}</span>;
}

export function PreviewPane() {
  const chapterId = useExportConfigStore((s) => s.chapterId);
  const reciterId = useExportConfigStore((s) => s.reciterId);
  const translationId = useExportConfigStore((s) => s.translationId);
  const translationLanguage = useExportConfigStore((s) => s.translationLanguage);
  const style = useExportConfigStore((s) => s.style);
  const intro = useExportConfigStore((s) => s.intro);
  const background = useExportConfigStore((s) => s.background);
  const aspectRatio = useExportConfigStore((s) => s.aspectRatio);

  const preview = usePreviewData(chapterId, reciterId, translationId);
  const library = useBackgroundLibrary();

  const chapter = preview.data?.chapter;
  const hasIntroWindow = intro.introCardEnabled || intro.bismillahTextEnabled || intro.bismillahAudioEnabled;
  const [showIntro, setShowIntro] = useState(false);

  const firstClipUrl = useMemo(() => {
    if (background.clipIds.length === 0 || !library.data) return null;
    const allClips = Object.values(library.data).flat();
    return allClips.find((c) => c.id === background.clipIds[0])?.url ?? null;
  }, [background.clipIds, library.data]);

  const translationScript = scriptForLanguage(translationLanguage);
  const translationFontFamily = resolveTranslationFontFamily(style.typography.latinFont, translationScript);
  const [videoFailed, setVideoFailed] = useState(false);
  useEffect(() => setVideoFailed(false), [firstClipUrl]);

  // Real playback state -- this is a genuine <audio> player over the real
  // recitation audio (a plain <audio src>, not a fetch(), so no CORS
  // concerns loading it from Quran.com's CDN), not a simulated timeline.
  const audioRef = useRef<HTMLAudioElement>(null);
  const bgVideoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentMs, setCurrentMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);

  // A new chapter/reciter means a new <audio src>, which the browser
  // implicitly resets -- mirror that in our own state too.
  useEffect(() => {
    setIsPlaying(false);
    setCurrentMs(0);
    setDurationMs(0);
  }, [preview.data?.audioUrl]);

  // Keep the looping background video's own play state in lockstep with the
  // real audio, so pausing/playing the recitation pauses/plays the visual
  // background too, instead of it looping independently forever.
  useEffect(() => {
    const v = bgVideoRef.current;
    if (!v) return;
    if (isPlaying) v.play().catch(() => {});
    else v.pause();
  }, [isPlaying, firstClipUrl]);

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) audio.play().catch(() => {});
    else audio.pause();
  }

  function handleSeek(ms: number) {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = ms / 1000;
    setCurrentMs(ms);
  }

  // The verse whose real [startMs, endMs) window contains the current
  // playback position -- before playback starts this is verse 1, and once
  // playback runs past the last verse's real end it stays on that verse
  // rather than going blank.
  const currentVerse = useMemo(() => {
    const verses = preview.data?.verses;
    if (!verses || verses.length === 0) return null;
    const match = verses.find((v) => v.startMs != null && v.endMs != null && currentMs >= v.startMs && currentMs < v.endMs);
    if (match) return match;
    return currentMs <= 0 ? verses[0] : verses[verses.length - 1];
  }, [preview.data, currentMs]);

  const currentWordIndex = useMemo(() => {
    if (!currentVerse) return -1;
    return currentVerse.words.findIndex(
      (w) => w.startMs != null && w.endMs != null && currentMs >= w.startMs && currentMs < w.endMs
    );
  }, [currentVerse, currentMs]);

  const isVertical = aspectRatio === '9:16';

  return (
    <div className="space-y-2">
      <div
        className={`relative overflow-hidden rounded-lg border border-neutral-800 bg-black ${isVertical ? 'mx-auto' : 'w-full'}`}
        style={
          isVertical
            ? { aspectRatio: '9 / 16', height: 'min(70vh, 720px)' }
            : { aspectRatio: '16 / 9' }
        }
      >
        {/* Background */}
        {firstClipUrl && !videoFailed ? (
          <video
            key={firstClipUrl}
            ref={bgVideoRef}
            className="absolute inset-0 h-full w-full object-cover"
            src={firstClipUrl}
            muted
            loop
            playsInline
            onError={() => setVideoFailed(true)}
          />
        ) : (
          <div
            className="absolute inset-0"
            style={{ background: 'linear-gradient(120deg, #0b1f1a 0%, #1c3d33 60%, #1c3d33 100%)' }}
          />
        )}

        {/* Surah badge (persistent) */}
        {style.badges.surahBadge.enabled && chapter && (
          <div
            style={{ ...badgePositionStyle(style.badges.surahBadge.position), fontFamily: 'Inter' }}
            className={`text-white ${style.badges.surahBadge.variant === 'stacked-title-card' ? 'bg-black/60 rounded px-3 py-2 text-center' : ''}`}
          >
            {style.badges.surahBadge.variant === 'stacked-title-card' ? (
              <div style={{ fontSize: Math.round(style.badges.surahBadge.fontSize * 0.6) }}>
                <div>{chapter.nameSimple}</div>
                <div className="opacity-80">{chapter.translatedName} • {chapter.id}</div>
              </div>
            ) : style.badges.surahBadge.variant === 'arabic-transliteration' ? (
              <div className="text-center drop-shadow">
                <div
                  style={{
                    fontFamily: FONT_REGISTRY.arabic[style.typography.arabicFont].family,
                    fontSize: Math.round((style.badges.surahBadge.fontSize + 6) * 0.6),
                  }}
                >
                  {chapter.nameArabic}
                </div>
                <div style={{ fontSize: Math.round(style.badges.surahBadge.fontSize * 0.5) }}>{chapter.nameSimple.toUpperCase()}</div>
              </div>
            ) : (
              <span style={{ fontSize: Math.round(style.badges.surahBadge.fontSize * 0.55) }} className="drop-shadow">
                {chapter.nameSimple} • {chapter.translatedName} • {chapter.id}
              </span>
            )}
          </div>
        )}

        {/* Watermark */}
        {style.badges.watermark.enabled && style.badges.watermark.text && (
          <div
            style={{
              ...badgePositionStyle(style.badges.watermark.position),
              color: style.badges.watermark.color,
              opacity: style.badges.watermark.opacity,
              fontFamily: 'Inter',
              fontSize: Math.round(style.badges.watermark.fontSize * 0.5),
            }}
          >
            {style.badges.watermark.text}
          </div>
        )}

        {/* Channel name badge */}
        {style.badges.channelNameBadge.enabled && style.badges.channelNameBadge.text && (
          <div
            style={{
              ...badgePositionStyle(style.badges.channelNameBadge.position),
              color: 'white',
              fontFamily: 'Inter',
              fontSize: Math.round(style.badges.channelNameBadge.fontSize * 0.55),
            }}
          >
            {style.badges.channelNameBadge.text}
          </div>
        )}

        {/* Channel logo: real uploaded image if present, else the placeholder monogram */}
        {style.badges.channelLogo.enabled &&
          (style.badges.channelLogo.logoId ? (
            <img
              src={`/uploads/logos/${style.badges.channelLogo.logoId}`}
              alt="Channel logo"
              style={{
                ...badgePositionStyle(style.badges.channelLogo.position),
                width: `${(style.badges.channelLogo.size / 1280) * 100}%`,
                aspectRatio: '1 / 1',
                objectFit: 'cover',
                borderRadius: LOGO_SHAPE_RADIUS[style.badges.channelLogo.shape],
              }}
            />
          ) : (
            <div
              style={{
                ...badgePositionStyle(style.badges.channelLogo.position),
                width: `${(style.badges.channelLogo.size / 1280) * 100}%`,
                aspectRatio: '1 / 1',
                background: '#B8860B',
                borderRadius: LOGO_SHAPE_RADIUS[style.badges.channelLogo.shape],
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontFamily: 'Inter',
                fontSize: 14,
              }}
            >
              A
            </div>
          ))}

        {/* Caption / intro area */}
        <div style={scrimStyle(style.colors.textPosition)} className={style.colors.scrim.enabled ? '' : ''}>
          {style.colors.scrim.enabled && (
            <div
              className="absolute inset-0"
              style={{ background: style.colors.scrim.color, opacity: style.colors.scrim.opacity }}
            />
          )}
          <div className="relative flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
            {showIntro ? (
              <>
                {intro.bismillahTextEnabled && (
                  <p
                    style={{
                      fontFamily: FONT_REGISTRY.arabic[style.typography.arabicFont].family,
                      fontSize: Math.round(style.typography.arabicFontSize * 0.6),
                      color: style.colors.arabicTextColor,
                      WebkitTextStroke: `${style.colors.outlineWidth * 0.5}px ${style.colors.outlineColor}`,
                    }}
                  >
                    بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ
                  </p>
                )}
                {!intro.bismillahTextEnabled && !intro.introCardEnabled && (
                  <p className="text-xs text-neutral-500">Bismillah audio only (no text shown) — silent in preview</p>
                )}
              </>
            ) : (
              <>
                {preview.loading && <p className="text-xs text-neutral-500">Loading preview…</p>}
                {preview.error && <p className="text-xs text-red-400">Failed to load preview: {preview.error}</p>}
                {currentVerse && (
                  <>
                    <p
                      dir="rtl"
                      style={{
                        fontFamily: FONT_REGISTRY.arabic[style.typography.arabicFont].family,
                        fontSize: Math.round(style.typography.arabicFontSize * 0.6),
                        color: style.colors.arabicTextColor,
                        WebkitTextStroke: `${style.colors.outlineWidth * 0.5}px ${style.colors.outlineColor}`,
                      }}
                    >
                      {currentVerse.words.map((word, i) => (
                        <span
                          key={i}
                          style={
                            style.colors.wordHighlightEnabled && i === currentWordIndex
                              ? { color: style.colors.highlightColor, WebkitTextStroke: 0 }
                              : undefined
                          }
                        >
                          {word.text}
                          {i < currentVerse.words.length - 1 ? ' ' : ''}
                        </span>
                      ))}
                      {style.colors.showArabicAyahNumbers && <AyahNumberBadge verseNumber={currentVerse.verseNumber} />}
                    </p>
                    <p
                      dir={isRtlScript(translationScript) ? 'rtl' : undefined}
                      style={{
                        fontFamily: translationFontFamily,
                        fontSize: Math.round(style.typography.translationFontSize * 0.6),
                        color: style.colors.translationTextColor,
                      }}
                    >
                      {style.colors.showAyahNumbers && `(${currentVerse.verseNumber}) `}
                      {currentVerse.translationText}
                    </p>
                  </>
                )}
              </>
            )}
          </div>
        </div>

        {hasIntroWindow && intro.introCardEnabled && (
          <div
            className="absolute left-1/2 -translate-x-1/2 rounded bg-black/60 px-4 py-2 text-center text-white"
            style={{ top: `${introTextTopPct(style.colors.textPosition) - 24}%`, fontFamily: 'Inter', fontSize: 13, display: showIntro ? 'block' : 'none' }}
          >
            {chapter && (
              <>
                <div>{chapter.nameSimple}</div>
                <div className="opacity-80">{chapter.translatedName} • {chapter.id}</div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Real playback controls over the real recitation audio -- hidden
          while looking at the (static, non-timed) intro/Bismillah view
          above, since that's an illustration of a screen rather than a
          moment on this timeline. */}
      {!showIntro && preview.data && (
        <div className="flex items-center gap-2 rounded-md border border-neutral-800 bg-neutral-900/50 px-3 py-2">
          <button
            type="button"
            onClick={togglePlay}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white hover:bg-emerald-500"
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? '⏸' : '▶'}
          </button>
          <span className="w-9 shrink-0 text-right text-xs tabular-nums text-neutral-400">{formatTime(currentMs)}</span>
          <input
            type="range"
            min={0}
            max={Math.max(durationMs, 1)}
            step={100}
            value={Math.min(currentMs, durationMs || 0)}
            onChange={(e) => handleSeek(Number(e.target.value))}
            className="flex-1 accent-emerald-500"
          />
          <span className="w-9 shrink-0 text-xs tabular-nums text-neutral-400">{formatTime(durationMs)}</span>
        </div>
      )}

      {preview.data && (
        <audio
          ref={audioRef}
          src={preview.data.audioUrl}
          preload="metadata"
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => setIsPlaying(false)}
          onTimeUpdate={(e) => setCurrentMs(e.currentTarget.currentTime * 1000)}
          onLoadedMetadata={(e) => setDurationMs(e.currentTarget.duration * 1000)}
          className="hidden"
        />
      )}

      <div className="flex items-center justify-between text-xs text-neutral-500">
        <span>
          {preview.data?.anyEstimatedTiming
            ? 'Some verse timing is estimated (real per-word data wasn\'t available for every verse).'
            : 'Real word-synced recitation audio -- background crossfades, the intro/Bismillah window, and outro are export-only and not shown here.'}
        </span>
        {hasIntroWindow && (
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setShowIntro(true)}
              className={`rounded px-2 py-1 ${showIntro ? 'bg-emerald-600 text-white' : 'bg-neutral-800 text-neutral-300'}`}
            >
              Intro
            </button>
            <button
              type="button"
              onClick={() => setShowIntro(false)}
              className={`rounded px-2 py-1 ${!showIntro ? 'bg-emerald-600 text-white' : 'bg-neutral-800 text-neutral-300'}`}
            >
              Verse
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
