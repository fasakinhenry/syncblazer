/** A folder picked via <input webkitdirectory> gives each File its real
 * leaf name in `.name` (e.g. "img.jpg") and the folder-relative path in
 * `.webkitRelativePath` (e.g. "vacation/day1/img.jpg"). `.name` is what
 * should show up everywhere — the file list, a downloaded file's name on
 * disk, a redownload — so this is deliberately just a passthrough to
 * `.webkitRelativePath`, not a rename: an earlier version of this file
 * renamed the File to that full path, which put the folder name in front
 * of every single file's displayed/downloaded name. The relative path is
 * still tracked (via this helper, passed alongside the file rather than
 * baked into its name) purely so a "download all" zip can rebuild the
 * original folder structure. */
export function relativePathOf(file: File): string | undefined {
  return file.webkitRelativePath || undefined;
}

/** The shared top-level folder name for a set of picked files, if they
 * all came from the same folder pick — e.g. ["vacation/a.jpg",
 * "vacation/day1/b.jpg"] -> "vacation". Null for a plain multi-file
 * pick (no common folder), so callers can fall back to an "N files"
 * description instead of claiming a folder that doesn't exist. */
export function commonFolderName(files: File[]): string | null {
  if (files.length === 0) return null;
  const roots = files.map((f) => f.webkitRelativePath.split("/")[0]);
  if (roots.some((r) => !r)) return null;
  return roots.every((r) => r === roots[0]) ? roots[0] : null;
}
