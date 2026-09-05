/* STA Splash Lab 06 · 棱影飞镖 shared runtime */
(function () {
  'use strict';

  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var lerp = function (a, b, k) { return a + (b - a) * k; };
  var easeIO = function (t) { return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
  var easeO = function (t) { return 1 - Math.pow(1 - t, 3); };
  var easeI = function (t) { return t * t * t; };
  var smooth = function (x, a, b) {
    var k = clamp((x - a) / (b - a), 0, 1);
    return k * k * (3 - 2 * k);
  };
  var px = function (v) { return v + 'px'; };
  var rnd = function (a, b) { return a + Math.random() * (b - a); };

  function mkCanvas(root) {
    var c = document.createElement('canvas');
    root.insertBefore(c, root.firstChild);
    var o = {
      c: c,
      x: c.getContext('2d'),
      d: 1,
      W: 0,
      H: 0,
      resize: function () {
        var d = Math.min(
          window.devicePixelRatio || 1,
          root.getBoundingClientRect().width < 720 ? 1.5 : 2
        );
        var r = root.getBoundingClientRect();
        this.d = d;
        c.width = Math.max(2, Math.round(r.width * d));
        c.height = Math.max(2, Math.round(r.height * d));
        c.style.width = r.width + 'px';
        c.style.height = r.height + 'px';
        this.W = c.width / d;
        this.H = c.height / d;
        this.x.setTransform(d, 0, 0, d, 0, 0);
      }
    };
    o.resize();
    return o;
  }

  async function sampleTextPts(text, size) {
    var w = Math.min(window.innerWidth * .92, 1000) | 0;
    var h = (size * 1.7) | 0;
    var oc = document.createElement('canvas');
    oc.width = w;
    oc.height = h;
    var o = oc.getContext('2d', { willReadFrequently: true });
    try {
      await Promise.race([
        document.fonts && document.fonts.load
          ? document.fonts.load('700 ' + size + 'px "Space Grotesk"')
          : Promise.resolve(),
        new Promise(function (resolve) { setTimeout(resolve, 900); })
      ]);
    } catch (e) {}
    o.font = '700 ' + size + 'px "Space Grotesk",sans-serif';
    o.textAlign = 'center';
    o.textBaseline = 'middle';
    o.fillStyle = '#fff';
    o.fillText(text, w / 2, h / 2);
    var img = o.getImageData(0, 0, w, h).data;
    var pts = [];
    var step = Math.max(3, Math.round(size / 38));
    for (var y = 0; y < h; y += step) {
      for (var xx = 0; xx < w; xx += step) {
        if (img[((y | 0) * w + (xx | 0)) * 4 + 3] > 110) {
          pts.push([xx - w / 2, y - h / 2]);
        }
      }
    }
    for (var i = pts.length - 1; i > 0; i--) {
      var j = (Math.random() * (i + 1)) | 0;
      var tmp = pts[i];
      pts[i] = pts[j];
      pts[j] = tmp;
    }
    return pts;
  }

var DartSplashAnimation={
  id:'f',no:'06',name:'棱影飞镖',en:'DART HULL',dur:7.2,
  hook:'一列由纯粹星尘构成的列车沿巨大光环绕行一周——掠过你眼前，再向右上方切出、解体；万千光点逆流汇聚成「STA」。',
  desc:[['核心意象','全息星尘列车：车身是真正的三维点云（透视近大远小、转弯自然变形），星环即轨道即进度。'],
    ['时间线','0–0.9s 星尘旋入凝成光环 → 0.4–3.95s 列车贴环绕行 255°（下前方最近最大）→ 切出解体 → 光点聚成 STA → 闪光揭幕。'],
    ['惊喜点','① 列车以纯光点构成却立体可信；② 近景掠过时的尺度冲击；③ 整列车解体成光流、连同星环一起被「吸」进 STA 字形。'],
    ['实现成本','单 Canvas 点云渲染（≤2200 点）+ 文字采样弹簧聚形，无 three.js。约 1.5 天。']],
  mount(stage,options){
    options=options||{};
    const content=options.content||{},brand=content.brand||{};
    const brandShort=String(brand.shortEN||'STA');
    const splashText=String(brand.splashText||brandShort);
    const brandNameCN=String(brand.nameCN||'成都七中科学技术协会');
    const brandEst=String(brand.est||'1999');
    const curtain=document.createElement('div');curtain.className='curtain';
    const root=document.createElement('div');root.className='vE preloader__dart-root';
    stage.appendChild(curtain);curtain.appendChild(root);
    const cv=mkCanvas(root);
    const x=cv.x,D=this.dur;
    const handleResize=()=>cv.resize();
    window.addEventListener('resize',handleResize);

    /* ---------- 光环几何（XY 圆 → 绕 X 轴后仰 66°：太空斜椭圆） ---------- */
    const R=320,TL=66*Math.PI/180,cB=Math.cos(TL),sB=Math.sin(TL);
    function ringPt(th,r){return [Math.cos(th)*r,Math.sin(th)*r*cB,160+Math.sin(th)*r*sB];}

    /* ---------- 相机（固定机位 + 缓慢推近，透视近大远小） ---------- */
    const cam={x:0,y:26,z:-420,yaw:0,pitch:0};
    function lookAt(tx,ty,tz){
      const dx=tx-cam.x,dy=ty-cam.y,dz=tz-cam.z;
      cam.yaw=Math.atan2(dx,dz);
      cam.pitch=Math.atan2(dy,Math.hypot(dx,dz));
    }
    function project(px,py,pz){
      let dx=px-cam.x,dy=py-cam.y,dz=pz-cam.z;
      const cy=Math.cos(cam.yaw),sy=Math.sin(cam.yaw);
      const x1=dx*cy-dz*sy,z1=dx*sy+dz*cy;
      const cp=Math.cos(cam.pitch),sp=Math.sin(cam.pitch);
      const y1=dy*cp-z1*sp,z2=dy*sp+z1*cp;
      if(z2<40)return null;
      const f=Math.min(cv.H*1.06,cv.W*.74);
      let sx=cv.W/2+x1*f/z2,syc=cv.H/2-y1*f/z2;
      /* 屏幕面旋转：长轴对角、右端抬起（土星环式构图） */
      const GR=-15*Math.PI/180,cgr=Math.cos(GR),sgr=Math.sin(GR);
      const rx=sx-cv.W/2,ry=syc-cv.H/2;
      return {x:cv.W/2+rx*cgr-ry*sgr,y:cv.H/2+rx*sgr+ry*cgr,s:f/z2};
    }

    /* ---------- 列车三维点云（车头朝 +x · 六角桶身＋圆锥压鼻） ----------
       截面为切角六角形：上下面是真平面（平行点列），六顶点加亮＝棱线；
       舰首圆锥沿用平底低尖；船尾收细＋喷口双环 */
    const train=[];(function(){
      const L=150,R0=16,HVF=.58;
      const prof=u=>{
        let w;
        if(u>=.85)w=R0*Math.pow((1-u)/.15,.78);
        else if(u>=.55)w=R0*(.9+.1*((u-.55)/.3));
        else if(u>=.2)w=R0*(.72+.18*((u-.2)/.35));
        else w=R0*(.32+.38*(u/.2));
        return Math.max(w,.6);
      };
      const NS=46,NP=18,m=NP/6;                     /* 六边 · 每边 3 点 */
      /* 面片着色：0左上肩 1顶面 2右上肩 3右下腹 4底面 5左下腹 */
      const FC=[{c:'#7FA3F0',al:.74},{c:'#C9DAFF',al:.92},{c:'#7FA3F0',al:.74},
                {c:'#31509E',al:.58},{c:'#1D3163',al:.52},{c:'#31509E',al:.58}];
      for(let i=0;i<NS;i++){
        const u=i/(NS-1),xl=-L/2+L*u;
        const seam=(i%7===4);
        let V,yO;
        if(u>.72){
          /* —— 圆锥舰首：底线恒定，上缘前倾至低位尖 —— */
          const t=(u-.72)/.28;
          const wS2=prof(.72),ycS=.8+2*.72*.72;
          const yB2=-wS2*HVF+ycS,yT2=wS2*HVF+ycS,tipY=yB2+1.5;
          const w2=Math.max(wS2*Math.pow(1-t,.9),.38);
          const yTt=yT2+(tipY-yT2)*t;
          yO=0;
          const yM=(yB2+yTt)/2;
          V=[[-w2,yM],[-w2*.74,yTt],[w2*.74,yTt],[w2,yM],[w2*.8,yB2],[-w2*.8,yB2]];
        }else{
          const w=prof(u),hv=w*HVF,yc=.8+2*u*u;
          yO=yc;
          V=[[-w,0],[-w*.74,hv],[w*.74,hv],[w,0],[w*.8,-hv],[-w*.8,-hv]];
        }
        for(let e2=0;e2<6;e2++){
          const A=V[e2],B2=V[(e2+1)%6],fc=FC[e2];
          for(let q2=0;q2<m;q2++){
            const tt=q2/m,vtx=q2===0;               /* 棱线起点＝顶点 */
            train.push({x:xl,
              y:yO+A[1]+(B2[1]-A[1])*tt,
              z:A[0]+(B2[0]-A[0])*tt,
              c:vtx?'#DCE7FF':fc.c,
              a:Math.min(1,(vtx?.95:fc.al)*(seam?.84:1)),
              s:vtx?rnd(1.25,1.8):rnd(.85,1.35)});}}
      }
      /* 收细船尾＋喷口双环（尾不再是圆头） */
      for(let k=0;k<14;k++){const a=k/14*Math.PI*2;
        train.push({x:-L/2+rnd(-.6,.6),y:.8+Math.sin(a)*2.6,z:Math.cos(a)*4.3,
          c:'#8FB0FF',a:.78,s:rnd(.9,1.5)});}
      for(let k=0;k<10;k++){const a=k/10*Math.PI*2;
        train.push({x:-L/2+1.8+rnd(-1,0),y:.8+Math.sin(a)*1.7,z:Math.cos(a)*2.9,
          c:k%2?'#BFD2FF':'#EAF2FF',a:.95,s:rnd(1.1,1.8)});}
    })();

    /* 移动端旗标 */
    const MOB=(cv.W||innerWidth)<720;
    /* 环伴萤火：绕环缓行、起伏明灭的微光尘（浪漫点缀） */
    const MOTES=[];for(let i=0;i<(MOB?6:11);i++)MOTES.push({th:Math.random()*Math.PI*2,
      ro:rnd(-26,42),ya:rnd(4,14),ph:rnd(0,7),sp:rnd(.06,.16)*(Math.random()<.5?-1:1),
      sz:rnd(1.2,2.6),tw:rnd(0,7)});
    /* ---------- 星环尘埃 ---------- */
    const DUSTN=MOB?300:520,dust=[];
    for(let i=0;i<DUSTN;i++)dust.push({th:Math.random()*Math.PI*2,
      r0:R*rnd(.55,1.7),jr:rnd(-5,5),sp:rnd(.05,.17)*(Math.random()<.85?-1:1),
      c:['#8FB0FF','#4D7CFF','#DCE7FF','#BFD2FF'][(Math.random()*4)|0],
      a:rnd(.14,.4),sz:rnd(.7,1.7),tw:rnd(0,7)});
    /* 背景星 */
    const stars=[];for(let i=0;i<(MOB?70:130);i++)stars.push({x:Math.random(),y:Math.random(),
      r:rnd(.4,1.5),tw:rnd(0,7)});

    /* ---------- 时间轴（顶部出现→整圈→脱轨直冲镜头→撞击屏幕碎裂聚字） ---------- */
    /* ---------- 时间轴（顶部出现→整圈 360°→回到起点脱轨直冲镜头） ---------- */
    const TH0=100*Math.PI/180,SWEEP=2*Math.PI,TH1=TH0+SWEEP;
    /* 出环方向：微收中·缓降·直插镜头（视线汇聚，放大全程在画面内） */
    const EXV=[-.163,-.202,-.965];{const el=Math.hypot(EXV[0],EXV[1],EXV[2]);
      EXV[0]/=el;EXV[1]/=el;EXV[2]/=el;}
    const T_RING_IN=.95,T_TRAV0=.4,T_TRAV1=3.95,TEX=T_TRAV1,DUR=D;
    let trail=[],sparks=[],stas=[],gather=[],formed=false,flashEl=null,T_SM=-1;
    let prevTh=TH0;
    /* 每个车体点的上一帧屏幕投影与速度（撞击时原位继承，杜绝凭空出现） */
    const lastP=new Array(train.length).fill(null);
    const lastV=new Array(train.length).fill(null);
    const lastS=new Array(train.length).fill(2);
    /* 俯冲散开：每个车体点的聚字孪生粒子与剥离阈值（exitE 比例） */
    let roster=false;const twin=[],peelAt=[];
    let shock=-1,shockX=0,shockY=0;   /* 撞击冲击波 */
    let massX=null,massY=null;        /* 可见车体质量的屏幕质心（逐帧跟踪） */
    const COLS=['#8FB0FF','#4D7CFF','#DCE7FF','#FFFFFF','#BFD2FF'];

    let staPts=null;
    const readyP=sampleTextPts(splashText,Math.min(innerWidth*.36,245))
      .then(r=>{staPts=r;}).catch(()=>{});

    /* 辉光贴片：聚字粒子用发光体而不是素点 */
    const GLOW=document.createElement('canvas');GLOW.width=GLOW.height=48;
    {const gg=GLOW.getContext('2d');
     const rg=gg.createRadialGradient(24,24,0,24,24,24);
     rg.addColorStop(0,'rgba(255,255,255,.95)');
     rg.addColorStop(.25,'rgba(190,212,255,.55)');
     rg.addColorStop(.6,'rgba(110,150,255,.18)');
     rg.addColorStop(1,'rgba(110,150,255,0)');
     gg.fillStyle=rg;gg.fillRect(0,0,48,48);}

    const gl=document.createElement('div');gl.className='gingaline';
    gl.appendChild(document.createTextNode('星环线 · '));
    const glStrong=document.createElement('b');glStrong.textContent='STELLAR ORBITAL';
    gl.appendChild(glStrong);
    gl.appendChild(document.createTextNode(' · 终点站 '+brandShort));
    const bl=document.createElement('div');bl.className='brandline';
    bl.appendChild(document.createTextNode(brandShort));
    const blSmall=document.createElement('small');blSmall.textContent=brandNameCN;
    bl.appendChild(blSmall);


    function getFlash(){if(!flashEl){flashEl=document.createElement('div');
      flashEl.className='flash';curtain.appendChild(flashEl);}return flashEl;}

    /* 列车位姿 */
    const SGN=SWEEP<0?-1:1;                 // 绕行方向
    function pose(th,t){
      const P=ringPt(th,R),dth=.02*Math.sign(SWEEP);
      const Pb=ringPt(th+dth,R);
      let Tx=Pb[0]-P[0],Ty=Pb[1]-P[1],Tz=Pb[2]-P[2];
      const l=Math.hypot(Tx,Ty,Tz)||1;Tx/=l;Ty/=l;Tz/=l;
      /* 副法线/上向量 + 内倾滚转（方向随绕行翻转） */
      let Rx0=Tz,Ry0=0,Rz0=-Tx;
      const rl=Math.hypot(Rx0,Ry0,Rz0)||1;Rx0/=rl;Ry0/=rl;Rz0/=rl;
      let Ux0=Ty*Rz0-Tz*Ry0,Uy0=Tz*Rx0-Tx*Rz0,Uz0=Tx*Ry0-Ty*Rx0;
      const BANK=.24*SGN;
      const ux=Ux0*Math.cos(BANK)+Rx0*Math.sin(BANK),
            uy=Uy0*Math.cos(BANK)+Ry0*Math.sin(BANK),
            uz=Uz0*Math.cos(BANK)+Rz0*Math.sin(BANK);
      return {P,T:[Tx,Ty,Tz],U:[ux,uy,uz],R:[Rx0,Ry0,Rz0]};
    }
    function trainWorld(po,lx,ly,lz){
      /* 车身局部 +x = 前进切线 T（车头沿轨道），+y = 上，+z = 侧向 R */
      return [po.P[0]+po.T[0]*lx+po.U[0]*ly+po.R[0]*lz,
              po.P[1]+po.T[1]*lx+po.U[1]*ly+po.R[1]*lz,
              po.P[2]+po.T[2]*lx+po.U[2]*ly+po.R[2]*lz];
    }

    return {
      readyP,
      frame(t,dt){
        dt=Math.min(dt,.05);
        x.clearRect(0,0,cv.W,cv.H);
        const W=cv.W,H=cv.H;

        /* 相机推近 */
        cam.z=-420+t/D*54;lookAt(0,12,160);

        /* 背景 */
        const ng=x.createRadialGradient(W*.5,H*.34,10,W*.5,H*.34,H*.62);
        ng.addColorStop(0,'rgba(23,50,124,.22)');ng.addColorStop(1,'rgba(23,50,124,0)');
        x.fillStyle=ng;x.fillRect(0,0,W,H);
        for(const st of stars){
          const a=.28+.5*Math.abs(Math.sin(t*1.1+st.tw));
          x.fillStyle='rgba(214,228,255,'+a.toFixed(2)+')';
          x.beginPath();x.arc(st.x*W,st.y*H,st.r,0,7);x.fill();}

        /* ---- 角度推进（进度条式渐进加速：起步缓、持续变快、末端全速） ---- */
        const ru=clamp((t-T_TRAV0)/(T_TRAV1-T_TRAV0),0,1);
        const trav=Math.pow(ru,1.7);
        const th=TH0+SWEEP*trav;
        const spd=dt>0?Math.abs(th-prevTh)/dt:0;prevTh=th;
        const inTrav=t>T_TRAV0&&t<T_TRAV1;
        const inExit=t>=TEX&&T_SM<0;

        /* ---- 散开花名册：进入俯冲即建立（每点一个聚字孪生） ---- */
        if(t>=TEX-.01&&!roster&&staPts&&staPts.length){
          roster=true;
          for(let i=0;i<train.length;i++){
            /* 阈值铺满整个俯冲段（撞点约 .49）：始终保留 ~12% 车体撞上屏幕，
               质心因此实时有效，爆点与视觉位置严格一致 */
            peelAt.push(rnd(0,.55));
            gather.push({act:false,idx:i,
              col:i%4?'#DCE7FF':COLS[(i*5)%COLS.length],sz:rnd(1,2.3),
              x:0,y:0,vx:0,vy:0,age:0,delay:0});
            twin.push(gather[gather.length-1]);}
        }

        /* ---- 星环成形 + 尘埃（含进度条轨道与速度线） ---- */
        x.globalCompositeOperation='lighter';
        const formK=easeO(clamp(t/T_RING_IN,0,1));
        /* 进度弧：走过的亮、未走的暗、车头前一段高亮——星环即加载轨道 */
        if(formK>.03){
          const fade=(T_SM<0?1:clamp(1-(t-T_SM)/.5,0,1));
          if(fade>0){
            const seg=(a0,a1,rgb,alpha,lw)=>{x.beginPath();let st=false;
              for(let s3=0;s3<=48;s3++){const a2=a0+(a1-a0)*s3/48;
                const wp=ringPt(a2,R);const p2=project(wp[0],wp[1],wp[2]);
                if(!p2){st=false;continue}
                if(!st){x.moveTo(p2.x,p2.y);st=true}else x.lineTo(p2.x,p2.y);}
              x.strokeStyle='rgba('+rgb+','+(alpha*fade).toFixed(3)+')';
              x.lineWidth=lw;x.stroke();};
            /* 多层柔光带 + 列车吞噬缺口：弧线不穿过车身（消除叠加白条） */
            const gap=.36;                                     /* ±20° 缺口 */
            seg(th+gap,TH1,'143,176,255',.045,1.6);             // 未走（极淡细线）
            seg(TH0,th-gap,'120,158,255',.05,26);               // 已走外晕
            seg(TH0,th-gap,'110,150,240',.11,14);               // 中带
            seg(TH0,th-gap,'140,172,250',.2,5);                 // 内带
            seg(TH0,th-gap,'223,233,255',.4,1.8);               // 亮芯
            seg(Math.max(TH0,th-.62),Math.max(TH0,th-.38),'234,242,255',.5,3);// 车尾后高亮余晖
            seg(Math.max(TH0,th-.62),Math.max(TH0,th-.38),'191,210,255',.16,10);
            /* 轨道里程碑：火车驶过即点亮 CDQZ→STA→SINCE→1999（避开底部隐藏弧段） */
            const MK=[['CDQZ',2.62],[brandShort,3.58],['SINCE',5.76],[brandEst,6.98]];
            const FT={C:['###','#..','#..','#..','###'],D:['##.','#.#','#.#','#.#','##.'],
              Q:['###','#.#','#.#','###','.#.'],Z:['###','..#','.#.','#..','###'],
              S:['###','#..','###','..#','###'],T:['###','.#.','.#.','.#.','.#.'],
              A:['###','#.#','###','#.#','#.#'],I:['###','.#.','.#.','.#.','###'],
              N:['#.#','##.','#.#','#.#','#.#'],E:['###','#..','###','#..','###'],
              '1':['.#.','##.','.#.','.#.','###'],'9':['###','#.#','###','..#','###']};
            for(let mi=0;mi<MK.length;mi++){
              const thM=MK[mi][1];
              if(th<thM)continue;
              const wp=ringPt(thM,R+34),pr2=project(wp[0],wp[1],wp[2]);
              if(!pr2)continue;
              const ru=(thM-TH0)/SWEEP;
              const tPass=T_TRAV0+(T_TRAV1-T_TRAV0)*Math.pow(Math.max(ru,.001),1/1.7);
              const fl=Math.exp(-Math.max(0,t-tPass)*4.5);
              const cs=Math.max(3.4,pr2.s*5.8)*(1+.16*fl)*(MOB?1.35:1);
              const txt=MK[mi][0];
              const colsN=txt.length*4-1;
              /* 小屏防裁切：标签盒整体钳制在视窗内 */
              const ox=Math.min(Math.max(pr2.x-cs*colsN/2,cs*2),W-colsN*cs-cs*2);
              const oy=Math.min(Math.max(pr2.y-cs*2.7,cs*3),H-cs*9);
              x.globalAlpha=.2*fade;
              x.drawImage(GLOW,ox-cs*2.5,oy-cs*2.5,colsN*cs+cs*5,cs*10);
              for(let ci=0;ci<txt.length;ci++){const g=FT[txt[ci]];if(!g)continue;
                for(let r2=0;r2<5;r2++)for(let c2=0;c2<3;c2++){
                  if(g[r2][c2]!=='#')continue;
                  x.globalAlpha=Math.min(1,(.58+.14*Math.sin(t*1.25+mi*2.1+r2)+fl)*fade);
                  x.fillStyle=(r2===0||c2===1)?'#F2F7FF':'#BFD2FF';
                  x.fillRect(ox+(ci*4+c2)*cs,oy+r2*cs,cs*.74,cs*.74);}}}
            /* 里程碑涟漪：点亮瞬间沿轨道荡开 */
            for(let mi2=0;mi2<MK.length;mi2++){
              const ru2=(MK[mi2][1]-TH0)/SWEEP;
              const tp2=T_TRAV0+(T_TRAV1-T_TRAV0)*Math.pow(Math.max(ru2,.001),1/1.7);
              const ag=t-tp2;if(ag<0||ag>.55)continue;
              const k2=ag/.55;
              x.globalCompositeOperation='lighter';
              x.beginPath();let st2=false;
              for(let s4=0;s4<=14;s4++){
                const a2=MK[mi2][1]+(s4/14-.5)*.5;
                const wq=ringPt(a2,R+34+k2*30),pq=project(wq[0],wq[1],wq[2]);
                if(!pq){st2=false;continue}
                if(!st2){x.moveTo(pq.x,pq.y);st2=true}else x.lineTo(pq.x,pq.y);}
              x.strokeStyle='rgba(214,228,255,'+((1-k2)*.55*fade).toFixed(3)+')';
              x.lineWidth=2.4*(1-k2)+.6;x.stroke();
              x.globalCompositeOperation='source-over';}
            /* 环伴萤火 */
            for(const mo of MOTES){
              const mth=mo.th+t*mo.sp;
              const mw=ringPt(mth,R+mo.ro);
              const mp=project(mw[0],mw[1]+Math.sin(t*.7+mo.ph)*mo.ya,mw[2]);
              if(!mp)continue;
              const twk=.55+.45*Math.sin(t*1.9+mo.tw);
              x.globalAlpha=.30*twk*fade*Math.min(1,formK*1.4);
              x.drawImage(GLOW,mp.x-mo.sz*3,mp.y-mo.sz*3,mo.sz*6,mo.sz*6);}

          }
        }
        for(const d of dust){
          d.th+=d.sp*dt;
          const rr=d.r0+(R-d.r0)*formK+d.jr*formK;
          const wp=ringPt(d.th,rr);
          const pr=project(wp[0],wp[1],wp[2]);if(!pr)continue;
          const tw=.6+.4*Math.abs(Math.sin(t*1.6+d.tw));
          x.globalAlpha=d.a*tw*(.25+.75*formK);
          /* 高速时拉出运动线（进度条的速度感） */
          if(d.px!==undefined&&spd>1.15&&t<T_TRAV1){
            const ex=pr.x+(pr.x-d.px)*(1+Math.min(3.2,spd*.28)),
                  ey=pr.y+(pr.y-d.py)*(1+Math.min(3.2,spd*.28));
            x.strokeStyle=d.c;x.lineWidth=Math.max(.7,pr.s*d.sz*1.2);
            x.beginPath();x.moveTo(ex,ey);x.lineTo(pr.x,pr.y);x.stroke();
          }else{
            x.fillStyle=d.c;
            x.beginPath();x.arc(pr.x,pr.y,Math.max(.55,pr.s*d.sz*1.35),0,7);x.fill();
          }
          d.px=pr.x;d.py=pr.y;
        }

        /* ---- 列车 ---- */
        let po,exitE=0,kAlign;
        if(t<TEX){po=pose(th,t);}
        else{ /* 终章：沿已对准的方向直线加速驶离（速度无缝衔接，不刹车） */
          po=pose(TH1,t);
          exitE=t-TEX;
          const dd=963*exitE+1200*exitE*exitE;
          po.P=[po.P[0]+EXV[0]*dd,po.P[1]+EXV[1]*dd,po.P[2]+EXV[2]*dd];
        }
        /* 车头对齐运行方向：绕行末段就开始缓缓外倾，脱轨后收尾到完全一致 */
        kAlign=t<TEX
          ?easeIO(clamp((trav-.86)/.14,0,1))*.9
          :.9+.1*clamp(exitE/.12,0,1);
        {
          let Tx2=po.T[0]*(1-kAlign)+EXV[0]*kAlign,
              Ty2=po.T[1]*(1-kAlign)+EXV[1]*kAlign,
              Tz2=po.T[2]*(1-kAlign)+EXV[2]*kAlign;
          const tl=Math.hypot(Tx2,Ty2,Tz2)||1;Tx2/=tl;Ty2/=tl;Tz2/=tl;
          let Rx2=Tz2,Ry2=0,Rz2=-Tx2;
          const rl=Math.hypot(Rx2,Ry2,Rz2)||1;Rx2/=rl;Ry2/=rl;Rz2/=rl;
          const Ux2=Ty2*Rz2-Tz2*Ry2,Uy2=Tz2*Rx2-Tx2*Rz2,Uz2=Tx2*Ry2-Ty2*Rx2;
          po.T=[Tx2,Ty2,Tz2];po.R=[Rx2,Ry2,Rz2];po.U=[Ux2,Uy2,Uz2];
        }
        let tAlpha=1;
        let mSX=0,mSY=0,mCN=0;   /* 本帧可见车体质心累加器 */
        if(inTrav||inExit||t<T_TRAV0+.3){
          const nPts=train.length;
          const visCount=nPts;
          for(let i=0;i<visCount;i++){
            const q=train[i];
            const wp=trainWorld(po,q.x,q.y,q.z);
            const pr=project(wp[0],wp[1],wp[2]);if(!pr)continue;
            if(t>=TEX&&dt>0){ /* 记录投影、尺寸与逐点速度，供剥离/撞击时原位同态继承 */
              const lp=lastP[i];
              if(lp){const vx2=(pr.x-lp[0])/dt,vy2=(pr.y-lp[1])/dt;
                if(isFinite(vx2)&&isFinite(vy2))lastV[i]=[vx2,vy2];}
              lastP[i]=[pr.x,pr.y];lastS[i]=pr.s;}
            const tw3=twin[i];
            if(tw3&&exitE>peelAt[i]&&!tw3.act){ /* 俯冲途中逐渐散开（同态继承：位置/速度/尺寸） */
              tw3.act=true;tw3.x=pr.x;tw3.y=pr.y;tw3.age=0;
              tw3.s0=Math.min(11,lastS[i]||2);   /* 出生时就是刚才那个大光点 */
              let ivx=(lastV[i]?lastV[i][0]:0)*.2,
                  ivy=(lastV[i]?lastV[i][1]:0)*.2;
              const vm=Math.hypot(ivx,ivy);if(vm>420){ivx*=420/vm;ivy*=420/vm;}
              const ka=rnd(0,Math.PI*2),ks=rnd(30,130);
              tw3.vx=ivx+Math.cos(ka)*ks;tw3.vy=ivy+Math.sin(ka)*ks*.75;
              continue;}
            const depthA=clamp((pr.s-.75)/1.1,.3,1.15);
            mSX+=pr.x;mSY+=pr.y;mCN++;          /* 可见车体质量累加 */
            const tw2=q.c==='#CFE0FF'||q.c==='#FFFFFF'?(.75+.25*Math.sin(t*3+i)):1;
            x.globalAlpha=Math.min(1,q.a*depthA*tAlpha*tw2);
            x.fillStyle=q.c;
            x.beginPath();x.arc(pr.x,pr.y,Math.max(.6,pr.s*q.s*1.18),0,7);x.fill();
            if(i%3===0){ /* 柔光辉光：车体体积感 */
              const gs3=pr.s*q.s*6.5;
              x.globalAlpha=Math.min(1,q.a*depthA*tAlpha)*.16;
              x.drawImage(GLOW,pr.x-gs3/2,pr.y-gs3/2,gs3,gs3);}
            if(i===Math.floor(nPts*.97)){/* 头灯定位点 */}
          }
          if(mCN>4){massX=mSX/mCN;massY=mSY/mCN;}   /* 更新可见车体质心 */
          /* 头灯光晕（鼻尖）+ 撞击检测 */
          const npW=trainWorld(po,71,4,0),npr=project(npW[0],npW[1],npW[2]);
          if(npr&&tAlpha>.2){x.globalCompositeOperation='lighter';
            const g2=x.createRadialGradient(npr.x,npr.y,1,npr.x,npr.y,npr.s*26);
            g2.addColorStop(0,'rgba(234,242,255,'+(.5*tAlpha).toFixed(2)+')');
            g2.addColorStop(1,'rgba(234,242,255,0)');
            x.fillStyle=g2;x.beginPath();x.arc(npr.x,npr.y,npr.s*26,0,7);x.fill();}
          /* —— 撞击屏幕：车体碎裂，碎片与星环尘埃汇成 STA —— */
          if(t>=TEX&&T_SM<0&&(npr&&npr.s>10.5||exitE>.85)&&staPts&&staPts.length){
            T_SM=t;formed=true;
            const pts=staPts,cx2=W*.5,cy2=H*.44,scl=Math.min(W/820,1.2);
            /* 爆点 = 上一帧可见车体质量的屏幕质心（与视觉位置严格一致） */
            const hasMass=massX!==null;
            const ix=hasMass?clamp(massX,W*.2,W*.8):clamp(npr?npr.x:W*.5,W*.2,W*.8),
                  iy=hasMass?clamp(massY,H*.25,H*.65):clamp(npr?npr.y:H*.3,H*.6);
            /* 撞击：冲击波 + 激活所有尚未散开的车体点（原位同态继承） */
            shock=t;shockX=ix;shockY=iy;
            const NB=train.length;
            for(let i=0;i<NB;i++){
              const tw3=twin[i];if(!tw3||tw3.act)continue;
              tw3.act=true;
              const lp=lastP[i]||[ix+rnd(-40,40),iy+rnd(-26,26)];
              tw3.x=lp[0];tw3.y=lp[1];tw3.age=0;
              tw3.s0=Math.min(11,lastS[i]||2);
              let ivx=(lastV[i]?lastV[i][0]:0)*.15,
                  ivy=(lastV[i]?lastV[i][1]:0)*.15;
              const vm=Math.hypot(ivx,ivy);
              if(vm>360){ivx*=360/vm;ivy*=360/vm;}
              const ka=Math.atan2(lp[1]-iy,lp[0]-ix)+rnd(-.5,.5),ks=rnd(90,260);
              tw3.vx=ivx+Math.cos(ka)*ks;tw3.vy=ivy+Math.sin(ka)*ks*.8;}
            /* 星环尘埃：按距撞点距离波次吸入 */
            let di=NB;
            for(const d of dust){
              if(di>=720)break;
              const wp=ringPt(d.th,d.r0+(R-d.r0));
              const pr=project(wp[0],wp[1],wp[2]);if(!pr)continue;
              const tp=pts[di%pts.length];
              const dist=Math.hypot(pr.x-ix,pr.y-iy);
              gather.push({act:true,x:pr.x,y:pr.y,s0:Math.max(1,pr.s*d.sz*1.3),
                vx:(ix-pr.x)*.9,vy:(iy-pr.y)*.9, /* 微微倾向撞点，运动连续 */
                idx:di,col:d.c,sz:rnd(.9,2),
                age:0,delay:.1+dist/2200+rnd(0,.05)});
              di++;}
            trail.length=0;sparks.length=0;dust.length=0;
          }
          /* 解体：切出阶段把车体点逐帧抛入 sparks */
          if(inExit){
            for(let k=0;k<12&&sparks.length<300;k++){
              const qq=train[(Math.random()*train.length)|0];
              const wp=trainWorld(po,qq.x,qq.y,qq.z);
              sparks.push({x:wp[0],y:wp[1],z:wp[2],
                vx:EXV[0]*(240+rnd(-30,30))+rnd(-20,20),
                vy:EXV[1]*(240+rnd(-30,30))+rnd(-14,14),
                vz:EXV[2]*(240+rnd(-30,30))+rnd(-20,20),
                life:rnd(.5,.9),age:0,c:qq.c,s:rnd(.9,2)});}
          }
        }
        /* 彗尾（驯化版：半径硬上限 6px，防近景糊成白带） */
        if(inTrav){
          const rearW=trainWorld(po,-71,0,0);
          const nEmit=Math.min(6,2+Math.floor(spd*.7));
          for(let e2=0;e2<nEmit;e2++){
            trail.push({x:rearW[0]+rnd(-5,5),y:rearW[1]+rnd(-4,4),z:rearW[2]+rnd(-5,5),
              vx:-po.T[0]*spd*6+rnd(-18,18),vy:-po.T[1]*spd*6+rnd(-12,12),vz:-po.T[2]*spd*6+rnd(-18,18),
              life:rnd(.55,.95),age:0,c:COLS[(Math.random()*COLS.length)|0],s:rnd(.8,1.8)});}
        }
        for(let i=trail.length-1;i>=0;i--){const q=trail[i];
          q.age+=dt;if(q.age>q.life){trail.splice(i,1);continue}
          q.vx*=.97;q.vy*=.97;q.vz*=.97;q.x+=q.vx*dt;q.y+=q.vy*dt;q.z+=q.vz*dt;
          const pr=project(q.x,q.y,q.z);if(!pr)continue;
          x.globalAlpha=(1-q.age/q.life)*.42;x.fillStyle=q.c;
          x.beginPath();x.arc(pr.x,pr.y,Math.max(.5,Math.min(pr.s*q.s*1.1,6)),0,7);x.fill();}
        /* 解体火花 */
        for(let i=sparks.length-1;i>=0;i--){const q=sparks[i];
          q.age+=dt;if(q.age>q.life){sparks.splice(i,1);continue}
          q.x+=q.vx*dt;q.y+=q.vy*dt;q.z+=q.vz*dt;
          const pr=project(q.x,q.y,q.z);if(!pr)continue;
          x.globalAlpha=(1-q.age/q.life)*.9;x.fillStyle=q.c;x.strokeStyle=q.c;
          x.lineWidth=Math.max(.7,pr.s*.9);
          x.beginPath();x.moveTo(pr.x,pr.y);
          x.lineTo(pr.x-q.vx*.02*pr.s,pr.y-q.vy*.02*pr.s);x.stroke();}
        x.globalAlpha=1;x.globalCompositeOperation='source-over';

        /* ---- 环心百分比 ---- */
        if(t>T_RING_IN&&t<TEX){
          const cpr=project(...ringPt(th,0));
          const fade=Math.min(smooth(t,T_RING_IN,T_RING_IN+.3),1-smooth(t,TEX-.25,TEX));
          if(cpr&&fade>0){
            x.save();x.globalAlpha=fade;
            const num=String(Math.round(trav*100));
            x.font='500 '+Math.max(44,H*.085)+'px "Space Grotesk",sans-serif';
            x.textAlign='center';x.textBaseline='middle';
            x.shadowColor='rgba(77,124,255,.75)';x.shadowBlur=30;
            x.fillStyle='#EAF2FF';x.fillText(num,cpr.x,cpr.y);
            x.shadowBlur=0;
            x.font='600 '+Math.max(9,H*.014)+'px "Space Grotesk",sans-serif';
            x.fillStyle='rgba(143,176,255,.85)';
            x.fillText('P E R C E N T',cpr.x,cpr.y+H*.062);
            x.restore();}
        }

        /* ---- 聚字 STA（俯冲散开+撞击碎裂：粒子两阶段运动 弹道→弹簧归位） ---- */
        const flash=getFlash();
        if(T_SM>0&&gather.length){
          const pts=staPts,cx2=W*.5,cy2=H*.44;
          const scl=Math.min(W/820,1.2);
          x.globalCompositeOperation='lighter';
          const calm=t>T_SM+1.15;   /* 成形后进入静谧高级态 */
          for(const sa of gather){
            if(!sa.act)continue;
            sa.age+=dt;
            const tp=pts[sa.idx%pts.length];
            const tx3=cx2+tp[0]*scl,ty3=cy2+tp[1]*scl;
            if(sa.age>sa.delay){ /* 近临界阻尼弹簧（k100/d.74 仿真零过冲） */
              sa.vx+=(tx3-sa.x)*100*dt;sa.vy+=(ty3-sa.y)*100*dt;
              sa.vx*=.74;sa.vy*=.74;
            }else{ /* 碎片先自由飞散 */
              sa.vx*=.985;sa.vy*=.985;}
            sa.x+=sa.vx*dt;sa.y+=sa.vy*dt;
            if(sa.age>sa.delay){ /* 到位即钉死，杜绝残余抖动 */
              const dx4=tx3-sa.x,dy4=ty3-sa.y;
              if(Math.abs(dx4)+Math.abs(dy4)<.7&&Math.abs(sa.vx)+Math.abs(sa.vy)<10){
                sa.x=tx3;sa.y=ty3;sa.vx=0;sa.vy=0;}}
            const tw=calm?(.85+.15*Math.sin(t*2.2+sa.idx)):(.7+.3*Math.abs(Math.sin(t*5+sa.idx)));
            const fi=Math.min(1,sa.age/.45);
            const ga=(.8+.2*fi)*tw;                    /* 出生即亮（继承原点亮度） */
            const k2=Math.min(1,sa.age/.9);            /* 尺寸从原点大小收缩到字粒径 */
            const eff=(sa.s0||sa.sz)*(1-k2)+sa.sz*k2;
            const gs=eff*3.1*(1.12-.22*Math.min(1,sa.age/.9));
            x.globalAlpha=ga*.42;
            x.drawImage(GLOW,sa.x-gs/2,sa.y-gs/2,gs,gs);
            x.globalAlpha=ga;x.fillStyle=sa.col;
            x.beginPath();x.arc(sa.x,sa.y,Math.max(.7,eff*.72),0,7);x.fill();}
          x.globalAlpha=1;x.globalCompositeOperation='source-over';
          /* 撞击冲击波：消融散开的能量交接 */
          if(shock>0){const sa2=t-shock;
            if(sa2<.42){const k3=1-Math.pow(1-sa2/.42,3);
              x.globalCompositeOperation='lighter';
              x.strokeStyle='rgba(191,210,255,'+((1-k3)*.55).toFixed(3)+')';
              x.lineWidth=(1-k3)*13+1.5;
              x.beginPath();x.arc(shockX,shockY,20+k3*Math.min(W,H)*.42,0,7);x.stroke();
              if(sa2<.14){x.fillStyle='rgba(234,242,255,'+((1-sa2/.14)*.35).toFixed(3)+')';
                x.beginPath();x.arc(shockX,shockY,30+sa2*380,0,7);x.fill();}
              x.globalCompositeOperation='source-over';}
            else shock=-1;}
          /* STA 成形签名下划线 */
          if(T_SM>0&&staPts&&t<T_SM+1.5){
            const scl=Math.min(W/820,1.2);
            let mnx=1e9,mxx=-1e9,mxy=-1e9;
            for(const p2 of staPts){const qx=p2[0]*scl;if(qx<mnx)mnx=qx;if(qx>mxx)mxx=qx;if(p2[1]>mxy)mxy=p2[1];}
            const prog=Math.min(1,Math.max(0,(t-T_SM-.12)/.38));
            const pe=1-Math.pow(1-prog,3);
            const fadeU=t>T_SM+1.15?Math.max(0,1-(t-T_SM-1.15)/.35):1;
            const x1=W*.5+mnx-6*scl,x2=W*.5+mnx+(mxx-mnx)*pe+12*scl;
            const uy=H*.44+mxy*scl+17*scl;
            const lg=x.createLinearGradient(x1-50,uy,x2,uy);
            lg.addColorStop(0,'rgba(234,242,255,0)');
            lg.addColorStop(Math.max(.01,pe*.75),'rgba(234,242,255,'+(.85*fadeU).toFixed(3)+')');
            lg.addColorStop(1,'rgba(234,242,255,'+(.9*fadeU).toFixed(3)+')');
            x.strokeStyle=lg;x.lineWidth=2.2*scl*(1+.6*Math.exp(-Math.max(0,t-T_SM-.12)*9));
            x.beginPath();x.moveTo(x1,uy);x.lineTo(x2,uy);x.stroke();}
          /* 色温弧线：撞击后回暖，铺垫亮色首页 */
          {const warm=T_SM>0?Math.min(1,Math.max(0,(t-T_SM)/.6)):0;
           if(warm>0){x.globalAlpha=.09*warm;x.fillStyle='#FFB678';x.fillRect(0,0,W,H);}
           else{x.globalAlpha=.04;x.fillStyle='#94BAFF';x.fillRect(0,0,W,H);}
           x.globalAlpha=1;}
          flash.style.opacity=(t>=T_SM+1.55?Math.sin(clamp((t-T_SM-1.55)/.28,0,1)*Math.PI)*.8:0).toFixed(2);
        }else if(T_SM<0){flash.style.opacity='0';}

        /* ---- 幕布 ---- */
        const ct=clamp((t-(D-.55))/.55,0,1);
        curtain.style.transform=ct>0?'translateY('+(-102*easeIO(ct)).toFixed(2)+'%)':'none';
        curtain.style.visibility=ct>=1?'hidden':'visible';
      },
      destroy(){
        window.removeEventListener('resize',handleResize);
        curtain.remove();
        trail.length=0;sparks.length=0;stas.length=0;gather.length=0;dust.length=0;
        twin.length=0;peelAt.length=0;roster=false;
        formed=false;flashEl=null;T_SM=-1;
      }
    };
  }
};

  window.STA_DART_SPLASH = {
    duration: DartSplashAnimation.dur,
    mount: function (stage, options) {
      return DartSplashAnimation.mount(stage, options);
    }
  };
})();
