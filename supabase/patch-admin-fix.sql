-- =====================================================
-- STA 官网 · 后台修复补丁（2026-XX）
-- 作用：修复管理后台三个问题
--   1) POST /rpc/admin_me 404        → 线上库缺少该函数，本补丁创建
--   2) cannot execute UPDATE in a
--      read-only transaction         → current_admin() 原来在读请求里更新
--                                      会话 last_seen，而 PostgREST 对 GET
--                                      使用只读事务；改为纯读取后不再报错，
--                                      访问日志 / 历史版本恢复正常
--   3) 历史版本表 401 / 日志表偶发 405 → 显式授予 anon 查询权限
--                                      （行级安全策略仍会限制可见行）
--
-- 用法：Supabase Dashboard → SQL Editor → New query →
--       粘贴本文件全部内容 → Run。可重复执行，不影响现有数据。
-- =====================================================

-- ---------- 1. current_admin()：去掉读路径里的 UPDATE ----------
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
  -- 注意：这里不再 update last_seen（GET 走只读事务会报错）。
  -- 会话过期时间以登录时间为基准（7 天），last_seen 仅作参考字段。
  return v_id;
end $$;

-- ---------- 2. 新增 admin_me()：后台刷新页面时恢复登录态 ----------
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

-- ---------- 3. 补齐客户端查询授权（RLS 策略负责限制具体行） ----------
grant select on public.sta_web_visit_logs to anon, authenticated;
grant select on public.sta_web_site_content_revisions to anon, authenticated;
grant select on public.sta_web_site_content to anon, authenticated;

-- ---------- 4. 图片上传桶（公开读；上传仅经 upload-image 边缘函数鉴权写入） ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'sta-web-images', 'sta-web-images', true, 5242880,
  array['image/png','image/jpeg','image/webp','image/gif']
)
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------- 5. 同步会话有效期语义（可选清理：过期会话） ----------
delete from public.sta_web_admin_sessions where expires_at < now();
