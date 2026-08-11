import { useChapters, useReciters, useTranslations } from '../lib/hooks';
import { useExportConfigStore } from '../state/exportConfigStore';
import { Panel } from './Panel';
import { SelectField } from './SelectField';

export function DataSelectionPanel() {
  const chapters = useChapters();
  const reciters = useReciters();
  const translations = useTranslations();

  const chapterId = useExportConfigStore((s) => s.chapterId);
  const reciterId = useExportConfigStore((s) => s.reciterId);
  const translationId = useExportConfigStore((s) => s.translationId);
  const setChapterId = useExportConfigStore((s) => s.setChapterId);
  const setReciterId = useExportConfigStore((s) => s.setReciterId);
  const setTranslationId = useExportConfigStore((s) => s.setTranslationId);

  const anyError = chapters.error ?? reciters.error ?? translations.error;

  return (
    <Panel title="Recitation">
      {anyError && (
        <p className="text-xs text-red-400">Failed to load data from Quran.com: {anyError}</p>
      )}

      <SelectField
        label="Surah"
        value={chapterId}
        disabled={chapters.loading}
        onChange={(v) => setChapterId(Number(v))}
      >
        {chapters.loading && <option>Loading…</option>}
        {chapters.data?.map((c) => (
          <option key={c.id} value={c.id}>
            {c.id}. {c.name_simple} — {c.translated_name.name} ({c.verses_count} verses)
          </option>
        ))}
      </SelectField>

      <SelectField
        label="Reciter"
        value={reciterId}
        disabled={reciters.loading}
        onChange={(v) => setReciterId(Number(v))}
      >
        {reciters.loading && <option>Loading…</option>}
        {reciters.data?.map((r) => (
          <option key={r.id} value={r.id}>
            {r.reciter_name}
            {r.style ? ` (${r.style})` : ''}
          </option>
        ))}
      </SelectField>

      <SelectField
        label="Translation"
        value={translationId}
        disabled={translations.loading}
        onChange={(v) => setTranslationId(Number(v))}
      >
        {translations.loading && <option>Loading…</option>}
        {translations.data?.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name} — {t.author_name}
          </option>
        ))}
      </SelectField>
    </Panel>
  );
}
