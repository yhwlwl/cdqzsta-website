(function () {
  'use strict';

  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  var RM = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var FINE = window.matchMedia('(pointer: fine)').matches;
  var hasGSAP = typeof window.gsap !== 'undefined';
  var hasST = hasGSAP && typeof window.ScrollTrigger !== 'undefined';
  var canAnim = hasGSAP && !RM;

  var lenis = null;
  var menuOpen = false;
  var navEl = $('.nav');
  var burger = $('.nav__burger');
  var overlay = $('.menu-overlay');
  var C = window.SITE_CONTENT || {};
  var voices = (C.voices && C.voices.quotes) || [];

  function cfgOk() {
    var cfg = window.SITE_CONFIG || {};
    return cfg.supabaseUrl && cfg.anonKey && String(cfg.supabaseUrl).indexOf('YOUR-PROJECT-REF') === -1;
  }

  async function resolveContent() {
    if (!cfgOk()) return C;
    try {
      var ctrl = ('AbortController' in window) ? new AbortController() : null;
      var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 3000) : null;
      var r = await fetch(String(window.SITE_CONFIG.supabaseUrl).replace(/\/$/, '') + '/rest/v1/sta_web_site_content?select=data,version,updated_at&id=eq.main', {
        headers: { apikey: window.SITE_CONFIG.anonKey, Accept: 'application/json' },
        cache: 'no-store',
        signal: ctrl ? ctrl.signal : undefined
      });
      if (timer) clearTimeout(timer);
      if (r.ok) {
        var j = await r.json();
        if (j && j[0] && j[0].data && Object.keys(j[0].data).length) {
          window.SITE_CONTENT_META = {
            source: 'cloud',
            version: j[0].version || null,
            updatedAt: j[0].updated_at || null
          };
          return j[0].data;
        }
      }
    } catch (e) { /* offline or not configured, fallback */ }
    window.SITE_CONTENT_META = { source: cfgOk() ? 'local-fallback' : 'local' };
    return C;
  }

  function initTracking() {
    if (new URLSearchParams(location.search).has('visual')) return; /* 后台可视化编辑模式不记日志 */
    if (!cfgOk()) return;
    var endpoint = String(window.SITE_CONFIG.supabaseUrl).replace(/\/$/, '') + '/functions/v1/log-visit';
    var vid;
    try {
      vid = localStorage.getItem('sta_vid');
      if (!vid) {
        vid = (window.crypto && crypto.randomUUID)
          ? crypto.randomUUID()
          : 'v-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
        localStorage.setItem('sta_vid', vid);
      }
    } catch (e) {
      vid = 'anon-' + Math.random().toString(36).slice(2, 10);
    }
    function send(kind, section) {
      var payload = {
        kind: kind,
        visitor_id: vid,
        path: location.pathname,
        section: section || null,
        referrer: document.referrer || null,
        screen: window.innerWidth + 'x' + window.innerHeight,
        lang: navigator.language || null
      };
      try {
        var blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
        if (!(navigator.sendBeacon && navigator.sendBeacon(endpoint, blob))) {
          fetch(endpoint, { method: 'POST', body: blob, keepalive: true }).catch(function () {});
        }
      } catch (e) {}
    }
    send('pageview');
    if (!('IntersectionObserver' in window) || RM) return;
    var seen = {};
    try { seen = JSON.parse(sessionStorage.getItem('sta_seen') || '{}'); } catch (e) {}
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var id = en.target.id;
        if (!id || id === 'home' || seen[id]) return;
        seen[id] = 1;
        try { sessionStorage.setItem('sta_seen', JSON.stringify(seen)); } catch (e) {}
        send('section', id);
      });
    }, { threshold: 0.4 });
    ['about', 'history', 'org', 'depts', 'events', 'voices', 'join'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) io.observe(el);
    });
  }

  var ICONS = {
    down: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 4v16m0 0l-6-6m6 6l6-6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    right: '<svg viewBox="0 0 24 24" fill="none"><path d="M4 12h16m0 0l-6-6m6 6l-6 6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" fill="none"><path d="M7 17L17 7m0 0H8m9 0v9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  };

  function h(tag, cls, text) {
    var el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) el.textContent = text;
    return el;
  }
  function applyLogo(src) {
    var mark = $('.logo__mark');
    if (mark) {
      mark.textContent = '';
      mark.classList.add('logo__mark--img');
      var im = document.createElement('img');
      im.src = src;
      im.alt = 'STA';
      mark.appendChild(im);
    }
    var jl = $('.join-logo');
    if (jl) jl.src = src;
    var fav = $('link[rel="icon"]');
    if (fav) fav.setAttribute('href', src);
  }

  function lerp(a, b, n) { return a + (b - a) * n; }

  function applyContent() {
    if (!C || !C.brand) return;
    document.title = C.meta.title || document.title;
    var md = $('meta[name="description"]');
    if (md && C.meta.description) md.setAttribute('content', C.meta.description);

    var plBrand = $('.preloader__brand');
    if (plBrand) {
      plBrand.textContent = '';
      plBrand.appendChild(document.createTextNode(C.brand.shortEN));
      plBrand.appendChild(h('span', null, C.brand.nameCN));
    }
    if (C.brand.logo) {
      var probe = new Image();
      probe.onload = function () { applyLogo(C.brand.logo); };
      probe.src = C.brand.logo;
    }

    $('[data-brand-cn]').textContent = C.brand.nameCN;
    $('[data-brand-en]').textContent = C.brand.nameEN.toUpperCase();
    $('[data-foot-en]').textContent = C.brand.nameEN.toUpperCase();
    $('.nav__cta .btn__label').textContent = C.nav.ctaLabel;

    var linksWrap = $('.nav__links');
    C.nav.links.forEach(function (l) {
      var a = h('a', null, l.label);
      a.href = l.href;
      linksWrap.appendChild(a);
    });
    var menuWrap = $('.menu-overlay__links');
    C.nav.links.forEach(function (l, i) {
      var a = h('a');
      a.href = l.href;
      a.appendChild(h('span', 'menu-num', String(i + 1).padStart(2, '0')));
      a.appendChild(h('span', 'menu-txt', l.label));
      menuWrap.appendChild(a);
    });

    $('[data-hero-eyebrow]').textContent = C.hero.eyebrow;
    $('[data-hero-line1]').textContent = C.hero.line1;
    $('[data-hero-line2]').textContent = C.hero.line2;
    $('[data-hero-sub]').textContent = C.hero.sub;
    $('[data-hero-note]').textContent = C.hero.scrollNote;
    $('[data-scroll-cue]').textContent = C.hero.scrollCue;
    $('[data-ring-text]').textContent = C.hero.ringText;

    var ctas = $('[data-hero-ctas]');
    C.hero.ctas.forEach(function (c) {
      var a = h('a', 'btn' + (c.icon === 'right' ? ' btn--ghost' : ''));
      a.href = c.href;
      a.setAttribute('data-magnetic', '');
      a.appendChild(h('span', 'btn__label', c.label));
      var ic = h('span', 'btn__icon');
      ic.innerHTML = ICONS[c.icon] || ICONS.right;
      a.appendChild(ic);
      ctas.appendChild(a);
    });

    var badges = $('[data-hero-badges]') || $('.hero-badges');
    var speeds = [0.4, -0.3, 0.55, -0.45];
    C.hero.badges.forEach(function (b, i) {
      var wrap = h('span', 'badge-wrap b' + (i + 1));
      wrap.setAttribute('data-speed', String(speeds[i % speeds.length]));
      var badge = h('span', 'badge');
      badge.appendChild(h('i'));
      badge.appendChild(document.createTextNode(b));
      wrap.appendChild(badge);
      badges.appendChild(wrap);
    });

    $$('[data-marquee]').forEach(function (mq) {
      var items = mq.getAttribute('data-marquee') === '1' ? C.marquee1 : C.marquee2;
      var track = mq.querySelector('.marquee__track');
      for (var g = 0; g < 2; g++) {
        var group = h('div', 'marquee__group');
        items.forEach(function (t) {
          group.appendChild(h('span', 'marquee__txt', t));
          group.appendChild(h('i', 'mq-dot'));
        });
        track.appendChild(group);
      }
    });

    $('[data-about-eyebrow]').textContent = C.about.eyebrow;
    $('[data-about-title]').textContent = C.about.title;
    $('[data-about-lead]').textContent = C.about.lead;
    $('[data-ghost="ABOUT"]').textContent = C.about.ghost;
    $('[data-about-html]').innerHTML = C.about.descHTML;
    if (C.about.art) {
      var fig = h('figure', 'about-art');
      var aim = document.createElement('img');
      aim.src = C.about.art;
      aim.alt = 'STA';
      aim.loading = 'lazy';
      fig.appendChild(aim);
      $('.about-body').appendChild(fig);
    }
    var factsWrap = $('[data-about-facts]');
    C.about.facts.forEach(function (f) {
      var d = h('div', 'fact');
      d.appendChild(h('k', null, f.k));
      d.appendChild(h('b', null, f.v));
      factsWrap.appendChild(d);
    });
    var statsWrap = $('[data-about-stats]');
    C.about.stats.forEach(function (s) {
      var d = h('div', 'stat');
      var top = h('div', 'stat-top');
      var num = h('span', 'stat-num', '0');
      num.setAttribute('data-count', String(s.num));
      top.appendChild(num);
      if (s.suffix) top.appendChild(h('span', 'stat-suf', s.suffix));
      d.appendChild(top);
      d.appendChild(h('p', 'stat-label', s.label));
      statsWrap.appendChild(d);
    });

    $('[data-history-eyebrow]').textContent = C.history.eyebrow;
    $('[data-history-title]').textContent = C.history.title;
    $('[data-history-desc]').textContent = C.history.desc;
    $('[data-ghost="HISTORY"]').textContent = C.history.ghost;
    var tlWrap = $('[data-history-items]');
    C.history.items.forEach(function (it) {
      var li = h('li', 'tl-item');
      li.setAttribute('data-reveal', '');
      li.appendChild(h('span', 't-year', it.year));
      li.appendChild(h('p', 't-text', it.text));
      tlWrap.appendChild(li);
    });

    $('[data-org-eyebrow]').textContent = C.org.eyebrow;
    $('[data-org-title]').textContent = C.org.title;
    $('[data-org-desc]').textContent = C.org.desc;
    $('[data-ghost="TEAM"]').textContent = C.org.ghost;
    var orgWrap = $('[data-org-groups]');
    C.org.groups.forEach(function (g) {
      var card = h('div', 'org-card');
      card.setAttribute('data-reveal', '');
      card.appendChild(h('h3', 'org-name', g.name));
      card.appendChild(h('span', 'org-motto', '【' + g.motto + '】'));
      var lb = h('div', 'org-block');
      lb.appendChild(h('span', 'org-role', g.leader.title));
      var ld = h('div', 'org-leader');
      var lms = h('div', 'org-members');
      g.leader.names.forEach(function (n) { lms.appendChild(h('span', 'org-chip', n)); });
      ld.appendChild(lms);
      lb.appendChild(ld);
      card.appendChild(lb);
      var mb = h('div', 'org-block');
      mb.appendChild(h('span', 'org-role', g.members.title));
      var ms = h('div', 'org-members');
      g.members.names.forEach(function (n) { ms.appendChild(h('span', 'org-chip', n)); });
      mb.appendChild(ms);
      card.appendChild(mb);
      orgWrap.appendChild(card);
    });

    $('[data-depts-eyebrow]').textContent = C.depts.eyebrow;
    $('[data-depts-title]').textContent = C.depts.title;
    $('[data-depts-desc]').textContent = C.depts.desc;
    $('[data-ghost="TEAMS"]').textContent = C.depts.ghost;
    var list = $('[data-depts-list]');
    list.before(h('p', 'depts-hint', '轻触部门，展开宣言与方向；再次轻触可收起。'));
    C.depts.items.forEach(function (d, i) {
      var row = h('div', 'dept-row');
      var heading = h('div', 'dept-heading');
      row.setAttribute('data-en', d.en);
      row.setAttribute('data-art', d.art);
      row.setAttribute('data-motto', d.motto);
      heading.appendChild(h('span', 'dept-num', String(i + 1).padStart(2, '0')));
      var main = h('div', 'dept-main');
      var title = h('h3', 'dept-name', d.name);
      title.id = 'dept-title-' + i;
      var toggle = h('button', 'dept-toggle');
      toggle.type = 'button';
      toggle.id = 'dept-toggle-' + i;
      toggle.setAttribute('aria-labelledby', title.id);
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-controls', 'dept-detail-' + i);
      main.appendChild(title);
      main.appendChild(h('p', 'dept-desc', d.desc));
      var heads = d.heads.map(function (hd) { return hd.role + '：' + hd.names.join(' · '); }).join('　');
      main.appendChild(h('p', 'dept-heads', heads));
      heading.appendChild(main);
      var side = h('div', 'dept-side');
      var tags = h('div', 'dept-tags');
      d.tags.forEach(function (t) { tags.appendChild(h('span', null, t)); });
      side.appendChild(tags);
      var arrow = h('span', 'dept-arrow');
      arrow.setAttribute('aria-hidden', 'true');
      arrow.innerHTML = ICONS.arrow;
      side.appendChild(arrow);
      heading.appendChild(side);
      heading.appendChild(toggle);
      row.appendChild(heading);
      var detail = h('div', 'dept-inline');
      detail.id = 'dept-detail-' + i;
      detail.hidden = true;
      detail.setAttribute('role', 'region');
      detail.setAttribute('aria-labelledby', toggle.id);
      var book = h('div', 'dept-preview__art dept-inline__book ' + (d.art || 'g1'));
      book.setAttribute('aria-hidden', 'true');
      book.appendChild(h('span', 'dept-inline__en', d.en));
      book.appendChild(h('span', 'dept-inline__name', d.name));
      detail.appendChild(book);
      var copy = h('div', 'dept-inline__copy');
      copy.appendChild(h('p', 'dept-inline__label', '部门宣言'));
      copy.appendChild(h('blockquote', 'dept-inline__motto', d.motto));
      var directions = h('div', 'dept-tags dept-inline__tags');
      d.tags.forEach(function (t) { directions.appendChild(h('span', null, t)); });
      copy.appendChild(directions);
      detail.appendChild(copy);
      row.appendChild(detail);
      list.appendChild(row);
    });

    $('[data-events-eyebrow]').textContent = C.events.eyebrow;
    $('[data-events-title]').textContent = C.events.title;
    $('[data-events-desc]').textContent = C.events.desc;
    $('[data-ghost="EVENTS"]').textContent = C.events.ghost;
    var track = $('[data-events-track]');
    C.events.items.forEach(function (ev, i) {
      var card = h('article', 'event-card');
      var cover = h('div', 'event-card__cover ' + (ev.art || 'g1'));
      if (ev.img) {
        var im = document.createElement('img');
        im.className = 'event-card__img';
        im.src = ev.img;
        im.alt = ev.title;
        im.loading = 'lazy';
        im.onerror = function () { im.remove(); };
        cover.appendChild(im);
      }
      cover.appendChild(h('span', 'event-idx', String(i + 1).padStart(2, '0')));
      cover.appendChild(h('span', 'event-date', ev.date));
      var body = h('div', 'event-card__body');
      body.appendChild(h('h3', null, ev.title));
      body.appendChild(h('p', null, ev.desc));
      var tags = h('div', 'event-tags');
      ev.tags.forEach(function (t) { tags.appendChild(h('span', null, t)); });
      body.appendChild(tags);
      card.appendChild(cover);
      card.appendChild(body);
      track.appendChild(card);
    });
    var more = h('a', 'event-card event-card--more');
    more.href = C.events.moreHref || '#join';
    more.innerHTML = ICONS.arrow;
    more.appendChild(h('span', null, C.events.moreLabel));
    track.appendChild(more);

    $('[data-voices-eyebrow]').textContent = C.voices.eyebrow;
    $('[data-voices-title]').textContent = C.voices.title;
    $('[data-voices-desc]').textContent = C.voices.desc;
    $('[data-ghost="VOICES"]').textContent = C.voices.ghost;
    var dotsWrap = $('[data-voice-dots]');
    voices.forEach(function (_, i) {
      var dot = h('button', 'voice-dot' + (i === 0 ? ' active' : ''));
      dot.type = 'button';
      dot.setAttribute('aria-label', '语录 ' + (i + 1));
      dotsWrap.appendChild(dot);
    });

    $('[data-join-eyebrow]').textContent = C.join.eyebrow;
    $('[data-join-tagline]').textContent = C.join.tagline;
    $('[data-join-title]').textContent = C.join.title;
    $('[data-join-desc]').textContent = C.join.desc;
    var jf = $('[data-join-facts]');
    C.join.facts.forEach(function (f) {
      var d = h('div', 'fact--light');
      d.appendChild(h('k', null, f.k));
      d.appendChild(h('b', null, f.v));
      jf.appendChild(d);
    });
    var steps = $('[data-join-steps]');
    C.join.steps.forEach(function (s) {
      var li = h('li', 'step');
      li.setAttribute('data-reveal', '');
      li.appendChild(h('span', 'step-num', s.num));
      li.appendChild(h('h4', 'step-title', s.title));
      li.appendChild(h('p', 'step-desc', s.desc));
      steps.appendChild(li);
    });
    $('[data-join-card-title]').textContent = C.join.cardTitle;
    $('[data-join-qqlabel]').textContent = C.join.qqLabel;
    $('[data-join-qqnum]').textContent = C.join.qqNumber;
    $('[data-join-qrnote]').textContent = C.join.qrNote;
    if (C.join.qrImg) {
      var qrBox = $('.qr');
      qrBox.textContent = '';
      var qi = document.createElement('img');
      qi.src = C.join.qrImg;
      qi.alt = 'QQ 招新群二维码';
      qi.loading = 'lazy';
      qrBox.appendChild(qi);
    }
    $('[data-join-copylabel]').textContent = C.join.copyLabel;
    $('[data-join-note]').textContent = C.join.note;
    $('.copy-qq').setAttribute('data-copy', C.join.copyText);

    $('[data-footer-big]').textContent = C.footer.bigText;
    var sl = $('[data-footer-slogans]');
    C.footer.slogans.forEach(function (s) { sl.appendChild(h('span', null, s)); });
    var cols = $('[data-footer-cols]');
    C.footer.cols.forEach(function (col) {
      var c = h('div', 'footer-col');
      c.appendChild(h('h4', null, col.h));
      var ul = h('ul');
      col.links.forEach(function (l) {
        var li = h('li');
        var a = h('a', null, l.t);
        a.href = l.href;
        li.appendChild(a);
        ul.appendChild(li);
      });
      c.appendChild(ul);
      cols.appendChild(c);
    });
    $('[data-footer-legal]').textContent = C.footer.legal;
    $('[data-footer-copy]').textContent = C.footer.copyright;
    $('[data-footer-version]').textContent = C.footer.version;
    $('[data-footer-credit]').textContent = C.footer.credit || '';
  }

  function splitEl(el) {
    var text = el.textContent;
    el.setAttribute('aria-label', text.trim());
    el.textContent = '';
    var frag = document.createDocumentFragment();
    var tokens = text.match(/[A-Za-z0-9&·！！？]+|\s|[\s\S]/g) || [];
    tokens.forEach(function (t) {
      if (/^\s+$/.test(t)) {
        frag.appendChild(document.createTextNode('\u00A0'));
        return;
      }
      var w = document.createElement('span');
      w.className = 'w';
      w.setAttribute('aria-hidden', 'true');
      var wi = document.createElement('span');
      wi.className = 'wi';
      wi.textContent = t;
      w.appendChild(wi);
      frag.appendChild(w);
    });
    el.appendChild(frag);
  }

  function splitAll() {
    $$('[data-split],[data-split-hero]').forEach(splitEl);
  }

  function setInitial() {
    if (!canAnim) return;
    var gsap = window.gsap;
    gsap.set('.wi', { yPercent: 120 });
    gsap.set('[data-intro]', { y: 34, opacity: 0 });
    gsap.set('.badge-wrap', { scale: .6, opacity: 0 });
    gsap.set('.hero-ring', { opacity: 0, scale: .7 });
    gsap.set('.scroll-cue,.hero-note', { opacity: 0 });
    gsap.set(navEl, { yPercent: -110 });
  }

  function heroIntro() {
    if (!canAnim) return;
    var gsap = window.gsap;
    var tl = gsap.timeline({ defaults: { ease: 'power4.out' } });
    tl.to(navEl, { yPercent: 0, duration: .9 }, 0)
      .to('.hero-title .wi', { yPercent: 0, duration: 1.25, stagger: .05 }, .05)
      .to('[data-intro]', { y: 0, opacity: 1, duration: 1, stagger: .13 }, .4)
      .to('.badge-wrap', { scale: 1, opacity: 1, duration: .9, ease: 'back.out(1.7)', stagger: .09 }, .6)
      .to('.hero-ring', { opacity: 1, scale: 1, duration: 1 }, .8)
      .to('.scroll-cue,.hero-note', { opacity: 1, duration: .8 }, 1);
  }

  function initLenis() {
    if (typeof window.Lenis === 'undefined' || RM) {
      document.documentElement.classList.add('no-smooth');
      return;
    }
    lenis = new window.Lenis({ duration: 1.15, smoothWheel: true });
    if (hasST) {
      lenis.on('scroll', window.ScrollTrigger.update);
      window.gsap.ticker.add(function (t) { lenis.raf(t * 1000); });
      window.gsap.ticker.lagSmoothing(0);
    } else {
      function raf(time) { lenis.raf(time); requestAnimationFrame(raf); }
      requestAnimationFrame(raf);
    }
  }

  function initCursor() {
    if (!FINE || RM) return;
    document.documentElement.classList.add('has-cursor');
    var dot = $('.cursor-dot');
    var ring = $('.cursor-ring');
    if (!dot || !ring) return;
    var mx = -100, my = -100, rx = -100, ry = -100, shown = false;
    window.addEventListener('mousemove', function (e) {
      mx = e.clientX; my = e.clientY;
      if (!shown) { shown = true; dot.style.opacity = 1; ring.style.opacity = 1; }
    }, { passive: true });
    var hoverSel = 'a,button,.dept-row,[data-magnetic]';
    document.addEventListener('mouseover', function (e) {
      if (e.target.closest(hoverSel)) ring.classList.add('is-hover');
    });
    document.addEventListener('mouseout', function (e) {
      if (e.target.closest(hoverSel)) ring.classList.remove('is-hover');
    });
    (function loop() {
      rx = lerp(rx, mx, .16);
      ry = lerp(ry, my, .16);
      dot.style.transform = 'translate3d(' + mx + 'px,' + my + 'px,0)';
      ring.style.transform = 'translate3d(' + rx + 'px,' + ry + 'px,0)';
      requestAnimationFrame(loop);
    })();
  }

  function setMenu(open) {
    menuOpen = open;
    document.documentElement.classList.toggle('menu-open', open);
    if (burger) {
      burger.classList.toggle('open', open);
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    if (overlay) overlay.classList.toggle('open', open);
    if (lenis) { open ? lenis.stop() : lenis.start(); }
  }

  function initNav() {
    if (burger) burger.addEventListener('click', function () { setMenu(!menuOpen); });
  }

  function scrollToTarget(target) {
    if (lenis) {
      lenis.scrollTo(target, { offset: -72, duration: 1.4 });
    } else {
      target.scrollIntoView({ behavior: RM ? 'auto' : 'smooth', block: 'start' });
    }
  }

  function initAnchors() {
    $$('a[href^="#"]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        var id = a.getAttribute('href');
        if (!id || id === '#') return;
        var target = $(id);
        if (!target) return;
        e.preventDefault();
        if (menuOpen) setMenu(false);
        setTimeout(function () { scrollToTarget(target); }, menuOpen ? 350 : 0);
      });
    });
  }

  function initScrollspy() {
    var links = $$('.nav__links a');
    if (!links.length || !('IntersectionObserver' in window)) return;
    var map = {};
    links.forEach(function (a) {
      var id = (a.getAttribute('href') || '').slice(1);
      var sec = document.getElementById(id);
      if (sec) map[id] = a;
    });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        links.forEach(function (a) { a.classList.remove('active'); });
        var a = map[en.target.id];
        if (a) a.classList.add('active');
      });
    }, { rootMargin: '-40% 0px -55% 0px' });
    Object.keys(map).forEach(function (id) { io.observe(document.getElementById(id)); });
  }

  function initCanvas() {
    var canvas = $('.hero-canvas');
    var hero = $('.hero');
    if (!canvas || !hero) return;
    var ctx = canvas.getContext('2d');
    if (!ctx) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W = 0, H = 0, nodes = [], running = true;
    var mouse = { x: -9999, y: -9999 };

    function resize() {
      W = hero.offsetWidth;
      H = hero.offsetHeight;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width = W + 'px';
      canvas.style.height = H + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      build();
      if (RM) draw();
    }
    function build() {
      nodes = [];
      var count = Math.min(Math.floor((W * H) / 16000), 90);
      for (var i = 0; i < count; i++) {
        nodes.push({
          x: Math.random() * W,
          y: Math.random() * H,
          vx: (Math.random() - .5) * .5,
          vy: (Math.random() - .5) * .5,
          r: Math.random() * 1.6 + .8
        });
      }
    }
    function step() {
      nodes.forEach(function (n) {
        n.x += n.vx; n.y += n.vy;
        var dx = n.x - mouse.x, dy = n.y - mouse.y;
        var d2 = dx * dx + dy * dy;
        if (d2 < 130 * 130 && d2 > 0.01) {
          var d = Math.sqrt(d2);
          n.x += (dx / d) * .6;
          n.y += (dy / d) * .6;
        }
        if (n.x < -20) n.x = W + 20; else if (n.x > W + 20) n.x = -20;
        if (n.y < -20) n.y = H + 20; else if (n.y > H + 20) n.y = -20;
      });
    }
    function draw() {
      ctx.clearRect(0, 0, W, H);
      var linkDist = 130;
      for (var i = 0; i < nodes.length; i++) {
        var a = nodes[i];
        for (var j = i + 1; j < nodes.length; j++) {
          var b = nodes[j];
          var dx = a.x - b.x, dy = a.y - b.y;
          var d = Math.sqrt(dx * dx + dy * dy);
          if (d < linkDist) {
            var alpha = (1 - d / linkDist) * .14;
            ctx.strokeStyle = 'rgba(29,89,242,' + alpha.toFixed(3) + ')';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
        var mdx = a.x - mouse.x, mdy = a.y - mouse.y;
        var md = Math.sqrt(mdx * mdx + mdy * mdy);
        if (md < 170) {
          var ma = (1 - md / 170) * .35;
          ctx.strokeStyle = 'rgba(29,89,242,' + ma.toFixed(3) + ')';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(mouse.x, mouse.y);
          ctx.stroke();
        }
        ctx.fillStyle = 'rgba(29,89,242,.45)';
        ctx.beginPath();
        ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    hero.addEventListener('mousemove', function (e) {
      var rect = hero.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
    }, { passive: true });
    hero.addEventListener('mouseleave', function () { mouse.x = -9999; mouse.y = -9999; });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        running = entries[0].isIntersecting;
      }).observe(hero);
    }
    window.addEventListener('resize', resize);
    resize();
    if (!RM) requestAnimationFrame(function loop() {
      if (running) { step(); draw(); }
      requestAnimationFrame(loop);
    }); else draw();
  }

  function initHeroChars() {
    if (!FINE || !canAnim) return;
    var chars = $$('.hero-title .w');
    var hero = $('.hero');
    if (!chars.length || !hero) return;
    var state = chars.map(function () { return { x: 0, y: 0, tx: 0, ty: 0 }; });
    var active = false;
    hero.addEventListener('mousemove', function (e) {
      active = true;
      chars.forEach(function (c, i) {
        var r = c.getBoundingClientRect();
        var cx = r.left + r.width / 2;
        var cy = r.top + r.height / 2;
        var dx = e.clientX - cx, dy = e.clientY - cy;
        var d = Math.sqrt(dx * dx + dy * dy);
        if (d < 160 && d > 0) {
          var f = (1 - d / 160) * 18;
          state[i].tx = -(dx / d) * f;
          state[i].ty = -(dy / d) * f;
        } else {
          state[i].tx = 0; state[i].ty = 0;
        }
      });
    }, { passive: true });
    hero.addEventListener('mouseleave', function () {
      active = false;
      state.forEach(function (s) { s.tx = 0; s.ty = 0; });
    });
    (function loop() {
      chars.forEach(function (c, i) {
        var s = state[i];
        s.x = lerp(s.x, s.tx, .12);
        s.y = lerp(s.y, s.ty, .12);
        c.style.transform = 'translate3d(' + s.x.toFixed(2) + 'px,' + s.y.toFixed(2) + 'px,0)';
      });
      requestAnimationFrame(loop);
    })();
  }

  function initReveals() {
    if (!canAnim) return;
    var gsap = window.gsap;
    var ST = window.ScrollTrigger;
    if (!ST) {
      gsap.set('.wi', { clearProps: 'all' });
      return;
    }
    $$('[data-split]').forEach(function (el) {
      var wis = el.querySelectorAll('.wi');
      if (!wis.length) return;
      gsap.to(wis, {
        yPercent: 0, duration: 1.15, ease: 'power4.out', stagger: .06,
        scrollTrigger: { trigger: el, start: 'top 86%', once: true }
      });
    });
    $$('[data-reveal]').forEach(function (el) {
      if (el.closest('.hero')) return;
      gsap.from(el, {
        y: 44, opacity: 0, duration: 1.05, ease: 'power3.out',
        scrollTrigger: { trigger: el, start: 'top 88%', once: true }
      });
    });
    $$('[data-reveal-group]').forEach(function (group) {
      gsap.from(Array.prototype.slice.call(group.children), {
        y: 48, opacity: 0, duration: 1, ease: 'power3.out', stagger: .12,
        scrollTrigger: { trigger: group, start: 'top 86%', once: true }
      });
    });
    $$('.event-card').forEach(function (card, i) {
      gsap.from(card, {
        y: 60, opacity: 0, duration: .95, delay: (i % 4) * .08, ease: 'power3.out',
        scrollTrigger: { trigger: '#events', start: 'top 70%', once: true }
      });
    });
  }

  function initCounters() {
    var els = $$('[data-count]');
    if (!els.length) return;
    if (!('IntersectionObserver' in window)) {
      els.forEach(function (el) { el.textContent = el.dataset.count; });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        io.unobserve(entry.target);
        var el = entry.target;
        var end = parseFloat(el.dataset.count) || 0;
        if (RM) { el.textContent = String(end); return; }
        var t0 = performance.now();
        var dur = 1600;
        (function tick(now) {
          var p = Math.min((now - t0) / dur, 1);
          var eased = 1 - Math.pow(2, -10 * p);
          el.textContent = String(Math.round(end * (p === 1 ? 1 : eased)));
          if (p < 1) requestAnimationFrame(tick);
        })(t0);
      });
    }, { threshold: .5 });
    els.forEach(function (el) { io.observe(el); });
  }

  function initEventsPin() {
    if (!canAnim || !hasST) return;
    var track = $('[data-events-track]');
    var prog = $('.events-progress i');
    if (!track) return;
    var mm = window.gsap.matchMedia();
    mm.add('(min-width: 900px)', function () {
      var dist = function () { return Math.max(0, track.scrollWidth - window.innerWidth); };
      var tw = window.gsap.to(track, {
        x: function () { return -dist(); },
        ease: 'none',
        scrollTrigger: {
          trigger: '.events-pin',
          start: 'top top',
          end: function () { return '+=' + dist(); },
          pin: true,
          scrub: 1,
          anticipatePin: 1,
          invalidateOnRefresh: true,
          onUpdate: function (self) {
            if (prog) prog.style.transform = 'scaleX(' + self.progress + ')';
          }
        }
      });
      return function () {
        if (tw.scrollTrigger) tw.scrollTrigger.kill();
        tw.kill();
        window.gsap.set(track, { clearProps: 'transform' });
      };
    });
  }

  function initLineScrub(lineSel, wrapSel, endStr) {
    if (!canAnim || !hasST) return;
    var fill = $(lineSel);
    var wrap = $(wrapSel);
    if (!fill || !wrap) return;
    window.gsap.to(fill, {
      scaleY: 1, ease: 'none',
      scrollTrigger: { trigger: wrap, start: 'top 78%', end: endStr || 'bottom 45%', scrub: .6 }
    });
  }

  function initParallax() {
    if (!canAnim || !hasST) return;
    $$('[data-speed]').forEach(function (el) {
      var sp = parseFloat(el.dataset.speed) || 0;
      var sec = el.closest('section') || el.parentElement;
      window.gsap.fromTo(el, {
        y: sp * 80
      }, {
        y: sp * -80,
        ease: 'none',
        scrollTrigger: { trigger: sec, start: 'top bottom', end: 'bottom top', scrub: true }
      });
    });
  }

  function initDeptsPreview() {
    var preview = $('.dept-preview');
    var list = $('[data-depts-list]');
    if (!list) return;
    var rows = $$('.dept-row', list);
    var hoverMedia = window.matchMedia('(min-width: 1024px) and (hover: hover) and (pointer: fine)');
    function syncInputHint() {
      var desc = $('[data-depts-desc]');
      if (desc) desc.textContent = hoverMedia.matches ? C.depts.desc : String(C.depts.desc || '').replace(/悬停每一行/g, '轻触每一行');
    }
    syncInputHint();
    var raf = 0;
    function hidePreview() {
      if (preview) preview.classList.remove('on');
      cancelAnimationFrame(raf);
      raf = 0;
    }
    function setExpanded(row, expanded) {
      row.classList.toggle('is-open', expanded);
      $('.dept-toggle', row).setAttribute('aria-expanded', String(expanded));
      $('.dept-inline', row).hidden = !expanded;
    }
    rows.forEach(function (row) {
      var button = $('.dept-toggle', row);
      button.addEventListener('click', function () {
        var top = row.getBoundingClientRect().top;
        var expanded = !row.classList.contains('is-open');
        rows.forEach(function (other) { setExpanded(other, other === row && expanded); });
        hidePreview();
        // Keep the tapped heading in place when an earlier department collapses.
        var delta = row.getBoundingClientRect().top - top;
        if (Math.abs(delta) > 1) {
          if (lenis) lenis.scrollTo(window.scrollY + delta, { immediate: true });
          else window.scrollBy({ top: delta, behavior: 'instant' });
        }
        if (hasST) window.ScrollTrigger.refresh();
      });
      row.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape' || !row.classList.contains('is-open')) return;
        setExpanded(row, false);
        button.focus({ preventScroll: true });
        if (hasST) window.ScrollTrigger.refresh();
      });
    });
    hoverMedia.addEventListener('change', function () { hidePreview(); syncInputHint(); });
    if (!preview || RM) return;
    var art = $('.dept-preview__art', preview);
    var en = $('.dept-preview__en', preview);
    var motto = $('.dept-preview__motto', preview);
    var tx = window.innerWidth / 2, ty = window.innerHeight / 2, cx = tx, cy = ty;
    list.addEventListener('pointermove', function (e) {
      tx = e.clientX; ty = e.clientY;
    }, { passive: true });
    rows.forEach(function (row) {
      row.addEventListener('pointerenter', function (e) {
        if (!hoverMedia.matches || e.pointerType === 'touch' || row.classList.contains('is-open')) return;
        tx = e.clientX; ty = e.clientY;
        cx = tx; cy = ty;
        if (en) en.textContent = row.dataset.en || '';
        if (motto) motto.textContent = row.dataset.motto ? '【' + row.dataset.motto + '】' : '';
        if (art) art.className = 'dept-preview__art ' + (row.dataset.art || 'g1');
        preview.classList.add('on');
        if (!raf) loop();
      });
      row.addEventListener('pointerleave', hidePreview);
    });
    window.addEventListener('blur', hidePreview);
    document.addEventListener('visibilitychange', hidePreview);
    function loop() {
      cx = lerp(cx, tx, .11);
      cy = lerp(cy, ty, .11);
      var rot = (tx - cx) * .04;
      preview.style.transform = 'translate3d(' + cx.toFixed(1) + 'px,' + cy.toFixed(1) + 'px,0)';
      art.style.rotate = rot.toFixed(2) + 'deg';
      raf = requestAnimationFrame(loop);
    }
  }

  function initMagnetic() {
    if (!FINE || RM) return;
    $$('[data-magnetic]').forEach(function (b) {
      b.classList.add('magnetic');
      b.addEventListener('mousemove', function (e) {
        var r = b.getBoundingClientRect();
        var dx = e.clientX - (r.left + r.width / 2);
        var dy = e.clientY - (r.top + r.height / 2);
        b.style.transform = 'translate(' + (dx * .28).toFixed(1) + 'px,' + (dy * .28).toFixed(1) + 'px)';
      });
      b.addEventListener('mouseleave', function () {
        b.style.transform = 'translate(0,0)';
      });
    });
  }

  function initVoices() {
    var box = $('.voice-box');
    var stage = $('[data-voice-stage]');
    var dotsWrap = $('[data-voice-dots]');
    if (!box || !stage || !voices.length) return;
    var dots = $$('.voice-dot', dotsWrap);
    var idx = 0, timer = null;

    function render(i) {
      stage.textContent = '';
      var q = h('blockquote', 'voice-quote', '「' + voices[i].text + '」');
      var a = h('p', 'voice-author', '—— ' + voices[i].author);
      stage.appendChild(q);
      stage.appendChild(a);
    }
    function syncDots() {
      dots.forEach(function (d, i) { d.classList.toggle('active', i === idx); });
    }
    function restart() {
      clearInterval(timer);
      if (!RM) timer = setInterval(function () { go(idx + 1); }, 5200);
    }
    function go(i) {
      idx = (i + voices.length) % voices.length;
      box.classList.add('switching');
      setTimeout(function () {
        render(idx);
        syncDots();
        box.classList.remove('switching');
      }, RM ? 0 : 430);
    }
    dots.forEach(function (d, i) {
      d.addEventListener('click', function () { go(i); restart(); });
    });
    box.addEventListener('mouseenter', function () { clearInterval(timer); });
    box.addEventListener('mouseleave', restart);
    render(0);
    restart();
  }

  var toastTimer = null;
  function toast(msg) {
    var t = $('.toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2200);
  }

  function initMisc() {
    var prog = $('.scroll-progress i');
    var backtop = $('.backtop');
    var lastY = 0;
    function maxScroll() {
      return Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    }
    function onScroll() {
      var y = window.scrollY || window.pageYOffset || 0;
      if (navEl) {
        navEl.classList.toggle('nav--scrolled', y > 40);
        if (y > lastY + 4 && y > 420 && !menuOpen) navEl.classList.add('nav--hidden');
        else if (y < lastY - 4 || y <= 420) navEl.classList.remove('nav--hidden');
      }
      if (prog) prog.style.transform = 'scaleX(' + Math.min(y / maxScroll(), 1) + ')';
      if (backtop) backtop.classList.toggle('show', y > 640);
      lastY = y;
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    if (backtop) backtop.addEventListener('click', function () {
      if (lenis) lenis.scrollTo(0, { duration: 1.4 });
      else window.scrollTo({ top: 0, behavior: RM ? 'auto' : 'smooth' });
    });
    var copyBtn = $('.copy-qq');
    if (copyBtn) {
      copyBtn.addEventListener('click', function () {
        var text = copyBtn.dataset.copy || '';
        function legacy() {
          var ta = document.createElement('textarea');
          ta.value = text;
          ta.style.position = 'fixed';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.select();
          try {
            document.execCommand('copy');
            toast('群号已复制：' + text);
          } catch (err) {
            toast('复制失败，请手动复制群号');
          }
          ta.remove();
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text)
            .then(function () { toast('群号已复制：' + text); })
            .catch(legacy);
        } else {
          legacy();
        }
      });
    }
  }

  function initPreloader() {
    var pl = $('.preloader');
    document.body.classList.add('locked');
    var finished = false;
    var dart = window.STA_DART_SPLASH;
    var dartInstance = null;
    var dartRaf = 0;
    function finish() {
      if (finished) return;
      finished = true;
      if (dartRaf) cancelAnimationFrame(dartRaf);
      if (dartInstance && dartInstance.destroy) dartInstance.destroy();
      if (pl) {
        pl.classList.add('done');
        setTimeout(function () { if (pl.parentNode) pl.parentNode.removeChild(pl); }, 1100);
      }
      document.body.classList.remove('locked');
      heroIntro();
    }
    if (dart && pl && !RM) {
      dartInstance = dart.mount(pl, { content: C });
      pl.classList.add('preloader--dart-active');
      var dartStart = performance.now();
      var dartLast = dartStart;
      var dartTick = function (now) {
        if (finished || !dartInstance) return;
        var dartDt = Math.min((now - dartLast) / 1000, .06);
        dartLast = now;
        var t = Math.min((now - dartStart) / 1000, dart.duration + .95);
        try {
          dartInstance.frame(t, dartDt);
        } catch (e) {
          console.error('[STA] splash animation failed', e);
          finish();
          return;
        }
        if (t >= dart.duration + .95) {
          finish();
          return;
        }
        dartRaf = requestAnimationFrame(dartTick);
      };
      dartRaf = requestAnimationFrame(dartTick);
      return;
    }
    if (dart && pl && RM) {
      finish();
      return;
    }
    var num = $('.preloader__num');
    var bar = $('.preloader__bar i');
    if (canAnim) {
      var o = { v: 0 };
      window.gsap.to(o, {
        v: 100, duration: 1.7, ease: 'power2.inOut',
        onUpdate: function () {
          if (num) num.textContent = String(Math.round(o.v)).padStart(3, '0');
          if (bar) bar.style.transform = 'scaleX(' + o.v / 100 + ')';
        },
        onComplete: finish
      });
      setTimeout(finish, 4200);
    } else {
      setTimeout(finish, 250);
    }
  }

  async function boot() {
    C = await resolveContent();
    voices = (C.voices && C.voices.quotes) || [];
    applyContent();
    splitAll();
    setInitial();
    initLenis();
    initCursor();
    initNav();
    initAnchors();
    initScrollspy();
    initCanvas();
    initHeroChars();
    initReveals();
    initCounters();
    initEventsPin();
    initLineScrub('.steps-line i', '.steps-wrap');
    initLineScrub('.timeline-line i', '.timeline-wrap', 'bottom 60%');
    initParallax();
    initDeptsPreview();
    initMagnetic();
    initVoices();
    initMisc();
    initTracking();
    initPreloader();
    window.addEventListener('load', function () {
      if (hasST) window.ScrollTrigger.refresh();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
