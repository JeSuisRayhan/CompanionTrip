// Content sent from another app ("Partager" → Compagnon de voyage).
// It needs a piece of the phone app that only builds made after it was added contain. The library is loaded
// carefully: when the piece is missing (a build made before), the hook reports nothing shared and nothing breaks.
let realHook = null;
try {
  realHook = require("expo-share-intent").useShareIntent;
} catch (e) {
  realHook = null;
}

const NOTHING = { hasShareIntent: false, shareIntent: null, resetShareIntent: () => {}, error: null };

// Same hook on every render (chosen once, when the file loads), so the rules of hooks hold.
export function useSharedContent() {
  return realHook ? realHook() : NOTHING;
}
