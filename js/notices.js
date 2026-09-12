(function () {
  'use strict';

  var $ = function (s, root) { return (root || document).querySelector(s); };
  var $$ = function (s, root) { return Array.prototype.slice.call((root || document).querySelectorAll(s)); };
  var motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var fine = window.matchMedia('(hover: hover) and (pointer: fine)');

  var CFG = window.SITE_CONFIG || {};
  var API = String(CFG.supabaseUrl || '').replace(/\/$/, '');
  var ANON = CFG.anonKey || '';
  var C = window.SITE_CONTENT || {};

  function cfgOk() {
    return CFG.supabaseUrl && CFG.anonKey && String(CFG.supabaseUrl).indexOf('YOUR-PROJECT-REF') === -1;
  }

  function rpc(name, body) {
    if (!cfgOk()) return Promise.reject(new Error('云端内容暂未连接'));
    return fetch(API + '/rest/v1/rpc/' + name, {
      method: 'POST',
      headers: { apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    }).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok) throw new Error((j && (j.message || j.error)) || ('HTTP ' + r.status));
        return j;
      });
    });
  }

  function safeBr(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/&lt;br\s*\/?&gt;/gi, '<br>')
      .replace(/\r\n?|\n/g, '<br>');
  }
  function rich(node, value) {
    if (node) node.innerHTML = safeBr(value);
  }
  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.innerHTML = safeBr(text);
    return node;
  }
  function button(text, cls, action) {
    var b = el('button', cls, text); b.type = 'button';
    if (action) b.addEventListener('click', action);
    return b;
  }
  function icon(direction) {
    var existing = direction === 'right' ? $('.backtop svg') : $('.dept-arrow svg');
    var svg = existing ? existing.cloneNode(true) : makeArrowSvg();
    svg.setAttribute('aria-hidden', 'true');
    if (direction === 'right') svg.style.rotate = '90deg';
    return svg;
  }
  function makeArrowSvg() {
    var span = el('span');
    span.innerHTML = '<svg viewBox="0 0 24 24" fill="none"><path d="M4 12h16m0 0l-6-6m6 6l-6 6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    return span.firstChild;
  }
  function closeIcon() {
    var span = el('span');
    span.innerHTML = '<svg viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
    return span.firstChild;
  }
  function photo(src, alt, cls) {
    var img = el('img', cls || ''); img.src = src; img.alt = alt || ''; img.decoding = 'async';
    img.addEventListener('error', function () {
      img.hidden = true;
      var fallback = el('span', 'b-image-failed', '图片暂时无法显示');
      if (img.parentElement) img.parentElement.append(fallback);
    }, { once: true });
    return img;
  }

  function logoSources() {
    var preferred = C.brand && C.brand.logo;
    return [preferred, 'image_dev/logo-sta.webp', 'image_dev/logo-sta.jpg']
      .filter(function (src, i, list) { return src && list.indexOf(src) === i; });
  }

  function mountBrandLogo() {
    var mark = $('.logo__mark'), sources = logoSources();
    if (!mark || !sources.length) return;
    var img = el('img');
    img.alt = 'STA';
    img.decoding = 'async';
    var index = 0;
    img.addEventListener('load', function () {
      mark.classList.add('logo__mark--img');
    });
    img.addEventListener('error', function () {
      index += 1;
      if (index < sources.length) {
        img.src = sources[index];
        return;
      }
      mark.classList.remove('logo__mark--img');
      mark.replaceChildren();
      mark.textContent = (C.brand && C.brand.shortEN) || 'STA';
    });
    mark.classList.add('logo__mark--img');
    mark.replaceChildren(img);
    img.src = sources[0];
    var fav = $('link[rel="icon"]');
    if (fav) fav.setAttribute('href', sources[0]);
  }

  function initCursor() {
    if (!fine.matches || motion.matches) return;
    var dot = $('.cursor-dot'), ring = $('.cursor-ring');
    if (!dot || !ring) return;
    document.documentElement.classList.add('has-cursor');
    var mx = -100, my = -100, rx = -100, ry = -100, shown = false;
    window.addEventListener('mousemove', function (event) {
      mx = event.clientX; my = event.clientY;
      if (!shown) {
        shown = true;
        dot.style.opacity = 1;
        ring.style.opacity = 1;
      }
    }, { passive: true });
    var hoverSel = 'a,button,[data-magnetic]';
    document.addEventListener('mouseover', function (event) {
      if (event.target.closest(hoverSel)) ring.classList.add('is-hover');
    });
    document.addEventListener('mouseout', function (event) {
      if (event.target.closest(hoverSel)) ring.classList.remove('is-hover');
    });
    (function loop() {
      rx += (mx - rx) * .16;
      ry += (my - ry) * .16;
      dot.style.transform = 'translate3d(' + mx + 'px,' + my + 'px,0)';
      ring.style.transform = 'translate3d(' + rx + 'px,' + ry + 'px,0)';
      requestAnimationFrame(loop);
    })();
  }
  function animate(node, frames, duration, extra) {
    if (motion.matches || !node.animate) return Promise.resolve();
    return node.animate(frames, { duration: duration || 300, easing: 'cubic-bezier(.16,1,.3,1)', ...(extra || {}) }).finished.catch(function () {});
  }
  function formatDate(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.getFullYear() + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + String(d.getDate()).padStart(2, '0');
  }
  function toast(msg) {
    var t = $('.toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._t);
    t._t = setTimeout(function () { t.classList.remove('show'); }, 2600);
  }

  /* ---------- 公告数据 → 设计卡片字段 ---------- */
  function item(n) {
    return {
      id: n.id, slug: n.slug, title: n.title, desc: n.summary || '',
      date: formatDate(n.publish_at), src: n.cover || '', category: n.category || '通知',
      department: n.department || '', actionLabel: n.action_label || '', actionUrl: n.action_url || ''
    };
  }
  function galleryFromNotice(notice) {
    var imgs = (notice.images || []);
    var records = imgs.map(function (img, i) {
      return { src: img.src, title: img.alt || '', caption: img.caption || ('图片 ' + (i + 1)) };
    });
    if (!records.length && notice.cover) {
      records.push({ src: notice.cover, title: notice.title, caption: notice.title });
    }
    return records;
  }

  /* ---------- 正文受控内容块 ---------- */
  function renderBlocks(blocks, host) {
    (blocks || []).forEach(function (b) {
      if (!b || !b.type) return;
      var node;
      if (b.type === 'paragraph') {
        node = el('p', 'nc-block nc-p', b.text || '');
      } else if (b.type === 'heading') {
        node = el('h3', 'nc-block nc-h' + (b.level === 2 ? ' nc-h2' : ''), b.text || '');
      } else if (b.type === 'quote') {
        node = el('blockquote', 'nc-block nc-quote', b.text || '');
      } else if (b.type === 'image') {
        node = el('figure', 'nc-figure');
        var open = button('', 'b-image-button', function () {
          openImages([{ src: b.src, title: b.alt || '', caption: b.caption || '' }], 0);
        });
        open.setAttribute('aria-label', '放大图片');
        open.append(photo(b.src, b.alt || ''));
        node.append(open);
        if (b.caption) node.append(el('figcaption', '', b.caption));
      } else if (b.type === 'gallery') {
        node = el('div', 'nc-block nc-gal');
        var records = (b.images || []).map(function (img, i) {
          return { src: img.src, title: img.alt || '', caption: img.caption || ('图片 ' + (i + 1)) };
        });
        records.forEach(function (image, i) {
          var fig = el('figure', 'nc-figure');
          var go = button('', 'b-image-button', function () { openImages(records, i); });
          go.setAttribute('aria-label', '放大图片');
          go.append(photo(image.src, image.title));
          fig.append(go);
          if (image.caption) fig.append(el('figcaption', '', image.caption));
          node.append(fig);
        });
      } else if (b.type === 'link_button') {
        node = el('a', 'nc-block nc-linkbtn', b.label || '');
        node.href = b.url || '#';
        node.setAttribute('data-noanchor', '');
        node.append(icon());
      } else if (b.type === 'qr_image') {
        node = el('figure', 'nc-figure nc-qr');
        var qo = button('', 'b-image-button', function () {
          openImages([{ src: b.src, title: b.alt || '', caption: b.caption || '' }], 0);
        });
        qo.setAttribute('aria-label', '放大二维码');
        qo.append(photo(b.src, b.alt || ''));
        node.append(qo);
        if (b.caption) node.append(el('figcaption', '', b.caption));
      }
      if (node) host.append(node);
    });
  }

  /* ---------- 首页公告板 ---------- */
  var reader, lightbox, images = [], imageIndex = 0;
  var board, root, currentFilter = '', expandedList = false, filtering = false, replayTimer;

  function metadata(n, featured) {
    var meta = el('div', 'b-meta');
    meta.append(el('strong', '', (featured ? '重点展示 / ' : '') + n.category), el('time', '', n.date));
    return meta;
  }

  function feature(n) {
    var article = el('article', 'b-feature');
    if (n.src) {
      var art = el('div', 'b-art');
      var orbit = el('div', 'b-orbit'); orbit.setAttribute('aria-hidden', 'true');
      var back = el('div', 'b-paper back'); back.setAttribute('aria-hidden', 'true');
      var middle = el('div', 'b-paper middle'); middle.setAttribute('aria-hidden', 'true');
      var dart = el('div', 'b-dart'); dart.setAttribute('aria-hidden', 'true');
      var poster = button('', 'b-poster', function () { openFeatureImages(n); });
      poster.setAttribute('aria-label', '放大查看：' + n.title);
      poster.append(photo(n.src, n.title));
      art.append(orbit, back, middle, poster, dart);
      var tiltFrame = 0;
      art.addEventListener('pointermove', function (event) {
        if (!fine.matches || motion.matches || event.pointerType === 'touch') return;
        cancelAnimationFrame(tiltFrame);
        tiltFrame = requestAnimationFrame(function () {
          var r = art.getBoundingClientRect();
          art.style.setProperty('--tilt-x', ((event.clientX - r.left) / r.width * 16 - 8).toFixed(1) + 'deg');
          art.style.setProperty('--tilt-y', (8 - (event.clientY - r.top) / r.height * 16).toFixed(1) + 'deg');
        });
      });
      art.addEventListener('pointerleave', function () {
        cancelAnimationFrame(tiltFrame);
        art.style.setProperty('--tilt-x', '0deg');
        art.style.setProperty('--tilt-y', '0deg');
      });
      article.append(art);
    }
    var body = el('div', 'b-feature-body');
    body.append(metadata(n, true), el('h3', '', n.title), el('p', '', n.desc));
    var read = button('', 'b-open', function () { openReader(n.id, article); });
    var circle = el('span', 'b-round'); circle.append(icon());
    read.append(el('span', '', '展开这则消息'), circle);
    body.append(read);
    article.append(body);
    return article;
  }

  function openFeatureImages(n) {
    rpc('notice_get', { p_id: n.id }).then(function (notice) {
      if (!notice) return;
      openImages(galleryFromNotice(notice), 0);
    }).catch(function () {});
  }

  function row(n, index) {
    var article = el('article', 'b-row'); article.style.setProperty('--row', index);
    var body = el('div'); var title = el('h3');
    var open = button(n.title, 'b-row-button', function () { openReader(n.id, article); });
    title.append(open);
    body.append(metadata(n, false), title);
    article.append(body);
    if (n.src) article.append(photo(n.src, '', 'b-thumb'));
    else { var circle = el('span', 'b-round'); circle.append(icon()); article.append(circle); }
    return article;
  }

  function drawBoard(data) {
    board.replaceChildren();
    var items = [];
    if (data.featured) items.push(item(data.featured));
    (data.latest || []).forEach(function (n) { items.push(item(n)); });
    if (!items.length) {
      board.append(el('p', 'b-empty', '这个分类暂时没有内容。'));
      return;
    }
    var lead = items[0];
    board.append(feature(lead));
    var latest = el('div', 'b-latest');
    var head = el('div', 'b-list-head');
    head.append(el('strong', '', '更多消息'), el('span', 'b-count', String(Math.max(0, (data.total || 0) - 1)).padStart(2, '0') + ' ENTRIES'));
    var list = el('div', 'b-list');
    var remaining = items.slice(1);
    var shown = expandedList ? remaining : remaining.slice(0, 3);
    shown.forEach(function (n, i) { list.append(row(n, i)); });
    if (!remaining.length) list.append(el('p', 'b-empty', '该分类共 1 条内容，点击左侧消息阅读全文。'));
    latest.append(head, list);
    board.append(latest);
  }

  function buildHome(container) {
    root = $('#notices');
    if (!root || !container) return;
    var watermark = el('span', 'b-watermark', 'BULLETIN'); watermark.setAttribute('aria-hidden', 'true');
    container.append(watermark);
    var heading = el('div', 'b-heading'), text = el('div'), title = el('h2'); title.id = 'bulletin-title';
    var em = el('em'); em.append(el('span', '', '公告'));
    title.append(el('span', '', '通知'), em);
    text.append(title);
    var mark = el('div', 'b-heading-mark'); mark.setAttribute('aria-hidden', 'true'); mark.append(icon());
    heading.append(text, mark);
    container.append(heading);

    var toolbar = el('div', 'b-toolbar'), tabs = el('div', 'b-tabs');
    tabs.setAttribute('role', 'group'); tabs.setAttribute('aria-label', '公告分类');
    toolbar.append(tabs);
    container.append(toolbar);

    var live = el('span', 'b-sr b-live'); live.setAttribute('aria-live', 'polite');
    container.append(live);
    board = el('div', 'b-board');
    container.append(board);

    var footer = el('div', 'b-footer');
    var allBtn = button('查看全部公告', 'b-more', function () { location.href = 'notices.html'; });
    allBtn.append(icon('right'));
    var replayButton = button('', 'b-replay', replay);
    replayButton.setAttribute('aria-label', '重播公告动画');
    replayButton.append(icon('right'));
    footer.append(allBtn, replayButton);
    container.append(footer);

    initTabs(tabs);
    loadHome('', false);
    var io = new IntersectionObserver(function (entries) {
      if (entries.some(function (e) { return e.isIntersecting; })) { replay(); io.disconnect(); }
    }, { threshold: 0.12 });
    io.observe(root);
  }

  function initTabs(tabs) {
    var all = button('全部', 'b-tab', function () { switchCategory(tabs, all, ''); });
    all.setAttribute('aria-pressed', 'true');
    all.append(el('small', '', ''));
    tabs.append(all);
    rpc('notice_categories').then(function (list) {
      (list || []).forEach(function (c) {
        var b = button(c.category, 'b-tab', function () { switchCategory(tabs, b, c.category); });
        b.setAttribute('aria-pressed', 'false');
        b.append(el('small', '', String(c.count)));
        tabs.append(b);
      });
    }).catch(function () {});
  }

  function switchCategory(tabs, active, category) {
    if (filtering || currentFilter === category) return;
    filtering = true;
    currentFilter = category;
    $$('.b-tab', tabs).forEach(function (t) { t.setAttribute('aria-pressed', String(t === active)); });
    clearTimeout(replayTimer);
    root.classList.remove('b-in');
    animate(board, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(8px)' }], 160)
      .then(function () {
        loadHome(category, true);
        refresh();
        animate(board, [{ opacity: 0, transform: 'translateY(16px)' }, { opacity: 1, transform: 'none' }], 420)
          .then(function () { filtering = false; });
      });
  }

  function loadHome(category, animateIn) {
    rpc('notice_homepage', { p_category: category || null })
      .then(function (data) {
        if (!data || (!data.featured && !(data.latest || []).length)) {
          hideHome();
          return;
        }
        currentFilter = category || '';
        drawBoard(data);
        $('.b-live', root).textContent = (currentFilter || '全部') + '，共 ' + (data.total || 0) + ' 条公告';
        if (animateIn) replay();
        refresh();
      })
      .catch(function (e) {
        board.replaceChildren(el('p', 'b-empty', '公告加载失败：' + (e.message || '请稍后重试')));
      });
  }

  function hideHome() {
    if (root) root.hidden = true;
    $$('a[href="#notices"],.nav__links a[href="#notices"],.menu-overlay__links a[href="#notices"]').forEach(function (a) {
      if (a && a.parentNode) a.parentNode.removeChild(a);
    });
  }

  function replay() {
    clearTimeout(replayTimer);
    root.classList.remove('b-in');
    void root.offsetWidth;
    root.classList.add('b-in');
    replayTimer = setTimeout(function () { root.classList.remove('b-in'); }, 2000);
  }
  function refresh() {
    if (window.ScrollTrigger) window.ScrollTrigger.refresh();
  }

  /* ---------- 阅读弹层 ---------- */
  function makeDialogs() {
    reader = el('dialog', 'b-reader'); reader.setAttribute('aria-labelledby', 'b-reader-title');
    var shell = el('div', 'b-reader-shell'); shell.setAttribute('data-lenis-prevent', '');
    var top = el('div', 'b-reader-top'); top.append(el('span', '', 'STA / 通知公告'));
    var close = button('', 'b-close', function () { closeDialog(reader); });
    close.setAttribute('aria-label', '关闭公告');
    close.append(closeIcon());
    top.append(close);
    shell.append(top, el('div', 'b-reader-body'));
    reader.append(shell);
    document.body.append(reader);

    lightbox = el('dialog', 'b-lightbox'); lightbox.setAttribute('aria-label', '公告图片查看');
    lightbox.setAttribute('data-lenis-prevent', '');
    var bar = el('div', 'b-lightbox-bar'); bar.append(el('span', 'b-image-title', '图片查看'));
    var tools = el('div', 'b-lightbox-tools');
    var zoom = button('放大', 'b-zoom', toggleZoom); zoom.setAttribute('aria-pressed', 'false');
    var x = button('', 'b-close', function () { closeDialog(lightbox); }); x.setAttribute('aria-label', '关闭图片查看'); x.append(closeIcon());
    tools.append(zoom, x); bar.append(tools);
    var stage = el('div', 'b-lightbox-stage'); stage.setAttribute('tabindex', '0');
    stage.setAttribute('aria-label', '图片，可放大后滚动查看');
    var foot = el('div', 'b-lightbox-foot');
    var prev = button('', '', function () { showImage(imageIndex - 1); }); prev.setAttribute('aria-label', '上一张图片'); prev.append(icon('right'));
    var next = button('', '', function () { showImage(imageIndex + 1); }); next.setAttribute('aria-label', '下一张图片'); next.append(icon('right'));
    var counter = el('span', 'b-image-count'); counter.setAttribute('aria-live', 'polite');
    foot.append(prev, counter, next);
    lightbox.append(bar, stage, foot);
    document.body.append(lightbox);

    [reader, lightbox].forEach(function (dialog) {
      dialog.addEventListener('cancel', function (e) { e.preventDefault(); closeDialog(dialog); });
      dialog.addEventListener('click', function (e) {
        if (e.target !== dialog) return;
        var r = dialog.getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) closeDialog(dialog);
      });
    });
    lightbox.addEventListener('keydown', function (e) {
      if (stage.classList.contains('zoomed')) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); showImage(imageIndex + 1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); showImage(imageIndex - 1); }
    });
    var start = null;
    stage.addEventListener('pointerdown', function (e) { start = { x: e.clientX, y: e.clientY }; });
    stage.addEventListener('pointercancel', function () { start = null; });
    stage.addEventListener('pointerup', function (e) {
      if (!start || stage.classList.contains('zoomed')) return;
      var dx = e.clientX - start.x, dy = e.clientY - start.y; start = null;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) showImage(imageIndex + (dx < 0 ? 1 : -1));
    });
  }

  async function closeDialog(dialog) {
    if (!dialog.open || dialog.classList.contains('closing')) return;
    dialog.classList.add('closing');
    var node = dialog === reader ? $('.b-reader-shell', dialog) : dialog;
    await animate(node, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(28px) scale(.98)' }], 220);
    dialog.close();
    dialog.classList.remove('closing');
    if (!reader.open && !lightbox.open) document.documentElement.classList.remove('b-dialog-open');
  }

  async function openReader(id, origin) {
    var notice;
    try {
      notice = await rpc('notice_get', { p_id: id });
    } catch (e) {
      toast('公告加载失败'); return;
    }
    if (!notice) { toast('公告不存在或已失效'); return; }
    var body = $('.b-reader-body', reader);
    body.replaceChildren();
    var title = el('h2', '', notice.title); title.id = 'b-reader-title';
    var meta = el('div', 'b-meta');
    meta.append(el('strong', '', notice.category || '通知'), el('time', '', formatDate(notice.publish_at)));
    if (notice.department) meta.append(el('span', '', notice.department));
    body.append(meta, title);
    renderBlocks(notice.content || [], body);
    var gallery = el('div', 'b-gallery');
    var records = galleryFromNotice(notice);
    records.forEach(function (image, i) {
      var figure = el('figure');
      var open = button('', 'b-image-button', function () { openImages(records, i); });
      open.setAttribute('aria-label', '放大图片：' + image.title);
      open.append(photo(image.src, image.title));
      figure.append(open, el('figcaption', '', image.caption));
      gallery.append(figure);
    });
    if (records.length) body.append(gallery);
    if (notice.action_label && notice.action_url) {
      var link = el('a', 'b-reader-link', notice.action_label);
      link.href = notice.action_url;
      link.setAttribute('data-noanchor', '');
      link.append(icon());
      body.append(link);
    }
    var more = el('a', 'b-reader-link', '查看全部公告');
    more.href = 'notices.html';
    more.setAttribute('data-noanchor', '');
    more.append(icon());
    body.append(more);
    reader.showModal();
    document.documentElement.classList.add('b-dialog-open');
    $('.b-reader-shell', reader).scrollTop = 0;
    var r = origin.getBoundingClientRect(), to = $('.b-reader-shell', reader).getBoundingClientRect();
    var dx = (r.left + r.width / 2) - (to.left + to.width / 2);
    var dy = (r.top + r.height / 2) - (to.top + to.height / 2);
    animate($('.b-reader-shell', reader), [
      { opacity: 0.15, transform: 'translate(' + (dx * 0.24) + 'px,' + Math.max(-80, Math.min(100, dy * 0.3)) + 'px) scale(.86)', filter: 'blur(5px)' },
      { opacity: 1, transform: 'none', filter: 'blur(0px)' }
    ], 550);
  }

  function showImage(index) {
    if (!images.length) return;
    imageIndex = (index + images.length) % images.length;
    var stage = $('.b-lightbox-stage', lightbox);
    stage.classList.remove('zoomed');
    var zoom = $('.b-zoom', lightbox);
    zoom.textContent = '放大'; zoom.setAttribute('aria-pressed', 'false');
    var img = photo(images[imageIndex].src, images[imageIndex].title);
    stage.replaceChildren(img);
    $('.b-image-title', lightbox).textContent = '图片查看';
    $('.b-image-count', lightbox).textContent = (imageIndex + 1) + ' / ' + images.length;
    animate(img, [{ opacity: 0, transform: 'translateX(18px) scale(.97)' }, { opacity: 1, transform: 'none' }], 340);
  }
  function openImages(records, index) {
    images = records; if (!images.length) return;
    showImage(index);
    lightbox.showModal();
    document.documentElement.classList.add('b-dialog-open');
    animate(lightbox, [{ opacity: 0, transform: 'scale(.93)' }, { opacity: 1, transform: 'none' }], 400);
  }
  function toggleZoom() {
    var stage = $('.b-lightbox-stage', lightbox);
    var active = stage.classList.toggle('zoomed');
    $('.b-zoom', lightbox).textContent = active ? '适应屏幕' : '放大';
    $('.b-zoom', lightbox).setAttribute('aria-pressed', String(active));
    stage.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }

  /* ---------- 归档页 ---------- */
  function buildArchive(container) {
    var qs = new URLSearchParams(location.search);
    var state = { page: Math.max(1, parseInt(qs.get('page') || '1', 10)), category: qs.get('cat') || '', q: qs.get('q') || '' };
    var head = el('div', 'np-head');
    var h = el('div');
    var title = el('h1');
    title.append(el('span', '', '通知'), el('em', '', '公告'));
    h.append(title);
    head.append(h);
    var tools = el('div', 'np-tools');
    var search = el('div', 'np-search');
    var input = el('input'); input.type = 'search'; input.placeholder = '搜索标题或摘要…'; input.value = state.q;
    input.addEventListener('input', debounce(function () {
      state.q = input.value.trim(); state.page = 1;
      loadArchive(container, state);
      syncUrl(state);
    }, 350));
    search.append(input);
    tools.append(search);
    head.append(tools);
    container.append(head);

    var cats = el('div', 'np-cats');
    container.append(cats);
    var grid = el('div', 'np-grid');
    container.append(grid);
    var pager = el('div', 'np-pager');
    container.append(pager);

    rpc('notice_categories').then(function (list) {
      buildCatTabs(cats, list || [], state, container);
    }).catch(function () {});
    buildCatTabs(cats, [], state, container);
    loadArchive(container, state);
  }

  function buildCatTabs(cats, list, state, container) {
    cats.replaceChildren();
    var all = button('全部', 'np-cat', function () {
      state.category = ''; state.page = 1;
      buildCatTabs(cats, list, state, container);
      loadArchive(container, state); syncUrl(state);
    });
    all.setAttribute('aria-pressed', String(!state.category));
    cats.append(all);
    list.forEach(function (c) {
      var b = button(c.category + (c.count ? ' (' + c.count + ')' : ''), 'np-cat', function () {
        state.category = c.category; state.page = 1;
        buildCatTabs(cats, list, state, container);
        loadArchive(container, state); syncUrl(state);
      });
      b.setAttribute('aria-pressed', String(state.category === c.category));
      cats.append(b);
    });
  }

  function loadArchive(container, state) {
    var grid = $('.np-grid', container), pager = $('.np-pager', container);
    grid.replaceChildren(el('p', 'np-empty', '正在加载公告…'));
    rpc('notice_list_published', { p_page: state.page, p_per_page: 12, p_category: state.category || null, p_q: state.q || null })
      .then(function (data) {
        grid.replaceChildren();
        var items = data.items || [];
        if (!items.length) {
          grid.append(el('p', 'np-empty', '没有找到符合条件的公告。'));
          pager.replaceChildren();
          return;
        }
        items.forEach(function (n) {
          grid.append(archiveCard(item(n)));
        });
        renderPager(pager, data, state, container);
      })
      .catch(function (e) {
        grid.replaceChildren(el('p', 'np-empty', '公告加载失败：' + (e.message || '')));
      });
  }

  function archiveCard(n) {
    var a = el('a', 'np-card');
    a.href = 'notice.html?slug=' + encodeURIComponent(n.slug);
    a.setAttribute('data-noanchor', '');
    var cover = el('div', 'np-card-cover');
    if (n.src) cover.append(photo(n.src, n.title));
    else {
      var fallback = el('span', 'np-cover-fallback', 'STA');
      var logo = el('img', 'np-cover-logo');
      logo.alt = 'STA'; logo.decoding = 'async';
      var sources = logoSources(), sourceIndex = 0;
      logo.addEventListener('load', function () { fallback.replaceChildren(logo); });
      logo.addEventListener('error', function () {
        sourceIndex += 1;
        if (sourceIndex < sources.length) logo.src = sources[sourceIndex];
        else logo.remove();
      });
      fallback.append(logo);
      if (sources.length) logo.src = sources[0];
      cover.append(fallback);
    }
    a.append(cover);
    var body = el('div', 'np-card-body');
    var meta = el('div', 'np-card-meta');
    meta.append(el('span', 'np-cat', n.category), el('time', '', n.date));
    body.append(meta, el('h3', '', n.title), el('p', '', n.desc));
    a.append(body);
    return a;
  }

  function renderPager(pager, data, state, container) {
    pager.replaceChildren();
    var pages = data.pages || 1;
    if (pages <= 1) return;
    var prev = button('', '', function () {
      state.page = Math.max(1, state.page - 1);
      loadArchive(container, state); syncUrl(state);
      window.scrollTo({ top: 0, behavior: motion.matches ? 'instant' : 'smooth' });
    });
    prev.setAttribute('aria-label', '上一页'); prev.disabled = state.page <= 1; prev.append(icon('right'));
    var next = button('', '', function () {
      state.page = Math.min(pages, state.page + 1);
      loadArchive(container, state); syncUrl(state);
      window.scrollTo({ top: 0, behavior: motion.matches ? 'instant' : 'smooth' });
    });
    next.setAttribute('aria-label', '下一页'); next.disabled = state.page >= pages; next.append(icon('right'));
    pager.append(prev, el('span', '', state.page + ' / ' + pages), next);
  }

  function syncUrl(state) {
    var qs = [];
    if (state.page > 1) qs.push('page=' + state.page);
    if (state.category) qs.push('cat=' + encodeURIComponent(state.category));
    if (state.q) qs.push('q=' + encodeURIComponent(state.q));
    history.replaceState(null, '', qs.length ? ('notices.html?' + qs.join('&')) : 'notices.html');
  }

  function debounce(fn, ms) {
    var t;
    return function () {
      clearTimeout(t);
      t = setTimeout(fn, ms);
    };
  }

  /* ---------- 详情页 ---------- */
  function buildDetail(container) {
    var qs = new URLSearchParams(location.search);
    var slug = qs.get('slug') || '', id = qs.get('id') || '';
    if (!slug && !id) {
      container.replaceChildren(el('p', 'np-empty', '缺少公告标识，请从公告列表进入。'));
      return;
    }
    container.replaceChildren(el('p', 'np-empty', '正在加载公告…'));
    var p = slug ? rpc('notice_get_by_slug', { p_slug: slug }) : rpc('notice_get', { p_id: id });
    p.then(function (notice) {
      if (!notice) {
        container.replaceChildren(el('p', 'np-empty', '公告不存在或已失效。'));
        return;
      }
      document.title = notice.title + ' · STA';
      var wrap = el('div', 'np-detail-wrap');
      var back = el('a', 'np-back', '返回公告列表');
      back.href = 'notices.html';
      back.setAttribute('data-noanchor', '');
      var bsvg = el('span'); bsvg.innerHTML = '<svg viewBox="0 0 24 24" fill="none"><path d="M4 12h16m0 0l-6-6m6 6l-6 6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      back.append(bsvg.firstChild, el('span', '', '返回公告列表'));
      wrap.append(back);
      var art = el('article', 'np-detail');
      var h1 = el('h1', '', notice.title);
      art.append(h1);
      var meta = el('div', 'np-detail-meta');
      meta.append(el('span', 'np-cat', notice.category || '通知'));
      if (notice.department) meta.append(el('span', '', notice.department));
      if (notice.publish_at) meta.append(el('time', '', formatDate(notice.publish_at)));
      if (notice.deadline_at) meta.append(el('span', 'np-detail-status', '截止 ' + formatDate(notice.deadline_at)));
      art.append(meta);
      var body = el('div', 'np-detail-body');
      renderBlocks(notice.content || [], body);
      var gallery = el('div', 'b-gallery');
      var records = galleryFromNotice(notice);
      records.forEach(function (image, i) {
        var figure = el('figure');
        var open = button('', 'b-image-button', function () { openImages(records, i); });
        open.setAttribute('aria-label', '放大图片：' + image.title);
        open.append(photo(image.src, image.title));
        figure.append(open, el('figcaption', '', image.caption));
        gallery.append(figure);
      });
      if (records.length) body.append(gallery);
      if (notice.action_label && notice.action_url) {
        var link = el('a', 'nc-block nc-linkbtn', notice.action_label);
        link.href = notice.action_url;
        link.setAttribute('data-noanchor', '');
        link.append(icon());
        body.append(link);
      }
      art.append(body);
      wrap.append(art);
      container.replaceChildren(wrap);
    }).catch(function (e) {
      container.replaceChildren(el('p', 'np-empty', '公告加载失败：' + (e.message || '')));
    });
  }

  /* ---------- 页面外壳（归档 / 详情页复用导航与页脚） ---------- */
  function toHref(href) {
    return (href || '#').indexOf('#') === 0 ? 'index.html' + href : href;
  }
  function renderShell() {
    if (C.nav && C.nav.links) {
      var noticeLink = C.nav.links.find(function (l) { return l.href === '#notices' || l.label === '公告'; });
      C.nav.links = C.nav.links.filter(function (l) { return l.href !== '#notices' && l.label !== '公告'; });
      C.nav.links.splice(1, 0, noticeLink || { label: '公告', href: '#notices' });
    }
    mountBrandLogo();
    initCursor();
    var cn = $('[data-brand-cn]');
    if (cn && C.brand) rich(cn, C.brand.nameCN);
    var en = $('[data-brand-en]');
    if (en && C.brand) rich(en, (C.brand.nameEN || '').toUpperCase());
    var fe = $('[data-foot-en]');
    if (fe && C.brand) rich(fe, (C.brand.nameEN || '').toUpperCase());
    var cta = $('.nav__cta .btn__label');
    if (cta && C.nav) rich(cta, C.nav.ctaLabel);
    var linksWrap = $('.nav__links');
    if (linksWrap && C.nav) {
      C.nav.links.forEach(function (l) {
        var a = el('a', null, l.label);
        a.href = toHref(l.href);
        if (l.href === '#notices') a.classList.add('active');
        linksWrap.appendChild(a);
      });
    }
    var menuWrap = $('.menu-overlay__links');
    if (menuWrap && C.nav) {
      C.nav.links.forEach(function (l, i) {
        var a = el('a'); a.href = toHref(l.href);
        a.append(el('span', 'menu-num', String(i + 1).padStart(2, '0')), el('span', 'menu-txt', l.label));
        menuWrap.appendChild(a);
      });
    }
    if (C.footer) {
      var big = $('[data-footer-big]'); if (big) big.textContent = C.footer.bigText;
      var sl = $('[data-footer-slogans]');
      if (sl) (C.footer.slogans || []).forEach(function (s) { sl.append(el('span', null, s)); });
      var cols = $('[data-footer-cols]');
      if (cols) (C.footer.cols || []).forEach(function (col) {
        var c = el('div', 'footer-col');
        c.append(el('h4', null, col.h));
        var ul = el('ul');
        (col.links || []).forEach(function (l) {
          var li = el('li');
          var a = el('a', null, l.t); a.href = toHref(l.href);
          li.append(a); ul.append(li);
        });
        c.append(ul); cols.append(c);
      });
      var legal = $('[data-footer-legal]'); if (legal) rich(legal, C.footer.legal);
      var copy = $('[data-footer-copy]'); if (copy) rich(copy, C.footer.copyright);
      var ver = $('[data-footer-version]'); if (ver) rich(ver, C.footer.version);
      var cr = $('[data-footer-credit]'); if (cr) rich(cr, C.footer.credit || '');
    }
    var menu = $('.nav__burger'), overlay = $('.menu-overlay');
    if (menu && overlay) {
      menu.addEventListener('click', function () {
        var open = menu.getAttribute('aria-expanded') === 'true';
        menu.setAttribute('aria-expanded', String(!open));
        overlay.classList.toggle('open', !open);
        document.documentElement.classList.toggle('menu-open', !open);
      });
    }
  }

  /* ---------- 活动横滑指示器（沿用设计） ---------- */
  function mobileMotion() {
    var wrap = $('.h-wrap'), cards = $$('.event-card:not(.event-card--more)');
    if (!wrap || !cards.length) return;
    var controls = el('div', 'b-carousel-nav'); var current = 0;
    var previous = button('', '', function () { move(-1); });
    previous.setAttribute('aria-label', '上一个活动'); previous.append(icon('right'));
    var next = button('', '', function () { move(1); });
    next.setAttribute('aria-label', '下一个活动'); next.append(icon('right'));
    var count = el('span', '', '1 / ' + cards.length);
    count.setAttribute('aria-live', 'polite');
    controls.append(previous, count, next);
    wrap.after(controls);
    function move(step) {
      current = Math.max(0, Math.min(cards.length - 1, current + step));
      cards[current].scrollIntoView({ inline: 'center', block: 'nearest', behavior: motion.matches ? 'instant' : 'smooth' });
    }
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          current = cards.indexOf(entry.target);
          count.textContent = (current + 1) + ' / ' + cards.length;
        }
      });
    }, { root: wrap, threshold: 0.6 });
    cards.forEach(function (card) { observer.observe(card); });
  }

  /* ---------- 启动 ---------- */
  function init() {
    var home = $('#notices-home');
    var archive = $('#notices-archive');
    var detail = $('#notice-detail');
    if (home) {
      if (!cfgOk()) {
        hideHome();
        return;
      }
      makeDialogs();
      buildHome(home);
      mobileMotion();
    } else if (archive) {
      makeDialogs();
      renderShell();
      buildArchive(archive);
    } else if (detail) {
      makeDialogs();
      renderShell();
      buildDetail(detail);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
