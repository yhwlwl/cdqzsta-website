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
      if (b.dataset.perm && !hasPerm(b.dataset.perm)) b.hidden = true;
      else b.hidden = false;
      if (b.dataset.super && ME.role !== 'super') b.hidden = true;
    });
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

  /* ---------- 标签切换 ---------- */
  function switchTab(name) {
    $$('.tab-btn').forEach(function (b) { b.classList.toggle('active', b.dataset.tab === name); });
    $$('.tab').forEach(function (s) { s.hidden = s.id !== 'tab-' + name; });
    if (name === 'content' && !DATA) loadContent();
    if (name === 'logs') loadLogs();
    if (name === 'admins') loadAdmins();
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
      var det = document.createElement('details');
      det.className = 'sec';
      det.open = ['meta', 'brand'].indexOf(topKey) !== -1;
      var sum = document.createElement('summary');
      sum.textContent = kl(topKey);
      det.appendChild(sum);
      var body = document.createElement('div');
      body.className = 'sec-body';
      det.appendChild(body);
      buildControl(body, DATA[topKey], [topKey], topKey);
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
      var long = key && (/html$/i.test(key) || /<br/i.test(String(val)) || String(val).length > 60);
      var w = fieldWrap(kl(key) || key);
      var inp = document.createElement(long ? 'textarea' : 'input');
      inp.className = long ? 'f-area' : 'f-input';
      if (!long) inp.type = 'text';
      inp.value = val == null ? '' : val;
      inp.addEventListener('input', function () { setPath(path, inp.value); });
      w.appendChild(inp);
      host.appendChild(w);
      if (/^(img|logo|art)$/i.test(key || '') && /^image_dev\//.test(String(val))) {
        var th = document.createElement('img');
        th.className = 'thumb';
        th.src = '/' + val;
        w.appendChild(th);
      }
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
      var card = document.createElement('div');
      card.className = 'item-card';
      var head = document.createElement('div');
      head.className = 'item-head';
      head.appendChild(Object.assign(document.createElement('span'),
        { className: 'item-tag', textContent: '#' + (i + 1) }));
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

  $('#save-btn').addEventListener('click', async function () {
    var btn = this;
    btn.disabled = true; btn.textContent = '保存中…';
    try {
      await api('/rest/v1/sta_web_site_content?id=eq.main', { method: 'PATCH', body: { data: DATA } });
      await loadContent();
      toast('已保存并发布，前台刷新即可生效');
    } catch (e) {
      toast(e.message || '保存失败', true);
    }
    btn.disabled = false; btn.textContent = '保存并发布';
  });

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

  /* ---------- 管理员管理 ---------- */
  async function loadAdmins() {
    try {
      var rows = await rpc('admin_list');
      var el = $('#admin-list');
      if (!rows || !rows.length) { el.innerHTML = '<p class="dim">暂无数据</p>'; return; }
      var html = '<table class="admin-tbl"><thead><tr>' +
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
      html += '</tbody></table>';
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

  /* ---------- 启动 ---------- */
  if (!API || API.indexOf('YOUR-PROJECT-REF') !== -1) {
    document.body.innerHTML = '<p style="padding:80px;text-align:center;color:#E5484D;font-size:15px">' +
      '尚未配置 Supabase：请先填写 js/config.js 中的 supabaseUrl 与 anonKey。</p>';
  } else if (TOKEN) {
    tryResume();
  } else {
    showLogin();
  }
})();
