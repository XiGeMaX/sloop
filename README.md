<p align="center">
  <img src="public/assets/brand/sloop-app-icon.svg" width="88" height="88" alt="Sloop app icon">
</p>

<h1 align="center">Sloop</h1>

<p align="center">
  <strong>把循环班次变成一份可以长期订阅的日历。</strong><br>
  Turn repeating shifts into a calendar you can keep subscribed to.
</p>

<p align="center">
  <a href="#中文">中文</a> ·
  <a href="#english">English</a> ·
  <a href="#license">License</a>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="MIT License"></a>
  <a href="go.mod"><img src="https://img.shields.io/github/go-mod/go-version/XiGeMaX/sloop" alt="Go version"></a>
</p>

## 项目一览

Sloop 面向需要轮班的人：按自己的顺序排列白班、夜班、休息或自定义班次，指定周期锚点，然后导出 `.ics` 或生成长期订阅链接。

| | |
| --- | --- |
| 前端 | 原生 HTML、CSS、JavaScript，支持中英文、深色模式和响应式布局 |
| 服务端 | Go 1.26+，标准库 HTTP 服务 |
| 数据 | SQLite，WAL 模式，内嵌版本化迁移 |
| 部署 | 单二进制或 Docker，不依赖外部数据库和 JavaScript 运行时 |
| 测试 | `go test` + Node.js 前端单元测试 |

### 界面预览

| 桌面端 | 移动端 |
| --- | --- |
| [<img src="screenshots/sloop-pc-light.png" alt="Sloop desktop interface">](screenshots/sloop-pc-light.png) | [<img src="screenshots/sloop-mobile-light.png" alt="Sloop mobile interface">](screenshots/sloop-mobile-light.png) |

深色主题截图见 [`screenshots/sloop-pc-dark.png`](screenshots/sloop-pc-dark.png) 和 [`screenshots/sloop-mobile-dark.png`](screenshots/sloop-mobile-dark.png)。

---

## 中文

### 功能

**编排轮班**

- 创建任意天数的周期，拖动或用键盘调整班次顺序。
- 使用最多 12 个可复用班次预设，支持白班、夜班、休息和自定义时段。
- 支持跨夜、多日班次、12 种颜色、休息日透明事件和周期锚点。
- 草稿和班次预设保存在账户与浏览器本地。

**订阅与共享**

- 每个成员最多保存 50 份周期。
- 单份周期支持 1 到 24 个月的订阅范围。
- 单周期和合并订阅都使用服务端 HMAC-SHA256 签名。
- 可订阅全部周期，也可选择部分周期生成独立签名的合并链接。
- 支持复制链接、下载 `.ics` 和打开 `webcal:`。

**账户与管理**

- 用户名加密码登录，不收集邮箱。
- 实例的第一个注册账号自动成为管理员。
- 后续注册默认待审批；有效邀请码可立即通过。
- 管理员可审批、拒绝、停用、恢复账号，调整角色并重置用户密码。
- 邀请码支持次数上限和过期时间。
- 管理员可导出或导入完整 JSON 备份。导入会覆盖便携数据并撤销全部会话。

### 为什么改成 Go + SQLite

- 服务端只依赖一个 Go 二进制和本地 SQLite 文件。
- 数据目录可直接挂载到宿主机或容器卷，便于备份和迁移。
- 无外部数据库、Serverless 运行时或 JavaScript 服务端进程。
- 密码哈希、会话令牌摘要和 v2 订阅签名格式沿用旧实现，已有账号和签名链接可继续使用。

### 本地开发

需要 Go 1.26+、Node.js 20+ 和 pnpm。

```bash
git clone https://github.com/XiGeMaX/sloop.git
cd sloop
corepack enable
pnpm install
pnpm dev
```

打开 <http://localhost:2167>。第一个完成注册的账号会成为管理员。`pnpm dev` 会先用 esbuild 生成 `public/app.bundle.js`，随后启动 Go 服务。

默认配置会创建：

```text
data/sloop.db
data/signing-secret
```

无需创建 `.env` 即可本地运行。需要自定义配置时，可以导出 [`.env.example`](.env.example) 中的变量：

```bash
set -a
. ./.env
set +a
pnpm dev
```

### 配置

| 变量 | 默认值 | 用途 |
| --- | --- | --- |
| `PORT` | `2167` | HTTP 监听端口 |
| `SLOOP_ADDR` | 空 | 完整监听地址；设置后覆盖 `PORT` |
| `SLOOP_DATABASE_PATH` | `./data/sloop.db` | SQLite 数据库路径 |
| `SLOOP_STATIC_DIR` | `./public` | 前端静态资源目录 |
| `SLOOP_SECRET_FILE` | 数据库同目录的 `signing-secret` | 自动生成的持久签名密钥文件 |
| `LINK_SIGNING_SECRET` | 空 | 显式 HMAC 密钥；设置后优先于密钥文件 |
| `DEFAULT_TIMEZONE` | `Asia/Shanghai` | 新周期的默认 IANA 时区 |

