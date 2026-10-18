<p align="center">
  <img src="public/assets/brand/sloop-app-icon.svg" width="88" height="88" alt="Sloop app icon">
</p>

<h1 align="center">Sloop</h1>

<p align="center">
  <strong>自由组合周期班次，生成可订阅的 ICS 日历链接。</strong><br>
  Build repeating shift cycles and generate subscribable ICS calendar links.
</p>

<p align="center">
  <a href="#中文">中文</a> ·
  <a href="#english">English</a>
</p>

---

## 中文

Sloop 是一个轻量的轮转班表工具。你可以按顺序组合白班、夜班、休息或自定义班次，设置周期起点，并生成可导入或订阅的 ICS 日历。项目包含响应式 Web 界面、Cloudflare Worker API、D1 数据库结构、账户与权限系统，以及 Docker 自托管方案。

### 功能

**班表编辑**

- 用任意顺序组合班次，一个周期最多 35 天。
- 内置白班、夜班和休息，可继续添加自定义班次；最多维护 12 个班次预设。
- 支持跨夜班次、休息日和每日 24 小时制时间。
- 提供 12 种可区分颜色，并同步到周期条、预览和 ICS 事件。
- 点选周期中的任意一天，即可把它设为“今天”和当前循环起点。
- 轮转预览默认折叠，移动端提供独立的周期组合编辑器。

**分享与订阅**

- 游客无需账户即可下载最多覆盖未来 6 个月的 `.ics` 文件。
- 游客也可生成覆盖 3 个月的临时订阅链接，链接 7 天后失效。
- 成员可保存多个周期，并从“我的周期”统一管理。
- 每个已保存周期都有独立签名订阅链接，覆盖时长可在 1 到 24 个月之间设置，默认 12 个月。
- 可将账号下全部周期合并为一个订阅，也可勾选部分周期生成独立的签名合并链接。
- 支持复制订阅地址、下载 `.ics` 和直接打开 `webcal:` 链接。

**账户、管理与界面**

- 使用用户名和密码登录，不依赖邮箱；昵称仅用于界面展示。
- 首个注册用户自动成为管理员；普通注册默认等待审批。
- 使用有效邀请码注册时直接通过。
- 管理员可审批、拒绝、停用或恢复成员，调整角色，并管理邀请码。
- 管理员可导出或导入应用数据备份（不含临时游客订阅）；导入会整体覆盖现有数据并撤销全部登录会话。
- 页面支持简体中文和英文，会记住上次选择，并随浏览器语言自动初始化。

### 快速开始

需要 Node.js 20 或更高版本，以及 pnpm。

```bash
git clone https://github.com/XiGeMaX/sloop.git
cd sloop
corepack enable
pnpm install
cp .dev.vars.example .dev.vars
pnpm exec wrangler d1 migrations apply sloop-db --local
pnpm dev
```

打开 `http://localhost:8787`。第一次注册的账号会成为本地管理员。

`pnpm dev` 会先通过 esbuild 将前端入口和 i18next 资源打包到 `public/app.bundle.js`，运行时不依赖 CDN。生成文件已被 Git 忽略。

### 配置

本地配置位于 `.dev.vars`，至少需要设置签名密钥：

```dotenv
LINK_SIGNING_SECRET=replace-with-a-long-random-secret
```

可以用下面的命令生成随机密钥：

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

`LINK_SIGNING_SECRET` 用于签名成员单周期和合并订阅链接。生产环境必须使用稳定、随机且足够长的值；轮换该密钥会使全部成员签名订阅链接失效。

健康检查接口为 `GET /api/health`，会同时检查 D1 连接和签名密钥是否已配置。

### Docker 自托管

Docker 镜像使用 Wrangler 本地运行时启动完整 Worker，并把 D1 数据保存到 `/data`。容器启动时会自动应用数据库迁移。CI 构建 `linux/amd64` 和 `linux/arm64` 镜像，并发布到 GHCR；发布到 Docker Hub 需要配置 `DOCKERHUB_USERNAME` 和 `DOCKERHUB_TOKEN` Secrets。

创建 `.env`：

```dotenv
LINK_SIGNING_SECRET=replace-with-a-long-random-secret
```

创建 `compose.yaml`：

```yaml
services:
  sloop:
    container_name: sloop
    image: ghcr.io/xigemax/sloop:latest
    ports:
      - "8787:8787"
    volumes:
      - sloop-data:/data
      - /etc/localtime:/etc/localtime:ro
    restart: unless-stopped
    stop_grace_period: 30s
    environment:
      TZ: Asia/Shanghai
      APP_ENV: production
      LINK_SIGNING_SECRET: "${LINK_SIGNING_SECRET}"

volumes:
  sloop-data:
```

