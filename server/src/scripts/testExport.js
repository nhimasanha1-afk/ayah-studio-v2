import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { probe } from '../lib/ffmpeg.js';
import { runTestExport, testExportPath } from '../lib/testExport.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.join(__dirname, '..', '..', 'output');
fs.mkdirSync(outputDir, { recursive: true });

const outputPath = testExportPath(outputDir);

console.log('Running hardcoded test export ->', outputPath);
await runTestExport(outputPath);

const info = await probe(outputPath);
const videoStream = info.streams.find((s) => s.codec_type === 'video');
const audioStream = info.streams.find((s) => s.codec_type === 'audio');

console.log('Done. Probe result:');
console.log({
  durationSeconds: Number(info.format.duration),
  sizeBytes: Number(info.format.size),
  video: videoStream && { codec: videoStream.codec_name, width: videoStream.width, height: videoStream.height },
  audio: audioStream && { codec: audioStream.codec_name },
});