未设置 `LINK_SIGNING_SECRET` 时，服务首次启动会在 `SLOOP_SECRET_FILE` 生成 256 位随机密钥。该文件和数据库必须一起备份；删除或更换它会让现有订阅链接失效。

### Docker 自托管

仓库包含两阶段镜像：Node.js 只负责构建前端，最终镜像只运行 Go 服务。SQLite 数据保存在 `/data`。

`compose.yaml` 默认从 Docker Hub 拉取 `docker.io/xigemax/sloop:latest`。GHCR 镜像地址为 `ghcr.io/xigemax/sloop:latest`。

```bash
docker compose pull
docker compose up -d
```

打开 <http://localhost:2167>。可选的 `.env` 示例：

```dotenv
PORT=2167
DEFAULT_TIMEZONE=Asia/Shanghai
LINK_SIGNING_SECRET=
SLOOP_IMAGE=docker.io/xigemax/sloop:latest
```

如需改用 GHCR，将 `.env` 中的镜像地址改为：

```dotenv
SLOOP_IMAGE=ghcr.io/xigemax/sloop:latest
```

修改后重新执行 `docker compose pull` 和 `docker compose up -d`。

从当前源码构建并启动：

```bash
docker compose up -d --build
```

容器入口会先修正 `/data` 卷的归属，再以非 root 的 `sloop` 用户运行服务。已有卷出现 `permission denied` 时，重新构建并启动即可。

建议将 `/data` 卷和宿主机备份计划一起管理。容器以非 root 用户运行，启动时自动应用内嵌迁移，并通过 `GET /api/health` 检查数据库连接。

也可以直接运行二进制：

```bash
make build
SLOOP_DATABASE_PATH=./data/sloop.db \
SLOOP_STATIC_DIR=./public \
./bin/sloop
```

### 从旧实例迁移

不支持直接迁移旧运行时的数据库文件。可移植迁移路径是管理员 JSON 备份：

1. 在旧实例中登录管理员，下载管理员备份 JSON。
2. 启动新的 Go + SQLite 实例。
3. 首次注册一个临时管理员。
4. 在人员管理页面导入 JSON 备份。
5. 导入会撤销全部会话；使用备份中的管理员账号和原密码重新登录。

密码哈希格式兼容，因此不需要重置用户密码。若还需保留现有订阅链接，请把旧实例的 HMAC 密钥配置为新的 `LINK_SIGNING_SECRET`，并在迁移时保留原 `shareSlug`。备份本身不包含签名密钥。

### 安全设计

- 密码使用随机盐和 PBKDF2-SHA256（100,000 次迭代）存储。
- 会话 Cookie 使用 `HttpOnly` 和 `SameSite=Lax`；HTTPS 请求自动添加 `Secure`。
- 数据库只保存会话令牌的 SHA-256 摘要。
- 所有写请求执行同源检查。
- 静态页面使用 CSP、`X-Frame-Options: DENY`、`nosniff` 和 `no-referrer`。
- 订阅响应使用签名校验、私有缓存和禁止索引提示。
- 管理员备份包含密码哈希和全部周期数据，应按敏感文件保管。

### 验证与构建

```bash
make test
make check
make build
```

`make check` 依次检查 Go 格式、运行 `go vet`、Go 测试、前端测试并重建浏览器包。CI 还会以 `-race` 运行 Go 测试、检查 `go mod tidy` 结果并构建多架构镜像。

### 管理员恢复

列出管理员：

```bash
go run ./cmd/sloop-admin --list --database ./data/sloop.db
```

重置管理员密码：

```bash
go run ./cmd/sloop-admin --username admin --database ./data/sloop.db
```

Docker 中直接执行镜像内的管理命令：

```bash
docker exec -it -u sloop sloop \
  /app/sloop-admin --username admin --database /data/sloop.db
```

完整参数和故障排查见 [`docs/admin-password-reset.md`](docs/admin-password-reset.md)。

### 目录结构

```text
cmd/
  sloop/                    HTTP 服务入口
  sloop-admin/              管理员恢复命令行
internal/
  calendar/                 计划校验、ICS 与合并日历
  config/                   环境变量与持久密钥
  httpapi/                  HTTP API、静态文件与安全头
  security/                 PBKDF2、令牌和 HMAC
  store/                    SQLite、事务与备份导入导出
migrations/                 内嵌的 SQLite 迁移
public/                     原生前端与构建资源
test/                       前端单元测试
docs/                       运维文档
Dockerfile                  多阶段自托管镜像
compose.yaml                本地单机部署示例
```

---

## English

### What it does

Sloop turns a repeating shift pattern into an ICS calendar. Each position in the cycle has a shift, and one selected position anchors the rotation. Signed-in members can save several cycles, download them, or subscribe to stable signed URLs.

### Features

