import { useEffect, useMemo, useState } from 'react';
import { useBackgroundLibrary, useChapters, useFirstVerse } from '../lib/hooks';
import { badgePositionStyle, introTextTopPct, scrimStyle } from '../lib/previewLayout';
import { FONT_REGISTRY } from '../lib/types';
import { isRtlScript, scriptForLanguage, TRANSLATION_SCRIPT_FONTS } from '../lib/translationFonts';
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

export function PreviewPane() {
  const chapterId = useExportConfigStore((s) => s.chapterId);
  const translationId = useExportConfigStore((s) => s.translationId);
  const translationLanguage = useExportConfigStore((s) => s.translationLanguage);
  const style = useExportConfigStore((s) => s.style);
  const intro = useExportConfigStore((s) => s.intro);
  const background = useExportConfigStore((s) => s.background);
  const aspectRatio = useExportConfigStore((s) => s.aspectRatio);

  const chapters = useChapters();
  const verse = useFirstVerse(chapterId, translationId);
  const library = useBackgroundLibrary();

  const chapter = chapters.data?.find((c) => c.id === chapterId);
  const hasIntroWindow = intro.introCardEnabled || intro.bismillahTextEnabled || intro.bismillahAudioEnabled;
  const [showIntro, setShowIntro] = useState(false);

  const firstClipUrl = useMemo(() => {
    if (background.clipIds.length === 0 || !library.data) return null;
    const allClips = Object.values(library.data).flat();
    return allClips.find((c) => c.id === background.clipIds[0])?.url ?? null;
  }, [background.clipIds, library.data]);

  const arabicWords = verse.data?.textUthmani.split(/\s+/) ?? [];
  const translationScript = scriptForLanguage(translationLanguage);
  const translationFontFamily = resolveTranslationFontFamily(style.typography.latinFont, translationScript);
  const [videoFailed, setVideoFailed] = useState(false);
  useEffect(() => setVideoFailed(false), [firstClipUrl]);

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
            className="absolute inset-0 h-full w-full object-cover"
            src={firstClipUrl}
            autoPlay
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
              <div style={{ fontSize: 13 }}>
                <div>{chapter.name_simple}</div>
                <div className="opacity-80">{chapter.translated_name.name} • {chapter.id}</div>
              </div>
            ) : style.badges.surahBadge.variant === 'arabic-transliteration' ? (
              <div className="text-center drop-shadow">
                <div style={{ fontFamily: FONT_REGISTRY.arabic[style.typography.arabicFont].family, fontSize: 16 }}>
                  {chapter.name_arabic}
                </div>
                <div style={{ fontSize: 11 }}>{chapter.name_simple.toUpperCase()}</div>
              </div>
            ) : (
              <span style={{ fontSize: 12 }} className="drop-shadow">
                {chapter.name_simple} • {chapter.translated_name.name} • {chapter.id}
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
              fontSize: 11,
            }}
          >
            {style.badges.watermark.text}
          </div>
        )}

        {/* Channel name badge */}
        {style.badges.channelNameBadge.enabled && style.badges.channelNameBadge.text && (
          <div
            style={{ ...badgePositionStyle(style.badges.channelNameBadge.position), color: 'white', fontFamily: 'Inter', fontSize: 11 }}
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
                {verse.loading && <p className="text-xs text-neutral-500">Loading verse…</p>}
                {verse.data && (
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
                      {arabicWords.map((word, i) => (
                        <span key={i} style={i === 0 ? { color: style.colors.highlightColor, WebkitTextStroke: 0 } : undefined}>
                          {word}
                          {i < arabicWords.length - 1 ? ' ' : ''}
                        </span>
                      ))}
                      {/* This preview always fetches verse 1 of the chapter, so the
                          ayah number is always "١" -- see useFirstVerse. U+06DD is
                          the real Unicode end-of-ayah mark; only Amiri Quran (a
                          Quranic-ligature-only companion font, never used for real
                          sentence text) nests the digit inside its decorative
                          circle -- matches server/src/lib/assBuilder.js's export
                          rendering, which applies the same font swap inline. */}
                      {style.colors.showAyahNumbers && (
                        <>
                          {' '}
                          <span style={{ fontFamily: 'Amiri Quran' }}>١۝</span>
                        </>
                      )}
                    </p>
                    <p
                      dir={isRtlScript(translationScript) ? 'rtl' : undefined}
                      style={{
                        fontFamily: translationFontFamily,
                        fontSize: Math.round(style.typography.translationFontSize * 0.6),
                        color: style.colors.translationTextColor,
                      }}
                    >
                      {style.colors.showAyahNumbers && '(1) '}
                      {verse.data.translationText}
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
                <div>{chapter.name_simple}</div>
                <div className="opacity-80">{chapter.translated_name.name} • {chapter.id}</div>
              </>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between text-xs text-neutral-500">
        <span>Approximation only — not frame-accurate. Actual timing/highlighting comes from the export.</span>
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
