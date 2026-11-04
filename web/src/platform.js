// 不引 @capacitor/core，桌面入口才能把这份包留在异步 chunk 里。
// Android WebView 会在页面脚本之前注入 window.Capacitor（native-bridge.js）。
// 注入还没发生时，和 @capacitor/core 一样看 androidBridge / webkit bridge。
function capacitorGlobal() {
  try {
    return globalThis.Capacitor || null;
  } catch {
    return null;
  }
}

function bridgePlatform() {
  try {
    if (globalThis.androidBridge) return "android";
    if (globalThis.webkit?.messageHandlers?.bridge) return "ios";
  } catch {
    return "web";
  }
  return "web";
}

export function isNativeApp() {
  try {
    const cap = capacitorGlobal();
    if (typeof cap?.isNativePlatform === "function") return Boolean(cap.isNativePlatform());
    return bridgePlatform() !== "web";
  } catch {
    return false;
  }
}

export function isAndroidApp() {
  try {
    const cap = capacitorGlobal();
    if (typeof cap?.getPlatform === "function") return cap.getPlatform() === "android";
    return bridgePlatform() === "android";
  } catch {
    return false;
  }
}

export const APP_VERSION = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "1.0.0";