- Cycles of any length with drag-and-keyboard ordering.
- Up to 12 reusable shift presets, including day, night, rest, and custom work periods.
- Overnight and multi-day shifts, 12 colors, transparent rest events, and a movable cycle anchor.
- Up to 50 saved cycles per member, each with a 1 to 24 month subscription range.
- HMAC-SHA256-signed member and merged subscription links.
- Account approval, role management, invite limits, expiry, password resets, and JSON backups.
- First registered account becomes the administrator; later accounts wait for approval unless they use a valid invite.

### Self-hosted architecture

| Layer | Implementation |
| --- | --- |
| Frontend | Native HTML, CSS, and JavaScript |
| Backend | Go HTTP service |
| Database | SQLite in WAL mode with embedded migrations |
| Deployment | One binary or one container, no external database or server-side JavaScript runtime |

The server keeps the existing password hash, session token digest, and v2 subscription signing formats. Reusing the previous signing secret preserves existing signed subscription URLs after a backup restore.

### Run locally

Requirements: Go 1.26+, Node.js 20+, and pnpm.

```bash
git clone https://github.com/XiGeMaX/sloop.git
cd sloop
corepack enable
pnpm install
pnpm dev
```

Open <http://localhost:2167>. The first account registered is the administrator. The development command builds the browser bundle and starts the Go server. Default data is written to `data/sloop.db` and `data/signing-secret`.

### Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `2167` | HTTP port |
| `SLOOP_ADDR` | empty | Full listen address; overrides `PORT` when set |
| `SLOOP_DATABASE_PATH` | `./data/sloop.db` | SQLite database path |
| `SLOOP_STATIC_DIR` | `./public` | Frontend asset directory |
| `SLOOP_SECRET_FILE` | `signing-secret` beside the database | Durable generated HMAC key file |
| `LINK_SIGNING_SECRET` | empty | Explicit HMAC key; takes precedence over the key file |
| `DEFAULT_TIMEZONE` | `Asia/Shanghai` | Default IANA time zone for new cycles |

If `LINK_SIGNING_SECRET` is empty, Sloop creates a persistent 256-bit key file on first start. Back up that file with the SQLite database. Replacing it invalidates existing subscription links.

### Docker

The `compose.yaml` file pulls a prebuilt image and defaults to Docker Hub at `docker.io/xigemax/sloop:latest`. The GHCR image is `ghcr.io/xigemax/sloop:latest`.

```bash
docker compose pull
docker compose up -d
```

Open <http://localhost:2167>. The final image runs as an unprivileged user, applies embedded migrations at startup, stores data in `/data`, and exposes a health check at `GET /api/health`.

To build and run from the current source:

```bash
docker compose up -d --build
```

The entrypoint repairs the ownership of an existing `/data` volume before dropping privileges to the unprivileged `sloop` user.

Create `.env` if you need to override defaults:

```dotenv
PORT=2167
DEFAULT_TIMEZONE=Asia/Shanghai
LINK_SIGNING_SECRET=
SLOOP_IMAGE=docker.io/xigemax/sloop:latest
```

To pull from GHCR instead, set:

```dotenv
SLOOP_IMAGE=ghcr.io/xigemax/sloop:latest
```

Run `docker compose pull` and `docker compose up -d` again after changing the image.

To run the compiled binary directly:

```bash
make build
SLOOP_DATABASE_PATH=./data/sloop.db \
SLOOP_STATIC_DIR=./public \
./bin/sloop
```

### Migrating an existing installation

Direct database-file migration from the previous runtime is not supported. Use an administrator JSON backup:

1. Export the administrator backup from the existing installation.
2. Start the new Go + SQLite server.
3. Register a temporary administrator.
4. Import the JSON backup from the member management page.
5. All sessions are revoked. Sign in with an administrator account from the backup and its existing password.

Existing password hashes are compatible. To keep old signed subscription URLs valid, configure the previous HMAC secret as `LINK_SIGNING_SECRET` before importing. The portable backup does not include the signing secret.

### Security

- PBKDF2-SHA256 with a random salt and 100,000 iterations.
- `HttpOnly`, `SameSite=Lax` session cookies with automatic `Secure` on HTTPS.
- Session tokens are stored only as SHA-256 digests.
- Same-origin checks on mutating requests.
- CSP, frame denial, MIME sniffing protection, and no-referrer headers.
- Signed subscription URLs with private caching and indexing protection.
- JSON backups contain password hashes and all cycle data and must be treated as sensitive.

### Verify and build

```bash
make test
make check
make build
```

CI runs Go tests with the race detector, checks `go mod tidy`, runs frontend tests, and builds multi-architecture images.

### Administrator recovery

```bash
go run ./cmd/sloop-admin --list --database ./data/sloop.db
go run ./cmd/sloop-admin --username admin --database ./data/sloop.db
```

Inside Docker:

```bash
docker exec -it -u sloop sloop \
  /app/sloop-admin --username admin --database /data/sloop.db
```

See [`docs/admin-password-reset.md`](docs/admin-password-reset.md) for custom passwords, dry runs, and troubleshooting.

## License

This project is licensed under the [MIT License](LICENSE).

本项目采用 [MIT 许可证](LICENSE)。
