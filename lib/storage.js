// AsyncStorage-backed persistence — the React Native equivalent of the
// window.storage wrapper used in the web/PWA version. Same trips:all key so
// a JSON backup exported from the web app can be re-imported here unchanged.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { STORAGE_KEY } from "./constants";

export async function loadTrips() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

export async function saveTrips(trips) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(trips));
}

export async function getSetting(key) {
  try {
    return await AsyncStorage.getItem(key);
  } catch (e) {
    return null;
  }
}

export async function setSetting(key, value) {
  await AsyncStorage.setItem(key, value);
}

export async function removeSetting(key) {
  await AsyncStorage.removeItem(key);
}
