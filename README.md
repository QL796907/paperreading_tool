<p align="center">
  <img src="web/public/icons/icon-on-desk.png" width="220" alt="术语本" />
</p>

<h1 align="center">术语本</h1>

<p align="center">
  论文读到生词，从 Zotero 里一划就收进本子。<br />
  按日期翻页，能手写，也能让 AI 写解析。
</p>

<p align="center">
  <a href="https://github.com/QL796907/paperreading_tool/releases/latest"><img src="https://img.shields.io/github/v/release/QL796907/paperreading_tool?label=release&color=2F4F3E" alt="release" /></a>
  <img src="https://img.shields.io/badge/Windows-安装包-2F4F3E" alt="Windows" />
  <img src="https://img.shields.io/badge/Android-APK-2F4F3E" alt="Android" />
  <img src="https://img.shields.io/badge/Zotero-7-C45C48" alt="Zotero 7" />
</p>

当前正式版 **1.0.1**（2026-09-23）。三条客户端互相独立更新：Windows 走 GitHub Release，手机读 `updates/android.json`，Zotero 走插件自己的更新地址。

## 下载

| 端 | 安装包 | 适合谁 |
| --- | --- | --- |
| **Windows** | [paper-glossary-Setup-1.0.1.exe](https://github.com/QL796907/paperreading_tool/releases/download/v1.0.1/paper-glossary-Setup-1.0.1.exe) | 一边读 PDF、一边划词。关窗进托盘，Zotero 仍能加入术语。 |
| **Android** | [paper-glossary-1.0.1.apk](https://github.com/QL796907/paperreading_tool/releases/download/v1.0.1/paper-glossary-1.0.1.apk) | 出门看本子。没有 Zotero 划词，词条用坚果云和电脑同步。 |
| **Zotero 7** | [paper-glossary.xpi](https://github.com/QL796907/paperreading_tool/releases/download/v1.0.1/paper-glossary.xpi) | 在 PDF 选区弹窗里点「加入术语本」。 |

一次下齐也可以打开 [v1.0.1 Release](https://github.com/QL796907/paperreading_tool/releases/tag/v1.0.1)。

## 它做什么

- 词条按**填写日期**分页，像一本真正的笔记本
- 搜索术语、解析、论文名
- 手写解析，或填 OpenAI 兼容接口后一键生成
- **展页阅读**：把当天的词放大来翻（快捷键 `F`）
- 电脑和手机可以共用同一份词条（坚果云 WebDAV）

词条只存在你自己的机器上。Windows 安装版在 `%APPDATA%\术语本\`；开发模式在项目里的 `data/`。

## Windows

1. 下载上面的 `.exe`，一路下一步。快捷方式仍叫「术语本」。
2. 若被 SmartScreen 拦住，选「仍要运行」（个人用、未做代码签名时常见）。
3. 关掉窗口会收到**托盘**，Zotero 划词还在；要退出请右键托盘图标。
4. 有新版本时会在后台下载，默认等你退出后再装。托盘菜单里可以「检查更新」，也可以勾选开机启动。你只要装 `.exe`；Release 里的 `.blockmap` 和 `latest.yml` 是给已经装好的术语本自己去读的，不用手动下载。

已经装过本机打的 1.0.0 时，装上本页的 1.0.1 就会走自动更新通道。

## Android

1. 允许安装未知来源的应用，然后打开 `.apk`。
2. 手机上**没有** Zotero 划词。在设置里填坚果云后，和电脑共用词条。
3. 「设置 → 检查并安装更新」会读仓库里的更新清单，下载新 APK 再交给系统安装。

换电脑重新打包必须用同一把签名钥匙，否则已经装过的手机无法当更新安装。钥匙不在 git 里，请自己备份 `android/glossary.keystore`。

## Zotero 插件

需要 [Zotero 7](https://www.zotero.org/)。读论文时请让 Windows 上的术语本保持运行（托盘里亮着即可）。

1. 下载 `paper-glossary.xpi`
2. Zotero → **工具** → **插件** → 右上角齿轮 → **Install Add-on From File…**
3. 重启 Zotero
4. 打开 PDF，选中术语，选区弹窗里点 **加入术语本**

也可以：选中后右键 → 「加入术语本」；或用阅读器工具栏 / **工具** 菜单里的「打开术语本」。

插件默认连接 `http://127.0.0.1:3780`。之后的更新走 Zotero 自己的插件更新，不用卸了重装。

## 坚果云同步

设置里打开 WebDAV，填坚果云提供的地址、账号和应用密码。只同步词条文件，**不同步** API Key。电脑和手机都打开同步后，后写入的那份会覆盖云端。

## AI 解析

设置页填三样即可（OpenAI 兼容接口）：

| 项目 | 示例 |
| --- | --- |
| API 地址 | `https://api.deepseek.com/v1` |
| API Key | 只写在本机设置里，不要提交到 git |
| 模型名 | `deepseek-chat` |

常见写法：DeepSeek、OpenAI 官方、硅基流动等中转的 `/v1` 地址，或本地 Ollama `http://127.0.0.1:11434/v1`。可勾选「从 Zotero 加入新词时自动生成解析」，解析随时能手改。

## 从源码运行

需要 [Node.js 18+](https://nodejs.org/)。

```bash
npm install
npm run dev
```

浏览器打开 [http://127.0.0.1:5173](http://127.0.0.1:5173)。日常也可以双击 `start.bat`，然后用 [http://127.0.0.1:3780](http://127.0.0.1:3780)（插件连这个地址）。

| 命令 | 作用 |
| --- | --- |
| `npm run dist` / `dist:proxy` | Windows 安装包 |
| `npm run apk` / `apk:proxy` | Android APK |
| `npm run plugin:pack` | Zotero xpi，并刷新 `updates/zotero.json` |

代理默认 `127.0.0.1:10808`。下载 Electron / Maven 失败时用带 `:proxy` 的命令。

快捷键：`/` 或 `Ctrl+K` 搜索，`Ctrl+N` 添加，`F` 展页阅读。
