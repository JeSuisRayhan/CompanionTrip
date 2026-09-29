// Remote updates of the app's JavaScript (expo-updates, published from GitHub:
// "Publier une mise à jour"). The app checks by itself when it opens and
// applies the update at the next start; these helpers let the person check
// and restart right away. Off in development and in builds without updates.
import * as Updates from "expo-updates";

export function updatesInfo() {
  return {
    enabled: !!Updates.isEnabled,
    version: Updates.runtimeVersion || null,
    // the first letters of the id of the update in use; null when running the APK's own code
    updateId: !Updates.isEmbeddedLaunch && Updates.updateId ? String(Updates.updateId).slice(0, 8) : null,
  };
}

// "disabled" | "none" | "downloaded". Throws when the server can't be reached.
export async function fetchUpdateNow() {
  if (!Updates.isEnabled) return "disabled";
  const check = await Updates.checkForUpdateAsync();
  if (!check.isAvailable) return "none";
  const result = await Updates.fetchUpdateAsync();
  return result.isNew ? "downloaded" : "none";
}

export function restartApp() {
  return Updates.reloadAsync();
}

// True once an update has been downloaded and is waiting for a restart.
export function useUpdatePending() {
  const { isUpdatePending } = Updates.useUpdates();
  return !!isUpdatePending;
}
