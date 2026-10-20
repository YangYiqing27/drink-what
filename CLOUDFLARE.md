# 网页与账号部署

当前使用 Cloudflare Worker + 静态资源 + D1，入口是 `worker.js`。

## 已有数据库升级

在 Cloudflare 的 D1 数据库 `drink-what` → Console 执行
[`migrations/0002_accounts.sql`](migrations/0002_accounts.sql) 的全部 SQL。
不会删除或修改原有 `app_state` 数据。

新数据库先执行 `schema.sql`，再执行上述账号迁移。

Worker 设置 → Bindings：D1 的变量名必须是 `DB`。
如由 Wrangler 管理绑定，请在配置加入实际数据库信息：

```toml
[[d1_databases]]
binding = "DB"
database_name = "drink-what"
database_id = "在D1页面复制的实际数据库ID"
```

不要填假 ID。已有控制台绑定在后续部署后也需要确认仍存在。

## 构建

- Build command：`npm run build`
- Deploy command：`npx wrangler deploy`
- Root directory：`/`

`wrangler.toml` 定义了 Worker 入口和网页静态资源目录。
仓库 `functions/` 是旧 Pages 入口，本次 Worker 部署不使用它。

## 账号测试

1. 注册账号 A，新增记录，等待顶部显示“已同步”。
2. 另一台设备登录 A，确认能看到相同记录。
3. 注册账号 B，确认看不到 A 的记录。
4. 退出后用错误密码登录，确认提示失败。
5. 在 D1 Console 查询：

```sql
SELECT users.username, user_state.updated_at,
       json_array_length(user_state.state_json, '$.records') AS record_count
FROM user_state JOIN users ON users.id = user_state.user_id;
```

密码通过 PBKDF2 加盐保存；登录凭证使用 HttpOnly、安全 Cookie，有效期30天。
当前没有邮件验证或忘记密码功能，请妥善保管密码。

登录前记录仍保存在原浏览器；账号菜单可选择“导入此浏览器原有记录”。
旧匿名 `app_state` 保留但不再开放匿名接口。原浏览器本地记录可导入；
仅存在旧 D1 中、而本地已丢失的记录，需要单独恢复。

同步失败时本机保留待同步修改，账号菜单可重试。
两台设备同时写入时，后写的设备会收到冲突提示，不会直接覆盖云端；
可先导出本机记录，再加载云端最新数据。

## 不开 VPN 访问

账号不能解决 `workers.dev` 的网络可达性问题。
没有域名时，可先注册域名，再在 Worker 的 Settings → Domains & Routes
添加 Custom Domain，并测试 Wi-Fi、手机流量下的访问。
这仍使用 Cloudflare 的线路，无法承诺在中国大陆所有网络稳定可达。

若希望中国大陆用户长期稳定使用，可选大陆服务器（网站通常需要ICP备案），
或香港等地区服务器（需要从实际用户网络验证速度与可达性）。
迁移到其他托管平台时，需要移植 Worker/D1 后端，不能只部署静态前端。
具体选用平台和账号尚未确定，本项目没有擅自迁移到其他平台。
