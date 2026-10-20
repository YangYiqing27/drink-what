# Cloudflare 部署

网页部署成功后，还需要把 D1 绑定到 Pages Functions，云端数据才会生效。

## 1. 创建 D1

在 Cloudflare 控制台进入 `Workers & Pages -> D1 SQL database`，创建数据库：

```text
drink-what
```

打开数据库的 Console，执行 `schema.sql` 中的 SQL。

## 2. 绑定到 Pages

进入 `drink-what -> 设置 -> 函数 -> D1 database bindings`，添加：

```text
Variable name: DB
Database: drink-what
```

保存后重新部署。

项目中的 `functions/api/state.js` 会提供：

```text
GET /api/state
PUT /api/state
```

每个浏览器会生成独立的 client id，品牌、品牌下饮品和饮水记录会保存到 D1。当前不要求朋友注册账号；清理浏览器数据后会生成新的 client id，因此后续仍可增加登录功能。
