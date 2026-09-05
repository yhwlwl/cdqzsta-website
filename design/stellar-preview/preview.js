(() => {
  'use strict';
  const $ = s => document.querySelector(s), reduced = matchMedia('(prefers-reduced-motion:reduce)');
  const content = window.SITE_CONTENT;
  const rail = $('.event-rail');
  content.events.items.forEach(ev => {
    const card = document.createElement('article'); card.className = 'event';
    const img = document.createElement('img'); img.src = '../../' + ev.img; img.alt = ev.title; img.loading = 'lazy';
    const body = document.createElement('div'); body.className = 'event-body';
    [['time',ev.date],['h3',ev.title],['p',ev.desc]].forEach(([tag,text]) => {const el=document.createElement(tag);el.textContent=text;body.append(el);});
    card.append(img,body);rail.append(card);
  });
  const names=['编辑部','新媒体部','活动部','宣传部','巨疯实验部','网络部'];
  const copy=['编辑出版《未来梦》，记录科学与校园生活，让文字承载想象。','用镜头与新媒体记录科协，把每一次灵感带给更多人。','承办科技活动月、未来梦大讲坛，让好奇心在相遇中生长。','从海报到宣传物料，用设计把科协的故事呈现在校园。','把大胆的想法带进实验室，在动手实践中寻找答案。','开发与维护科协网站及信息化工具，用代码连接每一份热爱。'];
  names.forEach((name,i)=>{const d=document.createElement('details'),s=document.createElement('summary'),p=document.createElement('p');s.textContent=name;p.textContent=copy[i];d.append(s,p);$('.team-list').append(d);});
  function syncRail(){const step=rail.children[0].getBoundingClientRect().width+parseFloat(getComputedStyle(rail).gap);const n=Math.min(rail.children.length,Math.round(rail.scrollLeft/step)+1);$('.rail-count').textContent=String(n).padStart(2,'0')+' / '+String(rail.children.length).padStart(2,'0');$('.prev').disabled=rail.scrollLeft<2;$('.next').disabled=rail.scrollLeft>=rail.scrollWidth-rail.clientWidth-2;}
  function move(dir){const step=rail.children[0].getBoundingClientRect().width+parseFloat(getComputedStyle(rail).gap);rail.scrollBy({left:dir*step,behavior:reduced.matches?'instant':'smooth'});}
  $('.prev').onclick=()=>move(-1);$('.next').onclick=()=>move(1);rail.addEventListener('scroll',syncRail,{passive:true});window.addEventListener('resize',syncRail);syncRail();
  rail.addEventListener('keydown',e=>{if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();move(e.key==='ArrowRight'?1:-1);}});
  if(!reduced.matches){const observer=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting){e.target.classList.remove('pending');observer.unobserve(e.target);}}),{threshold:.12});document.querySelectorAll('.reveal').forEach(el=>{el.classList.add('pending');observer.observe(el);});}
  $('.hero').addEventListener('pointermove',e=>{if(reduced.matches||e.pointerType==='touch')return;$('.orbit-scene').style.setProperty('--ox',((e.clientX/innerWidth-.5)*22)+'px');$('.orbit-scene').style.setProperty('--oy',((e.clientY/innerHeight-.5)*16)+'px');},{passive:true});
  let frame=0,instance=null,timer=0,returnFocus=null;
  function finish(){cancelAnimationFrame(frame);clearTimeout(timer);if(instance){instance.destroy();instance=null;}$('.intro').hidden=true;document.body.style.overflow='';$('main').inert=false;$('header').inert=false;document.body.classList.remove('entering');void document.body.offsetWidth;document.body.classList.add('entering');if(returnFocus){returnFocus.focus({preventScroll:true});returnFocus=null;}}
  function play(manual=false){finish();if(reduced.matches)return;returnFocus=manual?$('.replay'):null;window.scrollTo({top:0,behavior:'instant'});const intro=$('.intro');intro.classList.remove('leaving');intro.hidden=false;document.body.style.overflow='hidden';$('main').inert=true;$('header').inert=true;$('.skip').focus({preventScroll:true});instance=window.STA_DART_SPLASH.mount($('.intro-stage'),{content});let start=performance.now(),last=start;timer=setTimeout(finish,7000);
    function tick(now){const t=(now-start)/1000,dt=Math.min((now-last)/1000,.05);last=now;const runtime=t*1.44;try{instance.frame(runtime,dt*1.44);}catch(err){console.error(err);finish();return;}intro.style.setProperty('--progress',Math.min(t/5.4,1));intro.style.setProperty('--rush',Math.max(0,1-Math.abs(t-2.65)/.48)*.75);intro.style.setProperty('--scale',1+t*.1);if(t>=4.65)intro.classList.add('leaving');if(t>=5.4){finish();return;}frame=requestAnimationFrame(tick);}frame=requestAnimationFrame(tick);
  }
  $('.skip').onclick=finish;$('.replay').onclick=()=>play(true);document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('.intro').hidden)finish();});document.addEventListener('visibilitychange',()=>{if(document.hidden&&!$('.intro').hidden)finish();});reduced.addEventListener('change',()=>{if(reduced.matches)finish();});play();
})();
