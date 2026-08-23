# STA 官网 · 后台与访问日志部署指南

架构：前台（Vercel）→ Supabase（内容直读 + 访问日志）→ 管理后台 `/admin/`
管理员体系为**自建用户表**（`sta_web_admins` + bcrypt + 自定义会话），不使用 Supabase Auth。
登录使用**用户名**（非邮箱），所有数据表统一使用 `sta_web_` 前缀。

---

## 一、Supabase 控制台（约 5 分钟）

1. **执行数据库脚本**
   - Dashboard → SQL Editor → New query
   - 粘贴本仓库 `supabase/schema.sql` 的**全部内容** → Run
   - 该脚本包含：管理员表、会话表、站点内容表（含当前网站内容的种子数据）、版本历史、访问日志表，以及全部安全策略

2. **创建第一个超级管理员**
   - 仍在 SQL Editor 中运行（换成你的用户名和密码）：
   ```sql
   select public.admin_bootstrap('admin', 'YourPassword123');
   ```
   - 仅当系统中没有任何管理员时可用；之后的管理员一律在后台界面中添加

3. **获取密钥**
   - Project Settings → Data API（或 API Keys）
   - 复制 `Project URL` 和 **Publishable key**（新版为 `sb_publishable_...`，旧版叫 anon public）

4. **填写前端配置**
   - 编辑本仓库 `js/config.js`：
     ```js
     window.SITE_CONFIG = {
       supabaseUrl: "https://xxxxxxxx.supabase.co",
       anonKey: "sb_publishable_xxx（或 eyJhbGci... 形式的 anon key）"
     };
     ```
   - Publishable key 属于公开密钥（受 RLS 保护），可以提交到仓库；**Secret key / service_role 绝不能放进任何前端文件**

> 说明：不需要在 Authentication 里做任何配置，本项目不使用 Supabase Auth。

> **存量项目升级**：若线上库是早期版本建的（后台登录报 `admin_me 404`、访问日志报 `read-only transaction`），只需在 SQL Editor 执行一次 `supabase/patch-admin-fix.sql`（幂等，可重复跑，不动数据）。新装项目直接跑 `schema.sql` 即可，已包含全部修复。

## 二、部署 IP 归属地边缘函数（一次性）

需要在本机执行命令（任选一种安装 CLI：`npm i -g supabase` 或 `scoop install supabase`）：

```bash
supabase login                                  # 浏览器授权
supabase link --project-ref <项目ref>            # ref 即 URL 中 xxx.supabase.co 的 xxx
supabase secrets set SERVICE_ROLE_KEY=<粘贴 Secret key（sb_secret_... 或 service_role）>
supabase functions deploy log-visit             # config.toml 已关闭其 JWT 校验（匿名埋点必需）
supabase functions deploy upload-image          # 后台本机传图用；桶 sta-web-images 需先建（见下）
```

> 建图床存储桶（后台本机传图需要，一次性）：SQL Editor 执行
> `insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('sta-web-images','sta-web-images', true, 5242880, array['image/png','image/jpeg','image/webp','image/gif']) on conflict (id) do update set public = true;`
> （若只使用「贴图床链接」方式换图，可跳过此步与 upload-image 部署。）

## 三、Vercel 部署

1. Vercel → Add New Project → 导入 GitHub 仓库 `cdqzsta-website`
2. Framework Preset 选 **Other**，其余默认 → Deploy
3. 之后每次 `git push` 自动重新部署
4. 建议回到 Supabase → Auth → URL Configuration：Site URL 填 Vercel 域名（备用，当前登录流程不强依赖）

## 四、后台入口与功能

地址：`https://你的域名/admin/`（本地调试直接打开 `admin/index.html`）

| 模块 | 权限 | 功能 |
|---|---|---|
| 内容管理 | content | 两种编辑方式（见下）；「保存并发布」即时生效；「历史版本」可回滚最近 20 次 |
| 访问日志 | logs | PV/UV 概览、趋势图、明细表（时间/页面/来源/设备/归属地/IP）、路径筛选、CSV 导出 |
| 管理员 | 仅超管 | 创建/删除管理员、分配角色（超管/普通）与权限（内容/日志）、重置密码；不可删除自己或最后一个超管 |

普通管理员的权限由超级管理员逐人勾选（`content`＝改内容、`logs`＝看日志）。

### 内容编辑的两种方式

1. **✦ 可视化编辑（推荐，改字首选）**
   - 内容管理工具栏点「✦ 可视化编辑」→ 整站以真实样式渲染在预览层中
   - **点哪改哪**：文字直接点上去改（同一段文字在页面上出现多处会自动同步）；图片点一下弹「更换图片」框
   - 顶栏实时显示已修改处数；「保存并发布」只提交改动过的字段，其余数据原样保留
   - 「放弃修改」还原为已发布版本；Esc 或「退出」回到表单后台；编辑态下链接不可点击、不产生访问日志
2. **表单编辑器（结构操作）**
   - 按区块折叠卡片展示全部字段，适合**增删条目、调整顺序、批量查看**等结构性修改（如新增一条历程、给部门加标签）
   - 「表单保存发布」与可视化的「保存并发布」走同一条发布链路，均写入历史版本

### 更换图片（图床优先）

两处编辑器换图都走同一个「更换图片」弹窗，**推荐用图床**（加载走专业 CDN，不占网站流量）：

1. **贴图床直链（推荐）**：先把图片上传到任意图床（如 阿里云 OSS、腾讯云 COS、Cloudflare R2、ImgURL、路过图床等），复制得到的**直链**（`https://…/xxx.webp`），粘贴进弹窗输入框 → 下方立即预览 → 加载成功点「使用」
   - 预览失败会提示「防盗链」等可能原因；仍可强行使用（但前台可能显示不出）
   - 选图床时注意选**允许外链**的；国内访问优先选国内 OSS/COS 或 Cloudflare
2. **上传本机图片（备用）**：弹窗里点「选择本机图片上传」（PNG / JPG / WebP / GIF，≤5MB）。经 `upload-image` 边缘函数校验后台会话后写入 Supabase Storage（桶 `sta-web-images`，公开读），返回外链自动填入
3. **仓库路径**：静态素材（logo 等不常变的）直接填 `image_dev/xxx.webp`，随代码一起发版

入口：可视化编辑点页面上的图片；表单编辑器点图片字段旁的「⬆ 上传」。

> 大厂官网的内容后台基本就是这个思路：运营在「所见即所得」视图里改文案，涉及结构增删时再进结构化表单；发布走版本化存储、可灰度可回滚。本项目用 Supabase 版本表实现了其中最实用的部分：即时发布 + 最近 20 次一键回滚。

## 五、验证清单

- [ ] 打开首页 → 后台「访问日志」出现一条 pageview（IP/归属地可能有几秒延迟）
- [ ] 后台改一个标题 → 保存并发布 → 前台刷新生效
- [ ] 「放弃修改」可还原未发布的编辑
- [ ] 新建一个只有 `content` 权限的账号 → 登录后应看不到「访问日志」和「管理员」

## 六、安全说明

- 所有写操作经 Postgres 函数校验会话与权限，并启用 RLS；`sta_web_admins` 表对客户端完全不开放查询
- 会话有效期 7 天；重置密码会使该账号所有会话立即失效
- 访客 IP 与归属地仅存于 `sta_web_visit_logs`，仅 `logs` 权限者可读；对外公开页面不返回任何个人信息
- 若怀疑泄露：Supabase → Settings → API 可轮换密钥（轮换 anon key 需同步更新 `js/config.js`）
