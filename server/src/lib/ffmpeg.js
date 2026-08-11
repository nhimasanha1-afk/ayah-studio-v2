import ffmpeg from 'fluent-ffmpeg';
import { ffmpegPath, ffprobePath } from './ffmpegBinaries.js';

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

export function probe(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) reject(err);
      else resolve(data);
    });
  });
}

export default ffmpeg;
