# AGENTS.md

给后续 agent 的项目说明。用户是 ql。对外作者署名也是 ql（Zotero `manifest.json` 的 `author`，以及 `package.json` 的 `author` / `copyright`）。改完一轮目标后只更新本文件里真正变了的部分。

## 这是什么

论文阅读用的本地术语本：Zotero 划词加入，按日期分页，可手写或 AI 生成解析。仓库：https://github.com/QL796907/paperreading_tool

三条客户端，更新通道互相独立：

| 端 | 形态 | 更新 |
| --- | --- | --- |
| Windows | Electron + NSIS，关窗进托盘 | GitHub Release + `electron-updater`（`latest.yml`）。设置里「使用镜像下载更新」默认开，走 `https://gh.4o.pw/` 前缀；说明 https://gh.4o.pw/docs |
| Android | Capacitor WebView，无 Zotero 划词；词条在本地，坚果云 WebDAV 同步。后台同步通过 `setNativeSyncListener` 调 `load()`，拉回的词条和页脚一起刷新 | `updates/android.json` 的 `version` + **`versionCode`**。清单和 APK 下载同样可走 gh.4o.pw 镜像。启动静默检查用这次 `load()` 已取到的设置：`githubMirrorEnabled === false` 才直连 |
| Zotero | 插件 xpi | `manifest.json` 的 `update_url` → `updates/zotero.json` |

电脑开发时还有 Express（`server/`，端口 3780）+ Vite（`web/`，5173）。手机 APK **不跑 Express**，走 `web/src/native*.js`。

应用图标以 ql 敲定的 Grokbot 示例为准：奶油圆角方印、森林绿双线框、立着的墨色书、封面是掀起的折线（不是词条横杠、也不是盖在书上的黑块）、朱红角点在右上。电脑、手机、启动页同一套，由 `scripts/make-icons.js` 出图；`android:setup` 会覆盖 Capacitor 默认蓝标。不要再手改各密度 PNG。

当前对外版本是 **`1.0.3` / `versionCode` 4**（2026-09-26：立书封面折线图标 + GitHub 更新默认走 gh.4o.pw 镜像）。日常改功能不要 bump；只有 ql 说发版才改。下次发版：`1.0.3` → `1.0.4`，`versionCode` 4 → 5。

## 目录

- `web/` React UI。桌面走 `api.js`，SSE 触发整页 `load()`。Android 走 `nativeApi.js`；`setNativeSyncListener` 同样调 `load()`，启动更新检查把 `load()` 返回的 `settings` 传给 `checkAppUpdate`。阅读空白页把 `native={isAndroidApp()}` 传给 `EmptyState`。词条 upsert/patch、设置默认值与来源整理在 `web/src/glossaryLogic.js`。信封、删词、取词、设置读写在 `web/src/glossaryStore.js` 的 `createGlossaryStore({ readJson, writeJson })`，手机 `nativeStore.js` 和电脑 `server/store.js` 只提供各自的 JSON 读写。`getSettings` 走 `mergeSettings`，读出来的键和下一次 `saveSettings` 写回的键一致。手机读 `terms.json` / `settings.json` 与电脑 `readJson` 一样：只有文件不存在（`ENOENT` 或 Capacitor 的 `File does not exist`）才当空；解析失败或其他读失败抛出，`load()` 提示错误，保存不会接着把空数据写回去。
- `server/` 仅电脑：词条文件、AI、WebDAV。`store.js` 只提供本机 JSON 读写，再交给 `createGlossaryStore`。Electron 的 `build.files` 要带上 `web/src/glossaryLogic.js`、`web/src/glossaryStore.js`、`web/src/syncEngine.js`、`web/src/webdavProtocol.js`、`web/src/explainTerm.js` 和 `web/src/createTermFlow.js`，安装包里的 store / sync / 解析 / 新建词条才能 import 到它们。新建词条后的自动释义判断和 `{ term, created, explainError }` 回退只在 `createTermFlow.js`：电脑 `POST /api/terms` 和手机 `nativeApi.createTerm` 都调用它；SSE 和 HTTP 状态码留在 `server/index.js`。`sync.js` 的 `withLock` 同时串起同步和 `index.js` 里的词条/设置写入（`upsertTerm`、`updateTerm`、`deleteTerm`、`saveSettings`）；`queuePush` 在写入释放之后按定时器排队。手机 `nativeSync.js` / `nativeApi.js` 同一做法。坚果云 last-write-wins 在 `web/src/syncEngine.js`：`nativeSync.js` 和 `server/sync.js` 各自传入 `readEnvelope` / `writeEnvelope` / `getSettings` 和本端已有的 dav 函数，两条循环都调用 `start`。`withLock` 从两端导出，和同步是同一条链。WebDAV 协议在 `web/src/webdavProtocol.js`（`createDavClient(request)`）：测连、下载、上传、建父目录、拼地址只此一份。电脑 `server/webdav.js` 用 Node `fetch`，手机 `web/src/webdavClient.js` 用 `httpRequest`，两边只做传输适配。术语解析的请求体和回复解析在 `web/src/explainTerm.js`：`explainTerm(term, settings, post)`。电脑 `server/ai.js` 的 `post` 是 fetch，手机 `nativeAi.js` 的 `post` 是 `httpRequest`（超时先改回 `AbortError`）。非 2xx 和解析失败是 502，超时是 504，文案是「模型请求超时，请稍后重试」。测试连接的账号只在 `normalizeTestCredentials` 里整理：请求里带了的字段（含空字符串）以请求为准，没带才用已保存设置。电脑 `POST /api/sync/test` 和手机 `nativeApi.testSync` 都把 body 交给 `testConnection`。清空应用密码再点「测试连接」，两边都是「请填写账号和应用密码」，不会用旧密码去连。
- `electron/` 桌面壳、托盘、`electron-updater`。单实例锁失败只 `app.quit()`；服务、托盘和窗口只在持锁分支的 `whenReady` 里启动（`quit()` 卸不掉已注册的回调，第二进程会去听 3780）。GitHub 镜像前缀、开关 `githubMirrorOn`、主机后缀 `GITHUB_FILE_HOST_SUFFIXES` 都在 `electron/githubMirror.js`（纯函数，没有 Electron API）。`main.js` 静态 import 它，读 `settings.json` 之后只调用 `githubMirrorOn`；`electron/**/*` 已经进安装包，不要再为这份文件加 `build.files`。网页 `apkUpdate.js` 和 `overlays.jsx` 也从这里 import，Vite 打进 `web/dist`。`apkUpdate.js` 把前缀和主机后缀传给 `ApkUpdater.download`，重定向只改写主机命中这些后缀的地址。
- `android/` Capacitor 工程；包名 `com.ql796907.paperglossary`。`AndroidManifest.xml` 的 `android:allowBackup` 固定为 `false`（`scripts/setup-android.js` 的 `patchManifest` 在 `cap add` 生成默认清单后写回）。Auto Backup 会带走 `Directory.Data` 里的 `settings.json`，其中有 API key 和坚果云应用密码。`native/android/` 没有清单模板。
- `native/android/` 原生插件源，setup 时拷进 `android/`。`ApkUpdaterPlugin.java` 不写死镜像前缀和主机名单；改它时源文件和 `android/app/src/main/java/com/ql796907/paperglossary/ApkUpdaterPlugin.java` 一起改。`WebDavPlugin` 用 OkHttp 发 PROPFIND / MKCOL：手机系统网络库不认这两个方法，坚果云「测试连接」和建目录必须走它。
- `zotero-plugin/` Zotero 7 插件。
- `scripts/` `pack-plugin.js`、`build-apk.js`、`setup-android.js`、`with-proxy.js`、`make-icons.js`（方案 E 绿框学印，电脑/手机同一套）。
- `updates/android.json`、`updates/zotero.json` 更新清单（进 git）。
- `release/` 安装包输出（不进 git）。
- `web/public/icons/preview-windows.png`、`preview-android.png`、`preview-android-round.png`：电脑/手机图标预览。
- `.cursor/rules/` 项目硬规则。

