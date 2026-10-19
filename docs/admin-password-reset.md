# 管理员忘记密码恢复

Sloop 不收集邮箱，也没有公开的密码重置入口。管理员忘记密码时，需要由能够访问 SQLite 数据库的实例维护者运行 `sloop-admin`。

恢复命令会：

1. 确认目标是状态为 `approved` 的管理员。
2. 撤销该管理员的全部登录会话。
3. 使用新的随机盐和 PBKDF2-SHA256 生成密码哈希。
4. 默认生成一次性临时密码，供登录后立即修改。

命令不会修改其他用户、周期、邀请码或签名密钥。

## 前提条件

- 能在项目目录运行 Go 1.26+，或能在 Docker 容器中执行管理二进制。
- 知道 SQLite 数据库路径。
- 知道管理员用户名。

默认数据库路径是 `./data/sloop.db`，可通过 `SLOOP_DATABASE_PATH` 修改。

## 列出管理员

本地：

```bash
go run ./cmd/sloop-admin --list --database ./data/sloop.db
```

Docker：

```bash
docker exec -it sloop \
  /app/sloop-admin --list --database /data/sloop.db
```

输出只包含状态为 `approved` 的管理员用户名和昵称。

## 检查目标

只验证目标，不修改数据：

```bash
go run ./cmd/sloop-admin \
  --username admin \
  --database ./data/sloop.db \
  --dry-run
```

如果目标不是已批准管理员，命令会返回错误。

## 生成临时密码

```bash
go run ./cmd/sloop-admin \
  --username admin \
  --database ./data/sloop.db
```

成功后会输出：

```text
Password reset for "admin".
Temporary password: xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

使用临时密码登录后，请立即在账户设置中修改密码。命令会撤销该管理员之前的全部会话。

## 指定新密码

不要把明文密码直接写在命令行参数里。通过标准输入传入：

```bash
read -s -p "New admin password: " SLOOP_NEW_ADMIN_PASSWORD
printf '\n'
printf '%s' "$SLOOP_NEW_ADMIN_PASSWORD" | \
  go run ./cmd/sloop-admin \
    --username admin \
    --database ./data/sloop.db \
    --password-stdin
unset SLOOP_NEW_ADMIN_PASSWORD
```

密码长度必须为 8 到 128 个字符。使用 `--password-stdin` 时，命令不会再次打印密码。

## Docker 数据路径

容器内数据库默认位于 `/data/sloop.db`，`/data` 是持久化卷。必须在容器内指定这个路径：

```bash
docker exec -it sloop \
  /app/sloop-admin \
  --username admin \
  --database /data/sloop.db
```

如果 Compose 文件挂载了不同路径，请以容器内实际路径为准：

```bash
docker inspect sloop --format '{{json .Mounts}}'
```

不要把宿主机路径传给容器内的命令。例如宿主机上的 `./data/sloop.db` 在容器内通常应写成 `/data/sloop.db`。

## 自定义数据库路径

非默认部署可以显式指定数据库：

```bash
go run ./cmd/sloop-admin \
  --username admin \
  --database /srv/sloop/sloop.db
```

也可以通过环境变量提供默认值：

```bash
SLOOP_DATABASE_PATH=/srv/sloop/sloop.db \
  go run ./cmd/sloop-admin --username admin
```

## 故障排查

### 提示管理员不存在

先运行 `--list`，确认用户名和数据库路径正确。命令只识别已批准的 `admin` 角色。

### 提示数据库不可用

- 确认数据库文件存在且当前用户有读写权限。
- 确认服务没有使用另一个数据目录。
- 在 Docker 中使用 `/data/sloop.db`，不要使用宿主机相对路径。
- 检查文件系统或挂载卷是否只读。

### 登录后旧设备仍有效

恢复命令会删除目标管理员的所有会话。若旧设备仍能登录，通常是连接了另一个数据库实例。确认新服务与恢复命令使用同一路径。

### 订阅链接是否失效

密码重置不会轮换 `LINK_SIGNING_SECRET`，也不会改变签名密钥文件，因此成员订阅链接不受影响。

## 安全建议

- 不要把恢复命令包装成无需身份验证的公网接口。
- 不要通过聊天、工单或截图传递临时密码。
- 不要在共享 shell 历史中直接写明文密码。
- 将 SQLite 数据库、`signing-secret` 和 JSON 备份视为敏感文件。
- 恢复后立即修改临时密码，并检查管理员列表是否符合预期。
