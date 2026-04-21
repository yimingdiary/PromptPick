# PromptNest

PromptNest 是一个用于采集、归档和展示 AI Prompt 的静态站点仓库。推荐的使用方式是：

1. 用浏览器扩展采集页面内容。
2. 通过 GitHub Issue + GitHub Actions 把数据写回仓库。
3. 用 Cloudflare Pages 部署前端站点。

这个 README 只保留对外协作需要的内容，重点说明如何跑起来、如何构建、如何部署。

## 仓库结构

- `web/`：前端页面，基于 React + Vite。
- `data/`：条目数据，包含列表索引和详情文件。
- `images/`：原图、缩略图和参考图静态资源。
- `extension/`：Chrome 侧边栏采集插件。
- `scripts/`：数据重建、校验、Issue 导入等脚本。
- `.github/workflows/collect.yml`：GitHub Issue 采集工作流。

## 环境要求

- Node.js 24
- npm
- 一个开启了 GitHub Actions 的 GitHub 仓库

如果你要使用插件的 GitHub 采集模式，还需要一个对目标仓库有 Issues 写入权限的 token。

## 本地开发

安装依赖：

```bash
npm install
```

启动开发环境：

```bash
npm run dev
```

默认访问地址：

```text
http://127.0.0.1:5173/
```

开发模式下，前端在请求 `/data/index.json` 前会自动重建索引。所以本地直接修改 `data/items/*.json` 后，刷新页面就能看到更新。

如果你补充了图片，但还没有生成缩略图，可以执行：

```bash
npm run generate:thumbnails
npm run rebuild:index -- --normalize-items
```

## 构建

执行：

```bash
npm run build
```

这条命令会依次完成：

1. 重建 `data/index.json`
2. 校验 `data/` 下的数据结构
3. 构建前端资源到 `dist/`
4. 把 `data/` 和 `images/` 复制到 `dist/`

构建完成后，`dist/` 就是可直接部署的静态产物。

## Cloudflare Pages 部署

推荐直接把这个仓库接到 Cloudflare Pages，配置如下：

- Root directory：`/`
- Build command：`npm run build`
- Build output directory：`dist`

部署步骤：

1. 在 Cloudflare Pages 中导入这个 GitHub 仓库。
2. 保持根目录为 `/`。
3. 把构建命令设置为 `npm run build`。
4. 把输出目录设置为 `dist`。
5. 触发首次部署。

这里最容易出错的是输出目录。不要把仓库根目录 `/` 当成最终静态产物发布，因为根目录的 `index.html` 走的是 Vite 开发入口，会引用 `/web/src/main.tsx`。线上必须发布 `dist/`，否则浏览器会直接去加载源码入口，最终出现白屏或 MIME 类型错误。

## GitHub 采集流程

仓库内置了基于 Issue 的采集流程，工作流文件是 `.github/workflows/collect.yml`。

如果你准备使用插件的 GitHub 模式，先创建一个只给目标仓库使用的 token：

1. 打开 GitHub 右上角头像，进入 `Settings`。
2. 进入 `Developer settings`。
3. 打开 `Personal access tokens` -> `Fine-grained tokens`。
4. 点击 `Generate new token`。
5. `Repository access` 选择 `Only select repositories`，然后只勾选要写入的仓库。
6. `Permissions` 中把 `Issues` 设为 `Read and write`。
7. 生成后复制 token，填到浏览器扩展设置页的 GitHub token 输入框。

建议：

- 优先使用 `Fine-grained token`，不要直接给全仓库范围过大的经典 token。
- 这个 token 只用于创建采集 Issue，不需要额外开放代码推送权限。
- token 只会保存在浏览器扩展本地存储里，丢失后需要重新生成并重新填写。

触发方式：

- 创建一个带 `collect` 标签的 Issue
- 或编辑、重新打开一个已带 `collect` 标签的 Issue

工作流会自动完成以下事情：

1. 读取 Issue 正文中的 JSON
2. 做字段校验和去重判断
3. 下载图片并转换为 WebP
4. 生成详情文件和列表索引
5. 提交 `data/` 与 `images/` 的变更
6. 在成功或重复时回写评论并关闭 Issue

如果处理失败，工作流会给 Issue 打上 `failed` 标签，并保留日志供排查。

本地也可以直接模拟导入一条采集：

```bash
npm run ingest:issue -- --issue-body-file ./fixtures/issue-body.txt
```

## 浏览器扩展怎么配合

`extension/` 目录里是采集插件。当前项目支持两种采集模式：

- 本地模式：直接写当前项目目录
- GitHub 模式：向目标仓库创建 `collect` Issue，再由 Actions 入库

如果你准备把站点部署到公开环境，推荐使用 GitHub 模式。这样数据写入、图片处理和索引更新都由仓库工作流统一完成，部署链路会更稳定。

插件设置 GitHub 模式时，需要填写：

- `owner`：GitHub 用户名或组织名
- `repo`：目标仓库名
- `token`：上面创建的、具备目标仓库 `Issues: Read and write` 权限的 Fine-grained token

## 常用命令

```bash
npm run dev
npm run build
npm run rebuild:index -- --normalize-items
npm run validate:data
npm run generate:thumbnails
npm run ingest:issue -- --issue-body-file ./fixtures/issue-body.txt
```
