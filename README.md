# PromptNest

PromptNest 是一个面向 AI 提示词采集、归档与展示的低成本 MVP 仓库。当前版本用浏览器插件收集页面信息，直接写入本地项目里的 `data/` 与 `images/`，最后由静态前端展示和检索。

## 当前实现

- `extension/`
  Chrome Manifest V3 插件，负责识别当前页面，通过浏览器顶部扩展图标打开侧边栏采集页，并把采集数据与图片直接写入本地项目目录
- `.github/workflows/collect.yml`
  监听 `collect` Issue，执行 JSON 解析、去重、图片下载转 WebP、写入 `data/` 与 `images/`
- `scripts/`
  数据 Schema、Issue 处理脚本、数据校验脚本
- `data/`
  条目索引和详情数据
- `images/`
  转存后的静态图片目录，按月份归档
- `web/`
  静态前端，支持搜索、标签/模型/比例筛选、详情查看和 Prompt 复制
- `index.html`
  前端入口页放在仓库根目录，便于 Vite 在开发和构建时直接访问 `data/` 与 `images/`。当前 `web/vite.config.ts` 的 `root` 指向仓库根目录，因此浏览器实际使用的是根目录 `index.html`

## 数据结构

单条记录位于 `data/items/{id}.json`：

```json
{
  "id": "2f4b8f9c98ae",
  "title": "赛博朋克夜景",
  "source": "midjourney-showcase",
  "sourceUrl": "https://example.com/post/123",
  "author": "unknown",
  "license": "unknown",
  "prompt": "cyberpunk city at night, neon lights, cinematic, ultra detailed",
  "negativePrompt": "blurry, low quality, deformed",
  "model": "Midjourney v6",
  "sampler": "",
  "steps": 30,
  "cfg": 7,
  "seed": 123456,
  "ratio": "3:4",
  "resolution": "2K",
  "width": 1024,
  "height": 1365,
  "tags": ["cyberpunk", "night", "city"],
  "image": "/images/2026-04/2f4b8f9c98ae.webp",
  "thumbnail": "/images/2026-04/thumbs/2f4b8f9c98ae.webp",
  "status": "done",
  "collectedAt": "2026-04-19T12:00:00Z",
  "capturedAt": "2026-04-19T12:01:20Z",
  "createdAt": "2026-04-19T12:01:20Z",
  "updatedAt": "2026-04-19T12:01:20Z"
}
```

列表索引位于 `data/index.json`，只保留展示页需要的精简字段。详情文件里的 `image` 指向本地原图，`thumbnail` 指向本地 720p 缩略图；首页索引里的 `image` 会优先使用缩略图，详情页打开后再读取原图。

## 仓库目录

```text
/
├─ .github/workflows/collect.yml
├─ data/
│  ├─ index.json
│  └─ items/
├─ extension/
├─ images/
├─ img/
├─ scripts/
│  └─ lib/schema.ts
├─ web/
│  └─ src/
├─ AGENT.md
├─ CONTEXT.md
├─ package.json
└─ README.md
```

## 启动与验证

安装依赖：

```bash
npm install
```

本地启动前端：

```bash
npm run dev
```

默认可在 `http://127.0.0.1:5173/` 访问；如果需要固定端口，也可以手动指定：

```bash
npm run dev -- --host 127.0.0.1 --port 4173
```

开发服务会在浏览器请求 `/data/index.json` 前，自动根据 `data/items/*.json` 重建列表索引；因此本地新增或修改条目后，刷新页面即可看到最新内容。这个逻辑只发生在本地 Vite 开发服务里，线上静态部署仍使用构建时复制到 `dist/data/index.json` 的索引。

也可以手动重建索引：

```bash
npm run rebuild:index -- --normalize-items
```

如果已有图片缺少缩略图，可以批量生成 720p 缩略图：

```bash
npm run generate:thumbnails
npm run rebuild:index -- --normalize-items
```

校验数据结构并构建前端：

```bash
npm run build
```

本地模拟处理一条 Issue：

```bash
npm run ingest:issue -- --issue-body-file ./fixtures/issue-body.txt
```

说明：

- `ingest:issue` 会解析 Issue 正文中的 JSON，生成稳定哈希 ID
- 若条目已存在，则不会重复下载与写入
- 新条目会把原图保存到 `images/YYYY-MM/{id}.webp`
- 新条目会把 720p 缩略图保存到 `images/YYYY-MM/thumbs/{id}.webp`
- 条目详情写入 `data/items/{id}.json`
- 列表索引更新到 `data/index.json`

## GitHub Actions 工作流

`collect.yml` 的处理步骤如下：

1. 读取带 `collect` 标签的 Issue 正文
2. 提取 JSON 并做 Schema 校验
3. 基于 `sourceUrl + prompt + imageUrl` 计算稳定 ID
4. 检查 `data/items/{id}.json` 是否已存在
5. 下载原图并转换为 WebP
6. 写入详情文件与列表索引
7. 自动提交生成的数据
8. 回写处理结果并关闭 Issue

