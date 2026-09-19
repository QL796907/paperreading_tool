# 术语本

给论文阅读用的本地术语笔记本。在 **Zotero** 里选中几个词，选区弹窗会出现「加入术语本」；词条按填写日期分页，可搜索，也能用手写或 AI 生成解析。

## 两件东西

1. **术语本网页**：本仓库的本地软件（默认 [http://127.0.0.1:5173](http://127.0.0.1:5173)）
2. **Zotero 插件**：把 PDF 里选中的词送到术语本

读论文时请让术语本保持运行，插件才能连上。

## 启动术语本

需要 [Node.js 18+](https://nodejs.org/)。在项目目录执行：

```bash
npm install
npm run dev
```

Windows 也可以双击 `start.bat`。

开发时浏览器打开 [http://127.0.0.1:5173](http://127.0.0.1:5173)。日常使用可双击 `start.bat`，然后打开 [http://127.0.0.1:3780](http://127.0.0.1:3780)（插件也连这个地址）。

- 左侧是按日期排列的目录
- 右上角「添加术语」可手写
- 顶部检索框可搜单词、解析、论文名
- 「设置」里填写 AI 的 API，即可一键生成解析

词条存在 `data/` 目录，只留在你这台电脑上。

## 安装 Zotero 插件

1. 打包插件：

```bash
npm run plugin:pack
```

会在项目根目录生成 `paper-glossary.xpi`。

2. 打开 Zotero → **工具** → **插件** → 右上角齿轮 → **Install Add-on From File…** → 选中这个 xpi。
3. 重启 Zotero。
4. 确认术语本已经在跑，然后打开一篇 PDF，选中术语。选区弹窗里点 **加入术语本**。

也可以：

- 选中后右键 → 「加入术语本」
- 阅读器工具栏的「术语本」按钮，或 Zotero **工具** 菜单里的「打开术语本」

插件偏好设置里可以改术语本地址，默认是 `http://127.0.0.1:3780`。

## 接入 AI 解析

设置页使用 **OpenAI 兼容** 接口，填三样即可：

| 项目 | 示例 |
| --- | --- |
| API 地址 | `https://api.deepseek.com/v1` |
| API Key | 你的密钥 |
| 模型名 | `deepseek-chat` |

常见写法：

- DeepSeek：`https://api.deepseek.com/v1`
- OpenAI：`https://api.openai.com/v1`
- 硅基流动等中转：控制台里给的 `/v1` 地址
- 本地 Ollama：`http://127.0.0.1:11434/v1`（Key 可随便填）

可勾选「从 Zotero 加入新词时自动生成解析」。解析随时能手改。

## 日常命令

```bash
npm run dev          # 开发：网页 + API
npm run build        # 打包网页
npm start            # 只开 API；若已 build，则同时托管网页（http://127.0.0.1:3780）
npm run plugin:pack  # 生成 Zotero 插件
```

## 设计下一步

如果想换一套更完整的视觉稿，把 `GROKBOT_UI_PROMPT.md` 全文交给 Grokbot 即可。
