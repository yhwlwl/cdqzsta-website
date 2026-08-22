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

-- ---------- 2. 行级安全 ----------
alter table if exists public.sta_web_admins enable row level security;
alter table if exists public.sta_web_admin_sessions enable row level security;
alter table if exists public.sta_web_site_content enable row level security;
alter table if exists public.sta_web_site_content_revisions enable row level security;
alter table if exists public.sta_web_visit_logs enable row level security;

-- 敏感表对客户端完全封闭（仅安全定义者函数可访问）
revoke all on public.sta_web_admins from anon, authenticated;
revoke all on public.sta_web_admin_sessions from anon, authenticated;
revoke all on public.sta_web_site_content_revisions from anon, authenticated;

-- ---------- 3. 会话 / 权限辅助函数 ----------
create or replace function public.current_admin() returns uuid
language plpgsql volatile as $$
declare
  raw text;
  tok text;
  v_id uuid;
begin
  raw := current_setting('request.headers', true);
  if raw is null or raw = '' then return null; end if;
  tok := (raw::json)->>'x-admin-token';
  if tok is null then return null; end if;
  select admin_id into v_id from public.sta_web_admin_sessions
    where token = tok and expires_at > now();
  if v_id is not null then
    update public.sta_web_admin_sessions set last_seen = now() where token = tok;
  end if;
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
  return new;
end $$;

drop trigger if exists trg_content_update on public.sta_web_site_content;
create trigger trg_content_update before update on public.sta_web_site_content
  for each row execute function public.on_content_update();

create index if not exists idx_sta_web_visit_created on public.sta_web_visit_logs (created_at desc);
create index if not exists idx_sta_web_visit_visitor on public.sta_web_visit_logs (visitor_id);

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
    perform pg_sleep(0.5);
    raise exception '用户名或密码不正确';
  end if;
  delete from public.sta_web_admin_sessions where admin_id = v.id and expires_at < now();
  tok := encode(gen_random_bytes(32), 'hex');
  insert into public.sta_web_admin_sessions(token, admin_id, expires_at)
    values (tok, v.id, now() + interval '7 days');
  return jsonb_build_object(
    'token', tok,
    'admin', jsonb_build_object(
      'id', v.id, 'username', v.username, 'name', v.name,
      'role', v.role, 'permissions', to_jsonb(v.permissions)
    )
  );
end $$;

create or replace function public.admin_logout() returns void
language plpgsql security definer set search_path = public, extensions as $$
declare raw text;
begin
  raw := current_setting('request.headers', true);
  if raw is not null and raw <> '' then
    delete from public.sta_web_admin_sessions
     where token = ((raw::json)->>'x-admin-token');
  end if;
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
insert into public.sta_web_site_content (id, data) values ('main', '__CONTENT_JSON__'::jsonb);
