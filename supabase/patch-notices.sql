-- =====================================================
-- STA 官网 · 通知公告数据与接口补丁（幂等，可重复执行）
--
-- 作用：
--   1) 新增公告主表 sta_web_notices（含正文受控内容块、多图、置顶、状态、时间）
--   2) 新增公告版本表 sta_web_notice_revisions（历史版本 + 恢复）
--   3) 行级安全：公开用户仅能读到「已发布且未过期」的公告；
--      草稿 / 定时 / 撤回 / 归档一律不出现在公开读取中
--   4) 公开只读 RPC：首页聚合、归档分页列表、按 id / slug 取单条
--   5) 后台 RPC：带版本条件的保存、发布/定时/撤回/归档、复制、删除、版本历史与恢复
--   6) 权限新增 'notices'（编辑+发布公告），并写审计日志
--
-- 安全说明：
--   · 公告表对 anon/authenticated 收回 INSERT/UPDATE/DELETE，只能经安全定义者 RPC 写入；
--   · 公开读取函数为 security definer，内部显式过滤 live 状态，不泄露草稿/撤回内容；
--   · 后台写入函数校验 has_perm('notices') 或 has_perm('content')，并做版本冲突检测；
--   · 发布 / 撤回 / 归档 / 删除 / 保存 均写入审计日志。
--
-- 用法：supabase db query --linked --file supabase/patch-notices.sql
-- =====================================================

-- ---------- 1. 公告主表 ----------
create table if not exists public.sta_web_notices (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,
  title         text not null,
  summary       text,
  category      text not null default '通知',
  department    text,
  cover         text,
  content       jsonb not null default '[]'::jsonb,
  images        jsonb not null default '[]'::jsonb,
  detail_link   text,
  action_label  text,
  action_url    text,
  is_pinned     boolean not null default false,
  sort_weight   int not null default 0,
  status        text not null default 'draft'
                check (status in ('draft','scheduled','published','withdrawn','archived')),
  publish_at    timestamptz,
  schedule_at   timestamptz,
  deadline_at   timestamptz,
  created_by    uuid,
  updated_by    uuid,
  version       int not null default 1,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- 公告版本历史（保存时记录旧数据，供回滚）
create table if not exists public.sta_web_notice_revisions (
  id          bigint generated always as identity primary key,
  notice_id   uuid not null references public.sta_web_notices(id) on delete cascade,
  data        jsonb not null,
  saved_by    uuid,
  created_at  timestamptz not null default now()
);

-- ---------- 2. 索引 ----------
create index if not exists idx_sta_web_notices_status   on public.sta_web_notices (status);
create index if not exists idx_sta_web_notices_category on public.sta_web_notices (category);
create index if not exists idx_sta_web_notices_publish  on public.sta_web_notices (publish_at desc);
create index if not exists idx_sta_web_notices_pin      on public.sta_web_notices (is_pinned desc, publish_at desc);
create index if not exists idx_sta_web_notice_rev       on public.sta_web_notice_revisions (notice_id, id desc);

-- ---------- 3. 行级安全与授权 ----------
alter table public.sta_web_notices enable row level security;
alter table public.sta_web_notice_revisions enable row level security;

-- 公开读取：仅「已发布」且「发布时间已到」且「未过期」
drop policy if exists n_read_public on public.sta_web_notices;
create policy n_read_public on public.sta_web_notices for select
  using (
    status = 'published'
    and (publish_at is null or publish_at <= now())
    and (deadline_at is null or deadline_at > now())
  );

-- 后台读取：具备 notices / content 权限的管理员可读全部
drop policy if exists n_read_admin on public.sta_web_notices;
create policy n_read_admin on public.sta_web_notices for select
  using (public.has_perm('notices') or public.has_perm('content'));

-- 版本表仅后台可读
drop policy if exists nr_read_admin on public.sta_web_notice_revisions;
create policy nr_read_admin on public.sta_web_notice_revisions for select
  using (public.has_perm('notices') or public.has_perm('content'));

-- 读写授权：公开只读（受 RLS 过滤）；写操作仅允许经 RPC（禁止直接写表）
grant select on public.sta_web_notices to anon, authenticated;
grant select on public.sta_web_notice_revisions to anon, authenticated;
revoke insert, update, delete on public.sta_web_notices from anon, authenticated;
revoke insert, update, delete on public.sta_web_notice_revisions from anon, authenticated;

-- ---------- 4. 权限补充：新增 notices ----------
create or replace function public.check_perms(ps text[]) returns boolean
language plpgsql immutable as $$
begin
  if ps is null then return true; end if;
  return (select bool_and(x in ('content','logs','notices')) from unnest(ps) x);
end $$;

create or replace function public.has_notice_perm() returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select public.has_perm('notices') or public.has_perm('content');
$$;

-- ---------- 5. 辅助函数 ----------
-- jsonb 取时间（空串/缺失 -> null）
create or replace function public.jsonb_ts(j jsonb, k text) returns timestamptz
language sql immutable as $$
  select case when j ? k and nullif(j->>k, '') is not null
              then (j->>k)::timestamptz else null end;
$$;

-- 公开可读判断（内部使用）：已发布，或定时发布已到点；且发布时间已到、未过期
create or replace function public.notice_is_live(
  p_status text, p_publish_at timestamptz, p_schedule_at timestamptz, p_deadline_at timestamptz) returns boolean
language sql immutable as $$
  select (p_status = 'published'
          or (p_status = 'scheduled' and p_schedule_at is not null and p_schedule_at <= now()))
    and (p_publish_at is null or p_publish_at <= now())
    and (p_deadline_at is null or p_deadline_at > now());
$$;

-- 列表项投影（首页 / 归档用，不含正文内容块，保证轻量）
create or replace function public.notice_card(n public.sta_web_notices) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'id', n.id,
    'slug', n.slug,
    'title', n.title,
    'summary', n.summary,
    'category', n.category,
    'department', n.department,
    'cover', n.cover,
    'is_pinned', n.is_pinned,
    'sort_weight', n.sort_weight,
    'publish_at', n.publish_at,
    'deadline_at', n.deadline_at,
    'action_label', n.action_label,
    'action_url', n.action_url,
    'detail_link', n.detail_link,
    'status', n.status
  );
