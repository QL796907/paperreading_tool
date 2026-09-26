# AGENTS.md

给后续 agent 的项目说明。用户是 hy。改完一轮目标后只更新本文件里真正变了的部分。

## 这是什么

论文阅读用的本地术语本：Zotero 划词加入，按日期分页，可手写或 AI 生成解析。仓库：https://github.com/QL796907/paperreading_tool

三条客户端，更新通道互相独立：

| 端 | 形态 | 更新 |
| --- | --- | --- |
| Windows | Electron + NSIS，关窗进托盘 | GitHub Release + `electron-updater`（`latest.yml`）。设置里「使用镜像下载更新」默认开，走 `https://gh.4o.pw/` 前缀；说明 https://gh.4o.pw/docs |
| Android | Capacitor WebView，无 Zotero 划词；词条在本地，坚果云 WebDAV 同步 | `updates/android.json` 的 `version` + **`versionCode`**。清单和 APK 下载同样可走 gh.4o.pw 镜像 |
| Zotero | 插件 xpi | `manifest.json` 的 `update_url` → `updates/zotero.json` |

电脑开发时还有 Express（`server/`，端口 3780）+ Vite（`web/`，5173）。手机 APK **不跑 Express**，走 `web/src/native*.js`。

应用图标以 hy 敲定的 Grokbot 示例为准：奶油圆角方印、森林绿双线框、立着的墨色书、封面是掀起的折线（不是词条横杠、也不是盖在书上的黑块）、朱红角点在右上。电脑、手机、启动页同一套，由 `scripts/make-icons.js` 出图；`android:setup` 会覆盖 Capacitor 默认蓝标。不要再手改各密度 PNG。

当前对外版本是 **`1.0.2` / `versionCode` 3**（2026-09-23：电脑手机统一绿框学印图标）。日常改功能不要 bump；只有 hy 说发版才改。下次发版：`1.0.2` → `1.0.3`，`versionCode` 3 → 4。

## 目录

- `web/` React UI。桌面走 `api.js`；Android 走 `nativeApi.js` 等。
- `server/` 仅电脑：词条、AI、WebDAV。
- `electron/` 桌面壳、托盘、`electron-updater`。
- `android/` Capacitor 工程；包名 `com.ql796907.paperglossary`。
- `native/android/` 原生插件源，setup 时拷进 `android/`。
- `zotero-plugin/` Zotero 7 插件。
- `scripts/` `pack-plugin.js`、`build-apk.js`、`setup-android.js`、`with-proxy.js`、`make-icons.js`（方案 E 绿框学印，电脑/手机同一套）。
- `updates/android.json`、`updates/zotero.json` 更新清单（进 git）。
- `release/` 安装包输出（不进 git）。
- `图标截图/` 给 hy 直接打开看的电脑/手机图标图。
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
3. **`README.md` 给会下载、但不懂代码的人看**：第一次发版写成「是什么 → 下哪个 → 怎么装 → 第一次怎么用 → 卡住提示」；之后每次发版只改版本号、下载链接、会变的用法。不要写编译、npm、API、贡献指南。没改 README 不算发完。日常改功能不要动 README。
4. 没有 `AGENTS.md` 就创建；每轮结束后只更新有变化的段落。
5. **验收时 Android 必须实际编过** 才算完。没 SDK、Gradle 挂了、缺 keystore：必须说明，不能假装做完。
6. APK 签名：`android/glossary.keystore` + `android/keystore.properties`，不进 git。换电脑先拷这两份，**禁止默默新建钥匙**。
7. 不要把 API Key、WebDAV 密码、keystore 密码写进仓库或聊天。

## 发版时改什么

- `package.json` `version`
- `updates/android.json`：`version`、`versionCode`+1、`url`、`notes`
- `npm run plugin:pack` 更新 `zotero-plugin/manifest.json` 所用版本与 `updates/zotero.json` 的 sha256
- GitHub Release 资源：`paper-glossary-Setup-<ver>.exe`、`.exe.blockmap`、`latest.yml`、`paper-glossary-<ver>.apk`、`paper-glossary.xpi`。`.blockmap` 和 `latest.yml` 必须挂上，但对外说明里写清楚：**使用者只下 exe**，那两份是给 `electron-updater` 自己读的。
- `README.md`：给普通人看；改版本、链接、会卡住的用法。不要写开发命令。
