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

应用图标以 ql 敲定的 Grokbot 示例为准：奶油圆角方印、森林绿双线框、立着的墨色书、封面是掀起的折线（不是词条横杠、也不是盖在书上的黑块）、朱红角点在右上。电脑、手机、启动页同一套，由 `scripts/make-icons.js` 出图。启动图层 `<bitmap>` 用各密度 `drawable-*/splash_icon.png`（真位图）；`@mipmap/ic_launcher` 在 API 26+ 是自适应图标 XML，不能放进 `<bitmap>`，但可以当作 `windowSplashScreenAnimatedIcon`。`AppTheme.NoActionBarLaunch` 还要写 `windowSplashScreenBackground`、`windowSplashScreenAnimatedIcon`、`postSplashScreenTheme`。`android:setup` 会覆盖 Capacitor 默认蓝标。奶油底色只留 `values/ic_launcher_background.xml` 里的 `@color/ic_launcher_background`。`make-icons.js` 不再写 `drawable/ic_launcher_background.xml`，再跑时会删掉残留的 shape。不要再手改各密度 PNG。

当前对外版本是 **`1.0.5` / `versionCode` 6**（2026-10-21：标题栏按钮、应用内静默更新、托盘退出会结束进程、同步失败写出原因）。日常改功能不要 bump；只有 ql 说发版才改。下次发版：`1.0.5` → `1.0.6`，`versionCode` 6 → 7。

## 目录

