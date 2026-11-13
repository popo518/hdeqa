import { ZONES, ITEM_CATALOG } from './content.js';

const WORLD = { width: 2040, height: 1480 };
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function rounded(ctx, x, y, w, h, r, fill, stroke = null, line = 1) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.lineWidth = line; ctx.strokeStyle = stroke; ctx.stroke(); }
}
function seeded(seed) { let x = seed >>> 0; return () => ((x = (x * 1664525 + 1013904223) >>> 0) / 4294967296); }

export class GardenWorld {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.player = { x: 1110, y: 795, r: 17, vx: 0, vy: 0, direction: 'down', walk: 0, target: null };
    this.camera = { x: 0, y: 0, zoom: .88 };
    this.direction = { x: 0, y: 0 };
    this.objects = [];
    this.decorObstacles = [];
    this.unlockedZones = new Set(['garden','adhkar','prayer','mosque','charity','orphan','ihsan','library','ongoing']);
    this.reduceMotion = false;
    this.lowPower = false;
    this.buildMode = false;
    this.lastTime = 0;
    this.staticCanvas = document.createElement('canvas');
    this.staticCanvas.width = WORLD.width; this.staticCanvas.height = WORLD.height;
    this.staticCtx = this.staticCanvas.getContext('2d');
    this.buildBackground();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    this.canvas.width = Math.max(1, Math.round(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.view = { width: rect.width, height: rect.height };
    this.updateCamera();
  }

  buildBackground() {
    const c = this.staticCtx, w = WORLD.width, h = WORLD.height;
    const grad = c.createLinearGradient(0,0,w,h);
    grad.addColorStop(0, '#a8c98c'); grad.addColorStop(.48, '#9fc184'); grad.addColorStop(1, '#8fb47d');
    c.fillStyle = grad; c.fillRect(0,0,w,h);
    const rand = seeded(20261113);
    // Subtle grass texture.
    for (let i=0;i<4200;i++) {
      const x=rand()*w, y=rand()*h, r=1+rand()*2.2;
      c.fillStyle = rand()>.5 ? 'rgba(50,105,63,.11)' : 'rgba(246,236,185,.17)';
      c.beginPath(); c.ellipse(x,y,r*1.4,r*.65,rand()*Math.PI,0,Math.PI*2); c.fill();
    }
    // Water channel and small ponds.
    c.save(); c.lineCap='round'; c.lineJoin='round';
    c.beginPath(); c.moveTo(0,1035); c.bezierCurveTo(260,910,330,1120,535,1030); c.bezierCurveTo(720,950,700,1240,970,1250); c.bezierCurveTo(1230,1260,1390,1115,1600,1230); c.bezierCurveTo(1760,1300,1860,1215,2040,1270);
    c.strokeStyle='#6ba9aa'; c.lineWidth=82; c.stroke(); c.strokeStyle='rgba(213,242,223,.45)'; c.lineWidth=5; c.stroke();
    c.beginPath(); c.ellipse(450,1030,145,90,-.2,0,Math.PI*2); c.fillStyle='#73b7b3'; c.fill();
    c.beginPath(); c.ellipse(450,1030,112,62,-.2,0,Math.PI*2); c.strokeStyle='rgba(225,248,226,.55)'; c.lineWidth=3; c.stroke();
    c.restore();
    // Main walking paths.
    const paths = [
      [[1010,725],[790,620],[610,510],[480,420]],
      [[1010,725],[1030,550],[960,400],[900,260]],
      [[1010,725],[1200,620],[1310,520],[1370,420]],
      [[1010,725],[760,790],[550,850],[420,900]],
      [[1010,725],[1030,820],[1050,900],[1040,960]],
      [[1010,725],[900,870],[810,1000],[720,1110]],
      [[1010,725],[1200,760],[1350,820],[1450,850]],
      [[1010,725],[1210,900],[1430,1030],[1580,1110]]
    ];
    c.lineCap='round'; c.lineJoin='round';
    for (const p of paths) {
      c.beginPath(); c.moveTo(...p[0]); c.bezierCurveTo(...p[1],...p[2],...p[3]);
      c.strokeStyle='#cdbb98'; c.lineWidth=76; c.stroke();
      c.strokeStyle='#eadbbd'; c.lineWidth=66; c.stroke();
      c.setLineDash([3,15]); c.strokeStyle='rgba(157,132,95,.25)'; c.lineWidth=2; c.stroke(); c.setLineDash([]);
    }
    // Stone round plaza.
    c.beginPath(); c.ellipse(1010,725,190,132,0,0,Math.PI*2); c.fillStyle='#cbb995'; c.fill();
    c.beginPath(); c.ellipse(1010,725,177,119,0,0,Math.PI*2); c.fillStyle='#e8d8b8'; c.fill();
    c.beginPath(); c.ellipse(1010,725,130,85,0,0,Math.PI*2); c.fillStyle='#b5c88e'; c.fill();
    // Zone gardens / beds.
    for (const z of ZONES.filter(z=>z.id!=='garden')) {
      c.beginPath(); c.ellipse(z.x,z.y,132,96,0,0,Math.PI*2); c.fillStyle='rgba(75,121,75,.16)'; c.fill();
      c.beginPath(); c.ellipse(z.x,z.y,121,86,0,0,Math.PI*2); c.fillStyle='#92b77c'; c.fill();
      c.beginPath(); c.ellipse(z.x,z.y,108,73,0,0,Math.PI*2); c.strokeStyle='rgba(245,231,187,.6)'; c.lineWidth=4; c.stroke();
      for (let i=0;i<9;i++) {
        const a=(Math.PI*2*i)/9, fx=z.x+Math.cos(a)*105, fy=z.y+Math.sin(a)*68;
        this.drawFlower(c,fx,fy,4, ['#e9c58d','#f1d5c7','#d9a8b5'][i%3]);
      }
    }
    // Small fences, trees and decorative flowers (deterministic).
    for (let i=0;i<165;i++) {
      const x=60+rand()*(w-120), y=55+rand()*(h-110);
      const segmentDistance=(a,b)=>{const vx=b[0]-a[0],vy=b[1]-a[1],t=clamp(((x-a[0])*vx+(y-a[1])*vy)/(vx*vx+vy*vy||1),0,1);return Math.hypot(x-(a[0]+t*vx),y-(a[1]+t*vy));};
      const nearPath = paths.some(p => Math.min(segmentDistance(p[0],p[1]),segmentDistance(p[1],p[2]),segmentDistance(p[2],p[3])) < 92);
      const nearZone = ZONES.some(z=>Math.hypot(z.x-x,z.y-y)<155);
      const nearWater = Math.abs(y-(1035 + Math.sin(x/180)*35))<75;
      if (nearPath || nearZone || nearWater) continue;
      if (i%4===0) { const scale=.7+rand()*.35; this.drawTree(c,x,y,scale, i%2===0); this.decorObstacles.push({x,y,r:21*scale}); }
      else this.drawFlower(c,x,y,3+rand()*2, ['#e7c08a','#e5a8b7','#f1e6b8'][i%3]);
    }
    // Bridge over water.
    c.save(); c.translate(520,1045); c.rotate(-.16);
    rounded(c,-86,-23,172,46,12,'#a77851','#79563d',4);
    for(let i=0;i<9;i++){ c.fillStyle='rgba(255,224,177,.25)'; c.fillRect(-76+i*18,-16,3,32); }
    c.strokeStyle='#7a573e'; c.lineWidth=7; c.beginPath(); c.moveTo(-86,-29);c.lineTo(86,-29);c.moveTo(-86,29);c.lineTo(86,29);c.stroke();
    c.restore();
    // Bench corners and lanterns.
    this.drawBench(c,820,735,.86); this.drawLamp(c,1150,740,.8);
    [[760,485,.75,false],[1240,500,.78,true],[1310,700,.85,false],[700,980,.82,false],[1230,1055,.75,true],[340,650,.9,false],[1740,700,.88,false],[1780,960,.78,false]].forEach(([x,y,s,palm])=>{this.drawTree(c,x,y,s,palm);this.decorObstacles.push({x,y,r:21*s});});
    // Sign board at the entrance.
    rounded(c,965,855,90,38,10,'#866b4f','#e4c99a',3);
    c.fillStyle='#fff0cf'; c.font='bold 15px Tahoma, sans-serif'; c.textAlign='center'; c.fillText('حديقتي',1010,880);
    // Distinct landmarks.
    this.drawMosque(c,900,260,1.15);
    this.drawLibrary(c,1450,850,1.0);
    this.drawFountain(c,1010,725,1.0);
    this.drawCharityShelter(c,420,900,.9);
    this.drawSmallHouse(c,1040,960,.78);
    this.drawZoneLabels(c);
  }

  drawZoneLabels(c) {
    const labels = ZONES.filter(z=>z.id!=='garden');
    for (const zone of labels) {
      const y = zone.y + 108;
      const width = Math.max(92, Math.min(142, zone.short.length * 13 + 26));
      c.save(); c.direction='rtl'; c.textAlign='center'; c.font='bold 14px Tahoma, Arial';
      rounded(c, zone.x-width/2, y-16, width, 31, 10, 'rgba(250,246,229,.9)', 'rgba(142,126,91,.55)', 1.5);
      c.fillStyle='#526b4b'; c.fillText(zone.short, zone.x, y+4); c.restore();
    }
  }

  drawFlower(c,x,y,r,color) {
    c.save(); c.translate(x,y); c.fillStyle='rgba(62,91,53,.2)'; c.beginPath(); c.ellipse(2,3,r*2,r*.9,0,0,Math.PI*2); c.fill();
    for(let i=0;i<5;i++){const a=i*Math.PI*2/5;c.beginPath();c.arc(Math.cos(a)*r*.85,Math.sin(a)*r*.85,r*.55,0,Math.PI*2);c.fillStyle=color;c.fill();}
    c.beginPath();c.arc(0,0,r*.38,0,Math.PI*2);c.fillStyle='#f4d47d';c.fill(); c.restore();
  }
  drawTree(c,x,y,s=1,palm=false) {
    c.save();c.translate(x,y);c.scale(s,s);
    c.fillStyle='rgba(55,83,50,.22)';c.beginPath();c.ellipse(5,12,31,14,0,0,Math.PI*2);c.fill();
    c.fillStyle='#79583e';c.fillRect(-5,-8,10,28);
    if(palm){
      c.strokeStyle='#5e8e54';c.lineWidth=7;c.lineCap='round';
      for(let i=0;i<9;i++){const a=-Math.PI/2+i*Math.PI/4;c.beginPath();c.moveTo(0,-15);c.quadraticCurveTo(Math.cos(a)*24,-32+Math.sin(a)*13,Math.cos(a)*48,-27+Math.sin(a)*28);c.stroke();}
      c.fillStyle='#4d8859';c.beginPath();c.arc(0,-16,8,0,Math.PI*2);c.fill();
    } else {
      const colors=['#5e9462','#72a66d','#54885e'];
      for(let i=0;i<3;i++){c.beginPath();c.arc((i-1)*13,-17-(i%2)*9,22-i*2,0,Math.PI*2);c.fillStyle=colors[i];c.fill();}
      c.beginPath();c.arc(-5,-28,14,0,Math.PI*2);c.fillStyle='#82b277';c.fill();
    }
    c.restore();
  }
  drawBench(c,x,y,s=1){c.save();c.translate(x,y);c.scale(s,s);rounded(c,-25,-5,50,11,3,'#a8754c','#795239',2);rounded(c,-25,-19,50,10,3,'#bd895e','#795239',2);c.fillStyle='#795239';c.fillRect(-20,4,5,12);c.fillRect(15,4,5,12);c.restore();}
  drawLamp(c,x,y,s=1){c.save();c.translate(x,y);c.scale(s,s);c.strokeStyle='#6e654d';c.lineWidth=5;c.beginPath();c.moveTo(0,18);c.lineTo(0,-22);c.stroke();rounded(c,-8,-32,16,15,4,'#ead49c','#8e7750',2);c.fillStyle='rgba(255,231,165,.7)';c.beginPath();c.arc(0,-24,15,0,Math.PI*2);c.fill();c.restore();}
  drawFountain(c,x,y,s=1){c.save();c.translate(x,y+12);c.scale(s,s);c.fillStyle='rgba(55,83,50,.2)';c.beginPath();c.ellipse(0,35,67,20,0,0,Math.PI*2);c.fill();c.beginPath();c.ellipse(0,20,65,32,0,0,Math.PI*2);c.fillStyle='#bba98b';c.fill();c.beginPath();c.ellipse(0,16,56,24,0,0,Math.PI*2);c.fillStyle='#77b9bd';c.fill();c.beginPath();c.ellipse(0,11,32,13,0,0,Math.PI*2);c.fillStyle='#a4d5d2';c.fill();c.strokeStyle='#d5f1db';c.lineWidth=3;c.beginPath();c.moveTo(0,8);c.quadraticCurveTo(-13,-25,0,-33);c.quadraticCurveTo(13,-25,0,8);c.stroke();c.restore();}
  drawMosque(c,x,y,s=1){c.save();c.translate(x,y+10);c.scale(s,s);c.fillStyle='rgba(55,83,50,.2)';c.beginPath();c.ellipse(0,55,104,22,0,0,Math.PI*2);c.fill();rounded(c,-82,-8,164,72,12,'#d7c39e','#987b55',4);c.fillStyle='#e9d8b7';c.fillRect(-34,3,68,62);c.beginPath();c.arc(0,61,19,Math.PI,Math.PI*2);c.lineTo(19,61);c.closePath();c.fillStyle='#8c7559';c.fill();c.beginPath();c.moveTo(-54,-8);c.quadraticCurveTo(0,-93,54,-8);c.closePath();c.fillStyle='#6b9d86';c.fill();c.strokeStyle='#527c6b';c.lineWidth=4;c.stroke();c.fillStyle='#e4d3b4';for(const sx of [-74,74]){rounded(c,sx-10,-65,20,74,6,'#e5d1ae','#9d7d57',3);c.beginPath();c.moveTo(sx-10,-65);c.lineTo(sx,-84);c.lineTo(sx+10,-65);c.fill();c.fillStyle='#6b927f';c.beginPath();c.arc(sx,-84,5,0,Math.PI*2);c.fill();c.fillStyle='#e5d1ae';}c.restore();}
  drawLibrary(c,x,y,s=1){c.save();c.translate(x,y);c.scale(s,s);c.fillStyle='rgba(55,83,50,.2)';c.beginPath();c.ellipse(0,38,90,18,0,0,Math.PI*2);c.fill();rounded(c,-76,-32,152,78,8,'#a8754f','#79583f',4);c.fillStyle='#d9bd8c';c.beginPath();c.moveTo(-88,-32);c.lineTo(0,-84);c.lineTo(88,-32);c.closePath();c.fill();c.strokeStyle='#805f41';c.lineWidth=5;c.stroke();for(let i=-2;i<=2;i++){c.fillStyle='#6b9b83';rounded(c,i*27-9,-15,18,35,3,'#5b866d','#ead4aa',2);}c.restore();}
  drawCharityShelter(c,x,y,s=1){c.save();c.translate(x,y);c.scale(s,s);rounded(c,-62,-5,124,58,8,'#c49b72','#8c6749',3);c.fillStyle='#d9b58b';c.beginPath();c.moveTo(-74,-5);c.lineTo(0,-56);c.lineTo(74,-5);c.closePath();c.fill();c.strokeStyle='#8c6749';c.lineWidth=4;c.stroke();c.fillStyle='#7ca58c';c.fillRect(-45,9,90,30);c.restore();}
  drawSmallHouse(c,x,y,s=1){c.save();c.translate(x,y);c.scale(s,s);rounded(c,-55,-4,110,65,9,'#d8c29d','#9b805e',3);c.fillStyle='#9a7352';c.beginPath();c.moveTo(-65,-4);c.lineTo(0,-51);c.lineTo(65,-4);c.closePath();c.fill();c.strokeStyle='#6e5946';c.lineWidth=4;c.stroke();c.fillStyle='#8c6e4c';rounded(c,-12,18,24,43,5,'#8c6e4c');c.fillStyle='#efd9a8';for(const sx of [-34,34]){rounded(c,sx-8,10,16,18,3,'#d7e2c3','#9e825b',2);}c.restore();}

  setState({ objects = [], zones = [] } = {}) {
    this.objects = objects;
    if (zones.length) this.unlockedZones = new Set(zones.filter(z=>z.open).map(z=>z.id));
  }
  setPlayer(position) {
    if (position && Number.isFinite(position.x) && Number.isFinite(position.y)) {
      this.player.x = clamp(position.x, 25, WORLD.width-25);
      this.player.y = clamp(position.y, 25, WORLD.height-25);
    }
    this.updateCamera();
  }
  getPlayerPosition(){ return {x:Math.round(this.player.x),y:Math.round(this.player.y)}; }
  setDirection(x,y){this.direction={x,y};if(x||y)this.player.target=null;}
  moveTo(x,y){this.player.target={x:clamp(x,30,WORLD.width-30),y:clamp(y,30,WORLD.height-30)};this.direction={x:0,y:0};}

  resizeCamera(zoom){this.camera.zoom=clamp(zoom,.82,1.25);this.updateCamera();}
  updateCamera(){
    if(!this.view)return;
    const z=this.camera.zoom, visibleW=this.view.width/z, visibleH=this.view.height/z;
    this.camera.x=clamp(this.player.x-visibleW/2,0,WORLD.width-visibleW);
    this.camera.y=clamp(this.player.y-visibleH/2,0,WORLD.height-visibleH);
  }

  isBlocked(x,y,r=this.player.r,excludeObjectId=null) {
    if(x<r+8||y<r+8||x>WORLD.width-r-8||y>WORLD.height-r-8)return true;
    const landmarks=[{x:900,y:260,r:82},{x:1450,y:850,r:62},{x:420,y:900,r:45},{x:1040,y:960,r:48},{x:1010,y:725,r:42}];
    if(landmarks.some(o=>Math.hypot(o.x-x,o.y-y)<o.r+r*.55)) return true;
    if(this.decorObstacles.some(o=>Math.hypot(o.x-x,o.y-y)<o.r+r*.55)) return true;
    for(const o of this.objects){
      if(o.id===excludeObjectId) continue;
      const item=ITEM_CATALOG.find(i=>i.id===o.itemId); const size=o.itemId==='fountain'?42:o.itemId==='bench'?27:22;
      if(Math.hypot(o.x-x,o.y-y)<size+r*.7)return true;
    }
    return false;
  }

  update(dt){
    const maxStep=1/30; let remain=Math.min(dt,.08);
    while(remain>0){const step=Math.min(remain,maxStep);this.step(step);remain-=step;}
    this.updateCamera();
  }
  step(dt){
    let dx=this.direction.x,dy=this.direction.y;
    if(this.player.target && !dx&&!dy){const tx=this.player.target.x-this.player.x,ty=this.player.target.y-this.player.y;const d=Math.hypot(tx,ty);if(d<7){this.player.target=null;}else{dx=tx/d;dy=ty/d;}}
    const mag=Math.hypot(dx,dy); if(mag>0){dx/=mag;dy/=mag;const speed=this.lowPower?135:185;const nx=this.player.x+dx*speed*dt,ny=this.player.y+dy*speed*dt;
      if(!this.isBlocked(nx,this.player.y))this.player.x=nx;
      if(!this.isBlocked(this.player.x,ny))this.player.y=ny;
      this.player.walk+=dt*10;this.player.direction=Math.abs(dx)>Math.abs(dy)?(dx>0?'right':'left'):(dy>0?'down':'up');
    }else{this.player.walk=0;}
  }

  nearestInteractable(){
    let best=null,bestD=Infinity;
    for(const z of ZONES){const d=distance(this.player,z);if(d<bestD){bestD=d;best={type:'zone',id:z.id,object:z,distance:d};}}
    for(const o of this.objects){const d=distance(this.player,o);if(d<bestD){bestD=d;best={type:'object',id:o.id,object:o,distance:d};}}
    return bestD<125?best:null;
  }
  canPlace(x,y,itemId,excludeId=null){
    const areaZones=['adhkar','charity','ihsan','library','ongoing','orphan'];
    const inArea=areaZones.some(id=>{const z=ZONES.find(z=>z.id===id);return Math.abs(x-z.x)<120&&Math.abs(y-z.y)<74;});
    if(!inArea)return {ok:false,reason:'ضع العناصر داخل المساحات الخضراء المخصصة للبناء.'};
    if(this.isBlocked(x,y,8,excludeId))return {ok:false,reason:'هذا المكان قريب من مبنى أو عنصر آخر.'};
    if(Math.hypot(x-this.player.x,y-this.player.y)<52)return {ok:false,reason:'ابتعد قليلاً عن الشخصية قبل التثبيت.'};
    for(const o of this.objects){if(o.id===excludeId)continue;if(Math.hypot(o.x-x,o.y-y)<38)return {ok:false,reason:'المكان مشغول بعنصر آخر.'};}
    return {ok:true};
  }
  placeObjectAt(x,y,itemId,excludeId=null){const check=this.canPlace(x,y,itemId,excludeId);return check;}

  draw(time=0){
    const c=this.ctx, w=this.view.width,h=this.view.height,z=this.camera.zoom;
    c.save();c.clearRect(0,0,w,h);c.fillStyle='#a3c58b';c.fillRect(0,0,w,h);
    c.scale(z,z);c.translate(-this.camera.x,-this.camera.y);
    c.drawImage(this.staticCanvas,0,0);
    if(this.buildMode) this.drawBuildAreas(c);
    // Live water glints, only a few cheap strokes.
    if(!this.lowPower&&!this.reduceMotion){c.save();c.strokeStyle='rgba(231,249,220,.38)';c.lineWidth=2;c.beginPath();const phase=time/1100;for(let i=0;i<7;i++){let x=230+i*70+Math.sin(phase+i)*9,y=1014+Math.cos(i*1.7)*19;c.moveTo(x,y);c.lineTo(x+25,y-2);}c.stroke();c.restore();}
    // User-built objects and the player are sorted by y.
    const drawables=[...this.objects.map(o=>({type:'object',y:o.y,data:o})),{type:'player',y:this.player.y,data:this.player}].sort((a,b)=>a.y-b.y);
    for(const d of drawables){if(d.type==='player')this.drawPlayer(c,d.data);else this.drawPlacedObject(c,d.data);}
    c.restore();
    this.drawCompass(c,w,h);
  }
  drawBuildAreas(c){
    const ids=['adhkar','charity','ihsan','library','ongoing','orphan'];
    c.save(); c.setLineDash([8,7]); c.lineWidth=3;
    for(const id of ids){const z=ZONES.find(v=>v.id===id);c.beginPath();c.ellipse(z.x,z.y,112,66,0,0,Math.PI*2);c.fillStyle='rgba(231,244,206,.17)';c.fill();c.strokeStyle='rgba(245,255,220,.9)';c.stroke();}
    c.setLineDash([]); c.restore();
  }
  drawPlayer(c,p){
    c.save();c.translate(p.x,p.y+Math.sin(p.walk)*1.4);c.fillStyle='rgba(48,69,48,.24)';c.beginPath();c.ellipse(0,17,14,7,0,0,Math.PI*2);c.fill();
    const step=p.walk?Math.sin(p.walk)*3:0;c.fillStyle='#5d6b70';c.beginPath();c.ellipse(-5+step,12,4,7,-.1,0,Math.PI*2);c.ellipse(5-step,12,4,7,.1,0,Math.PI*2);c.fill();
    c.fillStyle='#f2e9d8';c.beginPath();c.roundRect(-10,-1,20,18,7);c.fill();c.strokeStyle='#b4aa97';c.lineWidth=1.3;c.stroke();
    c.fillStyle='#d6a77d';c.beginPath();c.arc(0,-10,8,0,Math.PI*2);c.fill();c.fillStyle='#5a4438';c.beginPath();c.arc(0,-14,8,Math.PI,Math.PI*2);c.fill();c.restore();
  }
  drawPlacedObject(c,o){
    const item=ITEM_CATALOG.find(i=>i.id===o.itemId);if(!item)return;
    c.save();c.translate(o.x,o.y);c.fillStyle='rgba(47,71,45,.2)';c.beginPath();c.ellipse(2,12,22,9,0,0,Math.PI*2);c.fill();
    switch(o.itemId){
      case 'sapling': this.drawTree(c,0,0,.62,false); break;
      case 'palm': this.drawTree(c,0,0,.72,true); break;
      case 'flower': this.drawFlower(c,0,0,8,'#d98eac');this.drawFlower(c,10,5,5,'#eed28d');break;
      case 'bench': this.drawBench(c,0,0,.72);break;
      case 'lamp': this.drawLamp(c,0,0,.62);break;
      case 'fountain': this.drawFountain(c,0,-4,.54);break;
    }
    c.restore();
  }
  drawCompass(c,w,h){
    c.save();c.direction='rtl';c.textAlign='center';c.font='12px Tahoma';c.fillStyle='rgba(255,255,255,.78)';
    c.beginPath();c.arc(w-24,24,12,0,Math.PI*2);c.fill();c.fillStyle='#667957';c.fillText('N',w-24,28);c.restore();
  }
  screenToWorld(clientX,clientY){const rect=this.canvas.getBoundingClientRect();return {x:(clientX-rect.left)/this.camera.zoom+this.camera.x,y:(clientY-rect.top)/this.camera.zoom+this.camera.y};}
  focusZone(id){const z=ZONES.find(z=>z.id===id);if(z){this.moveTo(z.x-5,z.y+110);}}
  destroy(){this.resizeObserver?.disconnect();}
}