启动服务：

```bash
docker compose up -d
```

随后访问 `http://localhost:8787`。`sloop-data` 卷保存数据库状态，请把它纳入常规备份。若未传 `LINK_SIGNING_SECRET`，容器会生成一次性临时密钥，重启后已有成员订阅链接会失效。

也可以直接从源码构建：

```bash
docker build -t sloop .
docker run -d \
  --name sloop \
  -p 8787:8787 \
  -v sloop-data:/data \
  -e LINK_SIGNING_SECRET="replace-with-a-long-random-secret" \
  --restart unless-stopped \
  sloop
```

### 部署到 Cloudflare Workers

1. 创建 D1 数据库。

   ```bash
   pnpm exec wrangler d1 create sloop-db
   ```

2. 将命令输出的 `database_id` 写入 `wrangler.jsonc`，替换全零占位 ID。
3. 写入签名密钥。

   ```bash
   pnpm exec wrangler secret put LINK_SIGNING_SECRET
   ```

4. 应用远程迁移并部署。

   ```bash
   pnpm exec wrangler d1 migrations apply sloop-db --remote
   pnpm deploy
   ```

`wrangler.jsonc` 还配置了静态资源绑定和每日 Cron Trigger，用于清理过期游客订阅。部署完成后，Wrangler 会输出 Workers 地址；绑定自定义域名后可继续使用同一套 API。

### 账户、权限与安全

| 角色 | 能力 |
| --- | --- |
| 游客 | 导出最多 6 个月的 `.ics`，或创建 7 天有效的 3 个月临时订阅。 |
| 待审批用户 | 可以验证账户状态，但不能访问周期接口。 |
| 成员 | 保存最多 50 个周期，生成 1 到 24 个月的签名订阅及合并订阅。 |
| 管理员 | 拥有成员能力，并管理审批、角色、邀请码、密码重置和数据备份。 |

- 密码使用随机盐和 PBKDF2-SHA256（210,000 次迭代）哈希后存储。
- 登录会话使用 HttpOnly Cookie，数据库中只保存会话令牌哈希。
- 成员订阅使用服务端 HMAC-SHA256 签名；签名无效或账号不再处于 `approved` 状态时统一返回 404。
- 游客临时令牌只保存 SHA-256 哈希，不保存原始令牌。
- 修改周期不会改变单周期链接，新增、编辑或删除周期后合并链接地址也保持不变。
- 导入备份会删除当前用户、周期、邀请码和会话，再整体写入备份数据。

> [!WARNING]
> 管理员备份包含账户密码哈希和全部周期数据，应作为敏感文件保管。备份导入完成后，需要使用备份中的管理员账号重新登录。

管理员忘记密码时，可以通过部署环境中的 D1 执行恢复命令。完整步骤见 [`docs/admin-password-reset.md`](docs/admin-password-reset.md)。

### ICS 行为

- 班次时间按 `Asia/Shanghai` 换算成 UTC 日历事件。
- 结束时间早于或等于开始时间时，结束日期按次日计算；休息班次仍按全天处理。
- 休息日默认不生成事件。开启“休息日写入日历”后，会生成 `TRANSP:TRANSPARENT` 的透明事件；夜班后的休息会从下班时刻起持续 24 小时。
- 日历响应包含 1 小时刷新提示，实际刷新频率由日历客户端决定。
- 合并订阅为每个周期使用独立 UID 命名空间，避免同名班次产生事件冲突。
- 订阅响应使用私有缓存提示和 `no-referrer`，避免共享缓存及 Referer 泄露签名地址。
- 游客导出始终最多覆盖 6 个月，不受 3 个月临时订阅上限影响。

### 开发与测试

```bash
pnpm test
pnpm check
```

`pnpm test` 使用 Node.js 内置测试运行器，覆盖周期标准化、输入校验、今天起点、跨夜班次、休息日、时区夏令时、游客订阅、成员签名、合并订阅、备份恢复和 ICS 折行等行为。

`pnpm check` 会检查 Worker、前端和国际化脚本语法，并重新构建前端包。

管理员恢复命令：

```bash
pnpm admin:reset -- --list-admins
pnpm admin:reset -- --username admin
pnpm admin:reset -- --username admin --mode remote
```

Docker 中执行本地恢复时，需要显式指定持久化目录：

```bash
docker exec -it sloop \
  pnpm admin:reset -- \
  --username admin \
  --persist-to /data
```

### 项目结构

