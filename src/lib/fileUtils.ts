/** A folder picked via <input webkitdirectory> gives each File its real
 * leaf name in `.name` and the folder-relative path in `.webkitRelativePath`
 * (e.g. "vacation/day1/img.jpg") — but `.name` is what every downstream
 * consumer actually looks at: multer's `originalname` on upload, a P2P
 * transfer's display name, a Transfer record's `name` field. None of them
 * know `webkitRelativePath` exists. Since File.name itself isn't writable,
 * this rebuilds the File with that path as its name, so folder context
 * survives everywhere else without any of those call sites having to
 * special-case it. */
export function withFolderRelativeName(file: File): File {
  if (!file.webkitRelativePath) return file;
  return new File([file], file.webkitRelativePath, { type: file.type, lastModified: file.lastModified });
}