失败时会保留 Issue，并补充 `failed` 标签和失败评论。

## 浏览器插件

当前插件品牌名为 PromptPick，是支持本地直写和 GitHub Issue 入库的通用采集器：

- 打开采集页或点击“重新识别”时只读取当前页面 DOM，不会自动刷新浏览器网页；如果目标网页需要刷新，需要手动在浏览器中刷新后再采集
- 插件不再向网页注入悬浮按钮；使用浏览器顶部扩展图标打开 Chrome 侧边栏采集页
- 如果开发过程中刚移除过悬浮按钮，已打开网页里可能还残留旧 content script；重新加载扩展后刷新当前网页或重新打开标签页即可清除
- 自动预填当前页标题、URL、主图、Prompt、模型、比例、作者与“智能参考”图片
- 分辨率字段会写入 `resolution`，当前默认保存为 `2K`；实际采集入库时间写入 `capturedAt`
- 如果页面上有选中文本，会把它作为 Prompt 初始值
- 其余字段允许人工补充和修正
- 插件采集页会醒目显示当前采集目标，区分“本地项目”和“GitHub 仓库”，避免写错位置
- 插件采集页和设置页已改成与主站一致的深色风格，并补充了配置状态、重新识别和打开设置入口
- 本地直写模式会在提交时下载预览图到 `images/YYYY-MM/`，并生成 `images/YYYY-MM/thumbs/` 下的 720p 缩略图；如果页面含“智能参考”等参考图，会同步保存到 `images/YYYY-MM/references/` 和对应 `thumbs/`；`imageUrl` / `referenceImageUrls` 保留原始远程链接，本地展示优先使用 `image` / `referenceImages`
- GitHub 模式会在配置的仓库创建带 `collect` 标签的 Issue，由仓库内 `.github/workflows/collect.yml` 自动下载图片、生成数据文件、提交结果并关闭 Issue

首次使用需要在插件设置页填写或选择：

- 采集目标：本地项目或 GitHub 仓库
- 可选的默认 `source`
- 本地模式：PromptNest 项目根目录
- GitHub 模式：GitHub owner、repo 和具备 Issues 写入权限的 token

GitHub 模式默认适配 `yimingdiary/PromptPick`，但可以在设置页修改为其它仓库。

## 前端能力

当前前端已经覆盖基础检索体验：

- 列表浏览
- 关键词搜索
- 标签筛选
- 模型筛选
- 比例筛选
- 详情展示
- 一键复制 Prompt
- 跳转原始来源
- 详情页“智能参考”图片悬停预览

当前 UI 已改为更接近内容社区的深色发现页样式：

- 当前实现已直接迁入 `cankao/` 所使用的前端技术栈和主要 UI 结构，而不是继续手写一套新样式
- 主站切换为与 `cankao/` 高度一致的搜索栏、瀑布流卡片、搜索联想和全屏详情页结构
- 为适配当前项目数据，仅替换了数据来源和字段映射层
- 视觉主题整体改为暗黑色，不再使用 `cankao/` 默认的白灰底色
- 顶部区域只保留搜索，不再保留参考项目中的其它图标和账号区域
- 首页搜索框和筛选入口位于同一行；筛选保持单独入口，弹层内按模型、比例分组显示独立按钮，不再使用浏览器默认 `select`
- 首页列表使用按页增量渲染、图片懒加载和加载骨架屏，减少数据量变大后的首屏渲染压力
- 首页卡片默认只展示图片，鼠标悬停时显示一行 Prompt 以及模型、比例、分辨率
- 首页搜索与筛选区域使用固定顶层工具栏，滚动时保持可用；工具栏使用纯色背景
- 首页内容区与固定工具栏之间额外增加约 20px 间距，避免首行卡片贴近顶部
- 首页卡片 hover 复制按钮使用稳定实体暗色背景，避免浅色图片下出现背景闪烁
- 详情页左侧预览区按完整左侧画面水平垂直居中，关闭按钮改为 fixed 悬浮，不再参与左侧预览空间分配；切换按钮固定在右侧信息区域偏底部并使用左右箭头
- 详情页右侧作者区移除了关注、点赞计数和更多菜单，底部操作固定为“复制提示词”和“查看来源”，并在按钮下方显示采集时间
- 前端图标统一通过 `lucide-react` 按需导入，避免 CDN 对大陆访问稳定性的影响

如果 `data/index.json` 为空，首页会显示空状态提示，指导先通过插件创建第一条采集数据。

仓库当前已附带一条通过脚本生成的示例数据，便于直接启动页面查看效果。
Vite 配置已经处理好开发期和构建产物中的 `data/`、`images/` 暴露问题，本地预览和 `dist/` 预览都能直接读取这些静态内容。

## 后续优先级

- 补充真实站点的 DOM 采集适配
- 增加失败重试与错误分类
- 为 GitHub Pages 部署补充 base path 配置
- 增加示例数据与基础测试
- 评估后续迁移到对象存储与数据库的边界
