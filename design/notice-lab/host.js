(function () {
  'use strict';
  const frame = document.querySelector('iframe');
  const surface = document.querySelector('.lab-surface');
  const status = document.getElementById('lab-status');
  const loading = document.querySelector('.lab-loading');
  let activeSection = 'notices';
  let sourceBlob;
  function jump(id, replay) {
    activeSection = id;
    const preview = frame.contentWindow.STA_NOTICE_PREVIEW;
    if (preview) preview.go(id, replay);
  }
  function mode(value) {
    surface.classList.toggle('mobile', value === 'mobile');
    document.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === value)));
    requestAnimationFrame(() => {
      frame.contentWindow.ScrollTrigger?.refresh();
      jump(activeSection, false);
    });
  }
  document.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => mode(b.dataset.mode)));
  document.querySelectorAll('[data-jump]').forEach(b => b.addEventListener('click', () => jump(b.dataset.jump, true)));
  document.getElementById('replay').addEventListener('click', () => jump(activeSection, true));
  if (innerWidth < 600) mode('mobile');
  window.addEventListener('message', e => {
    if (e.source !== frame.contentWindow || e.origin !== location.origin) return;
    if (e.data?.type === 'sta-notice-error') {
      loading.querySelector('p').textContent = e.data.message;
      status.textContent = '等待云端内容';
      return;
    }
    if (e.data?.type !== 'sta-notice-ready') return;
    loading.hidden = true;
    status.textContent = '设计预览 · 公告为版式演示 · 云端 v' + e.data.version;
    jump('notices', true);
  });
  window.addEventListener('pagehide', () => { if (sourceBlob) URL.revokeObjectURL(sourceBlob); });
  async function boot() {
    try {
      const [htmlResponse, scriptResponse] = await Promise.all([
        fetch('../../index.html', {cache:'no-store'}), fetch('../../js/main.js', {cache:'no-store'})
      ]);
      if (!htmlResponse.ok || !scriptResponse.ok) throw new Error('主站文件暂时无法读取');
      const html = await htmlResponse.text();
      let script = await scriptResponse.text();
      // Assemble an isolated preview from the real site. Production files are not edited.
      if (!script.includes('    initPreloader();') || !script.includes('    initTracking();')) throw new Error('主站启动结构已变化，请更新预览适配');
      script = script.replace('    initTracking();', '    /* Design preview: omit analytics. */');
      script = script.replace('    initPreloader();', '    document.querySelector(".preloader")?.remove(); heroIntro();');
      sourceBlob = URL.createObjectURL(new Blob([script], {type:'text/javascript'}));
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const base = doc.createElement('base');
      base.href = new URL('../../', location.href).href;
      doc.head.prepend(base);
      const css = doc.createElement('link');
      css.rel = 'stylesheet'; css.href = 'design/notice-lab/preview.css'; doc.head.append(css);
      doc.querySelector('script[src="js/main.js"]').src = sourceBlob;
      const extension = doc.createElement('script');
      extension.src = 'design/notice-lab/preview.js'; extension.defer = true; doc.body.append(extension);
      doc.body.classList.add('notice-preview-site');
      frame.srcdoc = '<!doctype html>\n' + doc.documentElement.outerHTML;
      setTimeout(() => {
        if (!loading.hidden) {
          loading.querySelector('p').textContent = '正在等待云端内容。网络较慢时可刷新预览重试。';
          const retry = document.createElement('button'); retry.textContent = '重新加载';
          retry.addEventListener('click', () => location.reload()); loading.append(retry);
        }
      }, 18000);
    } catch (error) {
      loading.querySelector('p').textContent = error.message;
      loading.querySelector('i').hidden = true;
    }
  }
  boot();
})();
