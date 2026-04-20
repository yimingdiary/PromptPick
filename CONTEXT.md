### 任务目标
一句话：完成 PromptPick 插件 GitHub 采集模式、品牌更新和仓库发布准备，同时保留本地直写能力。

### 当前状态
- 已完成：
  - 已按要求读取根目录 `AGENT.md` 和 `CONTEXT.md`
  - 数据 schema、前端类型、Issue 处理脚本、插件本地写入和索引生成已补齐 `resolution` 与 `capturedAt`
  - 现有 `data/items/*.json` 和 `data/index.json` 已通过 normalize 补齐 `resolution: "2K"`、`capturedAt`、`width`、`height`
  - 首页搜索框与筛选按钮已合并为一行，移除搜索层级下的横线和“全部标签”筛选
  - 首页筛选已从原生 `select` 改为主题化自定义弹层，并带淡入动效；弹层内模型和比例保持独立按钮组
  - 首页搜索与筛选区域已从 sticky 改为 fixed 顶层工具栏，工具栏背景改为纯色，并给首页内容补顶部占位
  - 首页卡片与固定工具栏之间的垂直间距额外增加约 20px
  - 首页列表已加入按页增量渲染、IntersectionObserver 懒加载触发、图片懒加载和骨架屏
  - 首页卡片底部文案已移除，hover 覆层改为显示一行 Prompt，以及模型、比例、分辨率；复制按钮已固定宽高并改为稳定实体暗色背景，避免浅色图片下闪烁
  - 详情页左侧预览图已按完整左侧区域水平垂直居中，关闭按钮已改为 fixed 悬浮且不再参与左侧预览空间分配，切换按钮已改到右侧信息区域偏底部固定并使用左右箭头，右侧信息间距已收紧
  - 详情页已移除“更多”和更多图标，作者头像首字/首汉字放大并居中，日期与“内容由 AI 生成”使用显式分割线对齐
  - 详情页采集时间已移动到“复制提示词/查看来源”按钮下方，不再贴到底部
  - 前端 React 图标已统一使用 `lucide-react` 按需导入
  - 插件已更名为 PromptPick，Manifest、侧边栏和设置页品牌文案已更新
  - 插件已使用 `/img/icon.svg` 作为源图标，生成并配置扩展所需 PNG icon
  - 插件设置页已增加采集目标：本地项目或 GitHub 仓库
  - 插件设置页已增加 GitHub owner、repo 和 token 配置，token 存入 `chrome.storage.local`
  - 插件侧边栏已醒目显示当前采集目标，避免本地和 GitHub 写错位置
  - 插件 GitHub 模式会创建带 `collect` 标签的 Issue，沿用仓库 Actions 入库流程
  - 已执行 `npm run rebuild:index -- --normalize-items`、`npm run validate:data`、`npx tsc --noEmit --pretty false` 和 `npm run build`
- 进行中：
  - 需要初始化 git 仓库并推送到 `https://github.com/yimingdiary/PromptPick.git`
- 待开始：
  - 为特定目标站点继续补充更精确的 DOM 提取规则
  - 增加插件采集流程的自动化或手动回归清单

### 已做决策
| 决策 | 理由 | 排除的方案及原因 |
|---|---|---|
| 新增 `resolution` 字段并默认 `2K` | 当前真实分辨率采集不稳定，用户要求统一默认 2k | 继续依赖 DOM 分辨率提取会导致字段缺失或不一致 |
| 新增 `capturedAt` 表示实际采集入库时间 | 顶部日期保留作品/页面日期，底部需要显示采集时间 | 复用 `collectedAt` 会混淆来源日期和采集时间 |
| 首页筛选改为自定义弹层，弹层内模型/比例分组 | 原生 `select` 与当前深色主题不协调，且用户明确禁止默认样式；用户反馈筛选入口位置同一行但功能不要全合并 | 继续使用浏览器默认下拉无法稳定适配视觉和动效；把所有筛选合成一个单值选择器会误解交互意图 |
| 首页先渲染当前页并懒加载后续条目 | 数据变多时减少首屏 DOM 和图片渲染压力 | 一次性渲染全部瀑布流会随数据增长变卡 |
| 前端图标使用 `lucide-react` 按需导入 | 已存在依赖，可 tree-shake，且避免 CDN 在大陆访问不稳定 | 使用 CDN 或下载整套图标都会增加稳定性或体积风险 |
| 详情页通过 `web/src/overrides.css` 承载最终覆盖样式 | 原 `index.css` 存在多段历史样式叠加，后置 import 能保证当前修正生效 | 立即清理全部历史重复 CSS 风险更高，容易引入布局回归 |
| 首页搜索筛选工具栏使用 `position: fixed` | 当前滚动结构下 sticky 仍会随瀑布流内容移出视口，fixed 能确保搜索与筛选始终冻结在顶部 | 继续依赖 sticky 会复现滚动后顶部工具栏隐藏的问题 |
| 首页 fixed 工具栏使用纯色背景 | 用户明确要求把半透明毛玻璃改为纯色，保证顶部层稳定清晰 | 继续使用毛玻璃不符合当前视觉反馈 |
| 卡片 hover 复制按钮不用 `backdrop-filter` | 浅色图片下 backdrop 取样会让圆形背景出现闪烁感 | 继续用半透明取样背景会在浅色图片上显得卡顿 |
| 详情页关闭按钮改为 fixed 悬浮层 | 关闭按钮原本所在的中间操作栏会影响左侧预览区域的视觉居中 | 继续把关闭按钮放在参与布局的中间栏会让图片相对左侧红框偏移 |
| GitHub 采集通过创建 `collect` Issue 实现 | 仓库已有 GitHub Actions Issue 入库流程，插件只需提交 JSON，图片下载和提交由 Actions 统一处理 | 让插件直接写 Git blobs 需要处理多文件 SHA、图片上传和冲突，复杂度更高且失败难追踪 |
| GitHub token 存入 `chrome.storage.local` | token 属于敏感信息，不应跟随 sync 跨设备同步 | 存入 `chrome.storage.sync` 会扩大凭据暴露面 |

