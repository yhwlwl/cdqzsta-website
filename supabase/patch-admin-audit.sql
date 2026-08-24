-- =====================================================
-- STA 官网 · 管理后台审计埋点补丁（登录 / 板块浏览 / 发布留痕）
--
-- 作用：
--   1) 新增审计表 sta_web_admin_audit_logs（谁、做了什么、何时、IP、UA）
--   2) admin_login：登录成功 / 登录失败（含尝试的用户名原文）都落库
--   3) admin_logout：退出登录落库
--   4) on_content_update 触发器：内容「保存并发布」落库（表单与可视化两条路都覆盖）
--   5) 新增 RPC admin_audit：供后台前端上报板块切换等行为
--
-- 记录的动作（action）：
--   login_success   登录成功        （保留永久）
--   login_failed    登录失败        （保留永久）
--   logout          退出登录        （保留永久）
--   content_publish 发布内容        （保留永久）
--   section_view    浏览后台某板块  （高噪音，仅保留 90 天，随机抽样清理）
--
-- 安全说明：
--   · 审计表开启 RLS，只有具备 logs 权限的管理员能读；
--   · 底层写入函数 audit_write 已对 anon/authenticated/Public 收回执行权限，
--     只能由安全定义者函数内部调用，无法被匿名伪造；
--   · 所有埋点均为 best-effort：埋点失败绝不影响登录 / 发布本身。
--
-- 用法：Supabase Dashboard → SQL Editor → New query →
--       粘贴本文件全部内容 → Run。可重复执行，不影响现有数据。
-- =====================================================

-- ---------- 1. 审计表 ----------
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

alter table public.sta_web_admin_audit_logs enable row level security;
grant select on public.sta_web_admin_audit_logs to anon, authenticated;

drop policy if exists al_read on public.sta_web_admin_audit_logs;
create policy al_read on public.sta_web_admin_audit_logs for select using (public.has_perm('logs'));

create index if not exists idx_sta_web_audit_created on public.sta_web_admin_audit_logs (created_at desc);
create index if not exists idx_sta_web_audit_action on public.sta_web_admin_audit_logs (action, created_at desc);

-- ---------- 2. 写入函数 ----------
-- 底层写入（仅限安全定义者函数内部调用）
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

-- 已登录管理员的埋点入口（后台前端 RPC 调用）；无有效会话时静默忽略
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

-- ---------- 3. 登录 / 退出埋点 ----------
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
    -- 审计埋点：登录失败（记录尝试的用户名原文；埋点失败不影响原有报错）
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
  -- 审计埋点：登录成功
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

-- ---------- 4. 内容发布埋点（复用既有触发器，重建函数即可） ----------
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
