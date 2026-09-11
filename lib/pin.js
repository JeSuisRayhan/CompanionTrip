import { getSetting, setSetting, removeSetting } from "./storage";

const PIN_KEY = "appPin";

export async function hasPin() {
  const pin = await getSetting(PIN_KEY);
  return !!pin;
}

export async function setPin(pin) {
  await setSetting(PIN_KEY, pin);
}

export async function checkPin(candidate) {
  const stored = await getSetting(PIN_KEY);
  return stored === candidate;
}

export async function clearPin() {
  await removeSetting(PIN_KEY);
}