- `web/` React UI。桌面走 `api.js`，SSE 触发整页 `load()`。Android 走 `nativeApi.js`；`setNativeSyncListener` 同样调 `load()`，启动更新检查把 `load()` 返回的 `settings` 传给 `checkAppUpdate`。阅读空白页把 `native={isAndroidApp()}` 传给 `EmptyState`。词条 upsert/patch、设置默认值与来源整理在 `shared/glossaryLogic.js`。信封、删词、取词、设置读写在 `shared/glossaryStore.js` 的 `createGlossaryStore({ readJson, writeJson })`，手机 `nativeStore.js` 和电脑 `server/store.js` 只提供各自的 JSON 读写。`getSettings` 走 `mergeSettings`，读出来的键和下一次 `saveSettings` 写回的键一致。手机读 `terms.json` / `settings.json` 与电脑 `readJson` 一样：只有文件不存在（`ENOENT` 或 Capacitor 的 `File does not exist`）才当空；解析失败或其他读失败抛出，`load()` 提示错误，保存不会接着把空数据写回去。手机保存 `terms.json` / `settings.json` 先写同目录的 `*.tmp`，再由 `GlossaryFilePlugin.replace` 用一次 `Os.rename` 盖掉正式文件。不用 Capacitor `Filesystem.rename`：它在 Android 上先删目标再 `File.renameTo`，而 `File.renameTo` 不覆盖已有文件；删完到改名之间被杀掉，正式文件就没了，`load()` 和同步都读不了。
- `shared/` 桌面安装包、网页和手机共用的模块：`glossaryLogic.js`、`glossaryStore.js`、`syncEngine.js`、`webdavProtocol.js`、`explainTerm.js`、`createTermFlow.js`。`build.files` 写 `shared/**/*`，并用 `!shared/**/*.test.js` 排除测试。`githubMirror.js` 仍在 `electron/`，由 `electron/**/*` 覆盖。Vite 和 `native*.js` 从这里 import，打进 `web/dist`。同目录的 `*.test.js` 用 `node --test` 跑。
- `server/` 仅电脑：词条文件、AI、WebDAV。`store.js` 只提供本机 JSON 读写，再交给 `createGlossaryStore`。Electron 的 `build.files` 用 `shared/**/*` 带上整份共享目录，`!shared/**/*.test.js` 把测试留在包外。store / sync / 解析 / 新建词条才能 import 到它们。新模块放进 `shared/` 就会进安装包，不用再逐个写进 `files`。新建词条后的自动释义判断和 `{ term, created, explainError }` 回退只在 `createTermFlow.js`：电脑 `POST /api/terms` 和手机 `nativeApi.createTerm` 都调用它；SSE 和 HTTP 状态码留在 `server/index.js`。`sync.js` 的 `withLock` 同时串起同步和 `index.js` 里的词条/设置写入（`upsertTerm`、`updateTerm`、`deleteTerm`、`saveSettings`）；`queuePush` 在写入释放之后按定时器排队。手机 `nativeSync.js` / `nativeApi.js` 同一做法。坚果云 last-write-wins 在 `shared/syncEngine.js`：`nativeSync.js` 和 `server/sync.js` 各自传入 `readEnvelope` / `writeEnvelope` / `getSettings` 和本端已有的 dav 函数，两条循环都调用 `start`。`withLock` 从两端导出，和同步是同一条链。WebDAV 协议在 `shared/webdavProtocol.js`（`createDavClient(request)`）：测连、下载、上传、建父目录、拼地址只此一份。电脑 `server/webdav.js` 用 Node `fetch`（`redirect: "manual"`），手机 `web/src/webdavClient.js` 用 `httpRequest` 并传 `redirect: "manual"`，两边只做传输适配。301/302/307/308 由 `webdavProtocol.js` 按原方法重放（最多 5 次，不跨主机）。手机上只有这条 WebDAV 调用关掉跟随：术语本 GET 和 PUT 仍走 CapacitorHttp（`disableRedirects`），响应体不经插件的 1MB 截断；AI POST 和更新清单 GET 不传这个参数，继续跟随。PROPFIND / MKCOL 仍走 WebDav 插件。传输层若自己跟随，落地的 200/201/204 会被当成上传成功，MKCOL 还会被改成 GET。建目录的地址带末尾斜杠；409 再 PROPFIND，207/200 才当成文件夹已存在。「测试连接」只探测账号，页脚在 `lastError` 时写出具体原因。术语解析的请求体和回复解析在 `shared/explainTerm.js`：`explainTerm(term, settings, post)`。电脑 `server/ai.js` 的 `post` 是 fetch，超时直接是 AbortError。手机 `nativeAi.js` 的 `post` 是 `httpRequest`；网络超时在 `web/src/http.js` 的 `httpRequest` 里标成 AbortError，文案保持「连接超时，请检查网络」。只有 `explainTerm` 把这条 AbortError 写成 504 和「模型请求超时，请稍后重试」。非 2xx 和解析失败仍是 502。测试连接的账号只在 `normalizeTestCredentials` 里整理：请求里带了的字段（含空字符串）以请求为准，没带才用已保存设置。电脑 `POST /api/sync/test` 和手机 `nativeApi.testSync` 都把 body 交给 `testConnection`。清空应用密码再点「测试连接」，两边都是「请填写账号和应用密码」，不会用旧密码去连。
- `electron/` 桌面壳、托盘、`electron-updater`。Windows 用无边框窗口（`frame: false`），最小化 / 最大化 / 关闭由 `web/src/WindowControls.jsx` 画在页面顶部（高 48、单钮宽 58）。更新在应用内下载；`quitAndInstall(true, true)` 静默安装（NSIS `/S`），不弹出安装窗口。页面上的「现在更新」和托盘「安装更新」都走它。托盘「退出」用 `setImmediate` 跳出菜单回调再 `quitApp()`：先 `tray.destroy()`、`closeAllConnections()`，一秒后若还在就 `app.exit(0)`。在菜单回调里直接 `app.quit()` 时，Windows 会把退出取消掉，进程留在任务管理器里。只关窗口仍收进托盘。安装包进程名是 `paper-glossary.exe`（`win.executableName`），快捷方式仍叫术语本。`build/installer.nsh` 的 `customCheckAppRunning` 会按安装目录结束旧进程（含以前的 `术语本.exe`），避免 cmd 里的 taskkill 对不上中文进程名。这份脚本比 `allowOnlyOneInstallerInstance.nsh` 先被包含，所以要自己 `!include getProcessInfo.nsh` 并声明 `Var pid`，否则 makensis 会把 `${GetProcessInfo}` 当成非法命令。`electron/preload.cjs` 暴露窗口按钮，以及更新是否已下载和开始安装。单实例锁失败只 `app.quit()`；服务、托盘和窗口只在持锁分支的 `whenReady` 里启动（`quit()` 卸不掉已注册的回调，第二进程会去听 3780）。GitHub 镜像前缀、开关 `githubMirrorOn`、主机后缀 `GITHUB_FILE_HOST_SUFFIXES` 都在 `electron/githubMirror.js`（纯函数，没有 Electron API）。`main.js` 静态 import 它，读 `settings.json` 之后只调用 `githubMirrorOn`；`electron/**/*` 已经进安装包，不要再为这份文件加 `build.files`。词条、同步、WebDAV 和解析这些共享模块在 `shared/`，由 `shared/**/*` 覆盖。网页 `apkUpdate.js` 和 `overlays.jsx` 也从这里 import，Vite 打进 `web/dist`。`apkUpdate.js` 把前缀和主机后缀传给 `ApkUpdater.download`，重定向只改写主机命中这些后缀的地址。
- `android/` Capacitor 工程；包名 `com.ql796907.paperglossary`。`AndroidManifest.xml` 的 `android:allowBackup` 固定为 `false`（`scripts/setup-android.js` 的 `patchManifest` 在 `cap add` 生成默认清单后写回）。Auto Backup 会带走 `Directory.Data` 里的 `settings.json`，其中有 API key 和坚果云应用密码。`native/android/` 没有清单模板。
- `native/android/` 是插件 Java 和 `file_paths.xml` 的唯一修改处。`scripts/setup-android.js` 的 `syncNativeSources` 把 `native/android/*.java` 拷进 `android/app`（跳过 `MainActivity.java`），并拷贝 `file_paths.xml`；`MainActivity.java` 只由同文件的 `mainActivitySource` 模板写出，`registerPlugin` 只改这份模板。该包目录里多出来的 `.java` 会被删掉。手改 `android/app` 下这些副本会在下次 `npm run apk` 被盖掉。改完源或模板后跑 `node scripts/setup-android.js --sync-sources`，让副本跟脚本输出一致，不要再手改那一边。`ApkUpdaterPlugin.java` 不写死镜像前缀和主机名单。`WebDavPlugin` 用 OkHttp 发 PROPFIND / MKCOL：手机系统网络库不认这两个方法，坚果云「测试连接」和建目录必须走它。OkHttp 关闭 `followRedirects`，301/302 交回协议层重发原方法。响应体仍截到 1MB，术语本 GET 不走这个插件。`GlossaryFilePlugin` 只在 `Directory.Data`（`getFilesDir()`）里做一次同目录 `Os.rename`。
- `zotero-plugin/` Zotero 7 插件。
- `scripts/` `pack-plugin.js`、`build-apk.js`、`setup-android.js`、`with-proxy.js`、`make-icons.js`（方案 E 绿框学印，电脑/手机同一套）。
- `updates/android.json`、`updates/zotero.json` 更新清单（进 git）。
- `release/` 安装包输出（不进 git）。
- `web/public/icons/preview-windows.png`、`preview-android.png`、`preview-android-round.png`：电脑/手机图标预览。
- `.cursor/rules/` 项目硬规则。

