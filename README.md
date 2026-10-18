# Sloop

自由组合周期班次，生成可订阅的 ICS 日历链接。Worker 提供静态页面、账户与订阅接口，Cloudflare D1 保存用户、邀请码和成员周期。

## 功能

- 按顺序组合白班、夜班、休息或自定义班次，支持跨夜班次。
- 班次设置提供 12 种可区分颜色，并同步到周期条、预览和 ICS 事件。
- 点击周期中的任意一天，把它设为“今天”以及本轮循环的起点。
- 固定使用中国时区 `Asia/Shanghai`，无需手动选择时区或开始日期。
- 轮转预览默认折叠，订阅范围由服务端控制。
- 游客推荐下载 `.ics` 文件，文件最多覆盖未来 6 个月。
- 游客也可生成 3 个月临时订阅链接，链接 7 天后失效。
- 注册并使用用户名登录；昵称仅用于界面展示。
- 普通注册默认等待管理员审批，首名注册用户自动成为管理员。
- 可使用管理员生成的邀请码注册，邀请码注册直接通过。
- 成员可保存多个周期，每个订阅链接固定覆盖未来 12 个月。
- 成员可在“我的周期”复制合并订阅链接，自动合并账号下全部已保存周期。
- 勾选部分已保存周期后，可生成只包含所选周期的独立签名合并链接。
- 成员单周期与合并订阅均使用服务端 HMAC 签名，停用账号后立即停止返回日历。
- 管理员可审批、拒绝、停用或恢复成员，调整管理员角色，并管理自定义邀请码。

## 本地开发

需要 Node.js 20 或更高版本。

```bash
pnpm install
cp .dev.vars.example .dev.vars
pnpm exec wrangler d1 migrations apply sloop-db --local
pnpm dev
```

本地服务默认运行在 `http://localhost:8787`。首次注册的账号会成为本地管理员。

`.dev.vars` 中的 `LINK_SIGNING_SECRET` 用于签名成员单周期与合并订阅链接。本地可以使用示例值，部署时必须替换为随机长字符串。

## 测试

```bash
pnpm test
pnpm check
```

测试覆盖周期标准化、用户名与昵称校验、今天起点、跨夜班次、休息日、时区夏令时、游客 3 个月临时订阅、6 个月文件导出、过期清理、成员签名校验和 ICS 折行。

## 部署到 Cloudflare Workers

本轮尚未部署。未来部署时按以下顺序操作：

1. 创建 D1 数据库：

   ```bash
   pnpm exec wrangler d1 create sloop-db
   ```

2. 把命令输出的 `database_id` 写入 `wrangler.jsonc`，替换全零占位 ID。

3. 写入签名密钥：

   ```bash
   pnpm exec wrangler secret put LINK_SIGNING_SECRET
   ```

4. 应用远程数据库迁移并部署：

   ```bash
   pnpm exec wrangler d1 migrations apply sloop-db --remote
   pnpm deploy
   ```

部署完成后，Wrangler 会输出 `https://<worker-name>.<subdomain>.workers.dev` 地址。

## 权限与订阅

- 游客：无需账户，推荐下载最多 6 个月的 `.ics`，也可生成 7 天有效的 3 个月临时订阅链接。
- 待审批用户：可以登录验证账户状态，但不能访问周期接口。
- 成员：保存多个周期，每个订阅链接覆盖 12 个月，并可生成一个稳定的合并订阅链接。
- 管理员：拥有成员周期能力，并可管理审批与邀请码。
- 每名成员最多保存 50 个周期。

周期管理接口只接受登录会话。日历客户端无法可靠携带网页 Cookie，因此成员订阅使用不可猜测的资源标识加 HMAC 签名作为能力令牌；签名无效或账号不再是“已通过”状态时，接口统一返回 404。修改周期不会改变单周期链接，新增、编辑或删除周期后合并链接地址也保持不变。轮换 `LINK_SIGNING_SECRET` 会使全部成员订阅链接失效，需要成员重新复制链接。

游客临时令牌只保存 SHA-256 哈希和临时方案，不保存原始令牌。记录 7 天后失效；`wrangler.jsonc` 中配置的每日 Cron Trigger 会删除过期记录，生成新游客链接时也会先执行一次清理。

## ICS 行为

- 班次时间按 `Asia/Shanghai` 换算成 UTC 日历事件。
- 结束时间早于或等于开始时间时，结束日期按次日计算。
- 休息日默认不生成事件；开启“休息日写入日历”后生成 `TRANSP:TRANSPARENT` 的全天事件。
- 日历链接包含 1 小时刷新提示，实际刷新频率由日历客户端决定。
- 合并订阅为每个周期使用独立 UID 命名空间，避免同名班次产生事件冲突。
- 订阅响应使用私有缓存提示与 `no-referrer`，避免共享缓存和 Referer 泄露签名地址。
- 游客导出始终包含最多 6 个月事件，不受 3 个月临时订阅上限影响。

## 结构

```text
public/
  index.html   页面结构
  app.js       周期编辑、移动端组合器、账户与管理界面
  styles.css   响应式界面与动效
worker.js      ICS、认证、订阅、审批和邀请码接口
migrations/     Cloudflare D1 数据库结构
test/           核心日历与输入校验测试
```

## 品牌资产

- `brand/sloop-brand.md`：视觉哲学与应用原则。
- `brand/sloop-brand-board.png`：标识尺度、单色变体与色彩展示板。
- `public/assets/brand/`：主图标、单色标记、maskable 图标及各尺寸 PNG。
- `public/og-image.png`：1200 × 630 分享预览图。

页面已接入 SVG favicon、Apple touch icon、PWA manifest、Open Graph 和 Twitter 分享元数据。
