import { Capacitor } from "@capacitor/core";

export function isNativeApp() {
  try {
    return Boolean(Capacitor?.isNativePlatform?.());
  } catch {
    return false;
  }
}

export function isAndroidApp() {
  try {
    return Capacitor?.getPlatform?.() === "android";
  } catch {
    return false;
  }
}

export const APP_VERSION = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "1.0.0";