## 命令

代理默认 `127.0.0.1:10808`。下 GitHub / Maven 失败先走 `*:proxy`。

- `npm run dev` 网页 + API
- `npm test`：`node --test` 跑 `shared/syncEngine.test.js`、`shared/webdavProtocol.test.js`、`web/src/nativeStore.test.js`。`web/src/webdavClient.test.js` 要在带 `mock.module` 的 Node 上跑（20.18+ 或 22.3+：`node --experimental-test-module-mocks --test web/src/webdavClient.test.js`），不放进 `npm test`
- `npm run dist` / `dist:proxy` Windows 安装包
- `npm run apk` / `apk:proxy` Android APK
- `npm run plugin:pack` xpi，并重写 `updates/zotero.json`（不改 `updates/android.json`）
- `npm run android:setup` 同步 web 进 Capacitor（缺 keystore 会停。确认要新建时才设 `GLOSSARY_NEW_KEYSTORE=1`，密码只读 `GLOSSARY_KEYSTORE_PASSWORD`，脚本里没有默认密码）。只刷新插件副本、`file_paths.xml` 和 `MainActivity.java` 时用 `node scripts/setup-android.js --sync-sources`，不跑 cap sync
- GitHub Actions（`.github/workflows/ci.yml`）：pull request 和 push 到 `main` 时用 Node 20 跑 `npm ci`、`npm test`、`npm run build`。不打 Windows / APK / xpi。锁文件下载地址是 npmmirror，CI 改从 `registry.npmjs.org` 取（`--replace-registry-host=always`），并设 `ELECTRON_SKIP_BINARY_DOWNLOAD=1`。Node 20 不带 `--experimental-test-module-mocks`，`web/src/webdavClient.test.js` 不在 `npm test` 里。

