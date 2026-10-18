# Sloop

自由组合周期班次，生成可订阅的 ICS 日历链接。前端与 ICS 生成接口都部署在 Cloudflare Workers，使用静态资源和一个无状态 Worker，不需要 KV、D1 或账户系统。

## 功能

- 拖动拼接白班、夜班、休息或自定义班次，按顺序循环。
- 支持跨夜班次，例如 `20:00` 到次日 `08:00`。
- 按 IANA 时区把本地班次转换成标准 UTC 日历时间，不受运行环境时区影响。
- 自定义开始日期和 1–24 个月的生成范围。
- 可选择把休息日写成全天透明事件。
- 班次方案压缩后编码进链接，分享链接不依赖数据库。
- 一键复制订阅链接、下载 `.ics`，或在系统日历中打开。

## 本地开发

需要 Node.js 20 或更高版本。

```bash
pnpm install
pnpm dev
```

本地服务默认运行在 `http://localhost:8787`。

## 测试

```bash
pnpm test
pnpm check
```

测试覆盖 ICS 时区换算、跨夜事件、全天休息事件、压缩分享数据、请求接口和中文长行折行。

## 部署到 Cloudflare Workers

首次部署先登录 Cloudflare：

```bash
pnpm exec wrangler login
pnpm deploy
```

部署完成后，Wrangler 会输出 `https://<worker-name>.<subdomain>.workers.dev` 地址。如需修改 Worker 名称，编辑 `wrangler.jsonc` 中的 `name`。

项目不需要后端环境变量，也不创建持久化存储。静态页面由 Cloudflare Assets 提供，只有 `/api/calendar.ics` 和 `/calendar.ics` 会进入 Worker 生成日历。

## ICS 行为

- 工作时间会输出为带 UTC 时间戳的日历事件。
- 当结束时间早于或等于开始时间时，结束日期按次日计算。
- 休息日默认不生成事件；开启“休息日写入日历”后会生成 `TRANSP:TRANSPARENT` 的全天事件。
- 日历链接使用 1 小时刷新提示，实际刷新频率由日历客户端决定。
- 分享数据仅保存在链接参数和浏览器本地存储中，不包含账户或个人资料。

## 结构

```text
public/
  index.html   页面结构
  app.js       周期组合、拖动排序、预览与链接生成
  styles.css   响应式界面与动效
worker.js      ICS 编码解码、时区换算和日历响应
test/          核心日历逻辑测试
```
