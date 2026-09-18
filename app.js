import {loadStages} from './assets.js';
import {WIDTH, HEIGHT, DIFFICULTIES, createPieces, piecePath, shuffled, formatTime} from './puzzle.js';

const $ = id => document.getElementById(id);
const ICONS = {
  back:'<path d="m14 5-7 7 7 7"/>', arrow:'<path d="M4 12h15m-6-7 7 7-7 7"/>',
  play:'<path d="m8 4 12 8-12 8z"/>', pause:'<path d="M8 5v14M16 5v14"/>',
  help:'<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 5 .5c0 1.5-2.5 1.5-2.5 3M12 16h.01"/>',
  collection:'<rect x="7" y="3" width="13" height="16" rx="2"/><path d="M4 6v14a2 2 0 0 0 2 2h10"/>',
  image:'<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.4"/><path d="m4 18 5-5 4 4 3-4 5 5"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  layers:'<path d="m12 3 9 5-9 5-9-5zM3 12l9 5 9-5M3 16l9 5 9-5"/>',
  bulb:'<path d="M8 15a7 7 0 1 1 8 0l-1 3H9zM9 21h6M12 9v5"/>',
  zoom:'<circle cx="10" cy="10" r="6.5"/><path d="m15 15 6 6M7 10h6M10 7v6"/>',
  edges:'<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 4v4M15 4v4M4 9h4M4 15h4M9 16v4M15 16v4M16 9h4M16 15h4"/>',
  shuffle:'<path d="M3 6h3c5 0 7 12 12 12h3m-4-4 4 4-4 4M3 18h3c2 0 3-2 4-4m4-4c1-2 2-4 4-4h3m-4-4 4 4-4 4"/>',
  lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>',
  check:'<path d="m5 12 4 4L19 6"/>', close:'<path d="m6 6 12 12M6 18 18 6"/>',
  refresh:'<path d="M20 7v5h-5M20 12a8 8 0 1 0-2.4 5.7"/>', home:'<path d="m3 11 9-8 9 8M5 10v11h5v-6h4v6h5V10"/>'
};
function icon(name) { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ICONS.image}</svg>`; }
document.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = icon(el.dataset.icon); });

const SAVE_KEY = 'zigso-save-v1';
function readSave() {
  const base = {version:1, diff:'easy', unlocked:1, completed:{}, sessions:{}, lastStage:0, sound:true};
  try {
    const value = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (!value || value.version !== 1) return base;
    return {...base, diff:DIFFICULTIES[value.diff] ? value.diff : 'easy', unlocked:Math.max(1,Math.min(100,Number(value.unlocked)||1)),
      completed:value.completed && typeof value.completed === 'object' ? value.completed : {},
      sessions:value.sessions && typeof value.sessions === 'object' ? value.sessions : {},
      lastStage:Math.max(0,Math.min(99,Number(value.lastStage)||0)), sound:value.sound !== false};
  } catch { return base; }
}
let save = readSave(), stages = [], game = null, drag = null, audio = null, loadingId = 0, drawQueued = false, lastTick = performance.now(), lastSaved = 0;
let toastTimeout = 0, storageWarned = false, homeScroll = 0;
const modal = $('modal'), board = $('board'), ctx = board.getContext('2d'), tray = $('tray');
function key(index,diff=save.diff){return `${index}-${diff}`;}
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>$('toast').hidden=true,2200);}
function writeSave(){
  try {localStorage.setItem(SAVE_KEY,JSON.stringify(save));$('saveStatus').textContent='자동 저장';}
  catch {$('saveStatus').textContent='저장 공간 없음';if(!storageWarned){storageWarned=true;toast('저장 공간이 없어 이번 진행은 보관되지 않습니다.');}}
}
function saveGame(){
  if(game?.image){save.sessions[key(game.index,game.diff)]={placed:[...game.placed],order:game.order,seconds:game.seconds,hints:game.hints};save.lastStage=game.index;}
  writeSave();
}
function sound(clear=false){
  if(!save.sound)return;
  try{
    const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;
    audio ||= new Audio();audio.resume().catch(()=>{});
    const notes=clear?[523.25,659.25,783.99]:[740];
    notes.forEach((frequency,i)=>{const osc=audio.createOscillator(),gain=audio.createGain(),t=audio.currentTime+i*.12;osc.type='sine';osc.frequency.value=frequency;gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime(.045,t+.012);gain.gain.exponentialRampToValueAtTime(.001,t+.20);osc.connect(gain);gain.connect(audio.destination);osc.start(t);osc.stop(t+.22);});
  }catch{/* Silent browsers retain full gameplay. */}
}
function targetStage(){
  const d=DIFFICULTIES[save.diff], n=d.cols*d.rows, previous=save.sessions[key(save.lastStage)];
  if(save.lastStage<save.unlocked && previous?.placed?.length>0 && previous.placed.length<n)return save.lastStage;
  const next=stages.findIndex((_,i)=>i<save.unlocked&&!save.completed[key(i)]);
  return next>=0?next:0;
}
function renderHome(){
  if(!stages.length)return;
  save.unlocked=Math.max(1,Math.min(stages.length,save.unlocked));
  const collected=stages.filter((_,i)=>Object.keys(DIFFICULTIES).some(d=>save.completed[key(i,d)])).length;
  $('collected').textContent=`${collected} / ${stages.length}`;$('collectionBar').style.width=`${collected/stages.length*100}%`;
  document.querySelectorAll('[data-diff]').forEach(button=>{const active=button.dataset.diff===save.diff;button.classList.toggle('selected',active);button.setAttribute('aria-pressed',String(active));});
  const target=targetStage(),n=DIFFICULTIES[save.diff].cols*DIFFICULTIES[save.diff].rows, progress=save.sessions[key(target)]?.placed?.length||0;
  $('continueLabel').textContent=progress>0&&progress<n?`스테이지 ${String(target+1).padStart(2,'0')} 이어 맞추기`:`스테이지 ${String(target+1).padStart(2,'0')} 시작하기`;
  $('heroImage').src=stages[target].thumb;
  $('stages').innerHTML=stages.map((stage,i)=>{
    const locked=i>=save.unlocked, record=save.completed[key(i)], count=Math.min(n,save.sessions[key(i)]?.placed?.length||0);
    const collectedStage=Object.keys(DIFFICULTIES).some(d=>save.completed[key(i,d)]);
    return `<button class="stage-card${locked?' locked':''}" data-stage="${i}" aria-label="스테이지 ${i+1}, ${stage.title}${locked?', 잠김':record?', 완성':''}"><div class="stage-art"><img src="${stage.thumb}" alt="" loading="lazy" draggable="false"><span class="stage-number">${String(i+1).padStart(2,'0')}</span>${locked?`<span class="stage-lock"><span>${icon('lock')}</span><span>이전 장면을 완성하세요</span></span>`:collectedStage?`<span class="clear-pill">${icon('check')} COLLECTED</span>`:''}</div><div class="stage-meta"><strong>${stage.title}</strong><small>${locked?'다음에 만나요':record?`${DIFFICULTIES[save.diff].label} 완료 · ${formatTime(record.seconds)}`:count>0?`${count} / ${n} 조각 · 진행 중`:`${n}조각 · 시작하기`}</small>${count>0&&!locked&&!record?`<div class="mini-track"><i style="width:${count/n*100}%"></i></div>`:''}</div></button>`;
  }).join('');
}
async function boot(){
  $('retryLoad').hidden=true;
  try{
    stages=await loadStages((percent,text)=>{$('loadingBar').style.width=`${percent}%`;$('loadingText').textContent=text;});
    $('loading').hidden=true;$('home').hidden=false;renderHome();
  }catch(error){console.error(error);$('loadingText').textContent=error.name==='AbortError'?'연결이 느립니다. 잠시 후 다시 시도해주세요.':error.message;$('loadingSub').textContent='최신 Chrome, Safari, Samsung Internet에서 열어주세요.';$('retryLoad').hidden=false;}
}
function sanitizedSession(index,diff,n){
  const s=save.sessions[key(index,diff)];if(!s||!Array.isArray(s.placed)||s.placed.length>=n)return null;
  return {placed:[...new Set(s.placed.filter(id=>Number.isInteger(id)&&id>=0&&id<n))],seconds:Math.max(0,Number(s.seconds)||0),hints:Math.max(0,Number(s.hints)||0),order:Array.isArray(s.order)?s.order:null};
}
async function startStage(index,restart=false){
  if(!Number.isInteger(index)||index<0||index>=stages.length)return;
  if(index>=save.unlocked){toast('이전 장면을 먼저 완성해주세요.');return;}
  if(game)saveGame();
  if(modal.open)modal.close();
  if(!$('home').hidden)homeScroll=window.scrollY;
  $('home').hidden=true;$('game').hidden=false;document.body.classList.add('playing');window.scrollTo(0,0);
  if(history.state?.view!=='play')history.pushState({view:'play'},'', '#play');
  const sequence=++loadingId,diff=save.diff,d=DIFFICULTIES[diff],pieces=createPieces(d.cols,d.rows,1709+index*97+d.cols),n=pieces.length;
  const session=restart?null:sanitizedSession(index,diff,n), all=pieces.map(p=>p.id);
  let order=session?.order;
  if(!Array.isArray(order)||order.length!==n||new Set(order).size!==n||order.some(id=>!all.includes(id)))order=shuffled(all);
  game={index,diff,d,pieces,paths:pieces.map(piecePath),placed:new Set(session?.placed||[]),order,seconds:session?.seconds||0,hints:session?.hints||0,selected:null,ghost:d.ghost,edges:false,zoom:1,image:null,finished:false,hintUntil:0,hintId:null,near:false,keyboardCell:null};
  $('boardLoading').hidden=false;$('stageLabel').textContent=`STAGE ${String(index+1).padStart(2,'0')} / ${stages.length}`;$('stageTitle').textContent=stages[index].title;$('difficultyTag').textContent=`${d.label} · ${n}조각`;
  $('interactionTip').textContent='조각을 끌거나, 조각을 누른 뒤 빈칸을 눌러요.';tray.innerHTML='';
  ['preview','guide','hint','zoom','shuffle','edges'].forEach(id=>$(id).disabled=true);
  refreshControls();updateStatus();layout();
  try{
    const image=new Image();image.src=stages[index].src;await image.decode();
    if(sequence!==loadingId||!game)return;
    game.image=image;$('boardLoading').hidden=true;['preview','guide','hint','zoom','shuffle','edges'].forEach(id=>$(id).disabled=false);
    lastTick=performance.now();renderTray();layout();saveGame();
    if(!session&&diff==='hard')toast('조각이 작으면 확대를 눌러 맞춰보세요.');
  }catch(error){if(sequence!==loadingId)return;toast('장면을 불러오지 못했습니다. 다시 시작해주세요.');goHome();}
}
function goHome(fromPop=false){
  loadingId++;stopDrag();saveGame();game=null;
  if(modal.open)modal.close();
  $('game').hidden=true;$('home').hidden=false;document.body.classList.remove('playing');renderHome();
  if(!fromPop&&history.state?.view==='play')history.back();
  requestAnimationFrame(()=>window.scrollTo(0,homeScroll));
}
window.addEventListener('popstate',()=>{if(game)goHome(true);});
function refreshControls(){
  if(!game)return;
  $('guide').setAttribute('aria-pressed',String(game.ghost));$('edges').setAttribute('aria-pressed',String(game.edges));$('zoom').setAttribute('aria-pressed',String(game.zoom>1));$('zoomLabel').textContent=game.zoom>1?'전체 보기':'확대';
}
function updateStatus(){
  if(!game)return;
  const done=game.placed.size,n=game.pieces.length;
  $('placedCount').textContent=done;$('totalCount').textContent=` / ${n}`;$('timer').textContent=formatTime(game.seconds);$('gameBar').style.width=`${done/n*100}%`;$('remainingLabel').textContent=`남은 조각 ${n-done}`;
  board.setAttribute('aria-label',`퍼즐판. ${n}개 중 ${done}개 완성. 조각을 선택한 뒤 빈칸을 누르거나 방향키와 Enter를 사용하세요.`);
}
function layout(){
  if(!game)return;
  const viewport=$('boardViewport'),availW=Math.max(60,viewport.clientWidth-16),availH=Math.max(80,viewport.clientHeight-16),fit=Math.min(availW/WIDTH,availH/HEIGHT),scale=fit*game.zoom;
  const width=WIDTH*scale,height=HEIGHT*scale,dpr=Math.min(2.5,window.devicePixelRatio||1);
  game.scale=scale;board.style.width=`${width}px`;board.style.height=`${height}px`;board.width=Math.round(width*dpr);board.height=Math.round(height*dpr);
  $('boardFrame').style.width=`${width}px`;$('boardFrame').style.height=`${height}px`;$('boardFrame').style.marginTop=`${Math.max(0,(viewport.clientHeight-height-16)/2)}px`;
  draw();
}
new ResizeObserver(()=>{if(game)layout();}).observe($('boardViewport'));
function requestDraw(){if(drawQueued)return;drawQueued=true;requestAnimationFrame(()=>{drawQueued=false;draw();});}
function draw(){
  if(!game||!board.width)return;
  const g=game;ctx.setTransform(board.width/WIDTH,0,0,board.height/HEIGHT,0,0);ctx.clearRect(0,0,WIDTH,HEIGHT);
  ctx.fillStyle='#ded6e2';ctx.fillRect(0,0,WIDTH,HEIGHT);
  if(!g.image)return;
  if(g.finished){ctx.drawImage(g.image,0,0,WIDTH,HEIGHT);return;}
  if(g.ghost){ctx.globalAlpha=.18;ctx.drawImage(g.image,0,0,WIDTH,HEIGHT);ctx.globalAlpha=1;}
  ctx.lineWidth=.7/g.scale;ctx.strokeStyle='#97889f66';for(const path of g.paths)ctx.stroke(path);
  for(const id of g.placed){ctx.save();ctx.clip(g.paths[id]);ctx.drawImage(g.image,0,0,WIDTH,HEIGHT);ctx.restore();ctx.strokeStyle='#3e29493d';ctx.lineWidth=.6/g.scale;ctx.stroke(g.paths[id]);}
  const highlighted=g.hintUntil>performance.now()?g.hintId:g.near?g.selected:null;
  if(highlighted!==null&&!g.placed.has(highlighted)){
    ctx.fillStyle='#7ec6a883';ctx.fill(g.paths[highlighted]);ctx.strokeStyle='#43775e';ctx.lineWidth=2.2/g.scale;ctx.stroke(g.paths[highlighted]);
  }
  if(g.keyboardCell!==null&&document.activeElement===board){const p=g.pieces[g.keyboardCell];ctx.strokeStyle='#7040ad';ctx.lineWidth=2/g.scale;ctx.setLineDash([5/g.scale,4/g.scale]);ctx.strokeRect(p.x+3/g.scale,p.y+3/g.scale,p.w-6/g.scale,p.h-6/g.scale);ctx.setLineDash([]);}
}
function renderPiece(canvas,id,width=71,height=88){
  if(!game?.image)return;
  const p=game.pieces[id],pad=Math.min(p.w,p.h)*.31,ratio=Math.min((width-8)/(p.w+2*pad),(height-8)/(p.h+2*pad)),dpr=Math.min(2.5,window.devicePixelRatio||1),c=canvas.getContext('2d');
  canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
  c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,width,height);c.translate((width-(p.w+pad*2)*ratio)/2,(height-(p.h+pad*2)*ratio)/2);c.scale(ratio,ratio);c.translate(pad-p.x,pad-p.y);
  c.shadowColor='#34284144';c.shadowBlur=4/ratio;c.shadowOffsetY=2/ratio;c.fillStyle='#fff';c.fill(game.paths[id]);c.shadowColor='transparent';c.shadowBlur=0;c.shadowOffsetY=0;
  c.save();c.clip(game.paths[id]);c.drawImage(game.image,0,0,WIDTH,HEIGHT);c.restore();c.strokeStyle='#ffffffb3';c.lineWidth=.8/ratio;c.stroke(game.paths[id]);
}
function renderTray(){
  if(!game?.image)return;
  const scroll=tray.scrollLeft, ids=game.order.filter(id=>!game.placed.has(id)&&(!game.edges||game.pieces[id].edge));
  tray.innerHTML='';
  if(!ids.length){tray.innerHTML=`<div class="tray-empty">${game.placed.size===game.pieces.length?'모든 조각이 제자리를 찾았어요.':'테두리를 모두 맞췄어요.<br>테두리만 버튼을 끄고 나머지를 찾아보세요.'}</div>`;return;}
  const fragment=document.createDocumentFragment();
  for(const id of ids){const button=document.createElement('button');button.className='piece-button';button.dataset.piece=id;button.setAttribute('aria-label',`퍼즐 조각 ${id+1}${game.pieces[id].edge?', 테두리':''}`);button.setAttribute('aria-pressed',String(game.selected===id));button.classList.toggle('selected',game.selected===id);const canvas=document.createElement('canvas');canvas.setAttribute('aria-hidden','true');button.append(canvas);renderPiece(canvas,id);fragment.append(button);}
  tray.append(fragment);tray.scrollLeft=scroll;
}
function selectPiece(id){
  if(!game?.image||game.finished||game.placed.has(id))return;
  game.selected=id;
  tray.querySelectorAll('[data-piece]').forEach(button=>{const active=Number(button.dataset.piece)===id;button.classList.toggle('selected',active);button.setAttribute('aria-pressed',String(active));});
  $('interactionTip').textContent='선택한 조각이 들어갈 빈칸을 누르거나 끌어놓으세요.';requestDraw();
}
function nearSpot(id,clientX,clientY){
  if(!game)return false;
  const r=board.getBoundingClientRect();if(!r.width||clientX<r.left-10||clientX>r.right+10||clientY<r.top-10||clientY>r.bottom+10)return false;
  const x=(clientX-r.left)/r.width*WIDTH,y=(clientY-r.top)/r.height*HEIGHT,p=game.pieces[id];
  return Math.abs(x-(p.x+p.w/2))<p.w*.54 && Math.abs(y-(p.y+p.h/2))<p.h*.54;
}
function placePiece(id){
  if(!game?.image||game.placed.has(id)||game.finished)return;
  game.placed.add(id);game.selected=null;game.near=false;game.hintId=null;game.hintUntil=0;sound();
  $('interactionTip').textContent='딱 맞았어요. 다음 조각도 찾아볼까요?';updateStatus();renderTray();saveGame();
  if(game.placed.size===game.pieces.length)finishGame();
  requestDraw();
}
function finishGame(){
  const g=game;g.finished=true;const k=key(g.index,g.diff),record=save.completed[k];
  if(!record||g.seconds<record.seconds)save.completed[k]={seconds:Math.floor(g.seconds),hints:g.hints};
  save.unlocked=Math.min(stages.length,Math.max(save.unlocked,g.index+2));saveGame();sound(true);
  setTimeout(()=>{if(game===g&&g.finished)showWin();},300);
}
function showWin(){
  const g=game,final=g.index===stages.length-1;
  showModal(`<div class="modal-inner win"><div class="win-medal">${icon('check')}</div><span class="eyebrow">${final?'COLLECTION COMPLETE':'STAGE COMPLETE'}</span><h2>${final?'모든 장면을 모았어요!':'한 장의 장면, 완성!'}</h2><img class="win-image" src="${stages[g.index].src}" alt="완성한 퍼즐"><div class="win-stats"><span>${g.d.label} · ${g.pieces.length}조각</span><span>${formatTime(g.seconds)}</span><span>힌트 ${g.hints}회</span></div><p class="win-subtitle">${final?'다른 난이도로 새로운 도전을 시작해보세요.':'새로운 장면이 열렸어요. 계속 맞춰볼까요?'}</p><button id="nextStage" class="primary">${final?'컬렉션으로 돌아가기':'다음 스테이지'} ${icon('arrow')}</button>${!final?'<button id="winHome" class="secondary">컬렉션 보기</button>':''}</div>`,{
    nextStage:()=>final?goHome():startStage(g.index+1), winHome:()=>goHome()
  },'win');
  if(!matchMedia('(prefers-reduced-motion: reduce)').matches){const wrap=document.createElement('div');wrap.className='confetti';for(let i=0;i<32;i++){const el=document.createElement('i');el.style.left=`${Math.random()*100}%`;el.style.background=['#b29ad8','#acd8c5','#e9bdd2','#e9d3a0'][i%4];el.style.animationDelay=`${Math.random()*.6}s`;wrap.append(el);}document.body.append(wrap);setTimeout(()=>wrap.remove(),3200);}
}
function stopDrag(){
  if(drag){try{tray.releasePointerCapture(drag.pointerId);}catch{}drag.el?.classList.remove('dragging');}
  drag=null;$('dragPiece').hidden=true;if(game){game.near=false;requestDraw();}
}
tray.addEventListener('pointerdown',event=>{
  const button=event.target.closest('[data-piece]');if(!event.isPrimary||!button||!game?.image||game.finished||(event.pointerType==='mouse'&&event.button!==0))return;
  const id=Number(button.dataset.piece);selectPiece(id);
  drag={id,el:button,pointerId:event.pointerId,x:event.clientX,y:event.clientY,startX:event.clientX,startY:event.clientY,touch:event.pointerType!=='mouse',active:false,offset:0};
  try{tray.setPointerCapture(event.pointerId);}catch{}
});
document.addEventListener('pointermove',event=>{
  if(!drag||event.pointerId!==drag.pointerId||!game)return;
  const dx=event.clientX-drag.startX,dy=event.clientY-drag.startY;drag.x=event.clientX;drag.y=event.clientY;
  if(!drag.active){
    if(Math.hypot(dx,dy)<8)return;
    if(drag.touch&&Math.abs(dx)>Math.abs(dy)*1.15)return;
    drag.active=true;drag.el.classList.add('dragging');const p=game.pieces[drag.id],pad=Math.min(p.w,p.h)*.31;
    drag.width=(p.w+2*pad)*game.scale;drag.height=(p.h+2*pad)*game.scale;
    const shrink=Math.min(1,185/drag.width,210/drag.height);drag.width*=shrink;drag.height*=shrink;drag.offset=drag.touch?Math.min(75,drag.height*.5):0;
    const ghost=$('dragPiece');renderPiece(ghost,drag.id,drag.width,drag.height);ghost.style.width=`${drag.width}px`;ghost.style.height=`${drag.height}px`;ghost.hidden=false;
  }
  if(event.cancelable)event.preventDefault();
  const ghost=$('dragPiece');ghost.style.left=`${event.clientX-drag.width/2}px`;ghost.style.top=`${event.clientY-drag.offset-drag.height/2}px`;
  game.near=nearSpot(drag.id,event.clientX,event.clientY-drag.offset)||nearSpot(drag.id,event.clientX,event.clientY);
  requestDraw();
},{passive:false});
document.addEventListener('pointerup',event=>{
  if(!drag||event.pointerId!==drag.pointerId)return;
  const {id,active,offset}=drag,valid=active&&(nearSpot(id,event.clientX,event.clientY-offset)||nearSpot(id,event.clientX,event.clientY));
  stopDrag();if(valid)placePiece(id);else if(active)toast('조각이 맞는 빈칸 가까이에 놓아주세요.');
});
document.addEventListener('pointercancel',event=>{if(drag?.pointerId===event.pointerId)stopDrag();});
tray.addEventListener('click',event=>{if(event.detail!==0)return;const button=event.target.closest('[data-piece]');if(button)selectPiece(Number(button.dataset.piece));});
board.addEventListener('click',event=>{
  if(!game?.image||game.finished)return;
  if(game.selected===null){toast('아래에서 조각을 먼저 골라주세요.');return;}
  if(nearSpot(game.selected,event.clientX,event.clientY))placePiece(game.selected);else toast('이 조각은 다른 빈칸에 들어가요.');
});
board.addEventListener('keydown',event=>{
  if(!game?.image||game.finished)return;
  const g=game,n=g.pieces.length;g.keyboardCell??=0;
  const delta={ArrowLeft:-1,ArrowRight:1,ArrowUp:-g.d.cols,ArrowDown:g.d.cols}[event.key];
  if(delta){event.preventDefault();g.keyboardCell=Math.max(0,Math.min(n-1,g.keyboardCell+delta));requestDraw();}
  else if(event.key==='Enter'||event.key===' '){event.preventDefault();if(g.selected===g.keyboardCell)placePiece(g.selected);else toast(g.selected===null?'먼저 아래에서 조각을 선택해주세요.':'이 조각은 다른 빈칸에 들어가요.');}
});
board.addEventListener('blur',()=>requestDraw());
function showModal(html,handlers={},kind='normal'){
  stopDrag();if(modal.open)modal.close();modal.dataset.kind=kind;$('modalContent').innerHTML=html;modal.showModal();lastTick=performance.now();
  Object.entries(handlers).forEach(([id,fn])=>{if($(id))$(id).onclick=fn;});
  $('closeModal')?.addEventListener('click',()=>modal.close());
}
modal.addEventListener('close',()=>{lastTick=performance.now();});
modal.addEventListener('cancel',event=>{if(modal.dataset.kind==='win')event.preventDefault();});
modal.addEventListener('click',event=>{if(event.target===modal&&modal.dataset.kind!=='win'){const r=modal.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)modal.close();}});
function modalHeading(title){return `<div class="modal-heading"><h2>${title}</h2><button id="closeModal" class="icon-button" aria-label="닫기">${icon('close')}</button></div>`;}
function showHelp(){
  showModal(`<div class="modal-inner">${modalHeading('한 조각씩, 이렇게 즐겨요')}<div class="help-step"><span>1</span><span>난이도와 장면을 골라요.<br><small>초급 12 · 중급 24 · 고급 54조각</small></span></div><div class="help-step"><span>2</span><span>아래 조각을 빈칸으로 끌어놓아요.<br><small>조각을 누른 뒤 빈칸을 눌러도 돼요.</small></span></div><div class="help-step"><span>3</span><span>다 맞추면 다음 장면이 열려요.<br><small>어느 난이도로 완성해도 다음 장면이 열려요.</small></span></div><p>막히면 원본 보기, 밑그림, 힌트를 사용하세요. 테두리만 모아 먼저 맞출 수도 있어요. 확대 후에는 퍼즐판을 손가락으로 밀어 이동하세요.</p><p class="modal-note">제한 시간과 조각 회전은 없습니다. 진행은 기기·브라우저별로 저장되며 인터넷 사용 기록을 삭제하면 사라질 수 있습니다. 키보드: Tab으로 조각 선택 → Enter → 퍼즐판에서 방향키와 Enter.</p><button id="understood" class="primary">알겠어요</button></div>`,{understood:()=>modal.close()});
}
function showMenu(){
  if(!game)return;
  showModal(`<div class="modal-inner">${modalHeading('잠깐 쉬어가요')}<p>게임은 일시 정지 중이에요.<br>현재 맞춘 조각은 자동으로 저장됩니다.</p><div class="setting-row"><span>효과음</span><button id="soundToggle" class="toggle" aria-label="효과음" aria-pressed="${save.sound}"><i></i></button></div><button id="resume" class="primary">계속 맞추기</button><button id="restart" class="secondary">${icon('refresh')} 이 장면 다시 시작</button><button id="menuHome" class="secondary">${icon('home')} 저장하고 컬렉션으로</button></div>`,{
    soundToggle:()=>{save.sound=!save.sound;$('soundToggle').setAttribute('aria-pressed',String(save.sound));writeSave();},resume:()=>modal.close(),menuHome:()=>goHome(),restart:()=>{
      const index=game.index;
      showModal(`<div class="modal-inner">${modalHeading('이 장면을 다시 시작할까요?')}<p>현재 장면의 조각 배치와 시간만 초기화됩니다.<br>이미 모은 장면과 완료 기록은 유지돼요.</p><button id="confirmRestart" class="primary">다시 시작하기</button><button id="cancelRestart" class="secondary">계속 맞추기</button></div>`,{confirmRestart:()=>startStage(index,true),cancelRestart:()=>modal.close()});
    }
  });saveGame();
}
$('preview').onclick=()=>{if(!game?.image)return;showModal(`<div class="modal-inner">${modalHeading(stages[game.index].title)}<img class="preview-image" src="${stages[game.index].src}" alt="현재 퍼즐의 완성 이미지"><button id="closePreview" class="primary">퍼즐로 돌아가기</button></div>`,{closePreview:()=>modal.close()});};
$('guide').onclick=()=>{if(game){game.ghost=!game.ghost;refreshControls();requestDraw();}};
$('hint').onclick=()=>{
  if(!game?.image||game.finished)return;
  if(game.selected===null){const id=game.order.find(id=>!game.placed.has(id)&&(!game.edges||game.pieces[id].edge));if(id===undefined){toast('테두리만 보기를 끄고 나머지 조각을 골라주세요.');return;}selectPiece(id);tray.querySelector(`[data-piece="${id}"]`)?.scrollIntoView({block:'nearest',inline:'center',behavior:'smooth'});}
  game.hints++;game.hintId=game.selected;game.hintUntil=performance.now()+2500;
  if(game.zoom>1){const p=game.pieces[game.selected],vp=$('boardViewport');vp.scrollTo({left:(p.x+p.w/2)*game.scale-vp.clientWidth/2,top:(p.y+p.h/2)*game.scale-vp.clientHeight/2,behavior:'smooth'});}
  $('interactionTip').textContent='초록색으로 표시한 자리에 선택한 조각을 놓아주세요.';saveGame();requestDraw();setTimeout(requestDraw,2600);
};
$('zoom').onclick=()=>{if(!game)return;game.zoom=game.zoom>1?1:1.75;refreshControls();layout();const vp=$('boardViewport');vp.scrollLeft=0;vp.scrollTop=0;$('interactionTip').textContent=game.zoom>1?'퍼즐판을 손가락으로 밀어 보고 싶은 곳으로 이동해요.':'조각을 끌거나, 조각을 누른 뒤 빈칸을 눌러요.';};
$('edges').onclick=()=>{if(game){game.edges=!game.edges;game.selected=null;refreshControls();renderTray();}};
$('shuffle').onclick=()=>{if(game){game.order=shuffled(game.order);renderTray();saveGame();toast('남은 조각을 섞었어요.');}};
$('trayPrev').onclick=()=>tray.scrollBy({left:-tray.clientWidth*.8,behavior:'smooth'});
$('trayNext').onclick=()=>tray.scrollBy({left:tray.clientWidth*.8,behavior:'smooth'});
$('difficulty').addEventListener('click',event=>{const button=event.target.closest('[data-diff]');if(!button)return;save.diff=button.dataset.diff;writeSave();renderHome();});
$('stages').addEventListener('click',event=>{const button=event.target.closest('[data-stage]');if(button)startStage(Number(button.dataset.stage));});
$('continueGame').onclick=()=>startStage(targetStage());$('back').onclick=()=>goHome();$('menu').onclick=showMenu;$('help').onclick=showHelp;$('retryLoad').onclick=boot;
setInterval(()=>{
  const now=performance.now(),delta=Math.min(2,(now-lastTick)/1000);lastTick=now;
  if(game?.image&&!game.finished&&!document.hidden&&!modal.open){game.seconds+=delta;$('timer').textContent=formatTime(game.seconds);if(now-lastSaved>5000){saveGame();lastSaved=now;}}
},250);
document.addEventListener('visibilitychange',()=>{lastTick=performance.now();if(document.hidden){stopDrag();saveGame();}});
window.addEventListener('pagehide',()=>{stopDrag();saveGame();});
window.addEventListener('resize',()=>{stopDrag();if(game)layout();});
history.replaceState({view:'home'},'',location.pathname+location.search);
boot();