## 命令

代理默认 `127.0.0.1:10808`。下 GitHub / Maven 失败先走 `*:proxy`。

- `npm run dev` 网页 + API
- `npm run dist` / `dist:proxy` Windows 安装包
- `npm run apk` / `apk:proxy` Android APK
- `npm run plugin:pack` xpi，并重写 `updates/zotero.json`（不改 `updates/android.json`）
- `npm run android:setup` 同步 web 进 Capacitor（缺 keystore 会停。确认要新建时才设 `GLOSSARY_NEW_KEYSTORE=1`，密码只读 `GLOSSARY_KEYSTORE_PASSWORD`，脚本里没有默认密码）
- GitHub Actions（`.github/workflows/ci.yml`）：pull request 和 push 到 `main` 时用 Node 20 跑 `npm ci`、`npm run build`。不打 Windows / APK / xpi。锁文件下载地址是 npmmirror，CI 改从 `registry.npmjs.org` 取（`--replace-registry-host=always`），并设 `ELECTRON_SKIP_BINARY_DOWNLOAD=1`。

## 硬规则（ql）

1. **一轮目标做完就自动 commit 到 `main`**。不要开分支，不要走 PR。不要 push，除非 ql 说 push。
2. **每次发版必须附带三件套**：Windows 安装包 + APK + Zotero xpi。同时 bump `package.json` 的 `version`，APK 再把 `versionCode` +1。未说发版不要改版本。
3. **`README.md` 给会下载安装、但不懂代码的普通人看**，也就是 GitHub Release 说明。第一次发版整篇写成：这是什么、能帮什么忙 → 下哪个包、怎么安装打开、第一次怎么用 → 真会卡住人的小提示。中文，一两分钟能读完，轻松但别夸张。不要写技术栈、编译、API、贡献指南。之后每次发版只增量更新版本号、下载链接、会变的用法。没改 README 不算发完。日常改功能不要动 README。
4. 没有 `AGENTS.md` 就自动创建；每轮结束后只更新有变化的段落。
5. **验收时 Android 必须能编过** 才算完。没 SDK、Gradle 挂了、缺 keystore：必须说明失败点，不能假装做完。纯文档、纯规则、或只改 Zotero 且不发版，可以不编，但要写明原因。
6. APK 签名：`android/glossary.keystore` + `android/keystore.properties`，不进 git。换电脑先拷这两份，**禁止默默新建钥匙**。新建时密码只读环境变量 `GLOSSARY_KEYSTORE_PASSWORD`，不要写进脚本。
7. 不要把 API Key、WebDAV 密码、keystore 密码写进仓库或聊天。

## 发版时改什么

- `package.json` `version`
- `updates/android.json`：`version`、`versionCode`+1、`url`、`notes`
- `npm run plugin:pack` 更新 `zotero-plugin/manifest.json` 所用版本与 `updates/zotero.json` 的 sha256
- GitHub Release 资源：`paper-glossary-Setup-<ver>.exe`、`.exe.blockmap`、`latest.yml`、`paper-glossary-<ver>.apk`、`paper-glossary.xpi`。`.blockmap` 和 `latest.yml` 必须挂上，但对外说明里写清楚：**使用者只下 exe**，那两份是给 `electron-updater` 自己读的。
- `README.md`：给普通人看；改版本、链接、会卡住的用法。不要写开发命令。