## 硬规则（ql）

1. **一轮目标做完就自动 commit 到 `main`**。不要开分支，不要走 PR。不要 push，除非 ql 说 push。
2. **每次发版必须附带三件套**：Windows 安装包 + APK + Zotero xpi。同时 bump `package.json` 的 `version`，APK 再把 `versionCode` +1。未说发版不要改版本。
3. **`README.md` 给会下载安装、但不懂代码的普通人看**，也就是 GitHub Release 说明。第一次发版整篇写成：这是什么、能帮什么忙 → 下哪个包、怎么安装打开、第一次怎么用 → 真会卡住人的小提示。中文，一两分钟能读完，轻松但别夸张。不要写技术栈、编译、API、贡献指南。之后每次发版只增量更新版本号、下载链接、会变的用法。没改 README 不算发完。日常改功能不要动 README。
4. 没有 `AGENTS.md` 就自动创建；每轮结束后只更新有变化的段落。
5. **验收时 Android 必须能编过** 才算完。没 SDK、Gradle 挂了、缺 keystore：必须说明失败点，不能假装做完。纯文档、纯规则、或只改 Zotero 且不发版，可以不编，但要写明原因。
6. APK 签名：`android/glossary.keystore` + `android/keystore.properties`，不进 git。换电脑先拷这两份，**禁止默默新建钥匙**。新建时密码只读环境变量 `GLOSSARY_KEYSTORE_PASSWORD`，不要写进脚本。2026-10-20 ql 确认旧钥匙丢失后新建了一把；已经装过术语本的手机要先卸载，才能装这把新钥匙签的包。密码只在本机的 `keystore.properties`。
7. 不要把 API Key、WebDAV 密码、keystore 密码写进仓库或聊天。

## 发版时改什么

- `package.json` `version`
- `updates/android.json`：`version`、`versionCode`+1、`url`、`notes`
- `npm run plugin:pack` 更新 `zotero-plugin/manifest.json` 所用版本与 `updates/zotero.json` 的 sha256
- GitHub Release 资源：`paper-glossary-Setup-<ver>.exe`、`.exe.blockmap`、`latest.yml`、`paper-glossary-<ver>.apk`、`paper-glossary.xpi`。`.blockmap` 和 `latest.yml` 必须挂上，但对外说明里写清楚：**使用者只下 exe**，那两份是给 `electron-updater` 自己读的。
- `README.md`：给普通人看；改版本、链接、会卡住的用法。不要写开发命令。
