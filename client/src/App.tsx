import { AudioSyncPanel } from './components/AudioSyncPanel';
import { BackgroundPanel } from './components/BackgroundPanel';
import { DataSelectionPanel } from './components/DataSelectionPanel';
import { ExportBar } from './components/ExportBar';
import { IntroPanel } from './components/IntroPanel';
import { OutroPanel } from './components/OutroPanel';
import { PreviewPane } from './components/PreviewPane';
import { StylePanel } from './components/StylePanel';
import { VideoFormatPanel } from './components/VideoFormatPanel';

function App() {
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <header className="border-b border-neutral-800 px-6 py-3">
        <h1 className="text-lg font-semibold">Ayah Studio</h1>
      </header>

      <main className="grid grid-cols-[360px_1fr] gap-6 p-6">
        <div className="space-y-4">
          <DataSelectionPanel />
          <VideoFormatPanel />
          <StylePanel />
          <IntroPanel />
          <OutroPanel />
          <AudioSyncPanel />
          <BackgroundPanel />
        </div>

        <div className="space-y-4 self-start sticky top-6">
          <PreviewPane />
          <ExportBar />
        </div>
      </main>
    </div>
  );
}

export default App;