$$;

-- 完整投影（详情 / 编辑用，含正文与多图）
create or replace function public.notice_full(n public.sta_web_notices) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'id', n.id,
    'slug', n.slug,
    'title', n.title,
    'summary', n.summary,
    'category', n.category,
    'department', n.department,
    'cover', n.cover,
    'content', n.content,
    'images', n.images,
    'detail_link', n.detail_link,
    'action_label', n.action_label,
    'action_url', n.action_url,
    'is_pinned', n.is_pinned,
    'sort_weight', n.sort_weight,
    'status', n.status,
    'publish_at', n.publish_at,
    'schedule_at', n.schedule_at,
    'deadline_at', n.deadline_at,
    'version', n.version,
    'created_at', n.created_at,
    'updated_at', n.updated_at
  );
$$;

-- ---------- 6. 公开只读 RPC ----------
-- 首页聚合：1 条重点（置顶优先，否则最新）+ 3 条最新；可按分类过滤
drop function if exists public.notice_homepage();
create or replace function public.notice_homepage(p_category text default null)
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
  declare
    v_featured public.sta_web_notices;
    v_latest jsonb;
    v_total int;
  begin
    select * into v_featured from public.sta_web_notices n
     where public.notice_is_live(n.status, n.publish_at, n.schedule_at, n.deadline_at)
       and (p_category is null or p_category = '' or n.category = p_category)
     order by n.is_pinned desc, n.sort_weight desc,
              coalesce(n.publish_at, n.created_at) desc
     limit 1;
    select coalesce(jsonb_agg(public.notice_card(n)), '[]'::jsonb) into v_latest
      from (
        select n.* from public.sta_web_notices n
         where public.notice_is_live(n.status, n.publish_at, n.schedule_at, n.deadline_at)
           and (p_category is null or p_category = '' or n.category = p_category)
           and (v_featured.id is null or n.id <> v_featured.id)
         order by n.is_pinned desc, n.sort_weight desc,
                  coalesce(n.publish_at, n.created_at) desc
         limit 3
      ) n;
    select count(*) into v_total from public.sta_web_notices n
     where public.notice_is_live(n.status, n.publish_at, n.schedule_at, n.deadline_at)
       and (p_category is null or p_category = '' or n.category = p_category);
    return jsonb_build_object(
      'featured', case when v_featured.id is null then null else public.notice_card(v_featured) end,
      'latest', v_latest,
      'total', v_total
    );
  end;
