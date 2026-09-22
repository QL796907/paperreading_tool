# AGENTS.md

给后续 agent 的项目说明。用户是 hy。改完一轮目标后只更新本文件里真正变了的部分。

## 这是什么

论文阅读用的本地术语本：Zotero 划词加入，按日期分页，可手写或 AI 生成解析。仓库：https://github.com/QL796907/paperreading_tool

三条客户端，更新通道互相独立：

| 端 | 形态 | 更新 |
| --- | --- | --- |
| Windows | Electron + NSIS，关窗进托盘 | GitHub Release + `electron-updater`（`latest.yml`） |
| Android | Capacitor WebView，无 Zotero 划词；词条在本地，坚果云 WebDAV 同步 | `updates/android.json` 的 `version` + **`versionCode`** |
| Zotero | 插件 xpi | `manifest.json` 的 `update_url` → `updates/zotero.json` |

电脑开发时还有 Express（`server/`，端口 3780）+ Vite（`web/`，5173）。手机 APK **不跑 Express**，走 `web/src/native*.js`。

当前对外版本仍是 `1.0.0` / `versionCode` 1。日常改功能不要 bump；只有 hy 说发版才改。

## 目录

- `web/` React UI。桌面走 `api.js`；Android 走 `nativeApi.js` 等。
- `server/` 仅电脑：词条、AI、WebDAV。
- `electron/` 桌面壳、托盘、`electron-updater`。
- `android/` Capacitor 工程；包名 `com.ql796907.paperglossary`。
- `native/android/` 原生插件源，setup 时拷进 `android/`。
- `zotero-plugin/` Zotero 7 插件。
- `scripts/` `pack-plugin.js`、`build-apk.js`、`setup-android.js`、`with-proxy.js`。
- `updates/android.json`、`updates/zotero.json` 更新清单（进 git）。
- `release/` 安装包输出（不进 git）。
- `.cursor/rules/` 项目硬规则。

## 命令

代理默认 `127.0.0.1:10808`。下 GitHub / Maven 失败先走 `*:proxy`。

- `npm run dev` 网页 + API
- `npm run dist` / `dist:proxy` Windows 安装包
- `npm run apk` / `apk:proxy` Android APK
- `npm run plugin:pack` xpi，并重写 `updates/zotero.json`（会保留已有 `versionCode`）
- `npm run android:setup` 同步 web 进 Capacitor（缺 keystore 会停）

## 硬规则（hy）

1. **一轮目标做完就 commit 到 `main`**。不开分支、不走 PR。不要 push，除非 hy 说 push。
2. **发版必须三件套**：Windows exe + APK + Zotero xpi。同时 bump `package.json` 的 `version`，APK 再把 `versionCode` +1。未说发版不要改版本。
3. **第一次发版写精美 `README.md`**（对外产品页）；之后每次发版增量更新版本号、下载链接和新功能。没改 README 不算发完。日常改功能不要动 README。
4. 没有 `AGENTS.md` 就创建；每轮结束后只更新有变化的段落。
5. **验收时 Android 必须实际编过** 才算完。没 SDK、Gradle 挂了、缺 keystore：必须说明，不能假装做完。
6. APK 签名：`android/glossary.keystore` + `android/keystore.properties`，不进 git。换电脑先拷这两份，**禁止默默新建钥匙**。
7. 不要把 API Key、WebDAV 密码、keystore 密码写进仓库或聊天。

## 发版时改什么

- `package.json` `version`
- `updates/android.json`：`version`、`versionCode`+1、`url`、`notes`
- `npm run plugin:pack` 更新 `zotero-plugin/manifest.json` 所用版本与 `updates/zotero.json` 的 sha256
- GitHub Release 资源：`paper-glossary-Setup-<ver>.exe`、`.exe.blockmap`、`latest.yml`、`paper-glossary-<ver>.apk`、`paper-glossary.xpi`
- `README.md`：首次整篇写成对外页；之后改版本、链接、新能力

## 本轮之后未提交的工作区

写本文件时，Electron / Android / Capacitor 相关改动仍大量停在工作区、尚未进 git（上一轮在「未开口不提交」规则下完成）。后续若 hy 要推送或收进 main，再单独处理，不要和无关的小改动混提交。