### 待解决问题
- [ ] 视觉复核：需要在浏览器中检查首页 fixed 纯色搜索/筛选、筛选弹层、瀑布流 hover、详情页关闭按钮悬浮后左侧居中和右侧信息区域偏底部左右切换按钮是否完全符合图示预期
- [ ] GitHub 采集实测：需要安装新版 PromptPick 插件，配置 GitHub token 后创建一次 collect Issue，确认 Actions 能成功入库并关闭 Issue
- [ ] 真实站点 DOM 稳定性：需验证目标站点在不刷新情况下，顶部扩展图标打开侧边栏是否能稳定读到当前详情页主图、Prompt 和智能参考图
- [ ] 站点采集规则：当前仍依赖通用 class/DOM 选择器，后续需按目标平台补充专用提取逻辑；分辨率已先统一默认 `2K`
- [ ] 图片下载兼容性：需要继续验证参考图远程 URL 的 403、重定向和防盗链情况

### 关键约束
- 当前前端页面 HTML 入口是仓库根目录 `index.html`
- Favicon 统一使用 `/img/icon.svg`
- `web/` 目录只保留实际使用的源码和 Vite 配置
- 插件不得再向网页注入悬浮按钮或 content script
- 采集入口使用浏览器顶部扩展图标打开 Chrome 侧边栏
- MVP 阶段继续保持本地直写，不引入传统后端服务
- 首页不使用原生筛选下拉样式
- 首页筛选入口与搜索框同一行，但筛选功能内部模型和比例保持独立分组
- 访问用户主要在中国大陆，图标不得依赖外部 CDN
- 当前分辨率统一默认 `2K`
- 插件 GitHub 模式依赖仓库存在 `.github/workflows/collect.yml`
- GitHub token 仅存储在本地浏览器扩展存储中，不写入仓库文件

### 参考资料
- `/Volumes/ZhuBaoyu/Web/PromptNest/AGENT.md`
- `/Volumes/ZhuBaoyu/Web/PromptNest/README.md`
- `/Volumes/ZhuBaoyu/Web/PromptNest/index.html`
- `/Volumes/ZhuBaoyu/Web/PromptNest/img/icon.svg`
- `/Volumes/ZhuBaoyu/Web/PromptNest/web/vite.config.ts`
- `/Volumes/ZhuBaoyu/Web/PromptNest/web/src/main.tsx`
- `/Volumes/ZhuBaoyu/Web/PromptNest/web/src/App.tsx`
- `/Volumes/ZhuBaoyu/Web/PromptNest/web/src/index.css`
- `/Volumes/ZhuBaoyu/Web/PromptNest/web/src/overrides.css`
- `/Volumes/ZhuBaoyu/Web/PromptNest/scripts/lib/schema.ts`
- `/Volumes/ZhuBaoyu/Web/PromptNest/scripts/lib/data-index.ts`
- `/Volumes/ZhuBaoyu/Web/PromptNest/extension/popup.js`
- `/Volumes/ZhuBaoyu/Web/PromptNest/extension/options.js`
- `/Volumes/ZhuBaoyu/Web/PromptNest/extension/manifest.json`
- `/Volumes/ZhuBaoyu/Web/PromptNest/extension/icon.svg`
- `/Volumes/ZhuBaoyu/Web/PromptNest/extension/icons/`
