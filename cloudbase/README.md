# CloudBase 迁移

本目录用 CloudBase 云函数和文档型数据库替代 Cloudflare Worker/D1。

## 控制台准备

1. 登录腾讯云 CloudBase，创建环境。
2. 启用云函数、云数据库和静态网站托管。
3. 创建 Node.js 云函数 `drink-api`，上传 `cloudbase/functions/drink-api` 目录并部署。
4. 静态网站托管将接收本项目的 `dist/` 内容。

首次注册、登录或保存记录时，会创建 `drink_users`、`drink_sessions`、`drink_state` 三个集合。客户端不会直接访问这些集合。

## 构建

根目录创建 `.env.production.local`：

```dotenv
VITE_BACKEND=cloudbase
VITE_CLOUDBASE_ENV_ID=你的CloudBase环境ID
```

```bash
npm install
npm run build:cloudbase
```

将 `dist/` 内容上传到该环境的静态网站托管。

## 验收

注册账号 A，新增记录；另一台设备登录 A 确认能看到记录。注册 B 后，B 不应看到 A 的记录。

Cloudflare D1 不会自动迁移。旧浏览器有记录时，登录后在账号菜单选择“导入此浏览器原有记录”。
