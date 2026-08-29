import type { BackgroundLibrary, UploadedBackgroundClip, UploadedCardImage } from './types';

export interface ResolvedCardBackground {
  type: 'image' | 'video';
  url: string;
}

/**
 * Resolves an intro/outro card's cardBackgroundClipId (the same unified id
 * space surahExport.js's resolveCardBackgroundInput uses server-side --
 * curated library clip id, uploaded background video id, or "img-" prefixed
 * uploaded/AI-generated card image id) to a real, directly playable URL for
 * the preview. Returns null when unset or unresolvable, meaning "fall back
 * to the main background" -- the same fallback the export itself uses when
 * a referenced upload can no longer be found.
 */
export function resolveCardBackground(
  clipId: string | null,
  uploadedCardImages: UploadedCardImage[],
  uploadedBackgroundClips: UploadedBackgroundClip[],
  library: BackgroundLibrary | null
): ResolvedCardBackground | null {
  if (!clipId) return null;

  const image = uploadedCardImages.find((img) => img.id === clipId);
  if (image) return { type: 'image', url: `/uploads/card-images/${clipId}` };

  const uploadedClip = uploadedBackgroundClips.find((clip) => clip.id === clipId);
  if (uploadedClip) return { type: 'video', url: `/uploads/backgrounds/${clipId}` };

  if (library) {
    for (const clips of Object.values(library)) {
      const found = clips.find((clip) => clip.id === clipId);
      if (found) return { type: 'video', url: found.url };
    }
  }

  return null;
}
