import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runSurahExport } from '../lib/surahExport.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.join(__dirname, '..', '..', 'output');
fs.mkdirSync(outputDir, { recursive: true });

const chapterId = Number(process.argv[2] ?? 112); // Al-Ikhlas by default: short, good smoke test
const styleJson = process.argv[3]; // optional path to a JSON file of style overrides
const style = styleJson ? JSON.parse(fs.readFileSync(styleJson, 'utf8')) : {};
const tag = process.argv[4] ?? 'test';
const introJson = process.argv[5]; // optional path to a JSON file of intro overrides
const intro = introJson ? JSON.parse(fs.readFileSync(introJson, 'utf8')) : {};
const backgroundJson = process.argv[6]; // optional path to a JSON file of background overrides
const background = backgroundJson ? JSON.parse(fs.readFileSync(backgroundJson, 'utf8')) : {};
const audioSyncJson = process.argv[7]; // optional path to a JSON file of audioSync overrides
const audioSync = audioSyncJson ? JSON.parse(fs.readFileSync(audioSyncJson, 'utf8')) : {};
const resolution = process.argv[8] ?? '720p'; // '720p' | '1080p'
const aspectRatio = process.argv[9] ?? '16:9'; // '16:9' | '9:16'
const captionTimingJson = process.argv[10]; // optional path to a JSON file of captionTiming overrides
const captionTiming = captionTimingJson ? JSON.parse(fs.readFileSync(captionTimingJson, 'utf8')) : {};
const outroJson = process.argv[11]; // optional path to a JSON file of outro overrides
const outro = outroJson ? JSON.parse(fs.readFileSync(outroJson, 'utf8')) : {};
const outputPath = path.join(outputDir, `surah-${chapterId}-${tag}.mp4`);

console.log(`Running styled surah export for chapter ${chapterId} -> ${outputPath}`);

const result = await runSurahExport({
  chapterId,
  outputPath,
  style,
  intro,
  outro,
  background,
  audioSync,
  resolution,
  aspectRatio,
  captionTiming,
});

console.log(`\nChapter: ${result.chapter.name_simple} (${result.chapter.name_arabic})`);
console.log(`Canvas: ${result.canvasWidth}x${result.canvasHeight} (${result.resolution}, ${result.aspectRatio})`);
console.log(`Audio sync offset: ${result.audioSyncOffsetMs}ms`);
console.log(`Intro window: ${JSON.stringify(result.introWindow)}`);
console.log(`Outro window: ${JSON.stringify(result.outroWindow)}`);
console.log(`Total duration: ${result.durationSeconds}s`);
console.log(`Any estimated timing used: ${result.captionData.anyEstimated}`);

const outStream = result.outputProbe.streams;
console.log('\nOutput probe:', {
  durationSeconds: Number(result.outputProbe.format.duration),
  sizeBytes: Number(result.outputProbe.format.size),
  video: outStream.find((s) => s.codec_type === 'video')?.codec_name,
  audio: outStream.find((s) => s.codec_type === 'audio')?.codec_name,
});
console.log(`Captions: ${result.srtPath}`);
console.log(`\nDone: ${outputPath}`);
