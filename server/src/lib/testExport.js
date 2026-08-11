import path from 'node:path';
import ffmpeg from './ffmpeg.js';

const WIDTH = 1280;
const HEIGHT = 720;
const DURATION_SECONDS = 6;
const TEXT = 'Ayah Studio v2 — Backend Skeleton Test Export';

const FONT_FILE = 'C\\:/Windows/Fonts/arialbd.ttf';

/**
 * Step-1 skeleton proof: burns hardcoded text over a synthetic moving
 * background and mixes in a generated tone, end to end through FFmpeg.
 * Background/audio here are synthetic lavfi sources, not real assets --
 * real backgrounds/recitation audio arrive in later build steps.
 */
export function runTestExport(outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(`color=c=0x143028:s=${WIDTH}x${HEIGHT}:d=${DURATION_SECONDS}:r=30`)
      .inputFormat('lavfi')
      .input(`sine=frequency=220:duration=${DURATION_SECONDS}`)
      .inputFormat('lavfi')
      .complexFilter([
        {
          filter: 'drawtext',
          options: {
            text: TEXT,
            fontfile: FONT_FILE,
            fontsize: 42,
            fontcolor: 'white',
            x: '(w-text_w)/2',
            y: '(h-text_h)/2',
            box: 1,
            boxcolor: '0x00000088',
            boxborderw: 20,
          },
          inputs: '0:v',
          outputs: 'vout',
        },
      ])
      .outputOptions([
        '-map', '[vout]',
        '-map', '1:a',
        '-c:v', 'libx264',
        '-pix_fmt', 'yuv420p',
        '-c:a', 'aac',
        '-shortest',
      ])
      .output(outputPath)
      .on('start', (cmd) => console.log('[ffmpeg] spawned:', cmd))
      .on('stderr', (line) => console.log('[ffmpeg]', line))
      .on('error', (err) => reject(err))
      .on('end', () => resolve(outputPath))
      .run();
  });
}

export function testExportFilename() {
  return `test-export-${Date.now()}.mp4`;
}

export function testExportPath(outputDir) {
  return path.join(outputDir, testExportFilename());
}
