// The phone's own lock (fingerprint, face, or the phone's code) as a way to open the app.
// The piece of the phone app it needs is loaded carefully: when it is missing or the phone has no lock at all,
// everything here simply answers "not available" and the lock code of the app is the only way in.
let LocalAuth = null;
try {
  LocalAuth = require("expo-local-authentication");
} catch (e) {
  LocalAuth = null;
}

// True when the phone has a lock to ask for (a fingerprint, a face, or at least a code or a pattern).
export async function deviceAuthAvailable() {
  try {
    if (!LocalAuth || typeof LocalAuth.getEnrolledLevelAsync !== "function" || typeof LocalAuth.authenticateAsync !== "function") return false;
    const level = await LocalAuth.getEnrolledLevelAsync();
    return typeof level === "number" && level > 0;
  } catch (e) {
    return false;
  }
}

// Asks the phone to check who is holding it. True only when the phone says yes.
export async function authenticateWithDevice(promptMessage = "Ouvrir Compagnon de voyage") {
  try {
    if (!LocalAuth || typeof LocalAuth.authenticateAsync !== "function") return false;
    const result = await LocalAuth.authenticateAsync({ promptMessage, disableDeviceFallback: false });
    return !!(result && result.success === true);
  } catch (e) {
    return false;
  }
}
