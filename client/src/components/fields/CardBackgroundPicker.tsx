import { useRef, useState } from 'react';
import { uploadCardImage } from '../../lib/backendApi';
import { useBackgroundLibrary } from '../../lib/hooks';
import { useExportConfigStore } from '../../state/exportConfigStore';

/**
 * Single-select media picker for an intro/outro card's own background,
 * shared by IntroPanel and OutroPanel. Reuses the exact same curated
 * library + uploaded-video clip ids as the main BackgroundPanel's rotation
 * pool (a card only ever shows one clip, not a rotation, hence a <select>
 * instead of BackgroundPanel's checkbox list), plus uploaded still images
 * which only make sense for a card, not the main looping background.
 */
export function CardBackgroundPicker({ value, onChange }: { value: string | null; onChange: (clipId: string | null) => void }) {
  const library = useBackgroundLibrary();
  const uploadedBackgroundClips = useExportConfigStore((s) => s.uploadedBackgroundClips);
  const uploadedCardImages = useExportConfigStore((s) => s.uploadedCardImages);
  const addUploadedCardImage = useExportConfigStore((s) => s.addUploadedCardImage);

  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const result = await uploadCardImage(file);
      addUploadedCardImage({ id: result.imageId, title: file.name });
      onChange(result.imageId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="space-y-1.5">
      <span className="text-xs font-medium text-neutral-400">Card background</span>
      <select
        className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-200"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
      >
        <option value="">Main background (default)</option>

        {(uploadedCardImages.length > 0 || uploadedBackgroundClips.length > 0) && (
          <optgroup label="Your uploads">
            {uploadedCardImages.map((img) => (
              <option key={img.id} value={img.id}>
                {img.title}
              </option>
            ))}
            {uploadedBackgroundClips.map((clip) => (
              <option key={clip.id} value={clip.id}>
                {clip.title}
              </option>
            ))}
          </optgroup>
        )}

        {library.data &&
          Object.entries(library.data).map(([category, clips]) => (
            <optgroup key={category} label={category}>
              {clips.map((clip) => (
                <option key={clip.id} value={clip.id}>
                  {clip.title}
                </option>
              ))}
            </optgroup>
          ))}
      </select>

      <label className="inline-block cursor-pointer rounded-md bg-neutral-800 px-2.5 py-1.5 text-xs font-medium text-neutral-200 hover:bg-neutral-700">
        {uploading ? 'Uploading…' : 'Upload image'}
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          disabled={uploading}
          onChange={handleFileChange}
        />
      </label>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <p className="text-xs text-neutral-500">Shown behind this card only, in place of the main background.</p>
    </div>
  );
}
