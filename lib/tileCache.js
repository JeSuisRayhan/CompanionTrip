// Map tiles kept on the phone, so a map you already looked at works with no
// network (abroad, in the metro).
//
// This is a CACHE, not a download feature. OpenStreetMap's tile servers forbid
// "download the area for offline use" and background pre-fetching, and block
// apps that do it. So a tile is fetched only when the map actually shows it
// (lib/map.js visibleTiles), kept, and served from disk next time. To have a
// place offline, look at it once with a connection.
//
// The file system is passed in (`fs`) so the rules can be tested without a phone.
import { TILE_USER_AGENT } from "./map";

export const TILE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // the policy asks for tiles to be reused for a week
export const MAX_CACHED_TILES = 6000; // about 100 MB at the very most
const KEEP_AFTER_TRIM = 0.8;
const TRIM_EVERY = 200; // new tiles between two checks of the size
const MAX_PARALLEL = 2; // the policy allows two connections
const DOWNLOAD_TIMEOUT_MS = 15000; // a stalled request must not hold one of the two places forever
const ASSUMED_TILE_BYTES = 18 * 1024;

export const tileFileName = (z, x, y) => `${z}_${x}_${y}.png`;

export function createTileCache({ fs, dir, now = Date.now, ttlMs = TILE_TTL_MS, maxTiles = MAX_CACHED_TILES, parallel = MAX_PARALLEL, timeoutMs = DOWNLOAD_TIMEOUT_MS, headers = { "User-Agent": TILE_USER_AGENT } }) {
  const known = new Map(); // file name -> when it was fetched (this session)
  const inflight = new Map(); // file name -> { promise, wants }: one request per tile
  const waiting = [];
  let active = 0;
  let dirReady = null;
  let sinceTrim = 0;
  let trimming = null;

  const ensureDir = () => {
    if (!dirReady) {
      dirReady = (async () => {
        const info = await fs.info(dir);
        if (!info.exists) await fs.makeDir(dir);
      })().catch((e) => {
        dirReady = null;
        throw e;
      });
    }
    return dirReady;
  };

  // At most `parallel` downloads at once; the rest wait their turn.
  const takeSlot = () =>
    new Promise((resolve) => {
      if (active < parallel) {
        active++;
        resolve();
      } else waiting.push(resolve);
    });
  const freeSlot = () => {
    const next = waiting.shift();
    if (next) next();
    else active--;
  };

  async function trim() {
    try {
      const names = await fs.list(dir);
      await Promise.all(names.filter((n) => n.endsWith(".part")).map((n) => fs.remove(dir + n).catch(() => {})));
      const tiles = names.filter((n) => n.endsWith(".png"));
      if (tiles.length <= maxTiles) return 0;
      const dated = await Promise.all(tiles.map(async (n) => ({ n, at: (await fs.info(dir + n)).modifiedAt || 0 })));
      dated.sort((a, b) => a.at - b.at);
      const drop = dated.slice(0, tiles.length - Math.floor(maxTiles * KEEP_AFTER_TRIM));
      await Promise.all(drop.map((d) => fs.remove(dir + d.n).catch(() => {})));
      drop.forEach((d) => known.delete(d.n));
      return drop.length;
    } catch (e) {
      return 0;
    }
  }

  function noteNewTile() {
    sinceTrim++;
    if (sinceTrim >= TRIM_EVERY && !trimming) {
      sinceTrim = 0;
      trimming = trim().finally(() => {
        trimming = null;
      });
    }
  }

  async function fetchAgain(name, url, wanted, hadOne) {
    const path = dir + name;
    await takeSlot();
    let ok = false;
    try {
      if (!wanted || wanted()) {
        let timer;
        const gaveUp = { ok: false };
        const timedOut = new Promise((resolve) => {
          timer = setTimeout(() => resolve(gaveUp), timeoutMs);
        });
        const download = fs.download(url, `${path}.part`, headers).catch(() => ({ ok: false }));
        const res = await Promise.race([download, timedOut]);
        clearTimeout(timer);
        // a request we stopped waiting for may still write its file later: sweep it then
        if (res === gaveUp) download.then(() => fs.remove(`${path}.part`).catch(() => {}));
        ok = !!(res && res.ok);
        if (ok) {
          if (hadOne) await fs.remove(path).catch(() => {}); // moving over an existing file is not safe everywhere
          ok = await fs.move(`${path}.part`, path).then(() => true, () => false);
        }
        if (!ok) await fs.remove(`${path}.part`).catch(() => {}); // an error page is never kept as a tile
      }
    } finally {
      freeSlot();
    }
    return ok;
  }

  // The tile's path when it is already known to be fresh: lets a tile that
  // scrolls back into view appear at once instead of after a file lookup.
  function peek(z, x, y) {
    const name = tileFileName(z, x, y);
    const seen = known.get(name);
    return seen !== undefined && now() - seen < ttlMs ? dir + name : null;
  }

  // Where to read the tile from: the file's path, or null when there is no
  // copy and the network failed (offline). Rejects only if the file system
  // itself is unusable: the caller then shows the tile straight from the web,
  // as before. `wanted()` is asked before any request: a tile that has left
  // the screen while it waited is not fetched.
  function resolve(z, x, y, url, { wanted } = {}) {
    const name = tileFileName(z, x, y);
    const seen = known.get(name);
    if (seen !== undefined && now() - seen < ttlMs) return Promise.resolve(dir + name);
    // Two views asking for the same tile share one request, and it is fetched
    // as long as one of them is still looking.
    const running = inflight.get(name);
    if (running) {
      if (wanted) running.wants.push(wanted);
      return running.promise;
    }
    const wants = wanted ? [wanted] : [];
    const stillWanted = () => wants.length === 0 || wants.some((w) => w());
    const promise = (async () => {
      await ensureDir();
      const info = await fs.info(dir + name);
      const have = !!info.exists;
      if (have && now() - info.modifiedAt < ttlMs) {
        known.set(name, info.modifiedAt);
        return dir + name;
      }
      if (!stillWanted()) return have ? dir + name : null;
      if (await fetchAgain(name, url, stillWanted, have)) {
        known.set(name, now());
        noteNewTile();
        return dir + name;
      }
      return have ? dir + name : null; // an old tile is better than a hole
    })().finally(() => inflight.delete(name));
    inflight.set(name, { promise, wants });
    return promise;
  }

  async function stats() {
    await ensureDir();
    const tiles = (await fs.list(dir)).filter((n) => n.endsWith(".png"));
    let bytes = 0;
    for (let i = 0; i < tiles.length; i += 50) {
      const sizes = await Promise.all(tiles.slice(i, i + 50).map(async (n) => (await fs.info(dir + n)).size || 0));
      bytes += sizes.reduce((a, b) => a + b, 0);
    }
    return { count: tiles.length, bytes: bytes || tiles.length * ASSUMED_TILE_BYTES };
  }

  async function clear() {
    known.clear();
    await ensureDir();
    const names = await fs.list(dir);
    await Promise.all(names.map((n) => fs.remove(dir + n).catch(() => {})));
    return names.length;
  }

  return { resolve, peek, stats, clear, trim };
}

// Megabytes for a person: "0,4 Mo", "12 Mo".
export function formatBytes(bytes) {
  const mb = bytes / (1024 * 1024);
  if (mb < 0.1) return "moins de 0,1 Mo";
  return `${mb < 10 ? mb.toFixed(1).replace(".", ",") : Math.round(mb)} Mo`;
}
