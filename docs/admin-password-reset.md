# 管理员忘记密码恢复

Sloop 不收集邮箱，也不提供公开的“发送重置邮件”入口。管理员忘记密码时，需要由拥有该实例服务器、容器或 Cloudflare 账号权限的维护者执行恢复命令。

恢复命令会：

1. 确认目标账号是状态为 `approved` 的管理员。
2. 撤销该管理员现有的全部登录会话。
3. 使用新的随机盐和 PBKDF2-SHA256 生成密码哈希。
4. 默认生成一次性临时密码，供登录后立即修改。

命令不会修改其他用户、周期、邀请码或订阅链接。

## 前提条件

- 本机已安装项目依赖，或能够在 Docker 容器内执行 `pnpm`。
- 知道管理员的登录用户名，可通过 `--list-admins` 查询。
- 本地模式需要知道正确的 D1 持久化目录。
- Cloudflare 模式需要已登录 Wrangler，或配置了具备目标 D1 数据库编辑权限的 API Token。

先查看本地管理员账号：

```bash
pnpm admin:reset -- --list-admins
```

Cloudflare 环境把 `--mode remote` 加到命令末尾：

```bash
pnpm admin:reset -- --list-admins --mode remote
```

本地无修改检查：

```bash
pnpm admin:reset -- --username admin --dry-run
```

Cloudflare 无修改检查：

```bash
pnpm admin:reset -- --username admin --mode remote --dry-run
```

## 本地开发

在项目根目录执行：

```bash
pnpm admin:reset -- --username admin --mode local
```

默认使用 Wrangler 的本地持久化目录，也就是 `pnpm dev` 当前使用的数据库。命令成功后会输出临时密码：

```text
Administrator password reset: admin
Temporary password: xxxxxxxxxxxxxxxxxxxxxxxx
All existing sessions for this administrator were revoked. Change the password after login.
```

如果本地使用了自定义持久化目录：

```bash
pnpm admin:reset \
  -- --username admin \
  --mode local \
  --persist-to /path/to/wrangler-state
```

## Docker 或自托管

Docker 镜像把 SQLite/D1 数据保存在容器的 `/data` 卷中，因此恢复命令必须同时指定 `--persist-to /data`。

假设容器名为 `sloop`：

```bash
docker exec -it sloop \
  pnpm admin:reset -- \
  --username admin \
  --mode local \
  --persist-to /data
```

先查询容器名称：

```bash
docker ps --format '{{.Names}}\t{{.Image}}'
```

如果容器名称不同，替换命令中的 `sloop`。不要省略 `--persist-to /data`，否则命令可能连接到容器内另一个空的本地数据库。

如果部署到其他兼容 Wrangler 的自托管运行时，请使用该运行时实际挂载的数据目录作为 `--persist-to` 参数。

## Cloudflare Workers

确认当前 Wrangler 登录了正确的 Cloudflare 账号：

```bash
pnpm exec wrangler whoami
```

使用 `wrangler.jsonc` 中配置的 D1 数据库执行远程恢复：

```bash
pnpm admin:reset -- \
  --username admin \
  --mode remote
```

如果使用 Wrangler 环境配置：

```bash
pnpm admin:reset -- \
  --username admin \
  --mode remote \
  --env production
```

如果使用独立配置文件：

```bash
pnpm admin:reset -- \
  --username admin \
  --mode remote \
  --config wrangler.production.jsonc
```

CI 或自动化环境可以使用 Cloudflare API Token。Token 需要具有目标账号和目标 D1 数据库的编辑权限：

```bash
export CLOUDFLARE_API_TOKEN="replace-with-a-scoped-token"
pnpm admin:reset -- --username admin --mode remote
unset CLOUDFLARE_API_TOKEN
```

## 自定义新密码

默认生成临时密码最安全，也最不容易留在命令历史中。确实需要指定新密码时，通过标准输入传入，不要把明文密码放在命令行参数里：

```bash
read -s -p "New admin password: " SLOOP_NEW_ADMIN_PASSWORD
printf '\n'
printf '%s' "$SLOOP_NEW_ADMIN_PASSWORD" \
  | pnpm admin:reset -- --username admin --password-stdin
unset SLOOP_NEW_ADMIN_PASSWORD
```

密码长度必须为 8–128 个字符。通过 `--password-stdin` 传入时，命令不会再次打印密码。

## 恢复后的操作

1. 使用管理员用户名和临时密码登录。
2. 打开账户设置，立即修改密码。
3. 确认原先打开的浏览器或设备已经退出登录。
4. 不要截图、粘贴或长期保存临时密码。

修改密码后，除当前会话外的其他管理员会话会被撤销。

## 常见问题

### 提示用户名不存在

确认用户名拼写，并执行：

```bash
pnpm admin:reset -- --list-admins
```

命令只列出角色为管理员且包含各状态的账号。

### 提示目标账号不是管理员

恢复命令只重置管理员账号。普通用户应由已登录的管理员在人员管理页面重置密码。

### 提示账号不是 approved

`pending`、`rejected` 或 `disabled` 管理员不能直接恢复登录。先确认该账号状态，再由数据库维护者调整状态或恢复有效运维备份。

### Docker 中提示找不到管理员

通常是遗漏了 `--persist-to /data`，命令连接到了容器内的临时目录。加上该参数后重试。

### Cloudflare 提示鉴权失败

检查 `wrangler whoami`、API Token 权限、账号选择和 `database_id`。远程模式只会访问 `wrangler.jsonc` 中配置的 D1 数据库。

### 登录后旧设备仍然有效

正常情况下，重置前后的旧会话都应失效。若仍可访问，请检查是否连接了错误的数据库环境，并重新执行一次恢复命令。

## 安全说明

- 不要把恢复命令包装成无需鉴权的公网 API。
- 不要通过聊天、工单或截图传递临时密码。
- 不要在共享 shell 历史中直接写明文密码。
- 建议限制 Cloudflare API Token 的账号和数据库范围。
- 恢复操作只撤销目标管理员的会话，不会轮换 `LINK_SIGNING_SECRET`，因此成员订阅链接不会因本次密码重置失效。
