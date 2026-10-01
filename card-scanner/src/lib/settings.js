import { mergeSettings } from "./pricing.js";

const SETTINGS_KEY = "binder.settings";
const PASS_KEY = "binder.passcode";

// localStorage can throw in private mode; settings then fall back to defaults.
export function loadSettings() {
  try {
    return mergeSettings(JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null"));
  } catch {
    return mergeSettings(null);
  }
}

export function saveSettings(s) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export function getPasscode() {
  try {
    return localStorage.getItem(PASS_KEY) || "";
  } catch {
    return "";
  }
}

export function setPasscode(v) {
  try {
    if (v) localStorage.setItem(PASS_KEY, v);
    else localStorage.removeItem(PASS_KEY);
  } catch {
    /* ignore */
  }
}
