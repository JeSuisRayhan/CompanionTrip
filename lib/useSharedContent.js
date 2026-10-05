// Content sent from another app ("Partager" → Compagnon de voyage).
// It needs a piece of the phone app that only builds made after it was added contain. The library is loaded
// carefully: when the piece is missing (a build made before), the hook reports nothing shared and nothing breaks.
import { Platform } from "react-native";

let realHook = null;
try {
  realHook = require("expo-share-intent").useShareIntent;
} catch (e) {
  realHook = null;
}

// The library wants the app's link name ("scheme") to clear what was shared. The app has none in its configuration, and
// without one the library throws as soon as the app goes to the background or a share is taken: so it is given here.
const OPTIONS = { scheme: "compagnondevoyage", debug: false, resetOnBackground: true, disabled: Platform.OS === "web" };

const NOTHING = { hasShareIntent: false, shareIntent: null, resetShareIntent: () => {}, error: null };

// Same hook on every render (chosen once, when the file loads), so the rules of hooks hold.
export function useSharedContent() {
  return realHook ? realHook(OPTIONS) : NOTHING;
}