$$;

-- 归档页：服务端分页 + 分类筛选 + 关键词搜索
create or replace function public.notice_list_published(
  p_page int default 1,
  p_per_page int default 12,
  p_category text default null,
  p_q text default null)
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
  declare
    v_per int := least(greatest(coalesce(p_per_page, 12), 1), 100);
    v_page int := greatest(coalesce(p_page, 1), 1);
    v_off int := (v_page - 1) * v_per;
    v_total int;
    v_items jsonb;
  begin
    select count(*) into v_total from public.sta_web_notices n
     where public.notice_is_live(n.status, n.publish_at, n.schedule_at, n.deadline_at)
       and (p_category is null or p_category = '' or n.category = p_category)
       and (p_q is null or p_q = '' or n.title ilike '%' || p_q || '%'
            or coalesce(n.summary,'') ilike '%' || p_q || '%');
    select coalesce(jsonb_agg(public.notice_card(n)), '[]'::jsonb) into v_items
      from (
        select n.* from public.sta_web_notices n
         where public.notice_is_live(n.status, n.publish_at, n.schedule_at, n.deadline_at)
           and (p_category is null or p_category = '' or n.category = p_category)
           and (p_q is null or p_q = '' or n.title ilike '%' || p_q || '%'
                or coalesce(n.summary,'') ilike '%' || p_q || '%')
         order by n.is_pinned desc, n.sort_weight desc,
                  coalesce(n.publish_at, n.created_at) desc
         limit v_per offset v_off
      ) n;
    return jsonb_build_object(
      'items', v_items,
      'total', v_total,
      'page', v_page,
      'per_page', v_per,
      'pages', greatest(ceil(v_total::numeric / v_per), 1)::int
    );
  end;
$$;

