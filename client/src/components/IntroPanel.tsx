import { useExportConfigStore } from '../state/exportConfigStore';
import { CheckboxField } from './fields/CheckboxField';
import { NumberField } from './fields/NumberField';
import { Panel } from './Panel';

export function IntroPanel() {
  const intro = useExportConfigStore((s) => s.intro);
  const setIntro = useExportConfigStore((s) => s.setIntro);

  return (
    <Panel title="Intro & Bismillah">
      <CheckboxField label="Show intro card" checked={intro.introCardEnabled} onChange={(v) => setIntro({ introCardEnabled: v })} />

      {/* These two are intentionally independent -- text visibility and audio
          playback are separate toggles, per the backend's introTiming rule:
          "text toggle controls visibility only, audio toggle controls
          playback only." Neither checkbox here reads the other's state. */}
      <CheckboxField
        label="Show Bismillah text"
        checked={intro.bismillahTextEnabled}
        onChange={(v) => setIntro({ bismillahTextEnabled: v })}
      />
      <CheckboxField
        label="Play Bismillah audio"
        checked={intro.bismillahAudioEnabled}
        onChange={(v) => setIntro({ bismillahAudioEnabled: v })}
      />

      {intro.introCardEnabled && (
        <NumberField
          label="Intro card duration (ms)"
          value={intro.introCardDurationMs}
          min={1000}
          max={8000}
          step={250}
          onChange={(v) => setIntro({ introCardDurationMs: v })}
        />
      )}

      <p className="text-xs text-neutral-500">
        The actual on-screen duration is computed by the export pipeline: it's the real Bismillah audio
        length when audio is on, or the intro card duration otherwise -- concurrently, not added together.
      </p>
    </Panel>
  );
}
