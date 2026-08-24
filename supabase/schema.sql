-- =====================================================
-- STA 官网 · 数据库结构（自定义管理员体系，不使用 Supabase Auth）
-- 在 Supabase Dashboard → SQL Editor 中完整执行本文件（可重复执行）
-- =====================================================

create extension if not exists pgcrypto;

-- ---------- 0. 仅删除参数名已变更的旧函数（其余用 CREATE OR REPLACE 即可） ----------
drop function if exists public.admin_login(text, text);
drop function if exists public.admin_list();
drop function if exists public.admin_create(text, text, text, text, text[]);
drop function if exists public.admin_bootstrap(text, text);

-- ---------- 1. 建表 ----------
create table if not exists public.sta_web_admins (
  id            uuid primary key default gen_random_uuid(),
  username      text unique not null,
  password_hash text not null,
  name          text,
  role          text not null default 'admin' check (role in ('super','admin')),
  permissions   text[] not null default '{content}',
  created_at    timestamptz not null default now()
);

do $$ begin
  if exists(select 1 from information_schema.columns
            where table_name = 'sta_web_admins' and column_name = 'email') then
    execute 'alter table public.sta_web_admins rename column email to username';
  end if;
end $$;

create table if not exists public.sta_web_admin_sessions (
  token      text primary key,
  admin_id   uuid not null references public.sta_web_admins(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_seen  timestamptz not null default now(),
  expires_at timestamptz not null
);

create table if not exists public.sta_web_site_content (
  id         text primary key default 'main',
  data       jsonb not null,
  version    int not null default 1,
  updated_by uuid,
  updated_at timestamptz not null default now()
);

create table if not exists public.sta_web_site_content_revisions (
  id         bigint generated always as identity primary key,
  data       jsonb not null,
  saved_by   uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.sta_web_visit_logs (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  kind       text not null default 'pageview',
  visitor_id text not null,
  path       text,
  section    text,
  referrer   text,
  screen     text,
  lang       text,
  ua         text,
  device     text,
  browser    text,
  os         text,
  ip         text,
  country    text,
  region     text,
  city       text
);

-- 管理后台审计日志：登录成功/失败、退出、板块浏览、内容发布等后台操作留痕
create table if not exists public.sta_web_admin_audit_logs (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  admin_id   uuid references public.sta_web_admins(id) on delete set null,
  username   text not null default '?',
  action     text not null,
  detail     jsonb,
  ip         text,
  ua         text
);

-- ---------- 2. 行级安全 ----------
alter table if exists public.sta_web_admins enable row level security;
alter table if exists public.sta_web_admin_sessions enable row level security;
alter table if exists public.sta_web_site_content enable row level security;
alter table if exists public.sta_web_site_content_revisions enable row level security;
alter table if exists public.sta_web_visit_logs enable row level security;
alter table if exists public.sta_web_admin_audit_logs enable row level security;

-- 敏感表对客户端完全封闭（仅安全定义者函数可访问）
revoke all on public.sta_web_admins from anon, authenticated;
revoke all on public.sta_web_admin_sessions from anon, authenticated;

-- 可查询表显式授权：具体能看哪些行仍由上方 RLS 策略限制
-- （visit_logs / audit_logs 需 logs 权限、revisions 需 content 权限，site_content 公开读）
grant select on public.sta_web_visit_logs to anon, authenticated;
grant select on public.sta_web_admin_audit_logs to anon, authenticated;
grant select on public.sta_web_site_content_revisions to anon, authenticated;
grant select on public.sta_web_site_content to anon, authenticated;

-- 图片上传桶：公开读；写入仅经 upload-image 边缘函数（校验后台会话）用 service role 完成，
-- 因此这里不需要任何 storage.objects 写策略
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'sta-web-images', 'sta-web-images', true, 5242880,
  array['image/png','image/jpeg','image/webp','image/gif']
)
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------- 3. 会话 / 权限辅助函数 ----------
create or replace function public.current_admin() returns uuid
language plpgsql stable as $$
declare
  raw text;
  tok text;
  v_id uuid;
begin
  raw := current_setting('request.headers', true);
  if raw is null or raw = '' then return null; end if;
  begin
    tok := (raw::json)->>'x-admin-token';
  exception when others then
    return null;
  end;
  if tok is null or tok = '' then return null; end if;
  select admin_id into v_id from public.sta_web_admin_sessions
    where token = tok and expires_at > now();
  -- 注意：不要在这里 update last_seen —— PostgREST 对 GET 请求使用
  -- 只读事务，读路径里的 UPDATE 会报
  -- "cannot execute UPDATE in a read-only transaction"
  return v_id;
end $$;

create or replace function public.is_super() returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select exists(select 1 from public.sta_web_admins where id = public.current_admin() and role = 'super');
$$;

create or replace function public.has_perm(p text) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select exists(
    select 1 from public.sta_web_admins
    where id = public.current_admin()
      and (role = 'super' or p = any(permissions))
  );
$$;

-- ---------- 3.5 审计埋点 ----------
-- 底层写入（仅限安全定义者函数内部调用：已对 anon/authenticated/Public 收回执行权限）
create or replace function public.audit_write(
  p_admin uuid, p_user text, p_action text, p_detail jsonb default null)
returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  raw text;
  ip text;
  ua text;
begin
  raw := current_setting('request.headers', true);
  if raw is not null and raw <> '' then
    begin
      ip := split_part(coalesce((raw::json)->>'x-forwarded-for', (raw::json)->>'x-real-ip', ''), ',', 1);
      ip := nullif(trim(ip), '');
      ua := left(coalesce((raw::json)->>'user-agent', ''), 400);
    exception when others then
      ip := null; ua := null;
    end;
  end if;
  insert into public.sta_web_admin_audit_logs(admin_id, username, action, detail, ip, ua)
  values (
    p_admin,
    coalesce(nullif(left(btrim(coalesce(p_user, '')), 64), ''), '?'),
    left(p_action, 40),
    p_detail,
    left(ip, 64),
    nullif(ua, '')
  );
  -- 低频清理：只裁剪「浏览板块」这类高噪音记录（保留 90 天），
  -- 登录成败 / 退出 / 发布等安全相关事件永久保留
  if random() < 0.02 then
    delete from public.sta_web_admin_audit_logs
     where action = 'section_view' and created_at < now() - interval '90 days';
  end if;
end $$;

revoke execute on function public.audit_write(uuid, text, text, jsonb) from public, anon, authenticated;

-- 已登录管理员的埋点入口（后台前端 RPC 调用，如板块切换）；无有效会话时静默忽略
create or replace function public.admin_audit(p_action text, p_detail jsonb default null)
returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  v record;
begin
  select id, username into v from public.sta_web_admins where id = public.current_admin();
  if v.id is null then return; end if;
  perform public.audit_write(v.id, v.username, p_action, p_detail);
end $$;

-- ---------- 4. 站点内容策略与触发器 ----------
drop policy if exists sc_read on public.sta_web_site_content;
create policy sc_read on public.sta_web_site_content for select using (true);
drop policy if exists sc_write on public.sta_web_site_content;
create policy sc_write on public.sta_web_site_content for update
  using (public.has_perm('content')) with check (public.has_perm('content'));

drop policy if exists scr_read on public.sta_web_site_content_revisions;
create policy scr_read on public.sta_web_site_content_revisions for select
  using (public.has_perm('content'));

drop policy if exists vl_read on public.sta_web_visit_logs;
create policy vl_read on public.sta_web_visit_logs for select using (public.has_perm('logs'));

drop policy if exists al_read on public.sta_web_admin_audit_logs;
create policy al_read on public.sta_web_admin_audit_logs for select using (public.has_perm('logs'));

create or replace function public.on_content_update()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare v_admin uuid;
begin
  v_admin := public.current_admin();
  new.updated_at := now();
  new.updated_by := v_admin;
  new.version    := old.version + 1;
  insert into public.sta_web_site_content_revisions(data, saved_by) values (old.data, v_admin);
  delete from public.sta_web_site_content_revisions
   where id < (select max(id) - 49 from public.sta_web_site_content_revisions);
  -- 审计埋点：内容发布（表单保存发布 / 可视化保存发布都走这里）
  begin
    perform public.audit_write(
      v_admin,
      (select username from public.sta_web_admins where id = v_admin),
      'content_publish',
      jsonb_build_object('version', new.version)
    );
  exception when others then
    null;  -- 埋点失败不影响发布本身
  end;
  return new;
end $$;

drop trigger if exists trg_content_update on public.sta_web_site_content;
create trigger trg_content_update before update on public.sta_web_site_content
  for each row execute function public.on_content_update();

create index if not exists idx_sta_web_visit_created on public.sta_web_visit_logs (created_at desc);
create index if not exists idx_sta_web_visit_visitor on public.sta_web_visit_logs (visitor_id);
create index if not exists idx_sta_web_audit_created on public.sta_web_admin_audit_logs (created_at desc);
create index if not exists idx_sta_web_audit_action on public.sta_web_admin_audit_logs (action, created_at desc);

-- ---------- 5. 登录相关 RPC ----------
create or replace function public.admin_login(p_user text, "password" text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v record;
  tok text;
begin
  select * into v from public.sta_web_admins
    where lower(username) = lower(admin_login.p_user)
      and password_hash = crypt(admin_login."password", password_hash);
  if v.id is null then
    -- 审计埋点：登录失败（记录尝试的用户名原文，截断到 64 字符；埋点失败不影响原有报错）
    begin
      perform public.audit_write(
        null,
        btrim(admin_login.p_user),
        'login_failed',
        jsonb_build_object('reason', '用户名或密码不正确')
      );
    exception when others then
      null;
    end;
    perform pg_sleep(0.5);
    -- 注意：这里绝不能 raise exception —— 异常会把整个事务回滚，
    -- 连刚写入的审计行也一并回滚。改为正常返回 ok:false，由前端判错。
    return jsonb_build_object('ok', false, 'error', '用户名或密码不正确');
  end if;
  delete from public.sta_web_admin_sessions where admin_id = v.id and expires_at < now();
  tok := encode(gen_random_bytes(32), 'hex');
  insert into public.sta_web_admin_sessions(token, admin_id, expires_at)
    values (tok, v.id, now() + interval '7 days');
  -- 审计埋点：登录成功（埋点失败不影响登录）
  begin
    perform public.audit_write(v.id, v.username, 'login_success', null);
  exception when others then
    null;
  end;
  return jsonb_build_object(
    'ok', true,
    'token', tok,
    'admin', jsonb_build_object(
      'id', v.id, 'username', v.username, 'name', v.name,
      'role', v.role, 'permissions', to_jsonb(v.permissions)
    )
  );
end $$;

create or replace function public.admin_logout() returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  raw text;
  v record;
begin
  raw := current_setting('request.headers', true);
  if raw is not null and raw <> '' then
    select s.admin_id as id, a.username as username into v
      from public.sta_web_admin_sessions s
      join public.sta_web_admins a on a.id = s.admin_id
     where s.token = ((raw::json)->>'x-admin-token');
    delete from public.sta_web_admin_sessions
     where token = ((raw::json)->>'x-admin-token');
    -- 审计埋点：退出登录
    if v.id is not null then
      begin
        perform public.audit_write(v.id, v.username, 'logout', null);
      exception when others then
        null;
      end;
    end if;
  end if;
end $$;

-- 恢复登录态：后台刷新页面时凭 x-admin-token 换取当前管理员信息
create or replace function public.admin_me()
returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare
  v record;
begin
  select id, username, name, role, permissions
    into v from public.sta_web_admins
   where id = public.current_admin();
  if v.id is null then return null; end if;
  return jsonb_build_object(
    'id', v.id, 'username', v.username, 'name', v.name,
    'role', v.role, 'permissions', to_jsonb(v.permissions)
  );
end $$;

create or replace function public.change_my_password("old" text, "new" text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v record;
begin
  if length("new") < 6 then raise exception '新密码至少 6 位'; end if;
  select * into v from public.sta_web_admins where id = public.current_admin();
  if v.id is null then raise exception '未登录'; end if;
  if v.password_hash <> crypt(change_my_password."old", v.password_hash) then
    raise exception '原密码不正确';
  end if;
  update public.sta_web_admins set password_hash = crypt("new", gen_salt('bf')) where id = v.id;
end $$;

-- ---------- 6. 超管管理 RPC ----------
create or replace function public.assert_super() returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.is_super() then raise exception '需要超级管理员权限'; end if;
end $$;

create or replace function public.check_perms(ps text[]) returns boolean
language plpgsql immutable as $$
begin
  if ps is null then return true; end if;
  return (select bool_and(x in ('content','logs')) from unnest(ps) x);
end $$;

create or replace function public.super_count() returns int
language sql stable security definer set search_path = public, extensions as $$
  select count(*) from public.sta_web_admins where role = 'super';
$$;

create or replace function public.admin_list()
returns table(id uuid, username text, name text, role text, permissions text[], created_at timestamptz)
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform public.assert_super();
  return query select a.id, a.username, a.name, a.role, a.permissions, a.created_at
    from public.sta_web_admins a order by a.created_at asc;
end $$;

create or replace function public.admin_create(
  p_user text, p_password text, p_name text default null,
  p_role text default 'admin', p_permissions text[] default '{content}')
returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform public.assert_super();
  if p_role not in ('super','admin') then raise exception '角色无效'; end if;
  if not public.check_perms(p_permissions) then raise exception '权限值无效（仅支持 content/logs）'; end if;
  if length(p_password) < 6 then raise exception '密码至少 6 位'; end if;
  if length(p_user) < 2 then raise exception '用户名至少 2 个字符'; end if;
  begin
    insert into public.sta_web_admins(username, password_hash, name, role, permissions)
    values (lower(p_user), crypt(p_password, gen_salt('bf')), p_name, p_role, p_permissions);
  exception when unique_violation then
    raise exception '该用户名已存在';
  end;
end $$;

create or replace function public.admin_update(
  a_id uuid, p_name text default null, p_role text default null, p_permissions text[] default null)
returns void
language plpgsql security definer set search_path = public, extensions as $$
declare tgt record;
begin
  perform public.assert_super();
  if p_role is not null and p_role not in ('super','admin') then raise exception '角色无效'; end if;
  if not public.check_perms(p_permissions) then raise exception '权限值无效'; end if;
  select * into tgt from public.sta_web_admins where id = a_id;
  if tgt.id is null then raise exception '管理员不存在'; end if;
  if tgt.role = 'super'
     and p_role is not null and p_role <> 'super'
     and public.super_count() <= 1 then
    raise exception '不能降级最后一个超级管理员';
  end if;
  update public.sta_web_admins set
    name        = coalesce(p_name, name),
    role        = coalesce(p_role, role),
    permissions = coalesce(p_permissions, permissions)
  where id = a_id;
end $$;

create or replace function public.admin_reset_password(a_id uuid, new_password text)
returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform public.assert_super();
  if length(new_password) < 6 then raise exception '密码至少 6 位'; end if;
  update public.sta_web_admins set password_hash = crypt(new_password, gen_salt('bf')) where id = a_id;
  delete from public.sta_web_admin_sessions where admin_id = a_id;
end $$;

create or replace function public.admin_delete(a_id uuid)
returns void
language plpgsql security definer set search_path = public, extensions as $$
declare tgt record;
begin
  perform public.assert_super();
  if a_id = public.current_admin() then raise exception '不能删除自己的账号'; end if;
  select * into tgt from public.sta_web_admins where id = a_id;
  if tgt.id is null then raise exception '管理员不存在'; end if;
  if tgt.role = 'super' and public.super_count() <= 1 then
    raise exception '不能删除最后一个超级管理员';
  end if;
  delete from public.sta_web_admins where id = a_id;
end $$;

-- 首个超级管理员引导（仅当系统中没有任何管理员时可用）
create or replace function public.admin_bootstrap(p_user text, p_password text)
returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if (select count(*) from public.sta_web_admins) > 0 then
    raise exception '系统已有管理员，请登录后台添加';
  end if;
  if length(p_password) < 6 then raise exception '密码至少 6 位'; end if;
  if length(p_user) < 2 then raise exception '用户名至少 2 个字符'; end if;
  insert into public.sta_web_admins(username, password_hash, role, permissions)
  values (lower(p_user), crypt(p_password, gen_salt('bf')), 'super', '{content,logs}');
end $$;

-- ---------- 7. 种子数据：当前网站内容 ----------
delete from public.sta_web_site_content where id = 'main';
insert into public.sta_web_site_content (id, data) values ('main', $json${"meta":{"title":"STA · 成都七中科学技术协会","description":"成都七中科学技术协会（STA）官方网站 —— 四川省首个高中生科技类学生组织，编辑校级杂志《未来梦》，承办科技活动月、未来梦大讲坛等校级活动。"},"brand":{"nameCN":"成都七中科学技术协会","nameEN":"Science & Technology Association of Chengdu No.7 High School","abbr":"科协","shortEN":"STA","type":"校级科技类高中生学生组织","magazine":"《未来梦》","founder":"周涛（电子科技大学教授）","est":"1999","coreValues":"自由 · 公平 · 勇气","logo":"image_dev/logo-sta.jpg"},"nav":{"links":[{"label":"首页","href":"#home"},{"label":"关于","href":"#about"},{"label":"历程","href":"#history"},{"label":"架构","href":"#org"},{"label":"部门","href":"#depts"},{"label":"活动","href":"#events"},{"label":"声音","href":"#voices"},{"label":"招新","href":"#join"}],"ctaLabel":"加入我们"},"hero":{"eyebrow":"CHENGDU NO.7 HIGH SCHOOL · SCIENCE & TECHNOLOGY ASSOCIATION · EST.1999","line1":"长空逐月","line2":"星河筑梦","sub":"这里是成都七中学生科学技术协会。自 1999 年起，一群热爱科学的少年在这里仰望星空、脚踏实地。","ctas":[{"label":"了解科协","href":"#about","icon":"down"},{"label":"立即加入","href":"#join","icon":"right"}],"badges":["自由 FREEDOM","公平 EQUALITY","勇气 COURAGE","《未来梦》MAGAZINE"],"ringText":"SCIENCE · TECHNOLOGY · DREAM · STA · SINCE 1999 · ","scrollCue":"SCROLL","scrollNote":"向下滚动，走进科协的世界"},"marquee1":["科技创新","《未来梦》","科技活动月","未来梦大讲坛","校际交流","一到夏天我要去科协"],"about":{"eyebrow":"01 · ABOUT US","ghost":"ABOUT","title":"关于科协","lead":"成都七中四大学生组织之一，四川省首个高中生科技类学生组织。","descHTML":"成都七中科学技术协会（STA）成立于1999年，是成都七中四大学生组织之一，也是四川省首个高中生科技类学生组织。<br>主要工作包括编辑校级杂志《未来梦》、承办科技活动月、未来梦大讲坛等校级活动，并开展校际科技交流。<br>现设编辑部、新媒体部、活动部、宣传部、巨疯实验部、网络部六大部门，形成以「自由、公平、勇气」为核心的发展体系。","art":"image_dev/161AFC8A791CC7451D9B43D2FF67D306.png","facts":[{"k":"组织类型","v":"校级科技类高中生学生组织"},{"k":"创立时间","v":"1999 年"},{"k":"创始人","v":"周涛（电子科技大学教授）"},{"k":"核心价值","v":"自由 · 公平 · 勇气"},{"k":"会刊","v":"《未来梦》"}],"stats":[{"num":1999,"suffix":"","label":"协会创立年份"},{"num":6,"suffix":"大","label":"核心部门"},{"num":42,"suffix":"期","label":"《未来梦》期数"},{"num":27,"suffix":"载","label":"科创传承"}]},"history":{"eyebrow":"02 · HISTORY","ghost":"HISTORY","title":"发展历程","desc":"从学生社团到校级学生组织，二十余载薪火相传。","items":[{"year":"1999","text":"周涛教授建立科协，初为学生社团，负责科技创新管理与竞赛事务。"},{"year":"2000","text":"《未来梦》杂志创刊，成立编辑部前身。"},{"year":"2005","text":"科协由社团转型为学生组织，增设科技部、科创部、编辑部。"},{"year":"2011","text":"《未来梦》出版第一本全彩杂志，主席张晟阳。"},{"year":"2012","text":"网络部改制为技术部，杂志内容拓展为科普与校园生活结合，主席陈治宇。"},{"year":"2016","text":"科协成立十七周年，部门调整为活动部、宣传部、编辑部、技术部。"},{"year":"2026","text":"故事仍在续写。期待更多热爱科学的少年在此相遇，一起编辑下一本《未来梦》、办下一场科技活动月，把自由、公平与勇气写进更远的星河。"}]},"org":{"eyebrow":"03 · ORGANIZATION","ghost":"TEAM","title":"组织架构","desc":"","groups":[{"name":"主席层","motto":"心之所向，行之所往","leader":{"title":"主 席","names":["张力源（2025级14班）"]},"members":{"title":"副主席","names":["赵思琪（2025级6班）","袁欣航（2025级7班）","白瑾瑜（2025级13班）"]}},{"name":"运营委员会","motto":"多维运行，携手共进","leader":{"title":"主 任","names":["张力源（2025级14班）"]},"members":{"title":"委 员","names":["赵思琪（2025级6班）","王茗涵（2025级7班）","李宇皓（2025级13班）"]}},{"name":"财务委员会","motto":"精打细算，厉行节约","leader":{"title":"主 任","names":["张洋铭（2025级14班）"]},"members":{"title":"委 员","names":["袁欣航（2025级7班）","蒋子羽（2025级7班）","王梓骁（2025级12班）","余成屹（2025级14班）"]}}]},"depts":{"eyebrow":"04 · OUR TEAMS","ghost":"TEAMS","title":"六大部门","desc":"六大部门，六种热爱。悬停每一行查看部门宣言，找到你的归属。","items":[{"name":"编辑部","en":"EDITORIAL","art":"g1","motto":"以己逐梦，共赴未来","desc":"编辑出版校级杂志《未来梦》，记录七中人的科学与生活。","tags":["杂志","写作","排版"],"heads":[{"role":"部长","names":["张 壹（2025级13班）","周子然（2025级13班）"]}]},{"name":"新媒体部","en":"NEW MEDIA","art":"g2","motto":"先锋创客，锐取新机","desc":"运营科协新媒体平台，让每一次灵感被看见。","tags":["运营","摄影","传播"],"heads":[{"role":"部长","names":["李荣耀（2025级6班）","陈韵菲（2025级14班）"]}]},{"name":"活动部","en":"EVENTS","art":"g3","motto":"天马行空，大显身手","desc":"承办科技活动月、未来梦大讲坛等校级活动的操盘手。","tags":["策划","执行","统筹"],"heads":[{"role":"部长","names":["王可昕（2025级6班）","王茗涵（2025级7班）"]}]},{"name":"宣传部","en":"PUBLICITY","art":"g4","motto":"妙笔生花，巧绘初夏","desc":"海报设计与宣传物料制作，妙笔与画笔齐飞。","tags":["设计","海报","文案"],"heads":[{"role":"代部长","names":["赵思琪（2025级6班）","李宇皓（2025级13班）"]}]},{"name":"巨疯实验部","en":"MAD LAB","art":"g5","motto":"实验铸梦，巨浪扬帆","desc":"把大胆的想法搬进实验室，疯一次又何妨。","tags":["实验","科创","探究"],"heads":[{"role":"部长","names":["方子煜（2025级10班）","姜却非（2025级14班）"]}]},{"name":"网络部","en":"NETWORK","art":"g6","motto":"人机智联，井井有条","desc":"开发与维护科协网站及信息化工具，本站出品方。","tags":["开发","运维","技术"],"heads":[{"role":"部长","names":["张家瑞（2025级12班）","张洋铭（2025级14班）"]}]}]},"events":{"eyebrow":"05 · RECENT EVENTS","ghost":"EVENTS","title":"近期活动","desc":"从夏令营到《未来梦》新刊，科协的脚步从未停歇。","moreLabel":"更多活动敬请期待","moreHref":"#join","items":[{"date":"2026.07.14","art":"","img":"image_dev/F149099CABE84B5E6111F7D1E95FE4E3.png","title":"「同赴星海」夏令营招新盛况","desc":"林荫曦园，我们于此同赴星海；高山海洋，我们于此共枕长风。皆是我们奔赴自由与热爱的最好证明——一到夏天，我要去科协！","tags":["招新","夏令营"]},{"date":"2026.06","art":"","img":"image_dev/gaokao.jpg","title":"向光翱翔，一览长天","desc":"你拥有身后星光点点，也拥有眼前气象万千。STA 祝 2026 年高考考生：向光翱翔，一览长天，高考加油！","tags":["高考","祝福"]},{"date":"2026.05.07","art":"","img":"image_dev/03E1BFB71564E18844783D43415814CC.png","title":"《未来梦》第 42 期正式发布","desc":"未来梦试读交流会上，第 42 期《未来梦》正式发布，科幻增刊《启明》同步推出。此刻，便请抬头仰望星空，一同探寻宇宙的终极答案。","tags":["《未来梦》","《启明》"]},{"date":"校运会","art":"","img":"image_dev/mag41.jfif","title":"运动会 & 第 41 期发布","desc":"《未来梦》第 41 期在运动会上正式与大家见面，开启一场心智溯源之旅；素描本、便利贴、书签等文创同步推出。","tags":["杂志","文创"]}]},"voices":{"eyebrow":"06 · VOICES","ghost":"VOICES","title":"科协的声音","desc":"一些被记住的话，来自历任主席与每一位 STAers。","quotes":[{"text":"一到夏天我要去科协。","author":"范伟艺 · 主席"},{"text":"生是科协人，死是科协的尸体，就算烧成灰，也要用科协的扫把扫。","author":"张晟阳 · 主席"},{"text":"Long live STA！","author":"陈治宇 · 主席"},{"text":"风雨共济，从未离开。","author":"STAers"},{"text":"我们要一直爱着七中，爱着科协。","author":"STAers"}]},"join":{"eyebrow":"07 · JOIN US · STA 2026 招新","tagline":"—— 长空逐月，星河筑梦 ——","title":"一到夏天我要去科协","desc":"无需经验，热爱即入场券。填写报名表或直接加入招新群，九月，我们在科协等你。","facts":[{"k":"招新时间","v":"2026 年 9 月初"},{"k":"招新对象","v":"全校各年级学生"},{"k":"报名要求","v":"对科技创新有热情，愿意学习新知识，有团队合作精神"}],"steps":[{"num":"STEP 01","title":"提交报名","desc":"领取报名表并填写，选择你的意向部门。"},{"num":"STEP 02","title":"部门面试","desc":"与部长面对面聊聊兴趣与规划，轻松氛围，不用紧张。"},{"num":"STEP 03","title":"正式加入","desc":"恭喜你，成为了正式的STAer，你与sta的故事从这里开始"}],"cardTitle":"扫码加入招新群","qqLabel":"QQ 招新群号","qqNumber":"910 674 276","copyText":"910674276","copyLabel":"复制群号","qrImg":"image_dev/A06247CDED94482DE9996A624AF23742.png","qrNote":"二维码占位 · 请替换","note":"入群请备注「招新 + 姓名 + 班级」"},"marquee2":["JOIN US","招新进行时","LONG LIVE STA","WE ARE STAers","KEEP ON THINKING","保持热爱"],"footer":{"bigText":"STA·科协","slogans":["—— 自由 · 平等 · 勇气 ——","—— Do not forget to keep on thinking ——","—— We are STAers ——"],"cols":[{"h":"探索","links":[{"t":"关于我们","href":"#about"},{"t":"发展历程","href":"#history"},{"t":"组织架构","href":"#org"},{"t":"六大部门","href":"#depts"}]},{"h":"参与","links":[{"t":"近期活动","href":"#events"},{"t":"STA 2026 招新","href":"#join"},{"t":"加入招新群","href":"#join"},{"t":"科协的声音","href":"#voices"}]},{"h":"联系","links":[{"t":"邮箱 sta@example.edu.cn（占位）","href":"mailto:sta@example.edu.cn"},{"t":"成都七中（地址占位）","href":"#home"},{"t":"工作日 12:00 – 22:00","href":"#home"}]}],"copyright":"© 2026 成都七中科学技术协会 STA · Science & Technology Association of Chengdu No.7 High School","legal":"本站内容均由成都七中科学技术协会原创或经授权发布，禁止任何形式的转载、摘编等侵权行为。若发现有任何侵权行为，请及时与我们联系，我们将依法追究其法律责任。","version":"内部测试 v0.1.1_alpha · 最后更新 2026-08-22","credit":"本网站由 25 级网络部 搭建运营"}}$json$::jsonb);
