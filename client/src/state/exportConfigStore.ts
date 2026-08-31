import { create } from 'zustand';
import {
  DEFAULT_AUDIO_SYNC,
  DEFAULT_BACKGROUND,
  DEFAULT_CAPTION_TIMING,
  DEFAULT_INTRO,
  DEFAULT_OUTRO,
  DEFAULT_STYLE,
  type AspectRatio,
  type AudioSyncConfig,
  type BackgroundConfig,
  type BackgroundOrder,
  type CaptionTimingConfig,
  type IntroConfig,
  type OutroConfig,
  type Resolution,
  type StyleConfig,
  type UploadedBackgroundClip,
  type UploadedCardImage,
} from '../lib/types';

interface ExportConfigState {
  chapterId: number;
  reciterId: number;
  translationId: number;
  translationLanguage: string;
  style: StyleConfig;
  intro: IntroConfig;
  outro: OutroConfig;
  background: BackgroundConfig;
  audioSync: AudioSyncConfig;
  captionTiming: CaptionTimingConfig;
  resolution: Resolution;
  aspectRatio: AspectRatio;
  uploadedBackgroundClips: UploadedBackgroundClip[];
  uploadedCardImages: UploadedCardImage[];

  setChapterId: (id: number) => void;
  setReciterId: (id: number) => void;
  setTranslation: (id: number, language: string) => void;
  setResolution: (resolution: Resolution) => void;
  setAspectRatio: (aspectRatio: AspectRatio) => void;

  setTypography: (partial: Partial<StyleConfig['typography']>) => void;
  setColors: (partial: Partial<Omit<StyleConfig['colors'], 'scrim'>>) => void;
  setScrim: (partial: Partial<StyleConfig['colors']['scrim']>) => void;
  setBadge: <K extends keyof StyleConfig['badges']>(badge: K, partial: Partial<StyleConfig['badges'][K]>) => void;

  setIntro: (partial: Partial<IntroConfig>) => void;
  setOutro: (partial: Partial<OutroConfig>) => void;

  setBackgroundOrder: (order: BackgroundOrder) => void;
  setBackgroundTiming: (
    partial: Partial<Pick<BackgroundConfig, 'slotDurationSeconds' | 'transitionDurationSeconds' | 'transitionStyle'>>
  ) => void;
  toggleClipInPool: (clipId: string) => void;
  moveClipInPool: (clipId: string, direction: 'up' | 'down') => void;
  reorderClipInPool: (fromIndex: number, toIndex: number) => void;
  toggleClipsInPool: (clipIds: string[]) => void;
  addUploadedBackgroundClip: (clip: UploadedBackgroundClip) => void;
  addUploadedCardImage: (image: UploadedCardImage) => void;

  setAudioSync: (partial: Partial<AudioSyncConfig>) => void;
  setCaptionTiming: (partial: Partial<CaptionTimingConfig>) => void;
}

export const useExportConfigStore = create<ExportConfigState>((set) => ({
  chapterId: 112, // Al-Ikhlas: short default, good first-load experience
  reciterId: 7, // Mishari Rashid al-`Afasy
  translationId: 20, // Saheeh International
  translationLanguage: 'english',
  style: DEFAULT_STYLE,
  intro: DEFAULT_INTRO,
  outro: DEFAULT_OUTRO,
  background: DEFAULT_BACKGROUND,
  audioSync: DEFAULT_AUDIO_SYNC,
  captionTiming: DEFAULT_CAPTION_TIMING,
  resolution: '720p',
  aspectRatio: '16:9',
  uploadedBackgroundClips: [],
  uploadedCardImages: [],

  setChapterId: (chapterId) => set({ chapterId }),
  setReciterId: (reciterId) => set({ reciterId }),
  setTranslation: (translationId, translationLanguage) => set({ translationId, translationLanguage }),
  setResolution: (resolution) => set({ resolution }),
  setAspectRatio: (aspectRatio) => set({ aspectRatio }),

  setTypography: (partial) =>
    set((s) => ({ style: { ...s.style, typography: { ...s.style.typography, ...partial } } })),

  setColors: (partial) =>
    set((s) => ({ style: { ...s.style, colors: { ...s.style.colors, ...partial } } })),

  setScrim: (partial) =>
    set((s) => ({
      style: { ...s.style, colors: { ...s.style.colors, scrim: { ...s.style.colors.scrim, ...partial } } },
    })),

  setBadge: (badge, partial) =>
    set((s) => ({
      style: { ...s.style, badges: { ...s.style.badges, [badge]: { ...s.style.badges[badge], ...partial } } },
    })),

  setIntro: (partial) => set((s) => ({ intro: { ...s.intro, ...partial } })),
  setOutro: (partial) => set((s) => ({ outro: { ...s.outro, ...partial } })),

  setBackgroundOrder: (order) => set((s) => ({ background: { ...s.background, order } })),

  setBackgroundTiming: (partial) => set((s) => ({ background: { ...s.background, ...partial } })),

  toggleClipInPool: (clipId) =>
    set((s) => {
      const inPool = s.background.clipIds.includes(clipId);
      const clipIds = inPool ? s.background.clipIds.filter((id) => id !== clipId) : [...s.background.clipIds, clipId];
      return { background: { ...s.background, clipIds } };
    }),

  moveClipInPool: (clipId, direction) =>
    set((s) => {
      const clipIds = [...s.background.clipIds];
      const index = clipIds.indexOf(clipId);
      if (index === -1) return s;
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= clipIds.length) return s;
      [clipIds[index], clipIds[targetIndex]] = [clipIds[targetIndex], clipIds[index]];
      return { background: { ...s.background, clipIds } };
    }),

  reorderClipInPool: (fromIndex, toIndex) =>
    set((s) => {
      const clipIds = [...s.background.clipIds];
      if (
        fromIndex < 0 ||
        fromIndex >= clipIds.length ||
        toIndex < 0 ||
        toIndex >= clipIds.length ||
        fromIndex === toIndex
      ) {
        return s;
      }
      const [moved] = clipIds.splice(fromIndex, 1);
      clipIds.splice(toIndex, 0, moved);
      return { background: { ...s.background, clipIds } };
    }),

  // Toggles a whole group at once (e.g. "select all in this category"):
  // if every clip in the group is already selected, removes all of them;
  // otherwise adds whichever ones aren't selected yet, appended in the
  // group's own order, leaving already-selected ones at their current
  // position in the pool.
  toggleClipsInPool: (clipIds) =>
    set((s) => {
      const allSelected = clipIds.every((id) => s.background.clipIds.includes(id));
      const nextClipIds = allSelected
        ? s.background.clipIds.filter((id) => !clipIds.includes(id))
        : [...s.background.clipIds, ...clipIds.filter((id) => !s.background.clipIds.includes(id))];
      return { background: { ...s.background, clipIds: nextClipIds } };
    }),

  addUploadedBackgroundClip: (clip) =>
    set((s) => ({ uploadedBackgroundClips: [...s.uploadedBackgroundClips, clip] })),

  addUploadedCardImage: (image) =>
    set((s) => ({ uploadedCardImages: [...s.uploadedCardImages, image] })),

  setAudioSync: (partial) => set((s) => ({ audioSync: { ...s.audioSync, ...partial } })),
  setCaptionTiming: (partial) => set((s) => ({ captionTiming: { ...s.captionTiming, ...partial } })),
}));
