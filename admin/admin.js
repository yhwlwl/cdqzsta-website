(function () {
  'use strict';

  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  var CFG = window.SITE_CONFIG || {};
  var API = String(CFG.supabaseUrl || '').replace(/\/$/, '');
  var ANON = CFG.anonKey || '';

  var TOKEN = localStorage.getItem('sta_admin_token') || null;
  var ME = null;
  var DATA = null;
  var LOADED = null;
  var CHART = null;
  var ROWS = [];
  var PAGE = 1;
  var PAGESIZE = 50;

  var LABELS = {
    meta: '基础信息', brand: '品牌信息', nav: '导航', hero: '首页首屏',
    marquee1: '跑马灯一', marquee2: '跑马灯二', about: '关于板块', history: '发展历程',
    org: '组织架构', depts: '六大部门', events: '近期活动', voices: '科协的声音',
    join: '招新板块', footer: '页脚', data: '内容', items: '列表', links: '链接',
    cols: '栏目', groups: '分组', steps: '步骤', facts: '信息条', stats: '统计数字',
    quotes: '语录', badges: '悬浮徽章', heads: '负责人', leader: '负责人', members: '成员',
    title: '标题', label: '文字', name: '名称', text: '文本', desc: '描述', descHTML: '简介（富文本）',
    lead: '导语', year: '年份', motto: '口号', en: '英文', num: '数值', suffix: '后缀',
    date: '日期', img: '图片', art: '配色', tags: '标签', href: '链接地址', icon: '图标',
    author: '作者', role: '角色', names: '名单', email: '邮箱', k: '标签', v: '内容',
    eyebrow: '眉题', ghost: '背景字', sub: '副标题', note: '备注', version: '版本号',
    copyright: '版权', legal: '法律声明', credit: '署名', moreLabel: '更多按钮文字',
    moreHref: '更多按钮链接', qqLabel: '群号标签', qqNumber: '群号', copyText: '复制文本',
    copyLabel: '复制按钮文字', qrImg: '二维码图片', qrNote: '二维码备注', cardTitle: '卡片标题',
    tagline: '标语', scrollCue: '滚动提示词', scrollNote: '滚动提示语', ringText: '环形文字',
    line1: '第一行', line2: '第二行', ctaLabel: '按钮文字', bigText: '大字', slogans: '口号列表',
    h: '栏目标题', t: '文字', kind: '类型'
  };
  function kl(key) { return LABELS[key] || key; }

  var SECTION_META = {
    meta:    { label: '基础信息', hint: '浏览器标签页上的标题和描述文字' },
    brand:   { label: '品牌信息', hint: '左上角 Logo 旁边的协会名称（中/英文）', anchor: 'home' },
    nav:     { label: '导航菜单', hint: '顶部导航的链接文字与「加入我们」按钮' },
    hero:    { label: '首屏大标题区', hint: '页面最顶上一屏：大字标题、副标题、两个按钮、悬浮徽章、环形文字', anchor: 'home' },
    marquee1:{ label: '跑马灯一', hint: '首屏正下方那条横向滚动的关键词' },
    about:   { label: '关于板块', hint: '「关于科协」：左侧简介与信息卡、右侧插画、四个统计数字', anchor: 'about' },
    history: { label: '发展历程', hint: '竖向年份时间线（1999 → 2026）', anchor: 'history' },
    org:     { label: '组织架构', hint: '主席层 / 运营委员会 / 财务委员会 三张卡片', anchor: 'org' },
    depts:   { label: '六大部门', hint: '部门列表行，悬停浮现部门宣言卡片', anchor: 'depts' },
    events:  { label: '近期活动', hint: '横向滑动的活动照片卡片画廊', anchor: 'events' },
    voices:  { label: '科协的声音', hint: '自动轮播的语录区块', anchor: 'voices' },
    join:    { label: '招新板块', hint: '底部深蓝色区域：标语、报名步骤、QQ 群卡片', anchor: 'join' },
    marquee2:{ label: '跑马灯二', hint: '招新深蓝区上方那条反向滚动的文字' },
    footer:  { label: '页脚', hint: '页面最底部：巨型 STA 字样、口号、栏目链接、法律声明、署名' }
  };

  function toast(msg, isErr) {
    var t = $('#toast');
    t.textContent = msg;
    t.classList.toggle('err', !!isErr);
    t.hidden = false;
    clearTimeout(t._timer);
    t._timer = setTimeout(function () { t.hidden = true; }, 2600);
  }

  function api(path, opts) {
    opts = opts || {};
    var headers = {
      apikey: ANON,
      Authorization: 'Bearer ' + ANON,
      'Content-Type': 'application/json'
    };
    if (TOKEN) headers['x-admin-token'] = TOKEN;
    return fetch(API + path, {
      method: opts.method || 'GET',
      headers: headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined
    }).then(function (r) {
      return r.text().then(function (t) {
        var j = null;
        try { j = t ? JSON.parse(t) : null; } catch (e) {}
        if (!r.ok) throw new Error((j && (j.message || j.error)) || ('HTTP ' + r.status));
        return j;
      });
    });
  }
  function rpc(fn, body) { return api('/rest/v1/rpc/' + fn, { method: 'POST', body: body || {} }); }

  /* ---------- 图片上传（经 upload-image 边缘函数校验后台会话后写入 Storage） ---------- */
  var IMG_EXT_RE = /\.(png|jpe?g|webp|gif|jfif)(\?|$)/i;
  function looksLikeImage(key, v) {
    v = String(v == null ? '' : v);
    return /^(img|logo|art|qrImg)$/.test(String(key || '')) ||
      /^image_dev\//.test(v) ||
      (/^https?:\/\//.test(v) && IMG_EXT_RE.test(v)) ||
      /^data:image\//.test(v);
  }
  function imgSrc(v) {
    v = String(v || '');
    return /^https?:\/\/|^data:/.test(v) ? v : '/' + v;
  }

  function uploadImage(file) {
    var fd = new FormData();
    fd.append('file', file);
    return fetch(API + '/functions/v1/upload-image', {
      method: 'POST',
      headers: { 'x-admin-token': TOKEN || '' },
      body: fd
    }).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok || !j.ok) throw new Error((j && j.error) || ('HTTP ' + r.status));
        return j.url;
      });
    });
  }

  /* 图片更换弹窗（图床优先）：贴图床直链实时预览，或本机上传到网站 Storage。回调 onOk(newVal) */
  function imgDialog(cur, onOk) {
    var mask = document.createElement('div');
    mask.className = 'dlg-mask';
    mask.innerHTML =
      '<div class="dlg">' +
      '  <h3>更换图片</h3>' +
      '  <div class="dlg-preview"><span class="dlg-ph">在下方粘贴图片链接，这里会实时预览</span><img alt="" hidden></div>' +
      '  <label class="f-label">图床直链 / 仓库路径</label>' +
      '  <input class="f-input dlg-url" type="text" placeholder="https://你的图床/xxx.webp 或 image_dev/xxx.webp">' +
      '  <div class="dlg-msg"></div>' +
      '  <div class="dlg-or">— 或者上传本机图片（存到网站存储）—</div>' +
      '  <label class="btn-ghost-sm dlg-upload">选择本机图片上传<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden></label>' +
      '  <div class="dlg-acts"><button type="button" class="btn-ghost-sm dlg-cancel">取消</button><button type="button" class="btn-primary dlg-ok">使 用</button></div>' +
      '</div>';
    document.body.appendChild(mask);
    var box = mask.querySelector('.dlg');
    var img = box.querySelector('.dlg-preview img');
    var ph = box.querySelector('.dlg-ph');
    var urlInp = box.querySelector('.dlg-url');
    var fileInp = box.querySelector('input[type=file]');
    var msg = box.querySelector('.dlg-msg');
    var okBtn = box.querySelector('.dlg-ok');
    urlInp.value = cur || '';
    /* 预览加载状态：'ok' 可直接用；'fail' 提示防盗链/地址错误；null 加载中 */
    var prevState = null;
    setTimeout(function () { urlInp.focus(); }, 50);
    function setMsg(t, err) { msg.textContent = t || ''; msg.classList.toggle('err', !!err); }
    function close() { mask.remove(); }
    function apply(v) { close(); onOk(v); }
    function showPrev() {
      var v = urlInp.value.trim();
      ph.hidden = !!v;
      okBtn.disabled = !v;
      if (!v) { img.hidden = true; img.src = ''; prevState = null; setMsg(''); return; }
      prevState = null;
      img.hidden = false;
      img.src = imgSrc(v);
      setMsg('正在加载预览…');
    }
    img.onload = function () {
      prevState = 'ok';
      setMsg(img.naturalWidth ? '' : '已加载（未能识别图片尺寸，请确认是直接链接）');
      if (img.naturalWidth) setMsg('');
    };
    img.onerror = function () {
      if (img.hidden) return;
      prevState = 'fail';
      setMsg('链接无法加载：请检查地址是否正确、是否为直链，或该图床是否开启防盗链', true);
    };
    urlInp.addEventListener('input', showPrev);
    box.querySelector('.dlg-cancel').addEventListener('click', close);
    mask.addEventListener('click', function (e) { if (e.target === mask) close(); });
    mask.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    okBtn.addEventListener('click', function () {
      var v = urlInp.value.trim();
      if (!v || v === cur) { close(); return; }
      if (prevState === 'fail' && !window.confirm('预览加载失败（可能是防盗链或地址有误），仍要使用该地址吗？')) return;
      apply(v);
    });
    fileInp.addEventListener('change', function () {
      var f = fileInp.files && fileInp.files[0];
      if (!f) return;
      setMsg('正在上传「' + f.name + '」…');
      okBtn.disabled = true;
      uploadImage(f).then(function (u) {
        setMsg('已上传到网站存储');
        apply(u);
      }).catch(function (ex) {
        setMsg((ex.message || '上传失败') + '，可改贴图床链接', true);
        okBtn.disabled = false;
      });
    });
    showPrev();
  }

  function getPath(path) {
    return path.reduce(function (o, k) { return o == null ? o : o[k]; }, DATA);
  }
  function setPath(path, v) {
    var o = DATA;
    for (var i = 0; i < path.length - 1; i++) o = o[path[i]];
    o[path[path.length - 1]] = v;
  }
  function zeroClone(v) {
    if (typeof v === 'string') return '';
    if (typeof v === 'number') return 0;
    if (typeof v === 'boolean') return false;
    if (Array.isArray(v)) return [];
    if (v && typeof v === 'object') {
      var o = {};
      Object.keys(v).forEach(function (k) { o[k] = zeroClone(v[k]); });
      return o;
    }
    return null;
  }

  function hasPerm(p) {
    return ME && (ME.role === 'super' || (ME.permissions || []).indexOf(p) !== -1);
  }

  /* ---------- 登录 ---------- */
  function showLogin() {
    $('#login-view').hidden = false;
    $('#app-view').hidden = true;
  }
  function enterApp() {
    $('#login-view').hidden = true;
    $('#app-view').hidden = false;
    $('#whoami').textContent = ME.username + '\n' + (ME.role === 'super' ? '超级管理员' : '管理员');
    $$('.tab-btn').forEach(function (b) {
      /* 注意：data-super 是无值属性，dataset.super 返回 ""（falsy），
         必须用 hasAttribute 判断，否则普通管理员也能看到管理员面板 */
      var okSuper = !b.hasAttribute('data-super') || ME.role === 'super';
      var okPerm = !b.dataset.perm || hasPerm(b.dataset.perm);
      b.hidden = !(okSuper && okPerm);
    });
    /* 兜底：管理员面板里的超管字段（添加表单含「超级管理员」角色、管理员列表）对普通管理员一律隐藏 */
    $$('#tab-admins [data-super-card]').forEach(function (c) { c.hidden = ME.role !== 'super'; });
    var first = $$('.tab-btn').filter(function (b) { return !b.hidden; })[0];
    if (first) switchTab(first.dataset.tab);
  }

  async function tryResume() {
    try {
      var r = await rpc('admin_me');
      var row = Array.isArray(r) ? r[0] : r;
      if (!row || !row.id) { clearToken(); return; }
      ME = row;
      enterApp();
    } catch (e) {
      clearToken();
    }
  }
  function clearToken() {
    TOKEN = null; ME = null;
    localStorage.removeItem('sta_admin_token');
    showLogin();
  }

  $('#login-form').addEventListener('submit', async function (e) {
    e.preventDefault();
    var btn = $('#login-btn'), err = $('#login-error');
    err.hidden = true;
    btn.disabled = true; btn.textContent = '登录中…';
    try {
      var res = await rpc('admin_login', {
        p_user: $('#login-user').value.trim(),
        password: $('#login-password').value
      });
      /* 服务端失败时不再抛 HTTP 异常（异常事务会回滚审计记录），
         而是正常返回 {ok:false, error}，这里负责判错 */
      if (!res || res.ok === false || !res.token) {
        throw new Error((res && res.error) || '登录失败');
      }
      TOKEN = res.token;
      ME = res.admin;
      ME.permissions = typeof ME.permissions === 'string' ? JSON.parse(ME.permissions) : ME.permissions;
      localStorage.setItem('sta_admin_token', TOKEN);
      enterApp();
    } catch (ex) {
      err.textContent = ex.message || '登录失败';
      err.hidden = false;
    }
    btn.disabled = false; btn.textContent = '登 录';
  });

  $('#logout-btn').addEventListener('click', async function () {
    try { await rpc('admin_logout'); } catch (e) {}
    clearToken();
  });

  /* ---------- 审计埋点（登录成败/退出在服务端落库；这里上报后台行为） ---------- */
  var AUDIT_ACTIONS = {
    login_success:   '登录成功',
    login_failed:    '登录失败',
    logout:          '退出登录',
    section_view:    '浏览板块',
    content_publish: '发布内容',
    visual_open:     '进入可视化编辑',
    visual_close:    '退出可视化编辑'
  };
  var TAB_NAMES = { content: '内容管理', logs: '访问日志', audit: '审计日志', admins: '管理员' };

  /* 上报一条审计事件（fire-and-forget：失败静默，不打扰操作） */
  function audit(action, detail) {
    try {
      rpc('admin_audit', { p_action: action, p_detail: detail || {} }).catch(function () {});
    } catch (e) {}
  }

  /* ---------- 标签切换 ---------- */
  function switchTab(name) {
    audit('section_view', { section: name });
    $$('.tab-btn').forEach(function (b) { b.classList.toggle('active', b.dataset.tab === name); });
    $$('.tab').forEach(function (s) { s.hidden = s.id !== 'tab-' + name; });
    if (name === 'content' && !DATA) {
      loadContent().catch(function (e) { toast(e.message || '载入内容失败', true); });
    }
    if (name === 'logs') loadLogs().catch(function (e) { toast(e.message || '载入日志失败', true); });
    if (name === 'audit') loadAudit().catch(function (e) { toast(e.message || '载入审计日志失败', true); });
    if (name === 'admins') {
      /* 兜底：非超管不允许看到管理员管理（后端 admin_* RPC 也有 assert_super 校验） */
      if (!ME || ME.role !== 'super') return;
      loadAdmins();
    }
  }
  $$('.tab-btn').forEach(function (b) {
    b.addEventListener('click', function () { switchTab(b.dataset.tab); });
  });

  /* ---------- 内容编辑器 ---------- */
  async function loadContent() {
    var rows = await api('/rest/v1/sta_web_site_content?select=data,version,updated_at&id=eq.main');
    LOADED = rows[0];
    DATA = JSON.parse(JSON.stringify(LOADED.data));
    renderEditor();
    updateStatus();
  }
  function updateStatus() {
    var d = LOADED ? new Date(LOADED.updated_at) : new Date();
    $('#save-status').textContent = 'v' + LOADED.version + ' · 最近发布 ' +
      d.toLocaleString('zh-CN', { hour12: false });
  }

  function renderEditor() {
    var root = $('#editor');
    root.innerHTML = '';
    Object.keys(DATA).forEach(function (topKey) {
      var meta = SECTION_META[topKey] || {};
      var det = document.createElement('details');
      det.className = 'sec';
      det.open = ['meta', 'brand'].indexOf(topKey) !== -1;
      var sum = document.createElement('summary');
      sum.textContent = meta.label || kl(topKey);
      if (meta.hint) {
        var h = document.createElement('small');
        h.className = 'sum-hint';
        h.textContent = '　' + meta.hint;
        sum.appendChild(h);
      }
      det.appendChild(sum);
      var body = document.createElement('div');
      body.className = 'sec-body';
      if (meta.hint) {
        var hintLine = document.createElement('p');
        hintLine.className = 'sec-hint';
        hintLine.textContent = '📍 对应前台位置：' + meta.hint;
        if (meta.anchor) {
          var link = document.createElement('a');
          link.href = location.origin + '/#' + meta.anchor;
          link.target = '_blank';
          link.rel = 'noopener';
          link.textContent = '打开前台对应位置 ↗';
          hintLine.appendChild(document.createTextNode('　'));
          hintLine.appendChild(link);
        }
        body.appendChild(hintLine);
      }
      try {
        buildControl(body, DATA[topKey], [topKey], topKey);
      } catch (err) {
        /* 单节渲染出错不影响其他节：降级为 JSON 直接编辑 */
        var fw = fieldWrap(kl(topKey) + '（该节数据结构异常，已切换为 JSON 编辑）');
        var ta = document.createElement('textarea');
        ta.className = 'f-area';
        ta.style.minHeight = '180px';
        ta.value = JSON.stringify(DATA[topKey], null, 2);
        (function (k) {
          ta.addEventListener('change', function () {
            try { DATA[k] = JSON.parse(ta.value); } catch (e) { toast('JSON 格式有误，未应用', true); }
          });
        })(topKey);
        fw.appendChild(ta);
        body.appendChild(fw);
      }
      det.appendChild(body); /* 修复：此前 sec-body 从未挂到 details 上，导致卡片展开后是空的 */
      root.appendChild(det);
    });
  }

  function fieldWrap(labelText) {
    var wrap = document.createElement('div');
    var lab = document.createElement('label');
    lab.className = 'f-label';
    lab.textContent = labelText;
    wrap.appendChild(lab);
    return wrap;
  }

  function buildControl(host, val, path, key) {
    if (val === null || val === undefined || typeof val === 'string') {
      var w = fieldWrap(kl(key) || key);
      if (looksLikeImage(key, val)) {
        /* 图片字段：路径输入 + 本机上传按钮 + 缩略图预览 */
        var row = document.createElement('div');
        row.className = 'img-row';
        var ip = document.createElement('input');
        ip.className = 'f-input';
        ip.type = 'text';
        ip.value = val == null ? '' : val;
        row.appendChild(ip);
        row.appendChild(miniBtn('⬆ 上传', '', function () {
          imgDialog(ip.value, function (nv) {
            ip.value = nv;
            setPath(path, nv);
            th.src = imgSrc(nv);
          });
        }));
        w.appendChild(row);
        var th = document.createElement('img');
        th.className = 'thumb';
        th.src = imgSrc(val);
        th.hidden = !val;
        ip.addEventListener('input', function () {
          setPath(path, ip.value);
          th.hidden = !ip.value.trim();
          th.src = imgSrc(ip.value);
        });
        w.appendChild(th);
        host.appendChild(w);
        return;
      }
      var long = key && (/html$/i.test(key) || /<br/i.test(String(val)) || String(val).length > 60);
      var inp = document.createElement(long ? 'textarea' : 'input');
      inp.className = long ? 'f-area' : 'f-input';
      if (!long) inp.type = 'text';
      inp.value = val == null ? '' : val;
      inp.addEventListener('input', function () { setPath(path, inp.value); });
      w.appendChild(inp);
      host.appendChild(w);
      return;
    }
    if (typeof val === 'number') {
      var nw = fieldWrap(kl(key));
      var ni = document.createElement('input');
      ni.className = 'f-input';
      ni.type = 'number';
      ni.value = val;
      ni.addEventListener('input', function () { setPath(path, parseFloat(ni.value) || 0); });
      nw.appendChild(ni);
      host.appendChild(nw);
      return;
    }
    if (typeof val === 'boolean') {
      var bw = document.createElement('div');
      var bl = document.createElement('label');
      bl.className = 'chk';
      var bi = document.createElement('input');
      bi.type = 'checkbox';
      bi.checked = val;
      bi.addEventListener('change', function () { setPath(path, bi.checked); });
      bl.appendChild(bi);
      bl.appendChild(document.createTextNode(' ' + kl(key)));
      bw.appendChild(bl);
      host.appendChild(bw);
      return;
    }
    if (Array.isArray(val)) {
      if (val.length === 0 || typeof val[0] !== 'object') {
        linesControl(host, val, path, key);
      } else {
        cardsControl(host, val, path, key);
      }
      return;
    }
    objectControl(host, val, path, key);
  }

  function linesControl(host, val, path, key) {
    var w = fieldWrap((kl(key) || '') + '（每行一条）');
    var ta = document.createElement('textarea');
    ta.className = 'f-area';
    ta.value = val.join('\n');
    ta.addEventListener('change', function () {
      setPath(path, ta.value.split('\n').map(function (s) { return s.trim(); })
        .filter(function (s) { return s.length > 0; }));
    });
    w.appendChild(ta);
    host.appendChild(w);
  }

  function miniBtn(text, cls, fn) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'mini-btn' + (cls ? ' ' + cls : '');
    b.textContent = text;
    b.addEventListener('click', fn);
    return b;
  }

  function move(arr, i, d) {
    var j = i + d;
    if (j < 0 || j >= arr.length) return;
    var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }

  function cardsControl(host, val, path, key) {
    var wrap = document.createElement('div');
    wrap.className = 'obj-group';
    var title = document.createElement('div');
    title.className = 'og-title';
    title.textContent = kl(key);
    wrap.appendChild(title);

    var cards = document.createElement('div');
    cards.className = 'cards';
    val.forEach(function (item, i) {
      var cardTitle = item.title || item.name || item.text || item.year ||
        (item.names && item.names[0]) || (item.t && ('栏目：' + item.t)) || ('#' + (i + 1));
      var card = document.createElement('div');
      card.className = 'item-card';
      var head = document.createElement('div');
      head.className = 'item-head';
      head.appendChild(Object.assign(document.createElement('span'),
        { className: 'item-tag', textContent: '#' + (i + 1) }));
      var nameSpan = document.createElement('span');
      nameSpan.className = 'item-name';
      nameSpan.textContent = String(cardTitle).slice(0, 26);
      head.appendChild(nameSpan);
      var ops = document.createElement('div');
      ops.className = 'item-ops';
      ops.appendChild(miniBtn('↑', '', function () { move(val, i, -1); renderEditor(); }));
      ops.appendChild(miniBtn('↓', '', function () { move(val, i, 1); renderEditor(); }));
      ops.appendChild(miniBtn('删除', 'danger', function () {
        val.splice(i, 1); setPath(path, val); renderEditor();
      }));
      head.appendChild(ops);
      card.appendChild(head);
      Object.keys(item).forEach(function (k) {
        buildControl(card, item[k], path.concat([i, k]), k);
      });
      cards.appendChild(card);
    });
    wrap.appendChild(cards);

    wrap.appendChild(miniBtn('+ 添加一项', 'add-btn', function () {
      var template = val.length ? zeroClone(val[val.length - 1]) : {};
      val.push(template);
      setPath(path, val);
      renderEditor();
    }));

    host.appendChild(wrap);
  }

  function objectControl(host, obj, path, key) {
    var group = document.createElement('div');
    group.className = 'obj-group';
    if (key) {
      var t = document.createElement('div');
      t.className = 'og-title';
      t.textContent = kl(key);
      group.appendChild(t);
    }
    Object.keys(obj).forEach(function (k) {
      buildControl(group, obj[k], path.concat([k]), k);
    });
    host.appendChild(group);
  }

  $('#save-btn').addEventListener('click', function () { publishChanges(this); });

  async function publishChanges(btn) {
    btn.disabled = true;
    if (!btn.dataset.label) btn.dataset.label = btn.textContent;
    btn.textContent = '保存中…';
    try {
      await api('/rest/v1/sta_web_site_content?id=eq.main', { method: 'PATCH', body: { data: DATA } });
      await loadContent();
      toast('已保存并发布，前台刷新即可生效');
      return true;
    } catch (e) {
      toast(e.message || '保存失败', true);
      return false;
    } finally {
      btn.disabled = false;
      btn.textContent = btn.dataset.label;
    }
  }

  $('#reload-btn').addEventListener('click', async function () {
    if (!confirm('放弃当前修改，重新载入已发布的内容？')) return;
    await loadContent();
    toast('已还原为已发布版本');
  });

  $('#history-btn').addEventListener('click', async function () {
    var panel = $('#history-panel');
    if (!panel.hidden) { panel.hidden = true; return; }
    try {
      var rows = await api('/rest/v1/sta_web_site_content_revisions?select=id,data,created_at&order=id.desc&limit=20');
      panel.innerHTML = '<h4>历史版本（点击载入到编辑器，确认无误后再点「保存并发布」）</h4>';
      if (!rows.length) panel.innerHTML += '<p class="dim">暂无历史记录</p>';
      rows.forEach(function (r) {
        var item = document.createElement('div');
        item.className = 'h-item';
        var a = document.createElement('span');
        a.textContent = '#' + r.id;
        var b = document.createElement('span');
        b.textContent = new Date(r.created_at).toLocaleString('zh-CN', { hour12: false });
        item.appendChild(a); item.appendChild(b);
        item.addEventListener('click', function () {
          if (!confirm('载入历史版本 #' + r.id + '？')) return;
          DATA = JSON.parse(JSON.stringify(r.data));
          renderEditor();
          panel.hidden = true;
          toast('已载入历史版本，检查后请保存发布');
        });
        panel.appendChild(item);
      });
      panel.hidden = false;
    } catch (e) {
      toast(e.message || '载入历史失败', true);
    }
  });

  /* ---------- 访问日志 ---------- */
  function fmtLocal(iso) {
    return new Date(iso).toLocaleString('zh-CN', { hour12: false });
  }
  function refHost(u) {
    if (!u) return '—';
    try { return new URL(u).host || u.slice(0, 24); } catch (e) { return u.slice(0, 24); }
  }

  async function loadLogs() {
    var days = parseInt($('#log-range').value, 10) || 30;
    var from = new Date(Date.now() - days * 864e5).toISOString();
    var p = '/rest/v1/sta_web_visit_logs?select=*&created_at=gte.' + from + '&order=created_at.desc&limit=20000';
    var kind = $('#log-kind').value;
    if (kind !== 'all') p += '&kind=eq.' + kind;
    var q = $('#log-q').value.trim();
    if (q) p += '&path=ilike.*' + encodeURIComponent(q) + '*';
    ROWS = (await api(p)) || [];
    PAGE = 1;
    renderStats();
    drawChart(days);
    renderTable();
  }

  function renderStats() {
    var uv = {}, todayUV = {}, todayPV = 0;
    var today = new Date().toDateString();
    ROWS.forEach(function (r) {
      uv[r.visitor_id] = 1;
      if (new Date(r.created_at).toDateString() === today) {
        todayPV++;
        todayUV[r.visitor_id] = 1;
      }
    });
    var cards = [
      ['总浏览 PV', ROWS.length],
      ['独立访客 UV', Object.keys(uv).length],
      ['今日 PV', todayPV],
      ['今日 UV', Object.keys(todayUV).length]
    ];
    $('#log-cards').innerHTML = cards.map(function (c) {
      return '<div class="card"><h4>' + c[0] + '</h4><div class="num">' + c[1] + '</div></div>';
    }).join('');
  }

  function drawChart(days) {
    var buckets = {};
    for (var i = days - 1; i >= 0; i--) {
      var d = new Date(Date.now() - i * 864e5);
      buckets[d.toISOString().slice(0, 10)] = { pv: 0, uv: {} };
    }
    ROWS.forEach(function (r) {
      var k = r.created_at.slice(0, 10);
      if (buckets[k]) {
        buckets[k].pv++;
        buckets[k].uv[r.visitor_id] = 1;
      }
    });
    var labels = [], pv = [], uvs = [];
    Object.keys(buckets).forEach(function (k) {
      labels.push(k.slice(5));
      pv.push(buckets[k].pv);
      uvs.push(Object.keys(buckets[k].uv).length);
    });
    if (typeof Chart === 'undefined') return;
    if (CHART) CHART.destroy();
    CHART = new Chart($('#log-chart'), {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          { label: 'PV', data: pv, borderColor: '#1D59F2', backgroundColor: 'rgba(29,89,242,.12)', tension: .35, fill: true },
          { label: 'UV', data: uvs, borderColor: '#F5A623', backgroundColor: 'rgba(245,166,35,.10)', tension: .35, fill: true }
        ]
      },
      options: {
        plugins: { legend: { position: 'bottom' } },
        scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
      }
    });
  }

  function renderTable() {
    var pages = Math.max(1, Math.ceil(ROWS.length / PAGESIZE));
    if (PAGE > pages) PAGE = pages;
    var slice = ROWS.slice((PAGE - 1) * PAGESIZE, PAGE * PAGESIZE);
    var html = '<table class="tbl"><thead><tr>' +
      '<th>时间</th><th>类型</th><th>页面 / 区块</th><th>来源</th><th>设备</th><th>归属地</th><th>IP</th></tr></thead><tbody>';
    if (!slice.length) html += '<tr><td colspan="7" class="dim">该时间范围内没有记录</td></tr>';
    slice.forEach(function (r) {
      var geo = [r.city, r.region, r.country].filter(Boolean).join(' ') || '—';
      var dev = [r.browser, r.os, r.device].filter(Boolean).join(' · ');
      html += '<tr>' +
        '<td class="mono">' + fmtLocal(r.created_at) + '</td>' +
        '<td>' + (r.kind === 'section' ? '区块' : '页面') + '</td>' +
        '<td>' + (r.path || '—') + (r.section ? ' <span class="dim">#' + r.section + '</span>' : '') + '</td>' +
        '<td>' + refHost(r.referrer) + '</td>' +
        '<td>' + dev + '</td>' +
        '<td>' + geo + '</td>' +
        '<td class="mono">' + (r.ip || '—') + '</td>' +
        '</tr>';
    });
    html += '</tbody></table>';
    $('#log-table').innerHTML = html;
    $('#log-pageinfo').textContent = '第 ' + PAGE + ' / ' + pages + ' 页 · 共 ' + ROWS.length + ' 条';
  }

  $('#log-refresh').addEventListener('click', function () { loadLogs().catch(function (e) { toast(e.message, true); }); });
  ['#log-range', '#log-kind'].forEach(function (s) {
    $(s).addEventListener('change', function () { loadLogs().catch(function (e) { toast(e.message, true); }); });
  });
  var qTimer = null;
  $('#log-q').addEventListener('input', function () {
    clearTimeout(qTimer);
    qTimer = setTimeout(function () { loadLogs().catch(function (e) { toast(e.message, true); }); }, 400);
  });
  $('#log-prev').addEventListener('click', function () { if (PAGE > 1) { PAGE--; renderTable(); } });
  $('#log-next').addEventListener('click', function () {
    if (PAGE < Math.ceil(ROWS.length / PAGESIZE)) { PAGE++; renderTable(); }
  });
  $('#log-export').addEventListener('click', function () {
    var head = ['时间', '类型', '路径', '区块', '来源', '浏览器', '系统', '设备', '国家', '省份', '城市', 'IP'];
    var lines = [head.join(',')];
    ROWS.forEach(function (r) {
      lines.push([fmtLocal(r.created_at), r.kind, r.path || '', r.section || '',
        (r.referrer || ''), r.browser || '', r.os || '', r.device || '',
        r.country || '', r.region || '', r.city || '', r.ip || '']
        .map(function (v) { return '"' + String(v).replace(/"/g, '""') + '"'; }).join(','));
    });
    var blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'visit-logs-' + new Date().toISOString().slice(0, 10) + '.csv';
    a.click();
  });

  /* ---------- 审计日志 ---------- */
  var AROWS = [], APAGE = 1;

  function escHtml(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function auditDetail(r) {
    var d = r.detail || {};
    if (r.action === 'section_view') return TAB_NAMES[d.section] || d.section || '—';
    if (r.action === 'content_publish') return '发布新版本 v' + (d.version != null ? d.version : '?');
    if (r.action === 'login_failed') return d.reason || '凭据错误';
    if (r.action === 'login_success') return '会话有效期 7 天';
    return '—';
  }

  async function loadAudit() {
    var days = parseInt($('#au-range').value, 10) || 30;
    var from = new Date(Date.now() - days * 864e5).toISOString();
    var p = '/rest/v1/sta_web_admin_audit_logs?select=*&created_at=gte.' + from + '&order=created_at.desc&limit=20000';
    var act = $('#au-kind').value;
    if (act !== 'all') p += '&action=eq.' + act;
    AROWS = (await api(p)) || [];
    APAGE = 1;
    renderAudit();
  }

  function renderAudit() {
    var pages = Math.max(1, Math.ceil(AROWS.length / PAGESIZE));
    if (APAGE > pages) APAGE = pages;
    var slice = AROWS.slice((APAGE - 1) * PAGESIZE, APAGE * PAGESIZE);
    var html = '<table class="tbl"><thead><tr>' +
      '<th>时间</th><th>动作</th><th>账号</th><th>详情</th><th>IP</th><th>User-Agent</th></tr></thead><tbody>';
    if (!slice.length) html += '<tr><td colspan="6" class="dim">该时间范围内没有记录</td></tr>';
    slice.forEach(function (r) {
      var ua = r.ua || '';
      html += '<tr>' +
        '<td class="mono">' + fmtLocal(r.created_at) + '</td>' +
        '<td>' + escHtml(AUDIT_ACTIONS[r.action] || r.action) + '</td>' +
        '<td class="mono">' + escHtml(r.username) + '</td>' +
        '<td>' + escHtml(auditDetail(r)) + '</td>' +
        '<td class="mono">' + escHtml(r.ip || '—') + '</td>' +
        '<td class="dim" title="' + escHtml(ua) + '">' + escHtml(ua.slice(0, 60)) + (ua.length > 60 ? '…' : '') + '</td>' +
        '</tr>';
    });
    html += '</tbody></table>';
    $('#au-table').innerHTML = html;
    $('#au-pageinfo').textContent = '第 ' + APAGE + ' / ' + pages + ' 页 · 共 ' + AROWS.length + ' 条';
  }

  $('#au-refresh').addEventListener('click', function () { loadAudit().catch(function (e) { toast(e.message, true); }); });
  ['#au-range', '#au-kind'].forEach(function (s) {
    $(s).addEventListener('change', function () { loadAudit().catch(function (e) { toast(e.message, true); }); });
  });
  $('#au-prev').addEventListener('click', function () { if (APAGE > 1) { APAGE--; renderAudit(); } });
  $('#au-next').addEventListener('click', function () {
    if (APAGE < Math.ceil(AROWS.length / PAGESIZE)) { APAGE++; renderAudit(); }
  });
  $('#au-export').addEventListener('click', function () {
    var head = ['时间', '动作', '账号', '详情', 'IP', 'User-Agent'];
    var lines = [head.join(',')];
    AROWS.forEach(function (r) {
      lines.push([fmtLocal(r.created_at), AUDIT_ACTIONS[r.action] || r.action, r.username || '',
        auditDetail(r), r.ip || '', r.ua || '']
        .map(function (v) { return '"' + String(v).replace(/"/g, '""') + '"'; }).join(','));
    });
    var blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'admin-audit-' + new Date().toISOString().slice(0, 10) + '.csv';
    a.click();
  });

  /* ---------- 管理员管理 ---------- */
  async function loadAdmins() {
    try {
      var rows = await rpc('admin_list');
      var el = $('#admin-list');
      if (!rows || !rows.length) { el.innerHTML = '<p class="dim">暂无数据</p>'; return; }
      var html = '<div class="tbl-wrap"><table class="admin-tbl"><thead><tr>' +
        '<th>用户名</th><th>姓名</th><th>角色</th><th>权限</th><th>创建时间</th><th>操作</th></tr></thead><tbody>';
      rows.forEach(function (a) {
        var isSelf = a.id === ME.id;
        var perms = a.permissions || [];
        var permBoxes =
          '<label class="chk"><input type="checkbox" data-id="' + a.id + '" data-perm="content"' +
          (perms.indexOf('content') !== -1 ? ' checked' : '') + (isSelf ? ' disabled' : '') + '>内容</label>' +
          '<label class="chk"><input type="checkbox" data-id="' + a.id + '" data-perm="logs"' +
          (perms.indexOf('logs') !== -1 ? ' checked' : '') + (isSelf ? ' disabled' : '') + '>日志</label>';
        html += '<tr>' +
          '<td>' + a.username + (isSelf ? ' <span class="dim">(我)</span>' : '') + '</td>' +
          '<td>' + (a.name || '—') + '</td>' +
          '<td><select class="role-sel" data-id="' + a.id + '"' + (isSelf ? ' disabled' : '') + '>' +
            '<option value="admin"' + (a.role === 'admin' ? ' selected' : '') + '>普通管理员</option>' +
            '<option value="super"' + (a.role === 'super' ? ' selected' : '') + '>超级管理员</option>' +
            '</select></td>' +
          '<td>' + permBoxes + '</td>' +
          '<td class="dim">' + fmtLocal(a.created_at) + '</td>' +
          '<td><div class="row-ops">' +
            '<button class="mini-btn" data-act="resetpwd" data-id="' + a.id + '">重置密码</button>' +
            '<button class="mini-btn danger" data-act="del" data-id="' + a.id + '" data-user="' + a.username + '"' +
            (isSelf ? ' disabled' : '') + '>删除</button>' +
            '</div></td>' +
          '</tr>';
      });
      html += '</tbody></table></div>';
      el.innerHTML = html;
    } catch (e) {
      $('#admin-list').innerHTML = '<p class="dim">' + (e.message || '载入失败') + '</p>';
    }
  }

  $('#admin-list').addEventListener('change', async function (e) {
    var t = e.target;
    try {
      if (t.classList.contains('role-sel')) {
        if (!confirm('确认将该管理员角色变更为「' + (t.value === 'super' ? '超级管理员' : '普通管理员') + '」？')) {
          loadAdmins(); return;
        }
        await rpc('admin_update', { a_id: t.dataset.id, p_role: t.value });
        toast('角色已更新');
      } else if (t.dataset.perm) {
        var boxes = $$('input[data-id="' + t.dataset.id + '"][data-perm]', $('#admin-list'));
        var perms = boxes.filter(function (b) { return b.checked; }).map(function (b) { return b.dataset.perm; });
        await rpc('admin_update', { a_id: t.dataset.id, p_permissions: perms });
        toast('权限已更新');
      }
    } catch (ex) {
      toast(ex.message || '操作失败', true);
      loadAdmins();
    }
  });

  $('#admin-list').addEventListener('click', async function (e) {
    var t = e.target.closest('button[data-act]');
    if (!t || t.disabled) return;
    try {
      if (t.dataset.act === 'resetpwd') {
        var np = prompt('为「' + t.dataset.id.slice(0, 8) + '…」设置新密码（至少 6 位）：');
        if (!np) return;
        await rpc('admin_reset_password', { a_id: t.dataset.id, new_password: np });
        toast('密码已重置，该账号所有会话已失效');
      } else if (t.dataset.act === 'del') {
        if (!confirm('确认删除管理员「' + t.dataset.user + '」？此操作不可恢复。')) return;
        await rpc('admin_delete', { a_id: t.dataset.id });
        toast('已删除');
        loadAdmins();
      }
    } catch (ex) {
      toast(ex.message || '操作失败', true);
    }
  });

  $('#admin-create-form').addEventListener('submit', async function (e) {
    e.preventDefault();
    var perms = [];
    if ($('#na-perm-content').checked) perms.push('content');
    if ($('#na-perm-logs').checked) perms.push('logs');
    try {
      await rpc('admin_create', {
        p_user: $('#na-user').value.trim(),
        p_password: $('#na-password').value,
        p_name: $('#na-name').value.trim() || null,
        p_role: $('#na-role').value,
        p_permissions: perms
      });
      toast('管理员已创建');
      this.reset();
      $('#na-perm-content').checked = true;
      loadAdmins();
    } catch (ex) {
      toast(ex.message || '创建失败', true);
    }
  });

  $('#pwd-form').addEventListener('submit', async function (e) {
    e.preventDefault();
    try {
      await rpc('change_my_password', {
        old: $('#pwd-old').value,
        "new": $('#pwd-new').value
      });
      toast('密码已修改');
      this.reset();
    } catch (ex) {
      toast(ex.message || '修改失败', true);
    }
  });

  /* ---------- 可视化编辑 ---------- */
  var VIS = { on: false, dirty: {}, loading: false };

  function visDoc() {
    var f = $('#visual-frame');
    try { return f ? f.contentDocument : null; } catch (e) { return null; }
  }
  function q(sel) { var d = visDoc(); return d ? d.querySelector(sel) : null; }
  function qa(sel) {
    var d = visDoc();
    return d ? Array.prototype.slice.call(d.querySelectorAll(sel)) : [];
  }

  function openVisual() {
    if (!DATA) { toast('内容尚未载入，请先进入内容管理', true); return; }
    document.documentElement.classList.add('vis-mode');
    $('#visual-view').hidden = false;
    VIS.on = true;
    VIS.dirty = {};
    audit('visual_open');
    updateVisBar('正在载入页面…');
    loadVisFrame();
  }
  function closeVisual() {
    var was = VIS.on;
    VIS.on = false;
    document.documentElement.classList.remove('vis-mode');
    $('#visual-view').hidden = true;
    if (was) audit('visual_close');
  }
  function loadVisFrame() {
    VIS.loading = true;
    $('#visual-frame').src = '/?visual=1&t=' + Date.now();
  }

  function updateVisBar(msg) {
    var n = Object.keys(VIS.dirty).length;
    $('#vis-dirty').textContent = msg || (n ? '已修改 ' + n + ' 处 · 记得「保存并发布」' : '点击页面上的文字即可直接修改');
  }

  function visMarkDirty(key) {
    VIS.dirty[key] = 1;
    updateVisBar();
  }

  function reg(el, path, kind, split) {
    if (!el || el.nodeType !== 1) return;
    el.contentEditable = 'true';
    el.spellcheck = false;
    el.classList.add('v-ed');
    el.__vp = { path: path, kind: kind || 'text', split: !!split };
  }

  function regTextNode(hostEl, path) {
    if (!hostEl) return;
    var n = hostEl.lastChild;
    if (!n || n.nodeType !== 3) return;
    var s = hostEl.ownerDocument.createElement('span');
    s.textContent = n.nodeValue;
    hostEl.replaceChild(s, n);
    reg(s, path);
  }

  function onEdit(e) {
    var el = e.target;
    while (el && el !== document && !(el.__vp && el.classList.contains('v-ed'))) el = el.parentNode;
    if (!el || !el.__vp) return;
    var p = el.__vp.path, kind = el.__vp.kind, v;
    if (kind === 'html') v = el.innerHTML.trim();
    else if (kind === 'num') {
      v = parseFloat(el.textContent.replace(/[^\d.\-]/g, ''));
      if (isNaN(v)) return;
    } else {
      v = el.textContent.replace(/[\n\r\t]+/g, ' ');
    }
    setPath(p, v);
    syncTwins(el, p, v);
    visMarkDirty(p.join('.'));
  }

  /* 同一数据的多处显示（如跑马灯两组、导航两份）同步更新 */
  function syncTwins(srcEl, path, v) {
    qa('.v-ed').forEach(function (el) {
      if (el === srcEl || !el.__vp) return;
      if (el.__vp.path.join('.') === path.join('.') && el.textContent !== v) el.textContent = v;
    });
  }

  function onBlurFlat(e) {
    var el = e.target;
    if (!el || !el.__vp || !el.__vp.split) return;
    el.textContent = el.textContent.replace(/\s+/g, ' ').trim();
  }

  function buildVisMap() {
    var doc = visDoc();
    if (!doc || !doc.body) {
      toast('无法访问预览页面（本地请用静态服务器打开，如：npx serve）', true);
      return;
    }
    var st = doc.createElement('style');
    st.textContent =
      '.v-ed{outline:0!important}' +
      '.v-ed:hover{box-shadow:0 0 0 2px rgba(77,124,255,.9);cursor:text;border-radius:2px}' +
      '.v-ed:focus{box-shadow:0 0 0 3px #1D59F2;background:rgba(29,89,242,.08)}' +
      '.v-img:hover{filter:brightness(1.06);box-shadow:0 0 0 3px #F5A623;cursor:pointer}' +
      '.hero-ring.v-click:hover svg{filter:drop-shadow(0 0 6px rgba(245,166,35,.9));cursor:pointer}';
    doc.head.appendChild(st);
    doc.addEventListener('input', onEdit);
    doc.addEventListener('blur', onBlurFlat, true);
    doc.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a');
      if (a) e.preventDefault(); /* 编辑模式下拦截链接跳转 */
    });

    function T(sel, path, kind, split) {
      qa(sel).forEach(function (el) { reg(el, path, kind, split); });
    }

    /* 品牌 / 导航 */
    T('[data-brand-cn]', ['brand', 'nameCN']);
    T('[data-brand-en]', ['brand', 'nameEN']);
    T('.nav__cta .btn__label', ['nav', 'ctaLabel']);
    qa('.nav__links a').forEach(function (a, i) { reg(a, ['nav', 'links', i, 'label']); });
    qa('.menu-overlay__links .menu-txt').forEach(function (a, i) { reg(a, ['nav', 'links', i, 'label']); });

    /* 首屏 */
    T('[data-hero-eyebrow]', ['hero', 'eyebrow']);
    T('[data-hero-line1]', ['hero', 'line1'], 'text', true);
    T('[data-hero-line2]', ['hero', 'line2'], 'text', true);
    T('[data-hero-sub]', ['hero', 'sub']);
    T('[data-scroll-cue]', ['hero', 'scrollCue']);
    T('[data-hero-note]', ['hero', 'scrollNote']);
    qa('[data-hero-ctas] .btn__label').forEach(function (el, i) { reg(el, ['hero', 'ctas', i, 'label']); });
    qa('[data-hero-badges] .badge').forEach(function (b, i) { regTextNode(b, ['hero', 'badges', i]); });
    var ring = q('.hero-ring');
    if (ring) {
      ring.classList.add('v-click');
      ring.addEventListener('click', function (e) {
        e.preventDefault(); e.stopPropagation();
        var nv = window.prompt('修改环形文字（当前：' + getPath(['hero', 'ringText']) + '）', getPath(['hero', 'ringText']));
        if (nv === null) return;
        nv = nv.replace(/\s+/g, ' ').trim();
        setPath(['hero', 'ringText'], nv);
        var tp = doc.querySelector('[data-ring-text]');
        if (tp) tp.textContent = nv;
        visMarkDirty('hero.ringText');
      }, true);
    }
    qa('[data-marquee]').forEach(function (mq) {
      var which = mq.getAttribute('data-marquee') === '1' ? 'marquee1' : 'marquee2';
      Array.prototype.forEach.call(mq.querySelectorAll('.marquee__group'), function (g) {
        Array.prototype.forEach.call(g.querySelectorAll('.marquee__txt'), function (sp, j) {
          reg(sp, [which, j]);
        });
      });
    });

    /* 关于 */
    T('[data-about-eyebrow]', ['about', 'eyebrow']);
    T('[data-about-title]', ['about', 'title']);
    T('[data-about-lead]', ['about', 'lead']);
    T('[data-ghost="ABOUT"]', ['about', 'ghost']);
    T('[data-about-html]', ['about', 'descHTML'], 'html');
    qa('[data-about-facts] .fact').forEach(function (f, i) {
      var k = f.querySelector('k'), v = f.querySelector('b');
      if (k) reg(k, ['about', 'facts', i, 'k']);
      if (v) reg(v, ['about', 'facts', i, 'v']);
    });
    qa('[data-about-stats] .stat').forEach(function (s, i) {
      var n = s.querySelector('.stat-num'), suf = s.querySelector('.stat-suf'), lb = s.querySelector('.stat-label');
      if (n) reg(n, ['about', 'stats', i, 'num'], 'num');
      if (suf) reg(suf, ['about', 'stats', i, 'suffix']);
      if (lb) reg(lb, ['about', 'stats', i, 'label']);
    });
    var artImg = q('.about-art img');
    if (artImg) regImg(artImg, ['about', 'art']);

    /* 历程 */
    T('[data-history-eyebrow]', ['history', 'eyebrow']);
    T('[data-history-title]', ['history', 'title']);
    T('[data-history-desc]', ['history', 'desc']);
    T('[data-ghost="HISTORY"]', ['history', 'ghost']);
    qa('[data-history-items] .tl-item').forEach(function (li, i) {
      var y = li.querySelector('.t-year'), t = li.querySelector('.t-text');
      if (y) reg(y, ['history', 'items', i, 'year']);
      if (t) reg(t, ['history', 'items', i, 'text']);
    });

    /* 架构 */
    T('[data-org-eyebrow]', ['org', 'eyebrow']);
    T('[data-org-title]', ['org', 'title']);
    T('[data-org-desc]', ['org', 'desc']);
    T('[data-ghost="TEAM"]', ['org', 'ghost']);
    qa('[data-org-groups] .org-card').forEach(function (c, i) {
      function blk(selBlock, groupKey) {
        var b = c.querySelector(selBlock);
        if (!b) return;
        var role = b.querySelector('.org-role');
        if (role) reg(role, ['org', 'groups', i, groupKey, 'title']);
        Array.prototype.forEach.call(b.querySelectorAll('.org-chip'), function (chip, j) {
          reg(chip, ['org', 'groups', i, groupKey, 'names', j]);
        });
      }
      var nm = c.querySelector('.org-name'), mo = c.querySelector('.org-motto');
      if (nm) reg(nm, ['org', 'groups', i, 'name']);
      if (mo) reg(mo, ['org', 'groups', i, 'motto']);
      blk('.org-block:nth-of-type(1)', 'leader');
      blk('.org-block:nth-of-type(2)', 'members');
    });

    /* 部门 */
    T('[data-depts-eyebrow]', ['depts', 'eyebrow']);
    T('[data-depts-title]', ['depts', 'title']);
    T('[data-depts-desc]', ['depts', 'desc']);
    T('[data-ghost="TEAMS"]', ['depts', 'ghost']);
    qa('[data-depts-list] .dept-row').forEach(function (row, i) {
      var nm = row.querySelector('.dept-name'), ds = row.querySelector('.dept-desc');
      if (nm) reg(nm, ['depts', 'items', i, 'name']);
      if (ds) reg(ds, ['depts', 'items', i, 'desc']);
      Array.prototype.forEach.call(row.querySelectorAll('.dept-tags span'), function (tg, j) {
        reg(tg, ['depts', 'items', i, 'tags', j]);
      });
    });

    /* 活动 */
    T('[data-events-eyebrow]', ['events', 'eyebrow']);
    T('[data-events-title]', ['events', 'title']);
    T('[data-events-desc]', ['events', 'desc']);
    T('[data-ghost="EVENTS"]', ['events', 'ghost']);
    T('.event-card--more span:last-child', ['events', 'moreLabel']);
    qa('[data-events-track] .event-card:not(.event-card--more)').forEach(function (c, i) {
      var dt = c.querySelector('.event-date'),
          tt = c.querySelector('.event-card__body h3'),
          dd = c.querySelector('.event-card__body p'),
          im = c.querySelector('.event-card__img');
      if (dt) reg(dt, ['events', 'items', i, 'date']);
      if (tt) reg(tt, ['events', 'items', i, 'title']);
      if (dd) reg(dd, ['events', 'items', i, 'desc']);
      if (im) regImg(im, ['events', 'items', i, 'img']);
      Array.prototype.forEach.call(c.querySelectorAll('.event-tags span'), function (tg, j) {
        reg(tg, ['events', 'items', i, 'tags', j]);
      });
    });

    /* 声音（轮播：切换后重新绑定到当前这条） */
    T('[data-voices-eyebrow]', ['voices', 'eyebrow']);
    T('[data-voices-title]', ['voices', 'title']);
    T('[data-voices-desc]', ['voices', 'desc']);
    T('[data-ghost="VOICES"]', ['voices', 'ghost']);
    function bindVoices(i) {
      setTimeout(function () {
        var qq = q('.voice-quote'), aa = q('.voice-author');
        if (qq) reg(qq, ['voices', 'quotes', i, 'text']);
        if (aa) reg(aa, ['voices', 'quotes', i, 'author']);
      }, 520);
    }
    qa('.voice-dot').forEach(function (d, i) {
      d.addEventListener('click', function () { bindVoices(i); });
    });
    bindVoices(0);

    /* 招新 */
    T('[data-join-eyebrow]', ['join', 'eyebrow']);
    T('[data-join-tagline]', ['join', 'tagline']);
    T('[data-join-title]', ['join', 'title']);
    T('[data-join-desc]', ['join', 'desc']);
    T('[data-join-card-title]', ['join', 'cardTitle']);
    T('[data-join-qqlabel]', ['join', 'qqLabel']);
    T('[data-join-qqnum]', ['join', 'qqNumber']);
    T('[data-join-qrnote]', ['join', 'qrNote']);
    T('[data-join-copylabel]', ['join', 'copyLabel']);
    T('[data-join-note]', ['join', 'note']);
    qa('[data-join-facts] .fact--light').forEach(function (f, i) {
      var k = f.querySelector('k'), v = f.querySelector('b');
      if (k) reg(k, ['join', 'facts', i, 'k']);
      if (v) reg(v, ['join', 'facts', i, 'v']);
    });
    qa('[data-join-steps] .step').forEach(function (s, i) {
      var n = s.querySelector('.step-num'), t = s.querySelector('.step-title'), d = s.querySelector('.step-desc');
      if (n) reg(n, ['join', 'steps', i, 'num']);
      if (t) reg(t, ['join', 'steps', i, 'title']);
      if (d) reg(d, ['join', 'steps', i, 'desc']);
    });
    var qrImg = q('.qr img');
    if (qrImg) regImg(qrImg, ['join', 'qrImg']);

    /* 页脚 */
    T('[data-footer-big]', ['footer', 'bigText']);
    qa('[data-footer-slogans] span').forEach(function (s, i) { reg(s, ['footer', 'slogans', i]); });
    qa('[data-footer-cols] .footer-col').forEach(function (c, i) {
      var h4 = c.querySelector('h4');
      if (h4) reg(h4, ['footer', 'cols', i, 'h']);
      Array.prototype.forEach.call(c.querySelectorAll('ul li a'), function (a, j) {
        reg(a, ['footer', 'cols', i, 'links', j, 't']);
      });
    });
    T('[data-footer-legal]', ['footer', 'legal']);
    T('[data-footer-copy]', ['footer', 'copyright']);
    T('[data-footer-version]', ['footer', 'version']);
    T('[data-footer-credit]', ['footer', 'credit']);

    var logoImg = q('.logo__mark img');
    if (logoImg) regImg(logoImg, ['brand', 'logo']);

    VIS.loading = false;
    updateVisBar();
  }

  function regImg(img, path) {
    img.classList.add('v-img');
    img.addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      var cur = getPath(path) || '';
      imgDialog(cur, function (nv) {
        img.src = nv;
        setPath(path, nv);
        visMarkDirty(path.join('.'));
        toast('图片已更换，记得「保存并发布」');
      });
    }, true);
  }

  $('#visual-frame').addEventListener('load', function () {
    var tries = 0;
    (function wait() {
      var doc = visDoc();
      var hero = doc && doc.querySelector('[data-hero-sub]');
      if (hero && hero.textContent) { buildVisMap(); return; }
      if (++tries < 50) setTimeout(wait, 300);
      else { VIS.loading = false; toast('页面载入超时，请重试', true); }
    })();
  });
  $('#visual-btn').addEventListener('click', openVisual);
  $('#vis-exit').addEventListener('click', closeVisual);
  $('#vis-save').addEventListener('click', async function () {
    var ok = await publishChanges(this);
    if (ok) { VIS.dirty = {}; updateVisBar('已发布，正在刷新预览…'); loadVisFrame(); }
  });
  $('#vis-reset').addEventListener('click', async function () {
    if (!confirm('放弃当前修改，重新载入已发布的内容？')) return;
    await loadContent();
    VIS.dirty = {};
    updateVisBar();
    loadVisFrame();
    toast('已还原为已发布版本');
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && VIS.on && !VIS.loading) closeVisual();
  });

  /* ---------- 启动 ---------- */
  window.addEventListener('unhandledrejection', function (e) {
    var r = e && e.reason;
    var m = r && r.message ? r.message : String(r || '未知错误');
    toast(m, true);
  });

  if (!API || API.indexOf('YOUR-PROJECT-REF') !== -1) {
    document.body.innerHTML = '<p style="padding:80px;text-align:center;color:#E5484D;font-size:15px">' +
      '尚未配置 Supabase：请先填写 js/config.js 中的 supabaseUrl 与 anonKey。</p>';
  } else if (TOKEN) {
    tryResume();
  } else {
    showLogin();
  }
})();