```text
public/
  index.html              页面结构
  app.js                  周期编辑、账户、管理界面和客户端交互
  i18n.js                 i18next 初始化与中英文资源
  styles.css              响应式样式与动效
  assets/brand/           图标与应用资产
worker.js                 Worker 路由、认证、订阅、备份与 ICS 生成
scripts/                  管理员密码恢复等运维命令
migrations/               Cloudflare D1 数据库迁移
docs/                     部署与运维文档
test/                     核心行为测试
brand/                    品牌规范与展示资产
Dockerfile                Docker 镜像构建
docker-entrypoint.sh      Docker 启动与本地 D1 迁移
wrangler.jsonc            Worker、D1、静态资源和 Cron 配置
```

---

## English

Sloop is a lightweight rotating-shift calendar builder. Arrange day, night, rest, or custom shifts in any order, choose where the cycle starts today, and publish an ICS calendar that can be imported or subscribed to. The project includes a responsive web interface, a Cloudflare Worker API, D1 migrations, accounts and access control, and a Docker self-hosting option.

### Features

**Shift planning**

- Arrange shifts in any order, with up to 35 days per cycle.
- Start with day, night, and rest shifts, then add custom shifts, with up to 12 saved presets.
- Support overnight shifts, rest days, and 24-hour time inputs.
- Choose from 12 distinguishable colors shared by the cycle strip, preview, and ICS events.
- Select any day in the cycle to make it both "today" and the start of the current rotation.
- Keep the rotation preview collapsed by default, with a dedicated mobile cycle editor.

**Sharing and subscriptions**

- Guests can download an `.ics` file covering up to 6 months without an account.
- Guests can also create a 3-month temporary subscription link that expires after 7 days.
- Members can save multiple cycles and manage them from the "My cycles" view.
- Each saved cycle has its own signed subscription link with a configurable 1 to 24 month range and a 12 month default.
- Merge every saved cycle into one subscription, or select specific cycles and generate a separately signed merged link.
- Copy subscription URLs, download `.ics` files, or open `webcal:` links directly.

**Accounts, administration, and interface**

- Sign in with a username and password without an email address; nicknames are display-only.
- The first registered user becomes an administrator, while later standard registrations wait for approval.
- Registration with a valid invite code is approved immediately.
- Administrators can approve, reject, disable, or restore members, change roles, and manage invite codes.
- Administrators can export or import application data backups, excluding temporary guest subscriptions; importing replaces current data and revokes every session.
- The interface supports Simplified Chinese and English, remembers the selected language, and initializes from the browser locale.

### Quick start

Requirements: Node.js 20 or newer and pnpm.

```bash
git clone https://github.com/XiGeMaX/sloop.git
cd sloop
corepack enable
pnpm install
cp .dev.vars.example .dev.vars
pnpm exec wrangler d1 migrations apply sloop-db --local
pnpm dev
```

Open `http://localhost:8787`. The first registered account becomes the local administrator.

`pnpm dev` first bundles the frontend entry point and i18next resources into `public/app.bundle.js` with esbuild. The application does not load runtime dependencies from a CDN, and the generated bundle is ignored by Git.

### Configuration

Local configuration lives in `.dev.vars`. At minimum, set a signing secret:

```dotenv
LINK_SIGNING_SECRET=replace-with-a-long-random-secret
```

Generate a random value with:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

`LINK_SIGNING_SECRET` signs member cycle and merged subscription links. Production deployments must use a stable, random, sufficiently long value. Rotating the secret invalidates every signed member subscription link.

The health endpoint is `GET /api/health`; it checks both the D1 connection and whether the signing secret is configured.

### Docker self-hosting

The Docker image runs the complete Worker on Wrangler's local runtime and stores D1 data in `/data`. Database migrations are applied automatically on startup. CI builds `linux/amd64` and `linux/arm64` images and publishes them to GHCR; Docker Hub publishing requires the `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` secrets.

Create `.env`:

```dotenv
LINK_SIGNING_SECRET=replace-with-a-long-random-secret
```

Create `compose.yaml`:

```yaml
services:
  sloop:
    container_name: sloop
    image: ghcr.io/xigemax/sloop:latest
    ports:
      - "8787:8787"
    volumes:
      - sloop-data:/data
      - /etc/localtime:/etc/localtime:ro
    restart: unless-stopped
    stop_grace_period: 30s
    environment:
      TZ: Asia/Shanghai
      APP_ENV: production
      LINK_SIGNING_SECRET: "${LINK_SIGNING_SECRET}"

volumes:
  sloop-data:
```

Start the service:

```bash
docker compose up -d
```

Then open `http://localhost:8787`. The `sloop-data` volume stores database state and should be included in regular backups. If `LINK_SIGNING_SECRET` is omitted, the container generates an ephemeral secret, so existing member subscription links break after a restart.

You can also build directly from source:

