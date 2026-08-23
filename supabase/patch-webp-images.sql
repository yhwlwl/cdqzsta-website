-- =====================================================
-- STA 官网 · 内容图片切换 WebP 补丁
-- 前置条件：image_dev/*.webp 已随仓库部署上线（git push 后）
-- 作用：把站点内容里 7 处 image_dev 旧图引用换成压缩后的
--       WebP 版本（总体积约 1.2MB → 490KB），旧文件保留不动。
-- 用法：Supabase Dashboard → SQL Editor → 粘贴全部内容 → Run。
--       幂等可重复执行；执行前自动把当前内容备份进版本表。
-- =====================================================

-- 0. 备份当前内容到版本历史（与后台发布走同一张表，可在后台回滚）
insert into public.sta_web_site_content_revisions (data, saved_by)
select data, null
from public.sta_web_site_content
where id = 'main'
  and (
    data::text like '%image_dev/logo-sta.jpg%'
    or data::text like '%.png"'
    or data::text like '%gaokao.jpg%'
    or data::text like '%mag41.jfif%'
  );

-- 1. 逐个替换旧图引用（幂等：已替换过则不再变化）
update public.sta_web_site_content
set data = (
  replace(replace(replace(replace(replace(replace(replace(
    data::text,
    'image_dev/logo-sta.jpg',                          'image_dev/logo-sta.webp'),
    'image_dev/161AFC8A791CC7451D9B43D2FF67D306.png',  'image_dev/161AFC8A791CC7451D9B43D2FF67D306.webp'),
    'image_dev/F149099CABE84B5E6111F7D1E95FE4E3.png',  'image_dev/F149099CABE84B5E6111F7D1E95FE4E3.webp'),
    'image_dev/gaokao.jpg',                            'image_dev/gaokao.webp'),
    'image_dev/03E1BFB71564E18844783D43415814CC.png',  'image_dev/03E1BFB71564E18844783D43415814CC.webp'),
    'image_dev/mag41.jfif',                            'image_dev/mag41.webp'),
    'image_dev/A06247CDED94482DE9996A624AF23742.png',  'image_dev/A06247CDED94482DE9996A624AF23742.webp')
)::jsonb
where id = 'main';

-- 2. 校验：结果里不应再有任何旧扩展名引用（期望输出 0）
select
  (data::text like '%logo-sta.jpg%') +
  (data::text like '%.png"') +
  (data::text like '%gaokao.jpg%') +
  (data::text like '%mag41.jfif%') as leftover_old_refs
from public.sta_web_site_content where id = 'main';