-- 按 id 取单条（仅公开可读的）
create or replace function public.notice_get(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
  declare v public.sta_web_notices;
  begin
    select * into v from public.sta_web_notices n
     where n.id = p_id
       and public.notice_is_live(n.status, n.publish_at, n.schedule_at, n.deadline_at);
    if v.id is null then return null; end if;
    return public.notice_full(v);
  end;
$$;

-- 按 slug 取单条
create or replace function public.notice_get_by_slug(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
  declare v public.sta_web_notices;
  begin
    select * into v from public.sta_web_notices n
     where n.slug = p_slug
       and public.notice_is_live(n.status, n.publish_at, n.schedule_at, n.deadline_at);
    if v.id is null then return null; end if;
    return public.notice_full(v);
  end;
$$;

-- 公开可读的分类列表（含数量，供分类筛选标签）
create or replace function public.notice_categories()
returns jsonb language sql stable security definer set search_path = public, extensions as $$
  select coalesce(jsonb_agg(jsonb_build_object('category', x.category, 'count', x.count)), '[]'::jsonb)
    from (
      select n.category, count(*) as count from public.sta_web_notices n
       where public.notice_is_live(n.status, n.publish_at, n.schedule_at, n.deadline_at)
       group by n.category order by n.category
    ) x;
$$;

grant execute on function public.notice_homepage(text) to anon, authenticated;
grant execute on function public.notice_list_published(int, int, text, text) to anon, authenticated;
grant execute on function public.notice_get(uuid) to anon, authenticated;
grant execute on function public.notice_get_by_slug(text) to anon, authenticated;
grant execute on function public.notice_categories() to anon, authenticated;

-- ---------- 7. 后台 RPC ----------
-- 校验是否有公告权限（否则抛错）
create or replace function public.assert_notice_perm() returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.has_notice_perm() then raise exception '需要公告管理权限'; end if;
end $$;

-- slug 生成：为空时用时间戳 + 随机
create or replace function public.notice_slug(p_title text, p_slug text) returns text
language sql immutable as $$
  select coalesce(nullif(btrim(p_slug), ''), 'n-' || to_char(now(), 'YYYYMMDD') || '-' || substring(md5(random()::text), 1, 8));
$$;

-- 后台列表：全部状态（含过期推导），分页 + 筛选 + 排序
create or replace function public.notice_list_admin(
  p_page int default 1,
  p_per_page int default 20,
  p_category text default null,
  p_status text default null,
  p_q text default null,
  p_pinned boolean default null,
  p_sort text default 'publish_at',
  p_dir text default 'desc')
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
  declare
    v_per int := least(greatest(coalesce(p_per_page, 20), 1), 100);
    v_page int := greatest(coalesce(p_page, 1), 1);
    v_off int := (v_page - 1) * v_per;
    v_total int;
    v_items jsonb;
    v_order text;
  begin
    perform public.assert_notice_perm();
    v_order := case
      when p_sort = 'publish_at' then 'coalesce(n.publish_at, n.created_at) ' || case when p_dir='asc' then 'asc' else 'desc' end
      when p_sort = 'deadline_at' then 'n.deadline_at ' || case when p_dir='asc' then 'asc' else 'desc' end
      when p_sort = 'sort_weight' then 'n.sort_weight ' || case when p_dir='asc' then 'asc' else 'desc' end
      when p_sort = 'updated_at' then 'n.updated_at ' || case when p_dir='asc' then 'asc' else 'desc' end
      when p_sort = 'status' then 'n.status asc'
      else 'n.is_pinned desc, coalesce(n.publish_at, n.created_at) desc'
    end;
    select count(*) into v_total from public.sta_web_notices n
     where (p_category is null or p_category = '' or n.category = p_category)
       and (p_status is null or p_status = '' or n.status = p_status)
       and (p_pinned is null or n.is_pinned = p_pinned)
       and (p_q is null or p_q = '' or n.title ilike '%' || p_q || '%'
            or coalesce(n.summary,'') ilike '%' || p_q || '%');
    execute format(
      'select coalesce(jsonb_agg(x), ''[]''::jsonb) from (' ||
      '  select n.* from public.sta_web_notices n' ||
      '  where (($1::text is null or $1 = '''' or n.category = $1)' ||
      '    and ($2::text is null or $2 = '''' or n.status = $2)' ||
      '    and ($3::boolean is null or n.is_pinned = $3)' ||
      '    and ($4::text is null or $4 = '''' or n.title ilike ''%%'' || $4 || ''%%'' or coalesce(n.summary,'''') ilike ''%%'' || $4 || ''%%''))' ||
      '  order by %s' ||
      '  limit $5 offset $6' ||
      ') x', v_order)
      into v_items
      using p_category, p_status, p_pinned, p_q, v_per, v_off;
    return jsonb_build_object(
      'items', coalesce(v_items, '[]'::jsonb),
      'total', v_total,
      'page', v_page,
      'per_page', v_per,
      'pages', greatest(ceil(v_total::numeric / v_per), 1)::int
    );
  end;
$$;

-- 后台取单条（含正文与多图，含过期推导状态）
create or replace function public.notice_get_admin(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
  declare v public.sta_web_notices;
  begin
    perform public.assert_notice_perm();
    select * into v from public.sta_web_notices where id = p_id;
    if v.id is null then return null; end if;
    return public.notice_full(v) ||
      jsonb_build_object('effective_status',
        case when v.status = 'published' and v.deadline_at is not null and v.deadline_at <= now()
             then 'expired' else v.status end);
  end;
$$;

-- 保存（创建 / 更新，带版本冲突检测）
create or replace function public.notice_save(
  p_id uuid default null,
  p_expected_version int default null,
  p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
  declare
    v_admin uuid := public.current_admin();
    v_slug text;
    v_id uuid;
    v_old public.sta_web_notices;
  begin
    perform public.assert_notice_perm();
    if p_data is null or coalesce(p_data->>'title','') = '' then
      raise exception '标题不能为空';
    end if;
    v_slug := public.notice_slug(p_data->>'title', p_data->>'slug');

    if p_id is null then
      insert into public.sta_web_notices (
        slug, title, summary, category, department, cover, content, images,
        detail_link, action_label, action_url, is_pinned, sort_weight,
        status, publish_at, schedule_at, deadline_at, created_by, updated_by, version)
      values (
        v_slug,
        p_data->>'title',
        p_data->>'summary',
        coalesce(p_data->>'category','通知'),
        p_data->>'department',
        p_data->>'cover',
        coalesce(p_data->'content','[]'::jsonb),
        coalesce(p_data->'images','[]'::jsonb),
        p_data->>'detail_link',
        p_data->>'action_label',
        p_data->>'action_url',
        coalesce((p_data->>'is_pinned')::boolean, false),
        coalesce((p_data->>'sort_weight')::int, 0),
        coalesce(p_data->>'status','draft'),
        public.jsonb_ts(p_data,'publish_at'),
        public.jsonb_ts(p_data,'schedule_at'),
        public.jsonb_ts(p_data,'deadline_at'),
        v_admin, v_admin, 1)
      returning id into v_id;
      perform public.admin_audit('notice_save', jsonb_build_object('notice_id', v_id, 'action', 'create'));
      return jsonb_build_object('ok', true, 'id', v_id, 'version', 1);
    end if;

    select * into v_old from public.sta_web_notices where id = p_id;
    if v_old.id is null then raise exception '公告不存在'; end if;
    if p_expected_version is not null and v_old.version <> p_expected_version then
      raise exception '该公告已被其他人修改（当前 v%），请刷新后重试', v_old.version;
    end if;

    insert into public.sta_web_notice_revisions(notice_id, data, saved_by)
      values (p_id, public.notice_full(v_old), v_admin);
    delete from public.sta_web_notice_revisions
     where notice_id = p_id and id < (select max(id) - 49 from public.sta_web_notice_revisions where notice_id = p_id);

    update public.sta_web_notices set
      slug = v_slug,
      title = p_data->>'title',
      summary = p_data->>'summary',
      category = coalesce(p_data->>'category', category),
      department = p_data->>'department',
      cover = p_data->>'cover',
      content = coalesce(p_data->'content', content),
      images = coalesce(p_data->'images', images),
      detail_link = p_data->>'detail_link',
      action_label = p_data->>'action_label',
      action_url = p_data->>'action_url',
      is_pinned = coalesce((p_data->>'is_pinned')::boolean, is_pinned),
      sort_weight = coalesce((p_data->>'sort_weight')::int, sort_weight),
      status = coalesce(p_data->>'status', status),
      publish_at = case when p_data ? 'publish_at' then public.jsonb_ts(p_data,'publish_at') else publish_at end,
      schedule_at = case when p_data ? 'schedule_at' then public.jsonb_ts(p_data,'schedule_at') else schedule_at end,
      deadline_at = case when p_data ? 'deadline_at' then public.jsonb_ts(p_data,'deadline_at') else deadline_at end,
      updated_by = v_admin,
      updated_at = now(),
      version = v_old.version + 1
    where id = p_id;
    perform public.admin_audit('notice_save', jsonb_build_object('notice_id', p_id, 'version', v_old.version + 1));
    return jsonb_build_object('ok', true, 'id', p_id, 'version', v_old.version + 1);
  end;
$$;

-- 状态流转：发布 / 定时 / 撤回 / 归档 / 转草稿
create or replace function public.notice_set_status(p_id uuid, p_status text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
  declare v_admin uuid := public.current_admin();
  begin
    perform public.assert_notice_perm();
    if p_status not in ('draft','scheduled','published','withdrawn','archived') then
      raise exception '状态无效';
    end if;
    update public.sta_web_notices set
      status = p_status,
      publish_at = case when p_status = 'published' and publish_at is null then now() else publish_at end,
      schedule_at = case when p_status = 'scheduled' then coalesce(schedule_at, now()) else schedule_at end,
      updated_by = v_admin,
      updated_at = now(),
      version = version + 1
    where id = p_id;
    if not found then raise exception '公告不存在'; end if;
    perform public.admin_audit('notice_' || p_status, jsonb_build_object('notice_id', p_id));
    return jsonb_build_object('ok', true);
  end;
$$;

-- 复制为草稿
create or replace function public.notice_duplicate(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
  declare v_old public.sta_web_notices;
          v_new uuid;
  begin
    perform public.assert_notice_perm();
    select * into v_old from public.sta_web_notices where id = p_id;
    if v_old.id is null then raise exception '公告不存在'; end if;
    insert into public.sta_web_notices (
      slug, title, summary, category, department, cover, content, images,
      detail_link, action_label, action_url, is_pinned, sort_weight,
      status, created_by, updated_by, version)
    values (
      public.notice_slug(v_old.title || '（副本）', null),
      v_old.title || '（副本）',
      v_old.summary, v_old.category, v_old.department, v_old.cover, v_old.content, v_old.images,
      v_old.detail_link, v_old.action_label, v_old.action_url,
      false, 0, 'draft', v_old.created_by, public.current_admin(), 1)
    returning id into v_new;
    perform public.admin_audit('notice_duplicate', jsonb_build_object('notice_id', v_new, 'from', p_id));
    return jsonb_build_object('ok', true, 'id', v_new);
  end;
$$;

-- 删除（物理删除；历史版本随级联删除）
create or replace function public.notice_delete(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
  begin
    perform public.assert_notice_perm();
    delete from public.sta_web_notices where id = p_id;
    if not found then raise exception '公告不存在'; end if;
    perform public.admin_audit('notice_delete', jsonb_build_object('notice_id', p_id));
    return jsonb_build_object('ok', true);
  end;
$$;

-- 批量归档 / 批量撤回
create or replace function public.notice_bulk_status(p_ids uuid[], p_status text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
  begin
    perform public.assert_notice_perm();
    if p_status not in ('archived','withdrawn') then raise exception '批量操作仅支持归档或撤回'; end if;
    update public.sta_web_notices set
      status = p_status, updated_by = public.current_admin(), updated_at = now(), version = version + 1
    where id = any(p_ids);
    perform public.admin_audit('notice_bulk_' || p_status, jsonb_build_object('ids', to_jsonb(p_ids)));
    return jsonb_build_object('ok', true);
  end;
$$;

-- 版本历史
create or replace function public.notice_revisions(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
  declare v_items jsonb;
  begin
    perform public.assert_notice_perm();
    select coalesce(jsonb_agg(jsonb_build_object(
        'id', r.id, 'created_at', r.created_at, 'data', r.data)),
        '[]'::jsonb) into v_items
      from (select * from public.sta_web_notice_revisions
             where notice_id = p_id order by id desc limit 50) r;
    return v_items;
  end;
$$;

-- 恢复历史版本（把旧数据写回，并保留当前数据为新版本）
create or replace function public.notice_restore_revision(p_id uuid, p_revision_id bigint)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
  declare v_rev public.sta_web_notice_revisions;
          v_old public.sta_web_notices;
          v_admin uuid := public.current_admin();
  begin
    perform public.assert_notice_perm();
    select * into v_rev from public.sta_web_notice_revisions
      where notice_id = p_id and id = p_revision_id;
    if v_rev.id is null then raise exception '历史版本不存在'; end if;
    select * into v_old from public.sta_web_notices where id = p_id;
    insert into public.sta_web_notice_revisions(notice_id, data, saved_by)
      values (p_id, public.notice_full(v_old), v_admin);
    update public.sta_web_notices set
      title = v_rev.data->>'title',
      summary = v_rev.data->>'summary',
      category = coalesce(v_rev.data->>'category', category),
      department = v_rev.data->>'department',
      cover = v_rev.data->>'cover',
      content = coalesce(v_rev.data->'content', '[]'::jsonb),
      images = coalesce(v_rev.data->'images', '[]'::jsonb),
      detail_link = v_rev.data->>'detail_link',
      action_label = v_rev.data->>'action_label',
      action_url = v_rev.data->>'action_url',
      is_pinned = coalesce((v_rev.data->>'is_pinned')::boolean, is_pinned),
      sort_weight = coalesce((v_rev.data->>'sort_weight')::int, sort_weight),
      updated_by = v_admin,
      updated_at = now(),
      version = version + 1
    where id = p_id;
    perform public.admin_audit('notice_restore', jsonb_build_object('notice_id', p_id, 'revision', p_revision_id));
    return jsonb_build_object('ok', true);
  end;
$$;

grant execute on function public.notice_list_admin(int,int,text,text,text,boolean,text,text) to authenticated;
grant execute on function public.notice_get_admin(uuid) to authenticated;
grant execute on function public.notice_save(uuid,int,jsonb) to authenticated;
grant execute on function public.notice_set_status(uuid,text) to authenticated;
grant execute on function public.notice_duplicate(uuid) to authenticated;
grant execute on function public.notice_delete(uuid) to authenticated;
grant execute on function public.notice_bulk_status(uuid[],text) to authenticated;
grant execute on function public.notice_revisions(uuid) to authenticated;
grant execute on function public.notice_restore_revision(uuid,bigint) to authenticated;
