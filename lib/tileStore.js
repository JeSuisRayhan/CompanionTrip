// The phone side of the tile cache: expo-file-system, the same "legacy" API the
// rest of the app uses for documents. One cache for the whole app.
import * as FileSystem from "expo-file-system/legacy";
import { createTileCache } from "./tileCache";

const expoFs = {
  makeDir: (dir) => FileSystem.makeDirectoryAsync(dir, { intermediates: true }),
  list: (dir) => FileSystem.readDirectoryAsync(dir),
  remove: (path) => FileSystem.deleteAsync(path, { idempotent: true }),
  move: (from, to) => FileSystem.moveAsync({ from, to }),
  info: async (path) => {
    const i = await FileSystem.getInfoAsync(path, { size: true });
    // modificationTime is in seconds; if the phone does not say, the tile counts as fresh rather than being fetched at every view
    return { exists: !!i.exists, modifiedAt: i.exists ? (i.modificationTime ? i.modificationTime * 1000 : Date.now()) : 0, size: i.size || 0 };
  },
  // downloadAsync does not throw on an HTTP error: it saves the error page. Only a real image counts.
  download: async (url, path, headers) => {
    const r = await FileSystem.downloadAsync(url, path, { headers });
    const type = r.headers && (r.headers["Content-Type"] || r.headers["content-type"]);
    return { ok: r.status === 200 && (!type || /image/i.test(type)) };
  },
};

let cache = null;
export function getTileCache() {
  if (!cache) cache = createTileCache({ fs: expoFs, dir: `${FileSystem.documentDirectory}tiles/` });
  return cache;
}
