(function () {
  'use strict';
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const fine = matchMedia('(hover: hover) and (pointer: fine)');
  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  };
  let root, board, source = [], currentFilter = '全部', expandedList = false;
  let reader, lightbox, images = [], imageIndex = 0, replayTimer, filtering = false;
  function icon(direction = 'diagonal') {
    const existing = direction === 'right' ? $('.backtop svg') : $('.dept-arrow svg');
    const svg = existing.cloneNode(true);
    svg.setAttribute('aria-hidden', 'true');
    if (direction === 'right') svg.style.rotate = '90deg';
    return svg;
  }
  function button(text, cls, action) {
    const b = el('button', cls, text); b.type = 'button';
    if (action) b.addEventListener('click', action);
    return b;
  }
  function photo(src, alt, cls = '') {
    const img = el('img', cls); img.src = src; img.alt = alt; img.decoding = 'async';
    img.addEventListener('error', () => {
      img.hidden = true;
      const fallback = el('span', 'b-image-failed', '图片暂时无法显示');
      img.parentElement.append(fallback);
    }, {once:true});
    return img;
  }
  function animate(node, frames, duration = 300, extra = {}) {
    if (motion.matches || !node.animate) return Promise.resolve();
    return node.animate(frames, {duration, easing:'cubic-bezier(.16,1,.3,1)', ...extra}).finished.catch(() => {});
  }
  function metadata(item, featured) {
    const meta = el('div', 'b-meta');
    meta.append(el('strong', '', featured ? '重点展示 / ' + item.category : item.category), el('time', '', item.date));
    return meta;
  }
  function recordImages(item) {
    const others = source.find(s => s.src && s.src !== item.src);
    const result = item.src ? [{src:item.src, title:item.title, caption:'当前内容的原始图片'}] : [];
    if (others) result.push({src:others.src, title:others.title, caption:'多图查看示例，取自另一条云端活动：' + others.title});
    return result;
  }
  function feature(item) {
    const article = el('article', 'b-feature');
    if (item.src) {
      const art = el('div', 'b-art');
      const orbit = el('div', 'b-orbit'); orbit.setAttribute('aria-hidden','true');
      const back = el('div', 'b-paper back'); back.setAttribute('aria-hidden','true');
      const middle = el('div', 'b-paper middle'); middle.setAttribute('aria-hidden','true');
      const dart = el('div', 'b-dart'); dart.setAttribute('aria-hidden','true');
      const poster = button('', 'b-poster', () => openImages(recordImages(item), 0));
      poster.setAttribute('aria-label', '放大查看：' + item.title);
      poster.append(photo(item.src, item.title)); art.append(orbit, back, middle, poster, dart);
      let tiltFrame = 0;
      art.addEventListener('pointermove', event => {
        if (!fine.matches || motion.matches || event.pointerType === 'touch') return;
        cancelAnimationFrame(tiltFrame);
        tiltFrame = requestAnimationFrame(() => {
          const r = art.getBoundingClientRect();
          art.style.setProperty('--tilt-x', ((event.clientX - r.left) / r.width * 16 - 8).toFixed(1) + 'deg');
          art.style.setProperty('--tilt-y', (8 - (event.clientY - r.top) / r.height * 16).toFixed(1) + 'deg');
        });
      });
      art.addEventListener('pointerleave', () => {
        cancelAnimationFrame(tiltFrame); art.style.setProperty('--tilt-x', '0deg'); art.style.setProperty('--tilt-y', '0deg');
      });
      article.append(art);
    }
    const body = el('div', 'b-feature-body');
    body.append(metadata(item, true), el('h3', '', item.title), el('p', '', item.desc));
    const read = button('', 'b-open', () => openReader(item, article));
    const circle = el('span', 'b-round'); circle.append(icon());
    read.append(el('span', '', '展开这则消息'), circle); body.append(read); article.append(body);
    return article;
  }
  function row(item, index) {
    const article = el('article', 'b-row'); article.style.setProperty('--row', index);
    const body = el('div'); const title = el('h3');
    const open = button(item.title, 'b-row-button', () => openReader(item, article));
    title.append(open); body.append(metadata(item, false), title); article.append(body);
    if (item.src) article.append(photo(item.src, '', 'b-thumb'));
    else { const circle = el('span','b-round'); circle.append(icon()); article.append(circle); }
    return article;
  }
  function drawBoard() {
    board.replaceChildren();
    const items = source.filter(item => currentFilter === '全部' || item.category === currentFilter);
    if (!items.length) { board.append(el('p','b-empty','这个分类暂时没有内容。')); return; }
    // Choose an actual publication cover when available; all text comes from rendered cloud content.
    const lead = items.find(item => item.category === '刊物') || items[0];
    board.append(feature(lead));
    const latest = el('div','b-latest');
    const head = el('div','b-list-head'); head.append(el('strong','','更多消息'),el('span','b-count',String(items.length).padStart(2,'0') + ' ENTRIES'));
    const list = el('div','b-list');
    const remaining = items.filter(item => item !== lead);
    const shown = expandedList ? remaining : remaining.slice(0,3);
    shown.forEach((item,i) => list.append(row(item,i)));
    if (!remaining.length) list.append(el('p','b-empty','该分类共 1 条内容，点击左侧消息阅读全文。'));
    latest.append(head,list);
    if (remaining.length > 3) {
      const more = button(expandedList ? '收起列表' : '查看全部消息', 'b-more', () => {expandedList = !expandedList; drawBoard(); refresh();});
      more.append(icon('right')); latest.append(more);
    }
    board.append(latest);
    $('.b-live',root).textContent = currentFilter + '，共 ' + items.length + ' 条演示内容';
  }
  function refresh() { if (window.ScrollTrigger) window.ScrollTrigger.refresh(); }
  function replay() {
    clearTimeout(replayTimer); root.classList.remove('b-in');
    void root.offsetWidth; root.classList.add('b-in');
    replayTimer = setTimeout(() => root.classList.remove('b-in'), 2000);
  }
  function go(id, repeat = false) {
    if (lightbox?.open || reader?.open) return;
    const target = document.getElementById(id); if (!target) return;
    // Native scroll keeps the exact preview position during viewport switching.
    window.scrollTo({top:Math.max(0, target.getBoundingClientRect().top + scrollY - 72), behavior:'instant'});
    if (id === 'notices' && repeat) replay();
    if (id === 'depts' && repeat) {
      const first = $('.dept-toggle',target);
      if (first.getAttribute('aria-expanded') === 'true') first.click();
      first.click();
    }
    if (id === 'home' && repeat && !motion.matches) animate($('.hero-content'),[{opacity:.3,transform:'translateY(22px)'},{opacity:1,transform:'none'}],750);
  }
  function addNav() {
    const nav = $('.nav__links');
    if (nav) {
      const a = el('a','','公告'); a.href = '#notices';
      a.addEventListener('click', e => {e.preventDefault();go('notices',true);}); nav.prepend(a);
      const activeObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) $$('a',nav).forEach(link => link.classList.toggle('active',link === a));
          else a.classList.remove('active');
        });
      }, {rootMargin:'-20% 0px -65% 0px'});
      activeObserver.observe(root);
    }
    const menu = $('.menu-overlay__links');
    if (menu) {
      const a = el('a'); a.href='#notices';
      a.append(el('span','menu-num',''),el('span','menu-txt','通知公告'));
      a.addEventListener('click', e => {
        e.preventDefault(); if ($('.nav__burger')?.getAttribute('aria-expanded') === 'true') $('.nav__burger').click();
        setTimeout(() => go('notices',true),250);
      }); menu.prepend(a);
    }
  }
  function makeDialogs() {
    reader = el('dialog','b-reader'); reader.setAttribute('aria-labelledby','b-reader-title');
    const shell = el('div','b-reader-shell'); shell.setAttribute('data-lenis-prevent','');
    const top = el('div','b-reader-top'); top.append(el('span','','STA / 通知公告'));
    const close = button('×','b-close',() => closeDialog(reader)); close.setAttribute('aria-label','关闭公告');
    top.append(close); shell.append(top,el('div','b-reader-body')); reader.append(shell); document.body.append(reader);
    lightbox=el('dialog','b-lightbox');lightbox.setAttribute('aria-label','公告图片查看');lightbox.setAttribute('data-lenis-prevent','');
    const bar = el('div','b-lightbox-bar');bar.append(el('span','b-image-title','图片查看'));
    const tools=el('div','b-lightbox-tools');const zoom=button('放大','b-zoom',toggleZoom);zoom.setAttribute('aria-pressed','false');
    const x=button('×','b-close',()=>closeDialog(lightbox));x.setAttribute('aria-label','关闭图片查看');tools.append(zoom,x);bar.append(tools);
    const stage=el('div','b-lightbox-stage');stage.setAttribute('tabindex','0');stage.setAttribute('aria-label','图片，可放大后滚动查看');
    const foot=el('div','b-lightbox-foot');const prev=button('','',()=>showImage(imageIndex-1));prev.setAttribute('aria-label','上一张图片');prev.append(icon('right'));
    const next=button('','',()=>showImage(imageIndex+1));next.setAttribute('aria-label','下一张图片');next.append(icon('right'));
    const counter=el('span','b-image-count');counter.setAttribute('aria-live','polite');foot.append(prev,counter,next);lightbox.append(bar,stage,foot);document.body.append(lightbox);
    [reader,lightbox].forEach(dialog=>{
      dialog.addEventListener('cancel',e=>{e.preventDefault();closeDialog(dialog);});
      dialog.addEventListener('click',e=>{
        if(e.target!==dialog)return;
        const r=dialog.getBoundingClientRect();
        if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeDialog(dialog);
      });
    });
    lightbox.addEventListener('keydown',e=>{
      if(stage.classList.contains('zoomed'))return;
      if(e.key==='ArrowRight'){e.preventDefault();showImage(imageIndex+1);}
      if(e.key==='ArrowLeft'){e.preventDefault();showImage(imageIndex-1);}
    });
    let start=null;
    stage.addEventListener('pointerdown',e=>{start={x:e.clientX,y:e.clientY};});
    stage.addEventListener('pointercancel',()=>{start=null;});
    stage.addEventListener('pointerup',e=>{
      if(!start||stage.classList.contains('zoomed'))return;
      const dx=e.clientX-start.x,dy=e.clientY-start.y;start=null;
      if(Math.abs(dx)>60&&Math.abs(dx)>Math.abs(dy)*1.5)showImage(imageIndex+(dx<0?1:-1));
    });
  }
  async function closeDialog(dialog) {
    if(!dialog.open||dialog.classList.contains('closing'))return;
    dialog.classList.add('closing');
    const node=dialog===reader?$('.b-reader-shell',dialog):dialog;
    await animate(node,[{opacity:1,transform:'none'},{opacity:0,transform:'translateY(28px) scale(.98)'}],220);
    dialog.close();dialog.classList.remove('closing');
    if(!reader.open&&!lightbox.open)document.documentElement.classList.remove('b-dialog-open');
  }
  function openReader(item, origin) {
    const body=$('.b-reader-body',reader);body.replaceChildren();
    const title=el('h2','',item.title);title.id='b-reader-title';
    body.append(metadata(item,false),title,el('p','b-reader-warning','公告版式演示：以下文字和图片摘自云端活动内容，不代表新发布的通知。'),el('p','b-reader-copy',item.desc));
    const gallery=el('div','b-gallery');const records=recordImages(item);
    records.forEach((image,i)=>{
      const figure=el('figure');const open=button('','b-image-button',()=>openImages(records,i));open.setAttribute('aria-label','放大图片：'+image.title);
      open.append(photo(image.src,image.title));figure.append(open,el('figcaption','',image.caption));gallery.append(figure);
    });body.append(gallery);
    const related=button('浏览主站活动','b-reader-link',async()=>{await closeDialog(reader);go('events');});related.append(icon());body.append(related);
    reader.showModal();document.documentElement.classList.add('b-dialog-open');$('.b-reader-shell',reader).scrollTop=0;
    const r=origin.getBoundingClientRect(),to=$('.b-reader-shell',reader).getBoundingClientRect();
    const dx=(r.left+r.width/2)-(to.left+to.width/2),dy=(r.top+r.height/2)-(to.top+to.height/2);
    animate($('.b-reader-shell',reader),[
      {opacity:.15,transform:`translate(${dx*.24}px,${Math.max(-80,Math.min(100,dy*.3))}px) scale(.86)`,filter:'blur(5px)'},
      {opacity:1,transform:'none',filter:'blur(0px)'}
    ],550);
  }
  function showImage(index) {
    if(!images.length)return;imageIndex=(index+images.length)%images.length;
    const stage=$('.b-lightbox-stage',lightbox);stage.classList.remove('zoomed');
    const zoom=$('.b-zoom',lightbox);zoom.textContent='放大';zoom.setAttribute('aria-pressed','false');
    const img=photo(images[imageIndex].src,images[imageIndex].title);stage.replaceChildren(img);
    $('.b-image-title',lightbox).textContent='图片查看';$('.b-image-count',lightbox).textContent=(imageIndex+1)+' / '+images.length;
    animate(img,[{opacity:0,transform:'translateX(18px) scale(.97)'},{opacity:1,transform:'none'}],340);
  }
  function openImages(records,index) {
    images=records;if(!images.length)return;showImage(index);
    lightbox.showModal();document.documentElement.classList.add('b-dialog-open');
    animate(lightbox,[{opacity:0,transform:'scale(.93)'},{opacity:1,transform:'none'}],400);
  }
  function toggleZoom() {
    const stage=$('.b-lightbox-stage',lightbox);const active=stage.classList.toggle('zoomed');
    $('.b-zoom',lightbox).textContent=active?'适应屏幕':'放大';$('.b-zoom',lightbox).setAttribute('aria-pressed',String(active));
    stage.scrollTo({top:0,left:0,behavior:'instant'});
  }
  function mobileMotion() {
    const wrap=$('.h-wrap'),cards=$$('.event-card:not(.event-card--more)');
    if(!wrap||!cards.length)return;
    const controls=el('div','b-carousel-nav');let current=0;
    const previous=button('','',()=>move(-1));previous.setAttribute('aria-label','上一个活动');previous.append(icon('right'));
    const next=button('','',()=>move(1));next.setAttribute('aria-label','下一个活动');next.append(icon('right'));
    const count=el('span','','1 / '+cards.length);count.setAttribute('aria-live','polite');controls.append(previous,count,next);wrap.after(controls);
    function move(step){current=Math.max(0,Math.min(cards.length-1,current+step));cards[current].scrollIntoView({inline:'center',block:'nearest',behavior:motion.matches?'instant':'smooth'});}
    const observer=new IntersectionObserver(entries=>{
      entries.forEach(entry=>{if(entry.isIntersecting){current=cards.indexOf(entry.target);count.textContent=(current+1)+' / '+cards.length;}});
    },{root:wrap,threshold:.6});cards.forEach(card=>observer.observe(card));
    if(window.gsap&&window.ScrollTrigger&&!motion.matches){
      window.gsap.matchMedia().add('(max-width: 899px)',()=>{
        // Re-time existing once-only reveals; the full site's scene structure stays intact.
        const changed=[];
        window.ScrollTrigger.getAll().forEach(t=>{
          if(t.vars.once&&t.animation&&t.trigger?.matches('[data-reveal],[data-reveal-group]')){
            changed.push([t.animation,t.animation.timeScale()]);t.animation.timeScale(1.55);
          }
        });
        return()=>changed.forEach(([animation,speed])=>animation.timeScale(speed));
      });
    }
  }
  function mount() {
    source=$$('.event-card:not(.event-card--more)').map((card,i)=>{
      const title=$('h3',card)?.textContent||'';
      return {id:i,title,desc:$('.event-card__body p',card)?.textContent||'',date:$('.event-date',card)?.textContent||'',src:$('.event-card__img',card)?.src||'',category:/未来梦|杂志|新刊/.test(title)?'刊物':/高考|毕业|祝福/.test(title)?'校园':'活动'};
    }).filter(item=>item.title);
    root=el('section','bulletin');root.id='notices';root.setAttribute('aria-labelledby','bulletin-title');
    const watermark=el('span','b-watermark','BULLETIN');watermark.setAttribute('aria-hidden','true');root.append(watermark);
    const container=el('div','container'),heading=el('div','b-heading'),text=el('div'),title=el('h2');title.id='bulletin-title';
    const em=el('em');em.append(el('span','','公告'));title.append(el('span','','通知'),em);
    const desc=el('p','','来自科协的新消息，值得你停留。');desc.append(el('small','','设计演示，以下内容摘自云端已发布活动。'));
    text.append(title,desc);const mark=el('div','b-heading-mark');mark.setAttribute('aria-hidden','true');mark.append(icon());heading.append(text,mark);container.append(heading);
    const toolbar=el('div','b-toolbar'),tabs=el('div','b-tabs');tabs.setAttribute('role','group');tabs.setAttribute('aria-label','公告分类');
    ['全部',...new Set(source.map(s=>s.category))].forEach(category=>{
      const count=category==='全部'?source.length:source.filter(s=>s.category===category).length;
      const b=button(category,'b-tab',async()=>{
        if(filtering||currentFilter===category)return;filtering=true;
        currentFilter=category;expandedList=false;
        $$('.b-tab',tabs).forEach(t=>t.setAttribute('aria-pressed',String(t===b)));
        clearTimeout(replayTimer);root.classList.remove('b-in');
        await animate(board,[{opacity:1,transform:'none'},{opacity:0,transform:'translateY(8px)'}],160);
        drawBoard();refresh();await animate(board,[{opacity:0,transform:'translateY(16px)'},{opacity:1,transform:'none'}],420);filtering=false;
      });
      b.setAttribute('aria-pressed',String(category==='全部'));b.append(el('small','',count));tabs.append(b);
    });
    toolbar.append(tabs,el('span','b-demo','活动素材 / 公告版式演示'));container.append(toolbar);
    const live=el('span','b-sr b-live');live.setAttribute('aria-live','polite');container.append(live);
    board=el('div','b-board');container.append(board);
    const footer=el('div','b-footer');footer.append(el('span','','消息有时效，热爱一直在线。'));
    const replayButton=button('重播展开动效','',replay);replayButton.append(icon('right'));footer.append(replayButton);container.append(footer);root.append(container);
    $('#about').before(root);drawBoard();makeDialogs();addNav();mobileMotion();refresh();
    const observer=new IntersectionObserver(entries=>{
      if(entries.some(e=>e.isIntersecting)){replay();observer.disconnect();}
    },{threshold:.12});observer.observe(root);
    window.STA_NOTICE_PREVIEW={go,replay};
    window.parent.postMessage({type:'sta-notice-ready',version:window.SITE_CONTENT_META.version},new URL(document.baseURI).origin);
  }
  let mounted=false;
  function check() {
    if(mounted||!$('.dept-toggle')||!$('.event-card'))return;
    mounted=true;observer.disconnect();
    if(window.SITE_CONTENT_META?.source!=='cloud') {
      window.parent.postMessage({type:'sta-notice-error',message:'云端内容暂未连接，请刷新重试。'},new URL(document.baseURI).origin);return;
    }
    mount();
  }
  const observer=new MutationObserver(check);
  observer.observe(document.body,{childList:true,subtree:true});
  check();
})();
