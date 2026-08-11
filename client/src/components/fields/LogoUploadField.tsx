import { useRef, useState } from 'react';
import { uploadChannelLogo } from '../../lib/backendApi';
import type { LogoShape } from '../../lib/types';
import { useExportConfigStore } from '../../state/exportConfigStore';

const SHAPE_RADIUS: Record<LogoShape, string> = { square: '0', rounded: '18%', circle: '50%' };

export function LogoUploadField() {
  const logoId = useExportConfigStore((s) => s.style.badges.channelLogo.logoId);
  const shape = useExportConfigStore((s) => s.style.badges.channelLogo.shape);
  const setBadge = useExportConfigStore((s) => s.setBadge);

  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const result = await uploadChannelLogo(file);
      setBadge('channelLogo', { logoId: result.logoId });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="space-y-2">
      <span className="text-xs font-medium text-neutral-400">Logo image</span>
      <div className="flex items-center gap-3">
        {logoId ? (
          <img
            src={`/uploads/logos/${logoId}`}
            alt="Uploaded logo preview"
            className="h-14 w-14 object-cover border border-neutral-700"
            style={{ borderRadius: SHAPE_RADIUS[shape] }}
          />
        ) : (
          <div className="flex h-14 w-14 items-center justify-center border border-dashed border-neutral-700 text-[10px] text-neutral-500">
            Placeholder
          </div>
        )}

        <div className="space-y-1">
          <label className="inline-block cursor-pointer rounded-md bg-neutral-800 px-2.5 py-1.5 text-xs font-medium text-neutral-200 hover:bg-neutral-700">
            {uploading ? 'Uploading…' : logoId ? 'Replace' : 'Upload image'}
            <input
              ref={inputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              disabled={uploading}
              onChange={handleFileChange}
            />
          </label>
          {logoId && (
            <button
              type="button"
              className="block text-xs text-neutral-500 hover:text-red-400"
              onClick={() => setBadge('channelLogo', { logoId: null })}
            >
              Remove (use placeholder)
            </button>
          )}
        </div>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      {!logoId && !error && <p className="text-xs text-neutral-500">Using a placeholder monogram until you upload a real logo.</p>}
    </div>
  );
}
