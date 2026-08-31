import { useEffect, useMemo, useRef, useState } from 'react';
import { useBackgroundLibrary, usePreviewData } from '../lib/hooks';
import { badgePositionStyle, scrimStyle } from '../lib/previewLayout';
import { FONT_REGISTRY } from '../lib/types';
import { isRtlScript, scriptForLanguage, TRANSLATION_SCRIPT_FONTS } from '../lib/translationFonts';
import { toArabicIndicNumerals } from '../lib/arabicNumerals';
import { computeIntroTimingWindow } from '../lib/introTiming';
import { resolveCardBackground } from '../lib/cardBackground';
import { activeClipIndexAt, resolvePlaybackOrder } from '../lib/backgroundRotation';
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

type Phase = 'intro' | 'verse' | 'outro';

export function PreviewPane() {
  const chapterId = useExportConfigStore((s) => s.chapterId);
  const reciterId = useExportConfigStore((s) => s.reciterId);
  const translationId = useExportConfigStore((s) => s.translationId);
  const translationLanguage = useExportConfigStore((s) => s.translationLanguage);
  const style = useExportConfigStore((s) => s.style);
  const intro = useExportConfigStore((s) => s.intro);
  const outro = useExportConfigStore((s) => s.outro);
  const background = useExportConfigStore((s) => s.background);
  const aspectRatio = useExportConfigStore((s) => s.aspectRatio);
  const uploadedBackgroundClips = useExportConfigStore((s) => s.uploadedBackgroundClips);
  const uploadedCardImages = useExportConfigStore((s) => s.uploadedCardImages);
  const previewClipId = useExportConfigStore((s) => s.previewClipId);
  const setPreviewClip = useExportConfigStore((s) => s.setPreviewClip);

  const preview = usePreviewData(chapterId, reciterId, translationId);
  const library = useBackgroundLibrary();

  const chapter = preview.data?.chapter;

  // Real intro-window duration, computed with the exact same rule the
  // export itself uses (see lib/introTiming.ts) -- concurrent card+audio,
  // never additive. Falls back to the card-only duration if audio is on but
  // its real duration hasn't loaded yet.
  const introWindowMs = useMemo(
    () =>
      computeIntroTimingWindow({
        introCardEnabled: intro.introCardEnabled,
        bismillahTextEnabled: intro.bismillahTextEnabled,
        bismillahAudioEnabled: intro.bismillahAudioEnabled,
        bismillahAudioDurationMs: preview.data?.bismillahAudioDurationMs,
        introCardDurationMs: intro.introCardDurationMs,
      }).windowMs,
    [intro, preview.data?.bismillahAudioDurationMs]
  );
  const outroWindowMs = outro.enabled ? outro.durationMs : 0;
  const introAudioActive =
    intro.bismillahAudioEnabled && typeof preview.data?.bismillahAudioDurationMs === 'number' && preview.data.bismillahAudioDurationMs > 0;

  // Sequential keeps the configured order; shuffle is a one-time permutation
  // recomputed only when the pool or order actually changes, not every
  // render -- mirrors resolvePlaybackOrder's real, non-crossfaded rotation
  // (see lib/backgroundRotation.ts for why a preview clip change is a hard
  // cut rather than the real ffmpeg xfade blend).
  const orderedClipIds = useMemo(
    () => (background.clipIds.length > 0 ? resolvePlaybackOrder(background.clipIds, background.order) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [background.clipIds, background.order]
  );

  const introCardBackground = useMemo(
    () => resolveCardBackground(intro.cardBackgroundClipId, uploadedCardImages, uploadedBackgroundClips, library.data ?? null),
    [intro.cardBackgroundClipId, uploadedCardImages, uploadedBackgroundClips, library.data]
  );
  const outroCardBackground = useMemo(
    () => resolveCardBackground(outro.cardBackgroundClipId, uploadedCardImages, uploadedBackgroundClips, library.data ?? null),
    [outro.cardBackgroundClipId, uploadedCardImages, uploadedBackgroundClips, library.data]
  );

  const translationScript = scriptForLanguage(translationLanguage);
  const translationFontFamily = resolveTranslationFontFamily(style.typography.latinFont, translationScript);
  const [videoFailed, setVideoFailed] = useState(false);

  // Real playback state, spanning a single continuous virtual timeline of
  // [intro][verse][outro] -- not three separate illustrations. Each phase
  // is driven by whatever real thing produces its duration: the intro's own
  // Bismillah audio when it's on, the main recitation audio for the verse
  // phase, and a plain timer for phases with no real audio (intro without
  // Bismillah audio, and the outro, which is always silent).
  const introAudioRef = useRef<HTMLAudioElement>(null);
  const mainAudioRef = useRef<HTMLAudioElement>(null);
  const bgVideoRef = useRef<HTMLVideoElement>(null);
  const rafRef = useRef<number | null>(null);
  const rafLastTsRef = useRef<number | null>(null);

  const [phase, setPhase] = useState<Phase>(introWindowMs > 0 ? 'intro' : 'verse');
  const [phaseElapsedMs, setPhaseElapsedMs] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [mainDurationMs, setMainDurationMs] = useState(0);

  const totalMs = introWindowMs + mainDurationMs + outroWindowMs;
  const virtualMs =
    (phase === 'intro' ? 0 : phase === 'verse' ? introWindowMs : introWindowMs + mainDurationMs) + phaseElapsedMs;

  // The main rotation clip active at the current point on the whole
  // timeline -- real time-based rotation (see lib/backgroundRotation.ts),
  // not just a fixed first clip. Only relevant as a fallback: intro/outro
  // phases with their own card background override this entirely (see
  // activeCardBackground below).
  const activeMainClipId =
    orderedClipIds.length > 0
      ? orderedClipIds[activeClipIndexAt(virtualMs / 1000, background.slotDurationSeconds, background.transitionDurationSeconds) % orderedClipIds.length]
      : null;
  const activeMainBackground = useMemo(
    () => resolveCardBackground(activeMainClipId, uploadedCardImages, uploadedBackgroundClips, library.data ?? null),
    [activeMainClipId, uploadedCardImages, uploadedBackgroundClips, library.data]
  );
  const activeMainBackgroundUrl = activeMainBackground?.url ?? null;
  useEffect(() => setVideoFailed(false), [activeMainBackgroundUrl]);

  // A clip the user just checked into the pool (or explicitly asked to
  // preview) -- shown in place of whatever the real timeline would show,
  // so they can see it before deciding to keep it. Highest priority: it
  // overrides even an intro/outro card's own background while active.
  const manualPreview = useMemo(
    () => resolveCardBackground(previewClipId, uploadedCardImages, uploadedBackgroundClips, library.data ?? null),
    [previewClipId, uploadedCardImages, uploadedBackgroundClips, library.data]
  );
  const manualPreviewTitle = useMemo(() => {
    if (!previewClipId) return null;
    const fromLibrary = Object.values(library.data ?? {})
      .flat()
      .find((c) => c.id === previewClipId);
    if (fromLibrary) return fromLibrary.title;
    return uploadedBackgroundClips.find((c) => c.id === previewClipId)?.title ?? previewClipId;
  }, [previewClipId, library.data, uploadedBackgroundClips]);

  function stopTimer() {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    rafLastTsRef.current = null;
  }

  // A new chapter/reciter means new audio sources -- reset the whole
  // timeline rather than leaving it mid-phase against stale content.
  useEffect(() => {
    stopTimer();
    setIsPlaying(false);
    setPhase(introWindowMs > 0 ? 'intro' : 'verse');
    setPhaseElapsedMs(0);
    setMainDurationMs(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview.data?.audioUrl]);

  // Keep the main rotation's background video playing whenever real
  // playback is running -- it's the base layer for the whole timeline on
  // export (intro/outro only override it when their own card background is
  // set), not just the verse phase.
  useEffect(() => {
    const v = bgVideoRef.current;
    if (!v) return;
    if (isPlaying) v.play().catch(() => {});
    else v.pause();
  }, [isPlaying, activeMainBackgroundUrl]);

  function advancePhase() {
    if (phase === 'intro') {
      stopTimer();
      if (mainDurationMs > 0) {
        setPhase('verse');
        setPhaseElapsedMs(0);
        if (isPlaying) {
          const a = mainAudioRef.current;
          if (a) {
            a.currentTime = 0;
            a.play().catch(() => {});
          }
        }
      } else {
        setIsPlaying(false);
      }
    } else if (phase === 'verse') {
      if (outroWindowMs > 0) {
        setPhase('outro');
        setPhaseElapsedMs(0);
        if (isPlaying) runTimerPhase(outroWindowMs);
      } else {
        setIsPlaying(false);
      }
    } else {
      stopTimer();
      setIsPlaying(false);
    }
  }

  function runTimerPhase(limitMs: number) {
    stopTimer();
    rafLastTsRef.current = null;
    const tick = (ts: number) => {
      if (rafLastTsRef.current === null) rafLastTsRef.current = ts;
      const deltaMs = ts - rafLastTsRef.current;
      rafLastTsRef.current = ts;
      setPhaseElapsedMs((prev) => {
        const next = prev + deltaMs;
        if (next >= limitMs) {
          stopTimer();
          // Deferred so we don't setState-during-setState on the same tick.
          setTimeout(() => advancePhase(), 0);
          return limitMs;
        }
        return next;
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }

  function startPhase() {
    if (phase === 'intro') {
      if (introAudioActive) {
        introAudioRef.current?.play().catch(() => {});
      } else {
        runTimerPhase(introWindowMs);
      }
    } else if (phase === 'verse') {
      mainAudioRef.current?.play().catch(() => {});
    } else {
      runTimerPhase(outroWindowMs);
    }
  }

  function pausePhase() {
    introAudioRef.current?.pause();
    mainAudioRef.current?.pause();
    stopTimer();
  }

  function togglePlay() {
    if (isPlaying) {
      pausePhase();
      setIsPlaying(false);
    } else {
      // Resuming real playback means they want the real timeline again, not
      // the manually-previewed clip.
      setPreviewClip(null);
      setIsPlaying(true);
      startPhase();
    }
  }

  // Stop the Bismillah clip at the real cut boundary -- the underlying
  // audio file is the reciter's whole Al-Fatiha recitation, not a
  // standalone Bismillah clip (see backendApi.ts's PreviewData comment).
  function handleIntroAudioTimeUpdate() {
    const a = introAudioRef.current;
    const durationMs = preview.data?.bismillahAudioDurationMs;
    if (!a || typeof durationMs !== 'number') return;
    const ms = a.currentTime * 1000;
    if (ms >= durationMs) {
      a.pause();
      advancePhase();
    } else {
      setPhaseElapsedMs(ms);
    }
  }

  function handleSeek(targetVirtualMs: number) {
    setPreviewClip(null);
    pausePhase();
    let targetPhase: Phase;
    let elapsed: number;
    if (targetVirtualMs < introWindowMs) {
      targetPhase = 'intro';
      elapsed = targetVirtualMs;
    } else if (targetVirtualMs < introWindowMs + mainDurationMs) {
      targetPhase = 'verse';
      elapsed = targetVirtualMs - introWindowMs;
    } else {
      targetPhase = 'outro';
      elapsed = Math.min(targetVirtualMs - introWindowMs - mainDurationMs, outroWindowMs);
    }

    setPhase(targetPhase);
    setPhaseElapsedMs(elapsed);

    if (targetPhase === 'intro' && introAudioActive && introAudioRef.current) {
      introAudioRef.current.currentTime = elapsed / 1000;
    } else if (targetPhase === 'verse' && mainAudioRef.current) {
      mainAudioRef.current.currentTime = elapsed / 1000;
    }

    if (isPlaying) {
      // Deferred so the phase/ref updates above land before we start playback.
      setTimeout(() => {
        if (targetPhase === 'intro') {
          if (introAudioActive) introAudioRef.current?.play().catch(() => {});
          else runTimerPhase(introWindowMs);
        } else if (targetPhase === 'verse') {
          mainAudioRef.current?.play().catch(() => {});
        } else {
          runTimerPhase(outroWindowMs);
        }
      }, 0);
    }
  }

  function jumpToPhase(target: Phase) {
    const targetMs = target === 'intro' ? 0 : target === 'verse' ? introWindowMs : introWindowMs + mainDurationMs;
    handleSeek(targetMs);
  }

  // The verse whose real [startMs, endMs) window contains the current
  // playback position -- before playback starts this is verse 1, and once
  // playback runs past the last verse's real end it stays on that verse
  // rather than going blank.
  const currentVerse = useMemo(() => {
    const verses = preview.data?.verses;
    if (!verses || verses.length === 0) return null;
    const match = verses.find((v) => v.startMs != null && v.endMs != null && phaseElapsedMs >= v.startMs && phaseElapsedMs < v.endMs);
    if (match) return match;
    return phaseElapsedMs <= 0 ? verses[0] : verses[verses.length - 1];
  }, [preview.data, phaseElapsedMs]);

  const currentWordIndex = useMemo(() => {
    if (!currentVerse || phase !== 'verse') return -1;
    return currentVerse.words.findIndex(
      (w) => w.startMs != null && w.endMs != null && phaseElapsedMs >= w.startMs && phaseElapsedMs < w.endMs
    );
  }, [currentVerse, phaseElapsedMs, phase]);

  const isVertical = aspectRatio === '9:16';
  const activeCardBackground = phase === 'intro' ? introCardBackground : phase === 'outro' ? outroCardBackground : null;

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
        {/* Background: a manually-previewed clip (just checked into the pool,
            or explicitly asked to preview) takes priority over everything
            else; then the active card's own override during intro/outro;
            otherwise the main rotation's currently-active clip (real
            time-based rotation, a hard cut between clips -- the crossfade
            blend itself is export-only, a real ffmpeg xfade filter). */}
        {manualPreview ? (
          manualPreview.type === 'image' ? (
            <img key={manualPreview.url} src={manualPreview.url} alt="" className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <video
              key={manualPreview.url}
              src={manualPreview.url}
              className="absolute inset-0 h-full w-full object-cover"
              muted
              autoPlay
              loop
              playsInline
            />
          )
        ) : activeCardBackground ? (
          activeCardBackground.type === 'image' ? (
            <img
              key={activeCardBackground.url}
              src={activeCardBackground.url}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <video
              key={activeCardBackground.url}
              src={activeCardBackground.url}
              className="absolute inset-0 h-full w-full object-cover"
              muted
              autoPlay
              loop
              playsInline
            />
          )
        ) : activeMainBackgroundUrl && !videoFailed ? (
          <video
            key={activeMainBackgroundUrl}
            ref={bgVideoRef}
            className="absolute inset-0 h-full w-full object-cover"
            src={activeMainBackgroundUrl}
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

        {manualPreview && (
          <div className="absolute left-1/2 top-3 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/70 px-3 py-1 text-xs text-white">
            <span>Previewing: {manualPreviewTitle}</span>
            <button
              type="button"
              onClick={() => setPreviewClip(null)}
              className="rounded-full px-1 text-neutral-300 hover:text-white"
              aria-label="Stop previewing"
            >
              ✕
            </button>
          </div>
        )}

        {/* Surah badge (hidden during the intro/outro cards, mirrors videoComposition.js's badgeVisibilityGate) */}
        {style.badges.surahBadge.enabled && chapter && phase === 'verse' && (
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

        {/* Channel logo: real uploaded image if present, else the placeholder monogram (hidden during the intro/outro cards) */}
        {style.badges.channelLogo.enabled &&
          phase === 'verse' &&
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

        {/* Caption / intro / outro area */}
        {phase === 'verse' && (
          <div style={scrimStyle(style.colors.textPosition, style.colors.scrim.heightScale)}>
            {style.colors.scrim.enabled && (
              <div
                className="absolute inset-0"
                style={{ background: style.colors.scrim.color, opacity: style.colors.scrim.opacity }}
              />
            )}
            <div className="relative flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
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
            </div>
          </div>
        )}

        {phase === 'intro' && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-4 text-center"
            style={{ background: `rgba(0, 0, 0, ${intro.overlayOpacity})` }}
          >
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
            {intro.introCardEnabled && chapter && (
              <div
                className="rounded bg-black/60 px-4 py-2 text-center text-white"
                style={{ fontFamily: 'Inter', fontSize: 13 }}
              >
                <div>{chapter.nameSimple}</div>
                <div className="opacity-80">{chapter.translatedName} • {chapter.id}</div>
              </div>
            )}
          </div>
        )}

        {phase === 'outro' && (
          <div
            className="absolute inset-0 flex items-center justify-center px-6 text-center"
            style={{ background: `rgba(0, 0, 0, ${outro.overlayOpacity})` }}
          >
            <div style={{ fontFamily: 'Inter', fontSize: 15, color: 'white' }}>
              <div>{outro.line1}</div>
              {outro.line2 && <div className="mt-1 opacity-80">{outro.line2}</div>}
            </div>
          </div>
        )}
      </div>

      {/* Real playback controls over one continuous virtual timeline
          (intro -> verse -> outro), each phase backed by whatever real
          thing produces its duration -- Bismillah audio, the main
          recitation audio, or a plain timer for silent phases. */}
      {preview.data && (
        <div className="flex items-center gap-2 rounded-md border border-neutral-800 bg-neutral-900/50 px-3 py-2">
          <button
            type="button"
            onClick={togglePlay}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white hover:bg-emerald-500"
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? '⏸' : '▶'}
          </button>
          <span className="w-9 shrink-0 text-right text-xs tabular-nums text-neutral-400">{formatTime(virtualMs)}</span>
          <input
            type="range"
            min={0}
            max={Math.max(totalMs, 1)}
            step={100}
            value={Math.min(virtualMs, totalMs || 0)}
            onChange={(e) => handleSeek(Number(e.target.value))}
            className="flex-1 accent-emerald-500"
          />
          <span className="w-9 shrink-0 text-xs tabular-nums text-neutral-400">{formatTime(totalMs)}</span>
        </div>
      )}

      {preview.data && (
        <>
          <audio
            ref={mainAudioRef}
            src={preview.data.audioUrl}
            preload="metadata"
            onTimeUpdate={(e) => {
              if (phase === 'verse') setPhaseElapsedMs(e.currentTarget.currentTime * 1000);
            }}
            onLoadedMetadata={(e) => setMainDurationMs(e.currentTarget.duration * 1000)}
            onEnded={() => phase === 'verse' && advancePhase()}
            className="hidden"
          />
          {introAudioActive && (
            <audio
              ref={introAudioRef}
              src={preview.data.bismillahAudioUrl}
              preload="metadata"
              onTimeUpdate={handleIntroAudioTimeUpdate}
              className="hidden"
            />
          )}
        </>
      )}

      <div className="flex items-center justify-between text-xs text-neutral-500">
        <span>
          {preview.data?.anyEstimatedTiming
            ? 'Some verse timing is estimated (real per-word data wasn\'t available for every verse).'
            : 'Real word-synced recitation audio, including the real intro/Bismillah and outro windows -- background crossfades for the main rotation are export-only and not shown here.'}
        </span>
        <div className="flex gap-1">
          {introWindowMs > 0 && (
            <button
              type="button"
              onClick={() => jumpToPhase('intro')}
              className={`rounded px-2 py-1 ${phase === 'intro' ? 'bg-emerald-600 text-white' : 'bg-neutral-800 text-neutral-300'}`}
            >
              Intro
            </button>
          )}
          <button
            type="button"
            onClick={() => jumpToPhase('verse')}
            className={`rounded px-2 py-1 ${phase === 'verse' ? 'bg-emerald-600 text-white' : 'bg-neutral-800 text-neutral-300'}`}
          >
            Verse
          </button>
          {outroWindowMs > 0 && (
            <button
              type="button"
              onClick={() => jumpToPhase('outro')}
              className={`rounded px-2 py-1 ${phase === 'outro' ? 'bg-emerald-600 text-white' : 'bg-neutral-800 text-neutral-300'}`}
            >
              Outro
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