```bash
docker build -t sloop .
docker run -d \
  --name sloop \
  -p 8787:8787 \
  -v sloop-data:/data \
  -e LINK_SIGNING_SECRET="replace-with-a-long-random-secret" \
  --restart unless-stopped \
  sloop
```

### Deploy to Cloudflare Workers

1. Create the D1 database.

   ```bash
   pnpm exec wrangler d1 create sloop-db
   ```

2. Replace the all-zero placeholder `database_id` in `wrangler.jsonc` with the value returned by Wrangler.
3. Add the signing secret.

   ```bash
   pnpm exec wrangler secret put LINK_SIGNING_SECRET
   ```

4. Apply remote migrations and deploy.

   ```bash
   pnpm exec wrangler d1 migrations apply sloop-db --remote
   pnpm deploy
   ```

`wrangler.jsonc` also configures the static asset binding and a daily Cron Trigger that removes expired guest subscriptions. After deployment, Wrangler prints the Workers URL; you can attach a custom domain without changing the API surface.

### Accounts, access, and security

| Role | Capabilities |
| --- | --- |
| Guest | Export an `.ics` file covering up to 6 months, or create a 7-day, 3-month temporary subscription. |
| Pending user | Verify account status, but cannot access cycle APIs. |
| Member | Save up to 50 cycles and create signed subscriptions covering 1 to 24 months, plus merged subscriptions. |
| Administrator | Member capabilities plus approvals, roles, invite codes, password resets, and data backups. |

- Passwords are stored as PBKDF2-SHA256 hashes with a random salt and 210,000 iterations.
- Login sessions use HttpOnly cookies; only session-token hashes are stored in the database.
- Member subscriptions use server-side HMAC-SHA256 signatures. An invalid signature or an account that is no longer `approved` returns 404.
- Temporary guest tokens are stored only as SHA-256 hashes; raw tokens are not persisted.
- Editing a cycle keeps its individual URL stable. Adding, editing, or deleting cycles also keeps the merged subscription URL stable.
- Importing a backup removes current users, cycles, invites, and sessions before writing the backup data.

> [!WARNING]
> Administrator backups contain password hashes and all cycle data, so treat them as sensitive files. After a backup import, sign in again with an administrator account from that backup.

If an administrator forgets their password, recover it through the deployment's D1 database. See the Chinese-language runbook at [`docs/admin-password-reset.md`](docs/admin-password-reset.md).

### ICS behavior

- Shift times in `Asia/Shanghai` are converted to UTC calendar events.
- If an end time is earlier than or equal to its start time, the event ends the next day; rest shifts remain all-day entries.
- Rest days are omitted by default. When "include rest days" is enabled, Sloop emits `TRANSP:TRANSPARENT` events; rest after an overnight shift lasts 24 hours from the shift end.
- Calendar responses request a one-hour refresh interval. Actual refresh behavior depends on the calendar client.
- Merged calendars use a separate UID namespace for each cycle to prevent collisions between shifts with the same name.
- Subscription responses use private caching and `no-referrer` to avoid shared caching and Referer leakage of signed URLs.
- Guest exports always cover up to 6 months and are not limited by the 3-month temporary subscription range.

### Development and testing

```bash
pnpm test
pnpm check
```

`pnpm test` uses the Node.js test runner and covers plan normalization, input validation, today anchors, overnight shifts, rest days, timezone daylight-saving changes, guest subscriptions, member signatures, merged subscriptions, backup recovery, and ICS line folding.

`pnpm check` validates the syntax of the Worker, frontend, and internationalization scripts, then rebuilds the frontend bundle.

Administrator recovery commands:

```bash
pnpm admin:reset -- --list-admins
pnpm admin:reset -- --username admin
pnpm admin:reset -- --username admin --mode remote
```

For local recovery inside Docker, specify the persistent data directory explicitly:

```bash
docker exec -it sloop \
  pnpm admin:reset -- \
  --username admin \
  --persist-to /data
```

### Project structure

```text
public/
  index.html              Page structure
  app.js                  Cycle editor, accounts, admin UI, and client interactions
  i18n.js                 i18next initialization and Chinese/English resources
  styles.css              Responsive styles and motion
  assets/brand/           Icons and application assets
worker.js                 Worker routes, auth, subscriptions, backups, and ICS generation
scripts/                  Administrative recovery and operations commands
migrations/               Cloudflare D1 database migrations
docs/                     Deployment and operations documentation
test/                     Core behavior tests
brand/                    Brand guidance and presentation assets
Dockerfile                Docker image build
docker-entrypoint.sh      Docker startup and local D1 migrations
wrangler.jsonc            Worker, D1, static asset, and Cron configuration
```
