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

        {/* This column deliberately keeps CSS grid's default stretch (no
            self-start) so it's exactly as tall as the left column, even
            though its own content (preview + export bar) is much shorter --
            position:sticky can only stay "stuck" within its containing
            block's height, so a short containing block (self-start) meant
            the preview ran out of room to follow and got left behind well
            before the end of the (much longer) left column, confirmed via a
            real report and reproduced directly. With the tall containing
            block restored, only the inner wrapper below is sticky, so it
            now has the same scroll range as the left column to follow
            within. ExportBar is a normal sibling in ordinary page flow
            right after it, so its growth once an export finishes (video
            player, download links) is reachable via a plain scroll near the
            top, same as before. */}
        <div className="space-y-4">
          <div className="sticky top-6">
            <PreviewPane />
          </div>
          <ExportBar />
        </div>
      </main>
    </div>
  );
}

export default App;
