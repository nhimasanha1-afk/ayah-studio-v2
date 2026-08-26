import fs from 'node:fs';

/**
 * Moves a file, falling back to copy+delete when the source and
 * destination are on different filesystems -- fs.renameSync throws EXDEV
 * in that case (confirmed via a real production failure: this Docker
 * image's Dockerfile VOLUME-declares server/tmp and server/assets
 * separately, which makes Docker create distinct anonymous volumes for
 * each even with no real disk attached, so they land on different
 * filesystems inside the container). A plain rename is still tried first
 * since it's atomic and cheap when source/destination share a filesystem.
 */
export function moveFile(sourcePath, destPath) {
  try {
    fs.renameSync(sourcePath, destPath);
  } catch (err) {
    if (err.code !== 'EXDEV') throw err;
    fs.copyFileSync(sourcePath, destPath);
    fs.unlinkSync(sourcePath);
  }
}
