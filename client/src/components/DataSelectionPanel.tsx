import { useChapters, useReciters, useTranslations } from '../lib/hooks';
import type { Translation } from '../lib/quranApi';
import { useExportConfigStore } from '../state/exportConfigStore';
import { Panel } from './Panel';
import { SelectField } from './SelectField';

/** "english" / "Bulgarian" / "sinhala, sinhalese" -> "English" / "Bulgarian" / "Sinhala, Sinhalese" -- Quran.com's language_name casing is inconsistent, this is display-only. */
function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

function groupByLanguage(translations: Translation[]): [string, Translation[]][] {
  const groups = new Map<string, Translation[]>();
  for (const t of translations) {
    const list = groups.get(t.language_name) ?? [];
    list.push(t);
    groups.set(t.language_name, list);
  }
  return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

export function DataSelectionPanel() {
  const chapters = useChapters();
  const reciters = useReciters();
  const translations = useTranslations();

  const chapterId = useExportConfigStore((s) => s.chapterId);
  const reciterId = useExportConfigStore((s) => s.reciterId);
  const translationId = useExportConfigStore((s) => s.translationId);
  const setChapterId = useExportConfigStore((s) => s.setChapterId);
  const setReciterId = useExportConfigStore((s) => s.setReciterId);
  const setTranslation = useExportConfigStore((s) => s.setTranslation);

  const anyError = chapters.error ?? reciters.error ?? translations.error;
  const translationGroups = translations.data ? groupByLanguage(translations.data) : [];

  function handleTranslationChange(idStr: string) {
    const id = Number(idStr);
    const match = translations.data?.find((t) => t.id === id);
    setTranslation(id, match?.language_name ?? 'english');
  }

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
        onChange={handleTranslationChange}
      >
        {translations.loading && <option>Loading…</option>}
        {translationGroups.map(([language, group]) => (
          <optgroup key={language} label={titleCase(language)}>
            {group.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} — {t.author_name}
              </option>
            ))}
          </optgroup>
        ))}
      </SelectField>
    </Panel>
  );
}
