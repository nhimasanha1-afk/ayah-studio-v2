import { useRef, useState } from 'react';
import { uploadBackgroundVideo } from '../../lib/backendApi';
import { useExportConfigStore } from '../../state/exportConfigStore';

export function BackgroundVideoUploadField() {
  const addUploadedBackgroundClip = useExportConfigStore((s) => s.addUploadedBackgroundClip);
  const toggleClipInPool = useExportConfigStore((s) => s.toggleClipInPool);

  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const result = await uploadBackgroundVideo(file);
      addUploadedBackgroundClip({ id: result.clipId, title: file.name });
      toggleClipInPool(result.clipId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="space-y-1.5">
      <label className="inline-block cursor-pointer rounded-md bg-neutral-800 px-2.5 py-1.5 text-xs font-medium text-neutral-200 hover:bg-neutral-700">
        {uploading ? 'Uploading…' : 'Upload background video'}
        <input
          ref={inputRef}
          type="file"
          accept="video/mp4,video/webm,video/ogg,video/quicktime,video/x-matroska"
          className="hidden"
          disabled={uploading}
          onChange={handleFileChange}
        />
      </label>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
