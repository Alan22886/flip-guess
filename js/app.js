'use strict';
const $=id=>document.getElementById(id);
const escapeHTML=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const PROGRESS_KEY='flip_guess_progress_v1';
const SETTINGS_KEY='flip_guess_settings_v1';
const KEYS={seen:'guess_seen_v4',matches:'guess_history_v4',audit:'guess_round_audit_v7'};
const FORMAT='cross-strait-charades-progress';
const STATES=Object.freeze({SETUP:'setup',READY:'ready',COUNTDOWN:'countdown',RUNNING:'running',PAUSED:'paused',ROUND_END:'roundEnd',FINAL:'final'});
let phase=STATES.SETUP,screenId='setup',mode='team',players=[],results=[],roundIndex=0,teamColors={},selected=new Set(Object.keys(BANK)),nameValues=new Map();
const WORD_ACTION_COOLDOWN=260;
let duration=120,penalty=false,deck=[],word=null,score=0,correct=0,passed=0,roundWords=[],undoStack=[],lastAction=0;
let matchWords=new Set(),allowReuse=false;
let lastTickSecond=null,lastSoundBeat=null;
const orientation=matchMedia('(orientation: landscape)');
const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)');
let remaining=0,deadline=0,wordStartRemaining=0,clockHandle=null,clockGeneration=0;
let swapSelection=null;
let pendingImport=null,importReader=null,importTimeout=null;
const palette=['#AA6504','#0B8753','#A63FEF','#E81046','#727C09','#D511B5','#2B870D','#CF470D','#0B828D','#6C60EF','#E52413','#0D79C7'];
const allWordSet=new Set(Object.values(BANK).flat());
function showMessage(message) {
 const dialog=$('messageDialog');
 $('messageText').textContent=message;
 if(!dialog.open)dialog.showModal();
}
function reportStorage(error) {
 console.warn('本地存储不可用',error);
 const status=$('storageStatus');
 status.hidden=false;
 status.textContent='无法读取或保存本机数据。请检查浏览器存储空间，并导出当前可用的备份。';
}
const unreadableStorageKeys=new Set();
const storage={
 load(key,fallback,validate){
  try{
   const raw=localStorage.getItem(key);
   if(raw===null)return fallback;
   const value=JSON.parse(raw);
   if(!validate(value))throw Error('本机数据格式错误');
   return value;
  }catch(error){unreadableStorageKeys.add(key);reportStorage(error);return fallback}
 },
 save(key,value){
  try{
   if(unreadableStorageKeys.has(key))throw Error('已保留无法读取的原始数据');
   localStorage.setItem(key,JSON.stringify(value));return true;
  }catch(error){reportStorage(error);return false}
 }
};
const DATA={
 seen:new Set(),matches:[],audit:[],checkpoint:null,
 save(seen=this.seen,matches=this.matches,audit=this.audit){
  return storage.save(PROGRESS_KEY,{seen:[...seen],matches,audit,checkpoint:this.checkpoint});
 },
 fingerprint(g){return JSON.stringify([g.date,g.mode,g.players,g.winner])},
 validateBackup(data){
  if(!data||typeof data!=='object'||Array.isArray(data)||data.format!==FORMAT||Number(data.version)!==1)throw Error('不是兼容的滑动猜词 JSON 记录');
  if(!Array.isArray(data.seen)||data.seen.length>200000)throw Error('已用词列表格式错误');
  const items=[...data.seen,...(Array.isArray(data.unknownSeen)?data.unknownSeen:[])];
  const seen=new Set();for(const item of items){if(!item||typeof item!=='object')continue;let w=typeof item.id==='string'&&item.id.startsWith('zh:')?item.id.slice(3):item.simplified;if(typeof w==='string'&&w.length<=160&&w.trim())seen.add(w.normalize('NFKC').trim())}
  const matches=Array.isArray(data.matches)?data.matches.slice(0,5000).filter(validMatch):[];
  const audit=Array.isArray(data.roundAudit)?data.roundAudit.slice(0,10000).filter(validAudit):[];
  return {seen,matches,audit};
 },
 backup(){const unique=new Set();const entries=[];for(const words of Object.values(BANK))for(const w of words){if(unique.has(wordKey(w)))continue;unique.add(wordKey(w));if(this.seen.has(wordKey(w)))entries.push({id:'zh:'+w,simplified:w,traditional:wordTraditional(w),taiwanAliases:Object.hasOwn(TAIWAN_ALIASES,w)?TAIWAN_ALIASES[w]:''})}return {format:FORMAT,version:1,appVersion:'59-pwa',exportedAt:new Date().toISOString(),seen:entries,unknownSeen:[...this.seen].filter(w=>!unique.has(w)).map(w=>({id:'zh:'+w,simplified:w})),matches:this.matches,roundAudit:this.audit}},
 merge(preview){const seen=new Set([...this.seen,...preview.seen]);const matches=this.matches.slice(),audit=this.audit.slice();const fingerprints=new Set(matches.map(g=>this.fingerprint(g))),ids=new Set(audit.map(x=>x.id));for(const g of preview.matches){const f=this.fingerprint(g);if(!fingerprints.has(f)){matches.push(g);fingerprints.add(f)}}for(const a of preview.audit){if(!ids.has(a.id)){audit.push(a);ids.add(a.id)}}matches.sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  if(!this.save(seen,matches,audit))throw Error('无法保存导入记录');this.seen=seen;this.matches=matches;this.audit=audit;
 }
};
function loadProgress(){
 const saved=storage.load(PROGRESS_KEY,null,value=>value&&Object.keys(KEYS).every(key=>Array.isArray(value[key])));
 const data=saved||Object.fromEntries(Object.entries(KEYS).map(([field,key])=>[field,storage.load(key,[],Array.isArray)]));
 if(!saved&&Object.values(KEYS).some(key=>unreadableStorageKeys.has(key)))unreadableStorageKeys.add(PROGRESS_KEY);
 DATA.seen=new Set(data.seen.filter(word=>typeof word==='string').map(wordKey));
 DATA.matches=data.matches.filter(validMatch);
 DATA.audit=data.audit.filter(validAudit);
 if(validCheckpoint(data.checkpoint))DATA.checkpoint=data.checkpoint;
}
function validCheckpoint(value){
 return value&&['team','solo'].includes(value.mode)&&[3,120,180,240,300].includes(value.duration)&&
  typeof value.penalty==='boolean'&&typeof value.allowReuse==='boolean'&&
  Array.isArray(value.categories)&&value.categories.every(name=>typeof name==='string')&&
  Array.isArray(value.used)&&value.used.every(word=>typeof word==='string')&&
  Array.isArray(value.players)&&value.players.length>0&&value.players.length<=360&&
  value.players.every(p=>p&&typeof p.key==='string'&&typeof p.label==='string'&&
   (value.mode==='solo'?p.team===null:typeof p.team==='string'&&/^[A-L]组$/.test(p.team)))&&
  value.teamColors&&Object.values(value.teamColors).every(color=>palette.includes(color))&&
  value.players.every(player=>!player.team||palette.includes(value.teamColors[player.team]))&&
  Array.isArray(value.results)&&value.results.length<value.players.length&&
  value.results.every((round,index)=>round&&Number.isFinite(round.score)&&
   round.team===value.players[index].team&&Array.isArray(round.words));
}
function saveCheckpoint(){
 DATA.checkpoint={mode,players,results,duration,penalty,teamColors,categories:[...selected],
  allowReuse,used:[...matchWords]};
 DATA.save();
}
function rememberSettings(){
 storage.save(SETTINGS_KEY,{
  mode:selectedMode(),teamCount:Number($('teamCount').value),soloCount:Number($('soloCount').value),
  sizes:[...$('teamConfig').querySelectorAll('input')].map(input=>Number(input.value)),
  duration:Number($('duration').value),penalty:$('penalty').checked,names:[...nameValues],
  categories:[...selected],swipeStyle:$('game').dataset.swipeStyle,
 });
}
function restoreSettings(){
 const saved=storage.load(SETTINGS_KEY,null,value=>value&&typeof value==='object'&&!Array.isArray(value));
 if(!saved)return [];
 if(saved.swipeStyle==='word'||saved.swipeStyle==='divider'){
  $('swipePreference').querySelector(`[value="${saved.swipeStyle}"]`).checked=true;
 }
 if(saved.mode==='solo')$('mode').querySelector('[value="solo"]').checked=true;
 for(const [id,min,max] of [['teamCount',2,12],['soloCount',1,30],['duration',1,5]]){
  const n=saved[id];
  if(Number.isInteger(n)&&n>=min&&n<=max)$(id).value=n;
 }
 $('penalty').checked=saved.penalty===true;
 if(Array.isArray(saved.names))nameValues=new Map(saved.names.filter(entry=>
   Array.isArray(entry)&&typeof entry[0]==='string'&&typeof entry[1]==='string'));
 if(Array.isArray(saved.categories)){
  const available=saved.categories.filter(name=>Object.hasOwn(BANK,name));
  if(available.length)selected=new Set(available);
 }
 return Array.isArray(saved.sizes)?saved.sizes.map(n=>Number.isInteger(n)&&n>=1&&n<=30?n:2):[];
}
function validMatch(g){
 return g&&typeof g.date==='string'&&Array.isArray(g.results)&&g.results.every(round=>
  round&&typeof round==='object'&&(round.words==null||
    (Array.isArray(round.words)&&round.words.every(word=>word&&typeof word==='object'))));
}
function validAudit(a){return a&&typeof a.id==='string'&&['round_restarted','game_ended'].includes(a.event)}
function teamColor(team){return teamColors[team]||'#e5e7eb'}
const soloColors=[
 '#3284D6','#E75683','#369357','#BC7B18','#9A64D7','#168C95',
 '#E35A38','#666DE0','#9A891A','#CD50AD','#207B72','#DF8053',
 '#6E9BB1','#813CAA','#8F6842','#7DB572','#C84652','#4E68AA',
 '#D8A042','#AC6E91','#198FB6','#A0A846','#824FCA','#E7858E',
 '#527D38','#578EA8','#AA5D24','#81486F','#7C74B3','#3D9C80',
];
function playerColor(player,index=0){
 if(player?.team)return teamColor(player.team);
 const slot=player?.key?.startsWith('solo-')?Number(player.key.slice(5)):index;
 return soloColors[slot]||'#e5e7eb';
}
function randomColors(){
 // Assign each team a unique color; maximize perceptual separation for early teams.
 const remaining=[...new Set(palette)];
 const chosen=[];
 const rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
 const distance=(a,b)=>{const x=rgb(a),y=rgb(b);return Math.sqrt(x.reduce((sum,v,i)=>sum+(v-y[i])**2,0))};
 chosen.push(remaining.splice(Math.floor(Math.random()*remaining.length),1)[0]);
 while(remaining.length){
  const scores=remaining.map(color=>Math.min(...chosen.map(other=>distance(color,other))));
  const best=Math.max(...scores);
  const candidates=remaining.map((_,i)=>i).filter(i=>scores[i]>=best-0.001);
  const index=candidates[Math.floor(Math.random()*candidates.length)];
  chosen.push(remaining.splice(index,1)[0]);
 }
 teamColors={};
 for(let i=0;i<12;i++)teamColors[String.fromCharCode(65+i)+'组']=chosen[i];
}
randomColors();
function landscape(){return orientation.matches}
function currentPlayer(){return players[roundIndex]}
function clearClock(){clockGeneration++;if(clockHandle!==null){clearInterval(clockHandle);clockHandle=null}}
function setPhase(next){if(phase===next)return;clearClock();phase=next;$('game').dataset.phase=next;renderOrientation()}
function screen(id){if(id!=='setup')clearSwapSelection();screenId=id;document.querySelectorAll('.screen').forEach(el=>el.classList.toggle('on',el.id===id));renderOrientation();syncLaunch()}
function selectedMode(){return $('mode').querySelector('input:checked').value}
function getRoster(){if(selectedMode()==='solo'){let n=Math.min(30,Math.max(1,Number($('soloCount').value)||1));return Array.from({length:n},(_,i)=>({team:null,key:'solo-'+i,label:nameValues.get('solo-'+i)?.trim()||'玩家'+(i+1)}))}
 const sizes=[...$('teamConfig').querySelectorAll('input[type=number]')].map(x=>Math.min(30,Math.max(1,Number(x.value)||1)));const list=[];for(let j=0;j<Math.max(0,...sizes);j++)for(let i=0;i<sizes.length;i++)if(j<sizes[i]){const team=String.fromCharCode(65+i)+'组',key=team+'-'+j;list.push({team,key,label:nameValues.get(key)?.trim()||team+' · 玩家'+(j+1)})}return list}
function saveNameInputs(){document.querySelectorAll('#nameInputs input[data-key]').forEach(el=>nameValues.set(el.dataset.key,el.value))}
function clearSwapSelection(){
 if(!swapSelection)return;
 swapSelection.setAttribute('aria-pressed','false');
 swapSelection=null;
}
function selectSwapPosition(button){
 if(button===swapSelection){clearSwapSelection();return}
 sound.unlock();
 sound.feedback('select');
 if(!swapSelection){
  swapSelection=button;
  button.setAttribute('aria-pressed','true');
  return;
 }
 const first=swapSelection.closest('.nameRow').querySelector('input');
 const second=button.closest('.nameRow').querySelector('input');
 [first.value,second.value]=[second.value,first.value];
 nameValues.set(first.dataset.key,first.value);
 nameValues.set(second.dataset.key,second.value);
 clearSwapSelection();
 syncLaunch();
}
function renderNames(){
 saveNameInputs();
 clearSwapSelection();
 const holder=$('nameInputs');
 holder.replaceChildren();
 const roster=getRoster();
 const groups=[...new Set(roster.map(player=>player.team))];
 for(const team of groups){
  const group=document.createElement('div');
  group.className='nameGroup';
  if(team){
   group.style.setProperty('--team-color',teamColor(team));
   group.classList.add('teamNameGroup');
   const heading=document.createElement('div');
   heading.className='nameGroupHeading';
   heading.textContent=team;
   group.append(heading);
  }
  for(const [index,player] of roster.entries()){
   if(player.team!==team)continue;
   const row=document.createElement('div');
   row.className='nameRow';
   if(!team){
    row.classList.add('soloNameRow');
    row.style.setProperty('--player-color',playerColor(player,index));
   }
   const input=document.createElement('input');
   input.id='nickname-'+player.key;
   input.dataset.key=player.key;
   input.maxLength=24;
   input.placeholder='昵称（选填）';
   input.value=nameValues.get(player.key)||'';
   input.addEventListener('input',()=>{nameValues.set(player.key,input.value);syncLaunch()});
   const title=document.createElement('label');
   title.htmlFor=input.id;
   title.className='namePlayerLabel';
   title.textContent=team?Number(player.key.split('-')[1])+1+'号玩家':`玩家 ${index+1}`;
   const order=document.createElement(team?'button':'span');
   order.className='nameOrderBadge';
   order.textContent='#'+(index+1);
   if(team){
    order.type='button';
    order.setAttribute('aria-label',`交换 ${team} ${title.textContent}（顺序 ${index+1}）`);
    order.setAttribute('aria-pressed','false');
    order.addEventListener('click',()=>selectSwapPosition(order));
   }
   row.append(title,input,order);
   group.append(row);
  }
  holder.append(group);
 }
 syncLaunch();
}
function configTeams(savedSizes){const solo=selectedMode()==='solo';$('teamCountWrap').style.display=solo?'none':'';$('soloCountWrap').style.display=solo?'':'none';$('teamConfig').style.display=solo?'none':'flex';if(!solo||Array.isArray(savedSizes)){const root=$('teamConfig');const old=Array.isArray(savedSizes)?savedSizes:[...root.querySelectorAll('input')].map(x=>x.value);const n=Math.min(12,Math.max(2,Number($('teamCount').value)||2));root.replaceChildren();for(let i=0;i<n;i++){const label=document.createElement('label');const team=String.fromCharCode(65+i)+'组';label.textContent=team+'人数 ';label.style.setProperty('--team-color',teamColor(team));const input=document.createElement('input');input.type='number';input.min='1';input.max='30';input.value=old[i]||2;input.addEventListener('input',renderNames);label.append(input);root.append(label)}upgradeSteppers()}renderNames()}
function syncCategoryPreview(){
 const expanded=$('toggleCategories').getAttribute('aria-expanded')==='true';
 $('cats').querySelectorAll('.cat:nth-child(n+5)').forEach(button=>{button.inert=!expanded});
}
function renderCats(){if(phase===STATES.SETUP)$('reuseWords').checked=false;$('cats').replaceChildren();for(const cat of Object.keys(BANK)){const b=document.createElement('button');b.className='cat'+(selected.has(cat)?' sel':'');b.setAttribute('aria-pressed',String(selected.has(cat)));b.textContent=cat;b.addEventListener('click',()=>{selected.has(cat)?selected.delete(cat):selected.add(cat);renderCats()});$('cats').append(b)}syncCategoryPreview();const count=[...selected].reduce((n,k)=>n+BANK[k].length,0),left=[...selected].reduce((n,k)=>n+BANK[k].filter(w=>!DATA.seen.has(wordKey(w))).length,0);$('count').textContent=`已选 ${selected.size} 类 · ${count} 个词（剩余 ${left}）`;const allSelected=selected.size===Object.keys(BANK).length;$('all').classList.toggle('isAll',allSelected);$('all').setAttribute('aria-pressed',String(allSelected));renderHistoryStats()}
function selectedWords(){
 return [...selected].flatMap(k=>(BANK[k]||[]).map(w=>({w,k})));
}
function buildDeck(){
 const available=selectedWords().filter(({w})=>!matchWords.has(wordKey(w)));
 deck=available.filter(({w})=>!DATA.seen.has(wordKey(w)));
 if(!deck.length&&allowReuse)deck=available;
 for(let i=deck.length-1;i>0;i--){
  const j=Math.floor(Math.random()*(i+1));
  [deck[i],deck[j]]=[deck[j],deck[i]];
 }
}
function nextWord(fitImmediately=false){
 if(!deck.length)buildDeck();
 if(!deck.length)return false;
 word=deck.pop();
 const key=wordKey(word.w);
 word.wasSeen=DATA.seen.has(key);
 matchWords.add(key);
 DATA.seen.add(key);
 saveCheckpoint();
 refreshWord(fitImmediately);
 return true;
}
function refreshWord(immediate=false){
 const simplified=$('wordHans'),traditional=$('wordHant'),box=$('word');
 simplified.textContent=word?.w||'';
 traditional.textContent=word?wordTraditional(word.w):'';
 if(!word)return;
 const fit=()=>{
  if(!word||screenId!=='game'||!landscape())return;
  const leftLabel=$('pass').querySelector('.taplabel').getBoundingClientRect();
  const rightLabel=$('correct').querySelector('.taplabel').getBoundingClientRect();
  const gameRect=$('game').getBoundingClientRect();
  const gutter=Math.max(leftLabel.right-gameRect.left,gameRect.right-rightLabel.left)+12;
  box.style.maxWidth=Math.max(0,Math.floor(gameRect.width-2*gutter))+'px';
  const maxWidth=box.clientWidth;
  for(const line of [simplified,traditional]){
   line.style.whiteSpace=Array.from(line.textContent).length<=9?'nowrap':'';
  }
  const wordBounds=box.getBoundingClientRect();
  const controlsTop=$('gameTools').getBoundingClientRect().top;
  const wordCenter=wordBounds.top+wordBounds.height/2;
  const maxHeight=Math.min(innerHeight*.51,2*(controlsTop-wordCenter-6),parseFloat(getComputedStyle(box).maxHeight));
  const gap=parseFloat(getComputedStyle(box).rowGap)||0;
  const apply=size=>{
   for(const line of [simplified,traditional])line.style.setProperty('font-size',size+'px','important');
  };
  let low=16,high=Math.floor(Math.min(118,Math.max(32,Math.min(innerWidth*.103,innerHeight*.202))));
  while(low<high){
   const size=Math.ceil((low+high)/2);
   apply(size);
   const fits=Math.max(simplified.scrollWidth,traditional.scrollWidth)<=maxWidth&&
     simplified.offsetHeight+traditional.offsetHeight+gap<=maxHeight;
   if(fits)low=size;else high=size-1;
  }
  apply(low);
 };
 if(immediate)fit();else requestAnimationFrame(fit);
}
function updateHUD(){const p=currentPlayer();if(!p)return;const who=$('who');who.replaceChildren();const name=document.createElement('span');name.textContent=p.label;const verb=document.createElement('span');verb.className='hudVerb';verb.textContent='猜';who.append(name,verb);$('score').textContent=score+' 分';$('timer').textContent=formatTime(remaining);$('undoAction').disabled=!(phase===STATES.RUNNING&&undoStack.length)}
function formatTime(ms){const secs=Math.max(0,Math.ceil(ms/1000));return Math.floor(secs/60)+':'+String(secs%60).padStart(2,'0')}
function vibrate(pattern){try{navigator.vibrate?.(pattern)}catch{}}
function countdownStart(){
 setPhase(STATES.COUNTDOWN);
 $('pauseOverlay').classList.remove('on');
 $('countdownOverlay').classList.add('on');
 const player=currentPlayer();
 const roles=roleNames(players,player);
 const title=$('countdownTitle');
 title.replaceChildren();
 for(const [person,verb,cls] of [[roles.description,'准备描述','descHint'],[roles.guess,'准备猜','guessHint']]){
  if(!person)continue;
  const line=document.createElement('span');
  line.className=cls;
  const name=document.createElement('span');
  name.className='rolePerson';
  name.textContent=person;
  name.style.color=playerColor(player);
  const action=document.createElement('span');
  action.className='roleAction';
  action.textContent=' '+verb;
  line.append(name,action);
  title.append(line);
 }
 const number=$('countdownNumber');
 const countdownDeadline=performance.now()+3000;
 const generation=clockGeneration;
 let shown=0;
 let pulse;
 const tick=()=>{
  if(generation!==clockGeneration||phase!==STATES.COUNTDOWN)return;
  const timeLeft=countdownDeadline-performance.now();
  const seconds=Math.ceil(timeLeft/1000);
  if(seconds<=0){
   $('countdownOverlay').classList.remove('on');
   startRunning();
   return;
  }
  if(seconds===shown)return;
  shown=seconds;
  if(seconds<3)sound.feedback('countdown');
  number.textContent=seconds;
  pulse?.cancel();
  if(!reduceMotion.matches)pulse=number.animate([
   {transform:'scale(.66)',opacity:.25},
   {transform:'scale(1.10)',opacity:1,offset:.65},
   {transform:'scale(1)',opacity:1},
  ],{duration:280,easing:'ease-out'});
 };
 clockHandle=setInterval(tick,50);
 tick();
}
function fitUrgentTimer(){
 const timer=$('timer');
 const name=$('who');
 const score=$('score');
 const hud=timer.parentElement;
 if(!hud.classList.contains('urgent')||!timer.offsetWidth||!timer.offsetHeight)return;
 const nameEdge=name.offsetLeft+name.offsetWidth;
 const scoreEdge=score.parentElement.offsetLeft+score.offsetLeft;
 const center=(nameEdge+scoreEdge)/2;
 timer.style.translate=`${center-timer.offsetLeft-timer.offsetWidth/2}px 0`;
 const spare=Math.max(0,(scoreEdge-nameEdge-timer.offsetWidth)/2-4);
 const angle=(parseFloat(getComputedStyle(timer).getPropertyValue('--timer-swing-angle'))||0)*Math.PI/180;
 const width=timer.offsetWidth;
 const height=timer.offsetHeight;
 const swingWidth=Math.max(width,width*Math.cos(angle)+height*Math.sin(angle));
 const swingHeight=Math.max(height,height*Math.cos(angle)+width*Math.sin(angle));
 const x=(width+2*spare)/swingWidth;
 const vertical=(hud.clientHeight-8)/swingHeight;
 const peak=Math.max(1,Math.min(vertical,x));
 timer.style.setProperty('--timer-peak',peak.toFixed(3));
}
function wordTranslation(x=0,y=0){
 return `calc(-50% + ${x}px) calc(-50% + ${y}px)`;
}
function startRunning(){
 if(word)refreshWord();
 else if(!nextWord()){audit('game_ended');newGame();showMessage('所选类别已无可用词语，已完成的回合保存在中断日志。');return}
 sound.feedback('roundStart');
 setPhase(STATES.RUNNING);
 deadline=performance.now()+remaining;
 lastAction=0;
 const generation=clockGeneration;
 const hud=$('game').querySelector('.hud');
 const timer=$('timer');
 const tick=()=>{
  if(generation!==clockGeneration||phase!==STATES.RUNNING)return;
  remaining=Math.max(0,deadline-performance.now());
  timer.textContent=formatTime(remaining);
  const seconds=Math.ceil(remaining/1000);
  const urgent=seconds>0&&seconds<=15;
  const swing=seconds<=5;
  const refit=!hud.classList.contains('urgent')||timer.classList.contains('timer-swing')!==swing;
  timer.classList.toggle('timer-warning',seconds<=15);
  timer.classList.toggle('timer-swing',swing);
  if(urgent){
   hud.classList.add('urgent');
   if(refit)fitUrgentTimer();
   const beat=seconds<=5?Math.ceil(remaining*4/1000):seconds*4;
   if(lastSoundBeat!==beat){
    lastSoundBeat=beat;
    sound.feedback('tick');
   }
   if(lastTickSecond!==seconds){
    lastTickSecond=seconds;
    vibrate([24,36,24,36,24]);
   }
  }
  if(remaining<=0)finishRound(true);
 };
 clockHandle=setInterval(tick,80);
 tick();
 updateHUD();
}
function pause(){if(phase===STATES.RUNNING){remaining=Math.max(0,deadline-performance.now())}else if(phase!==STATES.COUNTDOWN)return;setPhase(STATES.PAUSED);vibrate(0);$('countdownOverlay').classList.remove('on');$('pauseOverlay').classList.add('on');updateHUD()}
function resume(){if(phase!==STATES.PAUSED||!landscape())return;lockRoundHudWidth();sound.unlock();countdownStart()}
function lockRoundHudWidth(){
 const hud=$('game').querySelector('.hud');
 if(!landscape()||hud.style.getPropertyValue('--round-hud-width'))return;
 hud.dataset.measuring='';
 hud.style.setProperty('--round-hud-width',Math.ceil(hud.getBoundingClientRect().width)+'px');
 delete hud.dataset.measuring;
}
function beginRound(){
 sound.unlock();
 setPhase(STATES.READY);
 score=correct=passed=0;
 remaining=duration*1000;
 wordStartRemaining=remaining;
 roundWords=[];
 undoStack=[];
 word=null;
 lastTickSecond=lastSoundBeat=null;
 $('timer').classList.remove('timer-warning','timer-swing');
 $('timer').style.removeProperty('translate');
 const hud=$('game').querySelector('.hud');
 hud.classList.remove('urgent');
 hud.style.removeProperty('--round-hud-width');
 // Reserve digits for the fastest possible score changes during this round.
 const digits=String(Math.ceil(duration*1000/WORD_ACTION_COOLDOWN)).length;
 hud.querySelector('.hudScore').dataset.reserve=(penalty?'-':'')+'8'.repeat(digits)+' 分';
 $('pauseOverlay').classList.remove('on');
 screen('game');
 refreshWord();
 updateHUD();
 lockRoundHudWidth();
 if(landscape())countdownStart();
 else{setPhase(STATES.PAUSED);$('pauseOverlay').classList.add('on')}
}
function flashTapSide(kind,undo=false,delay=0){
 const layer=$(kind).querySelector('.tapFeedback');
 layer.getAnimations().forEach(animation=>animation.cancel());
 layer.classList.toggle('undoFeedback',undo);
 const from=undo?.68:.17;
 layer.animate([{opacity:from},{opacity:0}],{delay,duration:delay?155:reduceMotion.matches?140:230,easing:'ease-out'});
}
function showScoreChange(delta){
 if(!delta||reduceMotion.matches)return;
 const number=$('score');
 const change=$('scoreChange');
 for(const element of [number,change])element.getAnimations().forEach(animation=>animation.cancel());
 change.textContent=delta>0?'+1':'−1';
 change.classList.toggle('lost',delta<0);
 number.animate([{scale:1},{scale:1.1,offset:.32},{scale:1}],{duration:270,easing:'ease-out'});
 change.animate([{opacity:0,translate:'0 2px'},{opacity:1,translate:'0 0',offset:.2},
  {opacity:1,translate:'0 -1px',offset:.55},{opacity:0,translate:'0 -3px'}],
  {duration:370,easing:'ease-out'});
}
function canSelectWord(now=performance.now()){
 return phase===STATES.RUNNING&&Boolean(word)&&now-lastAction>=WORD_ACTION_COOLDOWN;
}
function action(kind,customFeedback=false){
 const now=performance.now();
 if(!canSelectWord(now))return false;
 lastAction=now;
 const timeLeft=Math.max(0,deadline-now);
 const elapsedMs=Math.max(0,Math.round(wordStartRemaining-timeLeft));
 sound.feedback(kind);
 if(!customFeedback)flashTapSide(kind);
 undoStack.push({word,score,correct,passed,elapsedMs,length:roundWords.length});
 roundWords.push({word:word.w,traditional:wordTraditional(word.w),kind,elapsedMs});
 wordStartRemaining=timeLeft;
 const delta=kind==='correct'?1:penalty?-1:0;
 score+=delta;
 if(kind==='correct'){correct++;vibrate(35)}else passed++;
 updateHUD();
 showScoreChange(delta);
 if(!nextWord(customFeedback&&$('game').dataset.swipeStyle==='word'&&!reduceMotion.matches))finishRound();
 return true;
}
function undo(){
 if(phase!==STATES.RUNNING||!undoStack.length)return;
 const old=undoStack.pop();
 sound.feedback('undo');
 const button=$('undoAction');
 button.getAnimations().forEach(animation=>animation.cancel());
 button.animate(reduceMotion.matches?[{filter:'brightness(1.18)'},{filter:'none'}]:
  [{scale:.94},{scale:1}],{duration:180,easing:'ease-out'});
 const kind=roundWords.at(-1).kind;
 const wordMode=$('game').dataset.swipeStyle==='word';
 const previous=wordMode&&!reduceMotion.matches?copyWordForMotion():null;
 if(!wordMode)flashTapSide(kind,true);
 $('scoreChange').getAnimations().forEach(animation=>animation.cancel());
 $('score').getAnimations().forEach(animation=>animation.cancel());
 if(word){
  const key=wordKey(word.w);
  if(!word.wasSeen)DATA.seen.delete(key);
  matchWords.delete(key);
  deck.push(word);
 }
 word=old.word;
 wordStartRemaining=Math.max(0,deadline-performance.now())+old.elapsedMs;
 score=old.score;
 correct=old.correct;
 passed=old.passed;
 roundWords.length=old.length;
 DATA.seen.add(wordKey(word.w));
 saveCheckpoint();
 refreshWord(Boolean(previous));
 if(previous)animatePortalWord(kind,previous,null);
 lastAction=performance.now();
 updateHUD();
}
function renderRoundReview(filter='all'){
 for(const button of $('roundReviewFilters').querySelectorAll('button')){
  button.setAttribute('aria-pressed',String(button.dataset.filter===filter));
 }
 const detail=$('roundDetail');detail.replaceChildren();const entries=[...roundWords.entries()];
 const longest=Math.max(1,...roundWords.map(word=>word.elapsedMs??0));
 if(filter==='slow')entries.sort((a,b)=>(b[1].elapsedMs??-1)-(a[1].elapsedMs??-1));
 for(const [index,w] of entries){
 if(filter==='pass'&&w.kind!=='pass')continue;
 const el=document.createElement('span');
 el.className='detailLine '+(w.kind==='correct'?'isCorrect':'isPass');
 const badge=document.createElement('span');
 badge.className='detailOrder';
 badge.textContent=index+1;
 el.append(badge,w.word+(w.traditional!==w.word?' / '+w.traditional:''));
 const row=document.createElement('div');
 row.className='roundWordRow';
 const time=document.createElement('span');
 time.className='roundWordTime';
 time.textContent=Number.isFinite(w.elapsedMs)?(w.elapsedMs/1000).toFixed(1)+' 秒':'—';
 const usage=document.createElement('span');
 usage.className='roundWordUsage';
 if(Number.isFinite(w.elapsedMs)){
  const bar=document.createElement('span');
  bar.className='roundWordBar';
  bar.style.setProperty('--time-share',String(w.elapsedMs/longest));
  bar.setAttribute('aria-hidden','true');
  usage.append(bar);
 }
 usage.append(time);
 row.append(el,usage);
 detail.append(row);
}
 if(!detail.childElementCount){
  const empty=document.createElement('p');
  empty.className='roundReviewEmpty';
  empty.textContent=filter==='pass'?'本轮没有跳过的词':'本轮还没有答题记录';
  detail.append(empty);
 }
 detail.scrollTop=0;
}
async function finishRound(timedOut=false){if(phase!==STATES.RUNNING&&phase!==STATES.COUNTDOWN)return;setPhase(STATES.ROUND_END);remaining=0;vibrate([160,70,160]);const p=currentPlayer();results.push({team:p.team,label:p.label,score,passed,correctCount:correct,words:roundWords.map(w=>({...w}))});if(roundIndex===players.length-1)recordMatch();else saveCheckpoint();$('roundTitle').textContent=p.label+' 完成';$('roundTitle').style.color=playerColor(p,roundIndex);$('roundScore').textContent=score+' 分';$('stats').textContent=`猜中 ${correct} · 跳过 ${passed}${penalty?'（扣 '+passed+' 分）':''}`;$('board').innerHTML=results.map((r,i)=>`<div class="row"><span style="color:${playerColor(r,i)}">${escapeHTML(r.label)}</span><strong>${r.score} 分</strong></div>`).join('');renderRoundReview();const next=players[roundIndex+1];const btn=$('nextPlayer');btn.replaceChildren();if(next){setRoleButton(btn,players,next);$('nextGuessNotice').textContent=next.label+' 准备猜词'}else{btn.textContent='查看最终排名';$('nextGuessNotice').textContent='所有玩家已完成，准备查看最终成绩'}if(timedOut){
  sound.feedback('roundEnd');
  if(landscape()&&!reduceMotion.matches){
   await playRoundTransition();
   return;
  }
 }
 screen('between');
 $('roundTransition').hidden=true;
}
async function playRoundTransition(){
 const transition=$('roundTransition');
 transition.hidden=false;
 const fade=transition.animate([{opacity:0},{opacity:1}],{duration:145,easing:'ease-out',fill:'both'});
 try{await fade.finished}catch{}
 screen('between');
 transition.hidden=true;
 fade.cancel();
 $('between').animate([{opacity:0},{opacity:1}],{id:'round-summary-in',duration:155,easing:'ease-out'});
}
function rank(){
 if(mode==='solo'){
  const ranking=results.map((r,i)=>({name:r.label,team:r.team,color:playerColor(r,i),score:r.score,members:[r]}));
  return {ranking:ranking.sort((a,b)=>b.score-a.score),average:false};
 }
 const groups=new Map();
 for(const {team} of players){
  if(!groups.has(team))groups.set(team,{name:team,team,size:0,members:[],score:0});
  groups.get(team).size++;
 }
 const ranking=[...groups.values()];
 const average=new Set(ranking.map(group=>group.size)).size>1;
 for(const result of results){
  const group=groups.get(result.team);
  group.members.push(result);
  group.score+=result.score;
 }
 if(average)for(const group of ranking)group.score/=group.size;
 return {ranking:ranking.sort((a,b)=>b.score-a.score),average};
}
function rankingPosition(ranking,entry){return ranking.findIndex(other=>other.score===entry.score)+1}
function scoreText(score){return String(Number(score.toFixed(3)))}
function matchWinner(ranking){
 const high=ranking[0]?.score??0,winners=ranking.filter(r=>r.score===high);
 return winners.map(r=>r.name).join('、')+(winners.length>1?' 并列第一':' 获胜');
}
function recordMatch(){
 DATA.checkpoint=null;
 const {ranking,average}=rank();
 DATA.matches.push({date:new Date().toISOString(),mode,players:players.length,winner:matchWinner(ranking),...(average?{scoring:'average'}:{}),results:results.map(r=>({...r}))});
 DATA.save();
}
function podiumColor(entry){
 return entry.color||teamColor(entry.team);
}
function podiumTagStyle(entry){
 const accent=podiumColor(entry);
 const channels=accent.slice(1).match(/.{2}/g).map(hex=>parseInt(hex,16)/255);
 const luminance=channels.reduce((sum,value,index)=>{
  const linear=value<=.04045?value/12.92:((value+.055)/1.055)**2.4;
  return sum+linear*[.2126,.7152,.0722][index];
 },0);
 return `--accent:${accent};--accent-ink:${luminance>.179?'#000':'#fff'}`;
}
function finishFinalReveal(ranking){
 const final=$('final');
 $('podiumReveal').hidden=true;
 final.classList.remove('revealing');
 final.classList.add('championRevealed');
 $('winner').textContent=matchWinner(ranking);
 sound.feedback('champion');
 vibrate([32,26,30,25,32,22,42,28,54,33,77]);
 celebrateFinal();
}
async function showFinal(){
 sound.unlock();
 setPhase(STATES.FINAL);
 const final=$('final');
 final.classList.remove('championRevealed');
 const {ranking,average}=rank();
 const unit=average?'均分':'分';
 const finalists=ranking.length>=3?[ranking[1],ranking[0],ranking[2]]:ranking.slice(0,2);
 final.dataset.podiumCount=String(finalists.length);
 const place=entry=>rankingPosition(ranking,entry);
 const tiedFirst=ranking.filter(r=>r.score===ranking[0]?.score).length>1;
 const members=r=>mode==='solo'
  ? `<span>猜中 ${r.members[0]?.correctCount||0} · 跳过 ${r.members[0]?.passed||0}</span>`
  : r.members.map(p=>`<div class="podiumMember"><span>${escapeHTML(p.label.replace(/^.*? · /,''))}</span><b>${p.score}<small> 分</small></b></div>`).join('');
 const teamName=r=>`<div class="podiumName">${escapeHTML(r.name)}</div>`;
 const crown=label=>`<svg viewBox="0 0 28 24" role="img" aria-label="${label}" fill="currentColor"><path d="M2 5l7 6 5-9 5 9 7-6-3 14H5L2 5Zm4 16h16v2H6z"/></svg>`;
 const slots=finalists.map(r=>{
  const position=place(r);
  const champion=position===1;
  const caption=champion?(tiedFirst?'并列冠军':'冠军'):`第 ${position} 名`;
  return `<section class="podiumSlot ${r===ranking[0]?'first':r===ranking[1]?'second':'third'}" style="${podiumTagStyle(r)}">
    <div class="podiumCard">
      <div class="podiumPosition${champion?' podiumChampionHeading':''}">${champion?crown(caption):`<span class="podiumPlace">${caption}</span>`}
      ${teamName(r)}</div>
      <div class="podiumScore">${scoreText(r.score)}<small> ${unit}</small></div>
      <div class="podiumMembers">${members(r)}</div>
    </div>
  </section>`;
 });
 const others=ranking.slice(3).map(r=>`<div class="podiumOther" style="${podiumTagStyle(r)}">
   <div class="podiumOtherMain"><span class="podiumPlace">第 ${place(r)} 名</span>${teamName(r)}<div class="podiumMembers">${members(r)}</div></div>
   <div class="podiumScore">${scoreText(r.score)}<small> ${unit}</small></div>
 </div>`).join('');
 $('winner').textContent='';
 $('finalSubtitle').textContent=`${results.length} 人完成 · ${mode==='solo'?'个人得分排名':average?'按各组平均分排名':'按各组总分排名'}`;
 $('finalCards').innerHTML=`<div class="podiumTop">${slots.join('')}</div>${others?`<div class="podiumOthers">${others}</div>`:''}`;
 $('finalCards').scrollTop=0;
 $('celebration').replaceChildren();

 if(reduceMotion.matches){
  screen('final');
  finishFinalReveal(ranking);
  return;
 }
 const scores=finalists.map(r=>r.score);
 const high=Math.max(0,...scores);
 const low=Math.min(0,...scores);
 const range=high-low||1;
 const zero=high===low?50:6+88*high/range;
 const chart=$('podiumBars');
 chart.style.setProperty('--zero',`${zero}%`);
 chart.innerHTML=finalists.map(r=>{
  const height=Math.abs(r.score)*88/range;
  const top=r.score>=0?zero-height:zero;
  return `<span class="podiumTrack" style="${podiumTagStyle(r)}"><i class="podiumBar ${r.score<0?'negative':''}" style="--bar-top:${top}%;--bar-height:${height}%"></i></span>`;
 }).join('');
 $('podiumLabels').innerHTML=finalists.map(r=>
  `<span style="${podiumTagStyle(r)}">${escapeHTML(r.name)}</span>`).join('');
 final.classList.add('revealing');
 $('podiumReveal').hidden=false;
 screen('final');

 const animations=[...chart.querySelectorAll('.podiumBar')].map(bar=>bar.animate(
  [{transform:'scaleY(0)'},{transform:'scaleY(1)'}],
  {duration:1080,easing:'cubic-bezier(.22,.72,.26,1)',fill:'both'},
 ));
 await Promise.allSettled(animations.map(animation=>animation.finished));
 finishFinalReveal(ranking);
}
function celebrateFinal(){
 const bursts=[{x:8,direction:1,delay:0},{x:92,direction:-1,delay:170},
  {x:13,direction:1,delay:480},{x:87,direction:-1,delay:760}];
 sound.confetti(bursts.map(burst=>burst.delay));
 if(reduceMotion.matches)return;
 const colors=['#ff5570','#ffd16b','#71dfd2','#5c9fff','#d899ff','#fff2ce'];
 const layer=$('celebration');
 for(const {x,direction,delay} of bursts){
  const burst=document.createElement('span');
  burst.className='confettiBurst';
  burst.style.left=x+'%';
  for(let i=0;i<22;i++){
   const piece=document.createElement('i');
   const spread=18+(i*19)%44;
   const rise=29+(i*13)%51;
   piece.style.setProperty('--confetti-x',`${direction*spread}vmin`);
   piece.style.setProperty('--confetti-y',`-${rise}vmin`);
   piece.style.setProperty('--confetti-turn',`${direction*(280+(i*47)%510)}deg`);
   piece.style.setProperty('--confetti-delay',`${delay+(i%4)*12}ms`);
   piece.style.setProperty('--confetti-duration',`${1150+(i*73)%570}ms`);
   piece.style.background=colors[i%colors.length];
   burst.append(piece);
  }
  layer.append(burst);
 }
}
function renderFireworks(layer,bursts){
 layer.replaceChildren();
 if(reduceMotion.matches)return;
 for(const {x,y,delay,count,radius,colors} of bursts){
  const burst=document.createElement('span');
  burst.className='celebrationBurst';
  burst.style.setProperty('--burst-x',`${x}%`);
  burst.style.setProperty('--burst-y',`${y}%`);
  burst.style.setProperty('--burst-delay',`${delay}ms`);
  burst.style.setProperty('--burst-radius',radius);
  burst.style.setProperty('--burst-color',colors[1]);
  for(let index=0;index<count;index++){
   const spark=document.createElement('i');
   const angle=(index+(index%2?0.18:-0.18))*2*Math.PI/count;
   const reach=radius*(0.65+((index*7)%11)*0.045);
   const duration=1130+((index*37)%260);
   spark.style.setProperty('--spark-x',Math.cos(angle)*reach);
   spark.style.setProperty('--spark-y',Math.sin(angle)*reach);
   spark.style.setProperty('--spark-angle',`${angle}rad`);
   spark.style.setProperty('--spark-color',colors[index%colors.length]);
   spark.style.setProperty('--spark-duration',`${duration}ms`);
   burst.append(spark);
  }
  layer.append(burst);
 }
}
function updateWordWarning(){
 const words=selectedWords();
 const fresh=words.filter(({w})=>!DATA.seen.has(wordKey(w))).length;
 const seconds=Number($('duration').value)===1?3:Number($('duration').value)*60;
 // Allow one initial word per turn, then budget roughly one every eight seconds.
 const target=getRoster().length*Math.ceil(seconds/8);
 const warning=fresh<target;
 $('launchWordWarning').hidden=!warning;
 $('launchReuseLabel').hidden=!warning||words.length===fresh;
 $('launchWordWarningText').textContent=words.length
  ?`新词剩余 ${fresh} 个，预计本局需要约 ${target} 个。`
  :'所选类别暂无词语，请回到竖屏补选。';
}
function renderSavedMatch(){
 const checkpoint=phase===STATES.SETUP?DATA.checkpoint:null;
 const summary=checkpoint
  ?`未完成对局 · 已完成 ${checkpoint.results.length} / ${checkpoint.players.length} 人`
  :'';
 for(const prefix of ['setup','launch']){
  $(prefix+'SavedMatch').hidden=!checkpoint;
  $(prefix+'SavedSummary').textContent=summary;
 }
 $('landscapeLaunchButton').hidden=Boolean(checkpoint);
}
function resumeSavedMatch(){
 const saved=DATA.checkpoint;
 if(phase!==STATES.SETUP||!saved)return;
 ({mode,players,results,duration,penalty,teamColors,allowReuse}=saved);
 selected=new Set(saved.categories.filter(name=>Object.hasOwn(BANK,name)));
 matchWords=new Set(saved.used);
 roundIndex=results.length;
 deck=[];
 $('passHint').textContent=penalty?'− 1 分':'不扣分';
 beginRound();
}
function discardSavedMatch(){
 const saved=DATA.checkpoint;
 if(!saved)return;
 const player=saved.players[saved.results.length];
 addAudit({player:player.label,team:player.team,roundIndex:saved.results.length,
  secondsRemaining:saved.duration,score:0,correctCount:0,passed:0,words:[],currentWord:null,
  completedRounds:saved.results});
 syncLaunch();
 renderHistoryStats();
}
function startGame(){
 if(phase!==STATES.SETUP||!landscape()||DATA.checkpoint)return;
 if(!selected.size)return showMessage('请至少选择一个类别');
 saveNameInputs();
 mode=selectedMode();
 players=getRoster();
 results=[];
 roundIndex=0;
 matchWords=new Set();
 allowReuse=!$('launchReuseLabel').hidden&&$('reuseWords').checked;
 penalty=$('penalty').checked;
 duration=Number($('duration').value)===1?3:Number($('duration').value)*60;
 $('passHint').textContent=penalty?'− 1 分':'不扣分';
 buildDeck();
 if(!deck.length)return showMessage('所选类别没有可用词语，请补选类别或允许复用旧词。');
 rememberSettings();
 saveCheckpoint();
 beginRound();
}
function newGame(){clearClock();vibrate(0);phase=STATES.SETUP;results=[];roundIndex=0;players=[];matchWords=new Set();$('reuseWords').checked=false;remaining=0;word=null;undoStack=[];$('pauseOverlay').classList.remove('on');$('countdownOverlay').classList.remove('on');randomColors();configTeams();screen('setup');renderCats()}
function addAudit(details,event='game_ended'){
 DATA.checkpoint=null;
 DATA.audit.push({id:event+'-'+Date.now()+'-'+Math.random().toString(36).slice(2),
  date:new Date().toISOString(),event,...details});
 DATA.save();
}
function audit(event){
 const player=currentPlayer()||{};
 addAudit({player:player.label||'',team:player.team||null,roundIndex,
  secondsRemaining:Math.ceil(remaining/1000),score,correctCount:correct,passed,
  words:roundWords.map(x=>({...x})),currentWord:word?.w||null,completedRounds:results.map(r=>({...r}))},event);
}
function canEndGame(){
 return phase===STATES.PAUSED||(phase===STATES.ROUND_END&&screenId==='between');
}
function renderPortrait(){const count=$('portraitProgressCount'),list=$('portraitProgressList');if(!count||!list)return;$('portraitEnd').disabled=!canEndGame();count.textContent=`已完成 ${results.length} / ${players.length} 人`;list.replaceChildren();if(!results.length){const empty=document.createElement('div');empty.className='portraitProgressEmpty';empty.textContent='暂无已完成的玩家';list.append(empty)}results.forEach((r,i)=>{const item=document.createElement('div');item.className='portraitProgressItem';const name=document.createElement('span');name.className='portraitProgressName';name.textContent=`${i+1}. ${r.label}`;name.style.color=playerColor(r,i);const points=document.createElement('span');points.className='portraitProgressScore';points.textContent=r.score+' 分';item.append(name,points);list.append(item)})}
function renderOrientation(){const portrait=!landscape(),active=phase!==STATES.SETUP&&phase!==STATES.FINAL&&['game','between'].includes(screenId);if(portrait&&active&&(phase===STATES.RUNNING||phase===STATES.COUNTDOWN))pause();document.body.classList.toggle('playing',active||screenId==='final');document.body.classList.toggle('portraitProgressActive',portrait&&active);renderPortrait();const label=portrait?'请横屏后开始':(getRoster()[0]?.label||'玩家1')+' 开始猜';for(const id of ['start','startTop']){const button=$(id);button.disabled=portrait;button.querySelector('.startLabel').textContent=label}}
function roleNames(roster,guess){
 if(!guess)return {description:'',guess:'玩家1'};
 if(!guess.team)return {description:'',guess:guess.label};
 const mates=roster.filter(p=>p.team===guess.team);
 const pos=mates.findIndex(p=>p.key===guess.key);
 const describer=mates.length>1?mates[(pos+1)%mates.length]:null;
 return {description:describer?.label||'',guess:guess.label};
}
function setRoleButton(button,roster,guess){
 const roles=roleNames(roster,guess);
 button.replaceChildren();
 const color=playerColor(guess);
 const addLine=(person,verb,cls)=>{
  const line=document.createElement('span');line.className=cls;
  const name=document.createElement('span');name.className='rolePerson';name.textContent=person;name.style.color=color;
  const action=document.createElement('span');action.className='roleAction';action.textContent=' '+verb;
  line.append(name,action);button.append(line);
 };
 if(roles.description)addLine(roles.description,'准备描述','nextButtonDesc');
 addLine(roles.guess,'准备猜','nextButtonGuess');
}
function syncLaunch(){const active=phase===STATES.SETUP&&screenId==='setup'&&landscape();$('landscapeLaunch').classList.toggle('active',active);renderSavedMatch();if(!active)return;clearSwapSelection();updateWordWarning();$('launchModeValue').textContent=selectedMode()==='solo'?'各自为战':`分组对战 · ${$('teamCount').value}组`;$('launchDurationValue').textContent=Number($('duration').value)===1?'测试模式 · 3 秒':$('duration').value+' 分钟';$('launchPenaltyValue').textContent=$('penalty').checked?'扣 1 分':'不扣分';const first=getRoster()[0];setRoleButton($('landscapeLaunchButton'),getRoster(),first)}
function renderHistoryStats(){$('historyInfo').textContent=`已出现 ${DATA.seen.size} / ${allWordSet.size} 词 · 历史 ${DATA.matches.length} 局`}
function refreshHistory(){renderHistoryStats();$('historyStats').textContent=$('historyInfo').textContent;const list=$('historyList');list.replaceChildren();if(!DATA.matches.length){list.innerHTML='<div class="sub">暂无已完成对局</div>'}for(const g of [...DATA.matches].reverse()){const details=document.createElement('details'),summary=document.createElement('summary'),head=document.createElement('span'),winner=document.createElement('strong');head.textContent=(g.date?new Date(g.date).toLocaleString('zh-CN'):'未知日期')+' · '+(g.mode==='team'?'分组':'个人')+' · '+(g.players||g.results?.length||0)+'人'+(g.scoring==='average'?' · 按平均分排名':'');winner.textContent=g.winner||'查看记录';summary.append(head,winner);details.append(summary);const rounds=document.createElement('div');rounds.className='historyRounds';for(const [i,r] of (g.results||[]).entries()){const section=document.createElement('section');section.className='historyPlayer';const title=document.createElement('div');title.className='historyPlayerHead';title.textContent=`#${i+1} · ${r.label||'玩家'} · ${r.score??0} 分（猜中 ${r.correctCount??0} / 跳过 ${r.passed??0}）`;const words=document.createElement('div');words.className='historyWords';for(const [j,w] of (r.words||[]).entries()){const item=document.createElement('div');item.className='historyWord '+(w.kind==='correct'?'correct':'pass');const name=document.createElement('span');name.textContent=(j+1)+'. '+(w.word||w.simplified||'未知词')+(w.traditional&&w.traditional!==w.word?' / '+w.traditional:'');const status=document.createElement('strong');status.textContent=w.kind==='correct'?'✓ 猜中':'× 跳过';item.append(name,status);words.append(item)}if(!r.words?.length)words.textContent='此回合没有逐词明细';section.append(title,words);rounds.append(section)}details.append(rounds);list.append(details)}if(DATA.audit.length){const section=document.createElement('details');const title=document.createElement('summary');title.textContent='中断 / 重来日志（'+DATA.audit.length+' 条）';section.append(title);for(const a of DATA.audit.slice(-30).reverse()){const row=document.createElement('div');row.className='row';row.textContent=`${a.date||''} · ${a.player||'玩家'} · ${a.event==='game_ended'?'结束游戏':'重来本轮'} · ${a.score||0}分`;section.append(row)}list.append(section)}}
function exportData(){const blob=new Blob([JSON.stringify(DATA.backup(),null,2)],{type:'application/json;charset=utf-8'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='滑动猜词_全部记录_'+new Date().toISOString().slice(0,10)+'.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000)}
function progress(p,msg){$('importWork').classList.add('on');$('importWorkFill').style.width=p+'%';$('importWorkPercent').textContent=Math.round(p)+'%';$('importWorkStage').textContent=msg}
function closeImportWork(){clearTimeout(importTimeout);$('importWork').classList.remove('on');importReader=null}
function importFile(file){$('importFile').value='';if(!file)return;if(file.size>12*1024*1024){showMessage('文件超过 12MB');return}pendingImport=null;progress(2,'准备读取 '+file.name);const reader=new FileReader();importReader=reader;importTimeout=setTimeout(()=>{if(reader.readyState===1)reader.abort();closeImportWork();showMessage('文件读取超时，请尝试从本地「文件」App 选择 JSON')},30000);reader.onprogress=e=>{if(e.lengthComputable)progress(5+Math.round(e.loaded/e.total*55),`正在读取 ${Math.round(e.loaded/1024)} / ${Math.round(e.total/1024)} KB`)};reader.onerror=()=>{closeImportWork();showMessage('文件读取失败')};reader.onabort=()=>closeImportWork();reader.onload=()=>{try{progress(65,'正在解析 JSON');const parsed=JSON.parse(reader.result);progress(80,'正在检查数据');const valid=DATA.validateBackup(parsed);const existing=new Set(DATA.matches.map(g=>DATA.fingerprint(g))),auditIds=new Set(DATA.audit.map(x=>x.id));const addedWords=[...valid.seen].filter(w=>!DATA.seen.has(wordKey(w)));const newMatches=valid.matches.filter(g=>!existing.has(DATA.fingerprint(g)));const newAudit=valid.audit.filter(a=>!auditIds.has(a.id));pendingImport={seen:new Set(addedWords),matches:newMatches,audit:newAudit};$('importSummary').textContent=`文件版本：${parsed.version}\n新增已用词：${addedWords.length}\n新增对局：${newMatches.length}\n新增中断日志：${newAudit.length}\n确认后合并，不清空现有记录。`;$('importSummary').style.whiteSpace='pre-line';progress(100,'检查完成');closeImportWork();$('importPreview').classList.add('on')}catch(e){closeImportWork();showMessage('导入失败：'+e.message)}finally{$('importFile').value=''}};reader.readAsText(file,'UTF-8')}
function shareResult(){
 const {ranking,average}=rank();
 if(!ranking.length)return;
 const canvas=document.createElement('canvas');
 const width=720,pad=42,content=width-pad*2,row=56;
 const members=mode==='team'?ranking:[];
 const detailsHeight=members.reduce((height,entry)=>height+55+entry.members.length*34,0);
 canvas.width=width;
 canvas.height=Math.max(980,310+ranking.length*row+detailsHeight+64);
 const c=canvas.getContext('2d');
 const text=(value,x,y,size,color='#f6f2eb',weight=700,align='left',maxWidth=content)=>{
  c.font=`${weight} ${size}px -apple-system, sans-serif`;
  c.fillStyle=color;
  c.textAlign=align;
  c.fillText(value,x,y,maxWidth);
 };
 const card=(x,y,w,h,color)=>{
  c.fillStyle=color;
  c.beginPath();
  c.roundRect(x,y,w,h,16);
  c.fill();
 };
 const unit=average?'均分':'分';
 c.fillStyle='#080808';
 c.fillRect(0,0,width,canvas.height);
 c.fillStyle='#e5b866';
 c.fillRect(pad,42,36,4);
 text('滑动猜词 · 最终成绩',pad,78,23,'#c9c2b6');
 card(pad,99,content,145,'#251e14');
 text(matchWinner(ranking),pad+22,158,38,'#ffedd0',850,'left',content-44);
 text(`${scoreText(ranking[0].score)} ${unit}`,pad+22,205,30,'#efbc6a',850);
 text(mode==='solo'?'个人排名':average?'队伍平均分':'队伍总分',width-pad-22,205,20,'#cfbb9c',600,'right');
 let y=285;
 text('名次',pad,y,22,'#bbb');
 y+=16;
 for(const entry of ranking){
  card(pad,y,content,row-8,'#191919');
  c.fillStyle=podiumColor(entry);
  c.fillRect(pad+12,y+12,4,row-32);
  text(String(rankingPosition(ranking,entry)),pad+28,y+32,22,'#bcbcbc');
  text(entry.name,pad+70,y+32,24,'#f6f2eb',750,'left',content-250);
  text(`${scoreText(entry.score)} ${unit}`,width-pad-14,y+32,23,'#f6f2eb',800,'right',164);
  y+=row;
 }
 if(members.length){
  text('成员明细',pad,y+28,22,'#bbb');
  y+=45;
  for(const entry of members){
   text(entry.name,pad,y+23,21,podiumColor(entry),800);
   y+=36;
   for(const player of entry.members){
    text(player.label.replace(/^.*? · /,''),pad+12,y+19,19,'#ddd',600,'left',content-130);
    text(player.score+' 分',width-pad,y+19,19,'#fff',750,'right',100);
    y+=34;
   }
   y+=19;
  }
 }
 canvas.toBlob(async blob=>{
  if(!blob)return showMessage('无法生成图片');
  const file=new File([blob],'滑动猜词_成绩.png',{type:'image/png'});
  try{
   if(navigator.canShare?.({files:[file]})){
    await navigator.share({files:[file],title:'滑动猜词成绩'});
    return;
   }
  }catch(e){if(e.name==='AbortError')return}
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;
  a.download=file.name;
  a.click();
  setTimeout(()=>URL.revokeObjectURL(url),5000);
 },'image/png');
}
function upgradeSteppers(){document.querySelectorAll('#teamCount,#soloCount,#duration,#teamConfig input[type="number"]').forEach(input=>{if(input.dataset.stepperReady)return;input.dataset.stepperReady='1';const wrap=document.createElement('span');wrap.className='numberStepper';input.parentNode.insertBefore(wrap,input);wrap.append(input);input.readOnly=true;input.setAttribute('inputmode','none');for(const [delta,symbol,cls] of [[-1,'−','stepMinus'],[1,'+','stepPlus']]){const btn=document.createElement('button');btn.type='button';btn.className=cls;btn.textContent=symbol;btn.addEventListener('click',e=>{e.preventDefault();const lo=Number(input.min||1),hi=Number(input.max||30);input.value=String(Math.max(lo,Math.min(hi,Number(input.value)+delta)));input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}))});if(delta<0)wrap.insertBefore(btn,input);else wrap.append(btn)}if(input.id==='duration'){const sync=()=>wrap.classList.toggle('testDuration',Number(input.value)===1);input.addEventListener('input',sync);sync()}})}

// 词库唯一数据层：内置 BANK + 用户新增 + 手动删除。只在设置页编辑。
const WORDS_KEY='guess_wordbank_custom_v1';
const WORDS_FORMAT='flip-guess-wordbank';
const WORDS_PROMPT=`请为我的中文猜词游戏生成可导入的词库 JSON 文件。只输出合法 JSON，不要 Markdown 代码块。格式严格为：\n{ "format": "flip-guess-wordbank", "version": 1, "categories": [ { "name": "类别名称", "words": [ { "simplified": "简体词", "traditional": "繁體詞" } ] } ] }\n要求：每个词适合口头描述和猜词；简体与繁体一一对应；不要重复；已有类别可沿用其名称，新类别可自拟；不要包含删除指令。请根据我随后提供的主题和数量生成。`;
let WORDS={added:Object.create(null),removed:[],trad:Object.create(null),extraCategories:[]};
function wordKey(v){return String(v||'').normalize('NFKC').trim()}
function wordEdits(data){
 return {
  added:Object.assign(Object.create(null),data.added),
  removed:Array.isArray(data.removed)?data.removed.filter(w=>typeof w==='string'):[],
  trad:Object.assign(Object.create(null),data.trad),
  extraCategories:Array.isArray(data.extraCategories)?data.extraCategories.filter(n=>typeof n==='string'&&n.trim()):[]
 };
}
function loadWords(){
 const saved=storage.load(WORDS_KEY,{},value=>value&&typeof value==='object'&&!Array.isArray(value));
 WORDS=wordEdits(saved);
 rebuildWords();
}
function commitWords(edit){
 const next=wordEdits(WORDS);
 for(const name of Object.keys(next.added))next.added[name]=Array.isArray(next.added[name])?next.added[name].slice():[];
 edit(next);
 if(!storage.save(WORDS_KEY,{version:1,...next}))throw Error('无法保存词库，请检查本机存储。');
 WORDS=next;
 rebuildWords();
}
function rebuildWords(){
 const removed=new Set(WORDS.removed.map(wordKey));const seen=new Set();
 for(const name of Object.keys(BANK)){
  const base=Object.hasOwn(BASE_WORDS,name)?BASE_WORDS[name]:[];BANK[name]=base.filter(w=>{const key=wordKey(w);if(removed.has(key)||seen.has(key))return false;seen.add(key);return true})
 }
 for(const name of WORDS.extraCategories)if(typeof name==='string'&&name.trim()&&!Object.hasOwn(BANK,name))BANK[name]=[];
 for(const [name,items] of Object.entries(WORDS.added)){
  if(!Object.hasOwn(BANK,name))BANK[name]=[];
  if(!Array.isArray(items))continue;
  for(const raw of items){const w=wordKey(raw);if(!w||removed.has(w)||seen.has(w))continue;BANK[name].push(w);seen.add(w)}
 }
 allWordSet.clear();for(const w of seen)allWordSet.add(w);
 for(const name of [...selected])if(!Object.hasOwn(BANK,name))selected.delete(name);
}
const BASE_WORDS=Object.fromEntries(Object.entries(BANK).map(([name,words])=>[name,[...words]]));
function addCategory(name){name=String(name||'').trim();if(!name||name.length>32)throw Error('类别名称需要 1–32 字');if(Object.hasOwn(BANK,name))return false;commitWords(next=>next.extraCategories.push(name));selected.add(name);return true}
function addWord(name,simplified,traditional){
 const w=wordKey(simplified),t=wordKey(traditional)||w;
 if(!Object.hasOwn(BANK,name))throw Error('类别不存在');
 if(!w||w.length>80||t.length>80)throw Error('词语需为 1–80 字');
 if(Object.values(BANK).some(items=>items.some(item=>wordKey(item)===w)))return false;
 commitWords(next=>{
  next.removed=next.removed.filter(item=>wordKey(item)!==w);
  (next.added[name]??=[]).push(w);
  if(t!==w)next.trad[w]=t;
 });
 return true;
}
function deleteWord(name,w){
 if(!BANK[name]?.includes(w))return;
 commitWords(next=>next.removed.push(wordKey(w)));
}
function wordTraditional(w){
 if(typeof WORDS.trad[w]==='string'&&WORDS.trad[w])return WORDS.trad[w];
 if(Object.hasOwn(TAIWAN_ALIASES,w))return TAIWAN_ALIASES[w];
 return Object.hasOwn(TRAD,w)?TRAD[w]:w;
}
function exportWordBank(){const categories=Object.entries(BANK).map(([name,words])=>({name,words:words.map(w=>({simplified:w,traditional:wordTraditional(w)}))}));downloadJSON({format:WORDS_FORMAT,version:1,categories},'滑动猜词_完整词库.json')}
function downloadJSON(obj,name){const url=URL.createObjectURL(new Blob([JSON.stringify(obj,null,2)],{type:'application/json;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000)}
function importWordBank(obj){
 if(!obj||obj.format!==WORDS_FORMAT||obj.version!==1||!Array.isArray(obj.categories))throw Error('格式不符：需要 flip-guess-wordbank v1');
 if(obj.categories.length>100)throw Error('类别过多');
 const proposals=[];let ignored=0;const existing=new Set(Object.values(BANK).flat().map(wordKey));
 for(const cat of obj.categories){if(!cat||typeof cat.name!=='string'||!Array.isArray(cat.words))throw Error('类别格式错误');const name=cat.name.trim();if(!name||name.length>32||cat.words.length>10000)throw Error('类别名称或词数超限');
  for(const item of cat.words){if(!item||typeof item.simplified!=='string'||(item.traditional!==undefined&&typeof item.traditional!=='string'))throw Error('词条必须包含 simplified 字符串，可选 traditional');const w=wordKey(item.simplified),t=wordKey(item.traditional)||w;if(!w||w.length>80||t.length>80)throw Error('词条为空或过长');if(existing.has(w)){ignored++;continue}existing.add(w);proposals.push({name,w,t})}
 }
 const categoryNames=obj.categories.map(c=>c.name.trim()).filter(n=>!Object.hasOwn(BANK,n));
 const message=`将新增 ${proposals.length} 个词、${new Set(categoryNames).size} 个类别；跳过 ${ignored} 个重复词。\n导入只添加，不会删除原词。确定导入吗？`;
 askWordManager(message,()=>applyWordBankImport(proposals,categoryNames,ignored));
}
function applyWordBankImport(proposals,categoryNames,ignored){
 commitWords(next=>{
  next.extraCategories.push(...new Set(categoryNames));
  const restored=new Set(proposals.map(({w})=>w));
  next.removed=next.removed.filter(w=>!restored.has(wordKey(w)));
  for(const {name,w,t} of proposals){
   (next.added[name]??=[]).push(w);
   if(t!==w)next.trad[w]=t;
  }
 });
 categoryNames.forEach(name=>selected.add(name));
 renderCats();renderWordManager();wordManagerMessage(`导入完成：新增 ${proposals.length} 词，跳过 ${ignored} 个重复词`)

}
let wordManagerPending=null;
function askWordManager(message,onYes,destructive=false){
 wordManagerPending=onYes;
 $('wmConfirmTitle').textContent=destructive?'删除词语？':'导入词库？';
 $('wmConfirmText').textContent=message;
 $('wmConfirmYes').textContent=destructive?'确认删除':'确认导入';
 $('wmConfirmYes').classList.toggle('danger',destructive);
 $('wmConfirm').classList.toggle('destructiveConfirm',destructive);
 $('wmConfirm').hidden=false;
 $('wmConfirmCancel').focus({preventScroll:true});
}
function closeWordManagerConfirm(){wordManagerPending=null;$('wmConfirm').hidden=true}
function wordManagerMessage(message){$('wmStatus').textContent=message}
function renderWordManager(){const picker=$('wmCategory'),before=picker.value;picker.replaceChildren();for(const name of Object.keys(BANK)){const o=document.createElement('option');o.value=name;o.textContent=`${name}（${BANK[name].length}）`;picker.append(o)}if(Object.hasOwn(BANK,before))picker.value=before;const name=picker.value,query=wordKey($('wmSearch').value).toLowerCase();const items=(BANK[name]||[]).filter(w=>!query||w.toLowerCase().includes(query)||wordTraditional(w).toLowerCase().includes(query));$('wmStatus').textContent=`${name||'暂无类别'} · 共 ${BANK[name]?.length||0} 词 · 显示 ${items.length} 词`;
 const list=$('wmList');list.replaceChildren();const shown=items.slice(0,400);if(items.length>400)$('wmStatus').textContent+=` · 为保持流畅仅显示前 400 条，请搜索定位其余词语`;for(const w of shown){const item=document.createElement('div');item.className='wmItem';const label=document.createElement('span');label.textContent=w;const t=wordTraditional(w);if(t!==w){const sub=document.createElement('small');sub.textContent=t;label.append(sub)}const btn=document.createElement('button');btn.type='button';btn.textContent='删除';btn.addEventListener('click',()=>askWordManager(`确定从「${name}」删除「${w}」？`,()=>{deleteWord(name,w);renderCats();renderWordManager();wordManagerMessage(`已删除「${w}」`)},true));item.append(label,btn);list.append(item)}}
function bindWordManager(){
 $('wmConfirmCancel').addEventListener('click',closeWordManagerConfirm);
 $('wmConfirmYes').addEventListener('click',()=>{const fn=wordManagerPending;closeWordManagerConfirm();if(fn){try{fn()}catch(e){wordManagerMessage('操作失败：'+e.message)}}});
 $('manageWords').addEventListener('click',()=>{if(phase!==STATES.SETUP)return;screen('wordManager');renderWordManager()});
 $('wmBack').addEventListener('click',()=>{screen('setup');renderCats()});
 $('wmCategory').addEventListener('change',renderWordManager);
 const search=$('wmSearch'),clearSearch=$('wmSearchClear');
 search.addEventListener('input',()=>{
  clearSearch.hidden=!search.value;
  renderWordManager();
 });
 clearSearch.addEventListener('click',()=>{
  search.value='';
  search.focus({preventScroll:true});
  clearSearch.hidden=true;
  renderWordManager();
 });
 const createPanel=$('wmCreate'),createName=$('wmCategoryName');
 $('wmNewCategory').addEventListener('click',()=>{createPanel.hidden=false;createName.focus();$('wmStatus').textContent='输入名称后点击「确认创建」';});
 $('wmCreateCancel').addEventListener('click',()=>{createPanel.hidden=true;createName.value='';renderWordManager()});
 const createCategory=()=>{const name=createName.value.trim();try{if(!addCategory(name)){ $('wmStatus').textContent='该类别已存在：'+name;return}createPanel.hidden=true;createName.value='';renderCats();renderWordManager();$('wmCategory').value=name;$('wmSearch').value='';renderWordManager();$('wmStatus').textContent='已创建类别：'+name}catch(e){$('wmStatus').textContent='创建失败：'+e.message}};
 $('wmCreateConfirm').addEventListener('click',createCategory);
 createName.addEventListener('keydown',e=>{if(e.key==='Enter')createCategory()});
 $('wmAddWord').addEventListener('click',()=>{try{const category=$('wmCategory').value,word=$('wmHans').value.trim();if(!addWord(category,word,$('wmHant').value)){wordManagerMessage('词语已存在，未重复添加：'+word);return}$('wmHans').value='';$('wmHant').value='';renderCats();renderWordManager();wordManagerMessage(`已添加「${word}」到「${category}」`);}catch(e){wordManagerMessage(e.message)}});
 $('wmExport').addEventListener('click',exportWordBank);$('wmImport').addEventListener('click',()=>$('wmFile').click());
 $('wmFile').addEventListener('change',async e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;if(file.size>4*1024*1024){$('wmStatus').textContent='词库文件不得超过 4 MB';return}try{$('wmStatus').textContent='正在读取并检查词库文件…';const obj=JSON.parse(await file.text());importWordBank(obj)}catch(err){$('wmStatus').textContent='词库导入失败：'+err.message}});
 $('wmPrompt').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(WORDS_PROMPT);$('wmPromptText').hidden=true;showMessage('已复制 AI 扩词提示词')}catch{const text=$('wmPromptText');text.hidden=false;text.value=WORDS_PROMPT;text.focus();text.select();wordManagerMessage('请手动复制下方提示词')}});
}
function bindContinue(id,advance){
 const button=$(id);
 button.addEventListener('click',async()=>{
  if(button.disabled||button.hasAttribute('data-rebounding'))return;
  if(reduceMotion.matches){advance();return}
  sound.unlock();
  const currentClip=getComputedStyle(button).clipPath;
  button.setAttribute('data-rebounding','true');
  const rebound=button.animate([
   {clipPath:currentClip},
   {clipPath:'inset(3% 1.75% round var(--continue-corner,999px))',offset:.3},
   {clipPath:'inset(0 round var(--continue-corner,999px))'},
  ],{id:'continue-rebound',duration:145,easing:'ease-out'});
  try{await rebound.finished}catch{}
  button.removeAttribute('data-rebounding');
  advance();
 });
}
function bindSetupDetails(){
 const setup=$('setup');
 const details=$('setupDetails');
 const trigger=$('revealSetupDetails');
 const active=()=>screenId==='setup'&&!landscape();
 let reachedBottom=false;
 let movedBack=false;

 function reveal(focus=false){
  if(!active()||!details.hidden)return;
  details.hidden=false;
  trigger.setAttribute('aria-expanded','true');
  if(focus){
   $('swipePreference').querySelector(':checked').focus();
  }else{
   setup.scrollBy({top:120,behavior:reduceMotion.matches?'auto':'smooth'});
  }
 }

 setup.addEventListener('scroll',()=>{
  if(!active())return;
  if(!details.hidden){
   if(setup.scrollTop<=1){
    details.hidden=true;
    trigger.setAttribute('aria-expanded','false');
    reachedBottom=false;
    movedBack=false;
   }
   return;
  }
  const distance=setup.scrollHeight-setup.clientHeight-setup.scrollTop;
  if(distance<=3){
   if(movedBack)reveal();
   reachedBottom=true;
  }else if(reachedBottom&&distance>=24){
   movedBack=true;
  }
 },{passive:true});
 trigger.addEventListener('click',()=>reveal(true));
}
function bindTitleFireworks(){
 const title=$('setupTitle'),stage=title.parentElement,layer=$('titleFireworks');
 let gesture=null;
 title.addEventListener('pointerdown',event=>{
  if(!event.isPrimary||event.button!==0||reduceMotion.matches||stage.hasAttribute('data-celebrating'))return;
  gesture={id:event.pointerId,x:event.clientX,y:event.clientY};
  try{title.setPointerCapture(event.pointerId)}catch{}
 });
 title.addEventListener('pointercancel',()=>{gesture=null});
 title.addEventListener('pointerup',async event=>{
  if(event.pointerId!==gesture?.id)return;
  const dx=event.clientX-gesture.x,dy=event.clientY-gesture.y;
  gesture=null;
  if(Math.abs(dx)<36||Math.abs(dx)<Math.abs(dy)*1.5)return;
  stage.dataset.celebrating=dx<0?'left':'right';
  const offscreen=`${Math.sign(dx)*(stage.clientWidth+40)}px 0`;
  const exit=title.animate([{translate:'0 0'},{translate:offscreen}],{duration:230,easing:'ease-in',fill:'forwards'});
  await exit.finished;
  renderFireworks(layer,[
   {x:30,y:57,delay:0,count:18,radius:.8,colors:['#ffd377','#fff7d9','#ff8fae']},
   {x:69,y:45,delay:320,count:19,radius:.9,colors:['#6ca8ff','#d5f9ff','#55dfe2']},
   {x:48,y:49,delay:690,count:22,radius:1,colors:['#e7b0ff','#ff83b5','#ffd377']},
   {x:18,y:46,delay:900,count:17,radius:.8,colors:['#ff748f','#ffd0ce','#ffab73']},
   {x:81,y:52,delay:1150,count:18,radius:.85,colors:['#87e9db','#d8fff5','#83b7ff']},
   {x:51,y:52,delay:1390,count:21,radius:1.1,colors:['#aab5ff','#e7b0ff','#fff7d9']},
   {x:12,y:55,delay:1820,count:17,radius:.86,colors:['#ffb16d','#ff788a','#fff3ca']},
   {x:30,y:43,delay:1820,count:22,radius:1.04,colors:['#8bd5ff','#73a5ff','#e2f8ff']},
   {x:50,y:55,delay:1820,count:27,radius:1.18,colors:['#ffd377','#fff7d9','#ffa97d']},
   {x:70,y:43,delay:1820,count:22,radius:1.04,colors:['#d899ff','#ff83b5','#f9dcff']},
   {x:88,y:55,delay:1820,count:17,radius:.86,colors:['#6ee6cc','#a7f7a1','#e9fff1']},
  ]);
  await new Promise(resolve=>setTimeout(resolve,3500));
  layer.replaceChildren();
  const entrance=title.animate([{translate:offscreen},{translate:'0 0'}],{duration:360,easing:'ease-out'});
  exit.cancel();
  await entrance.finished;
  delete stage.dataset.celebrating;
 });
}
function copyWordForMotion(){
 const copy=$('word').cloneNode(true);
 copy.removeAttribute('id');
 copy.querySelectorAll('[id]').forEach(node=>node.removeAttribute('id'));
 copy.classList.add('wordInTransit');
 copy.setAttribute('aria-hidden','true');
 return copy;
}
function portalScale(progress,horizontalGrowth=.12){
 return `${1+horizontalGrowth*progress} ${1+.28*progress}`;
}
function wordPortalPath(kind,word){
 const game=$('game');
 const isRight=kind==='correct';
 const direction=isRight?1:-1;
 const portal=game.querySelector(isRight?'.wordPortalRight':'.wordPortalLeft');
 const target=portal.getBoundingClientRect();
 const bounds=game.getBoundingClientRect();
 const center=word.getBoundingClientRect();
 const edge=isRight?target.left:target.right;
 const dx=edge-center.left-center.width/2;
 const dy=target.top+target.height/2-center.top-center.height/2;
 const scale=Math.min(1,target.height*.67/word.offsetHeight);
 const halfWord=Math.max(...[...word.children].map(line=>line.offsetWidth))*scale/2;
 const mouthX=dx-direction*(halfWord+8);
 const cutoff=isRight?bounds.right-edge:edge-bounds.left;
 return {portal,dy,scale,mouthX,hiddenX:dx+direction*(halfWord+2),
  clip:isRight?`inset(0 ${cutoff}px 0 0)`:`inset(0 0 0 ${cutoff}px)`};
}
function animateHudWord(copy,intoHud,delay=0){
 const game=$('game');
 const hud=game.querySelector('.hud').getBoundingClientRect();
 const layer=document.createElement('div');
 layer.className='wordMotionLayer';
 layer.style.clipPath=`inset(${hud.bottom-game.getBoundingClientRect().top}px 0 0)`;
 layer.append(copy);
 game.append(layer);
 const bounds=copy.getBoundingClientRect();
 const scale=.30;
 const y=hud.bottom-bounds.top-bounds.height/2-copy.offsetHeight*scale/2-2;
 const hidden={translate:wordTranslation(0,y),scale:String(scale)};
 const center={translate:wordTranslation(),scale:'1'};
 const motion=copy.animate(intoHud?[center,hidden]:[hidden,center],{
  id:intoHud?'word-into-hud':'word-from-hud',duration:125,delay,fill:'both',
  easing:intoHud?'cubic-bezier(.4,.15,.8,.7)':'cubic-bezier(.2,.65,.35,1)',
 });
 motion.finished.then(()=>layer.remove(),()=>layer.remove());
 return motion;
}
function animatePortalWord(kind,copy,drag){
 const game=$('game'),live=$('word');
 const path=drag?.path??wordPortalPath(kind,live);
 const {portal,dy,scale,mouthX,hiddenX,clip}=path;
 const shell=portal.querySelector('.portalShell');
 const travel=drag?Math.abs(hiddenX-drag.offset):0;
 const baseDuration=drag?.dragging?Math.round(Math.max(85,Math.min(165,travel*.43))):drag?155:185;
 const releaseSpeed=drag?.releaseSpeed??0;
 const initialSlope=Math.max(.35,Math.min(1.8,releaseSpeed*baseDuration/Math.max(1,travel)));
 shell.getAnimations().forEach(animation=>animation.cancel());
 const centerFrame={translate:wordTranslation(),scale:'1'};
 const layer=document.createElement('div');
 layer.className='wordMotionLayer';
 if(drag){
  layer.style.clipPath=clip;
  layer.append(copy);
  game.append(layer);
 }
 const approachDuration=drag?baseDuration*Math.max(0,Math.sign(hiddenX)*(mouthX-drag.offset))/travel:0;
 const duration=baseDuration+(drag?32:0);
 const approachAt=approachDuration/duration;
 const approachEasing=`cubic-bezier(.24,${.24*initialSlope},.72,${approachAt>0?.72:1})`;
 const retractDuration=55;
 const swallowedAt=duration/(duration+retractDuration);
 const openingFrames=drag?[
  {progress:Math.min(1,Math.abs(drag.offset)/Math.max(1,Math.abs(mouthX))),easing:approachEasing},
  ...(approachAt>0?[{progress:1,offset:approachAt*swallowedAt}]:[]),
  {progress:1,offset:swallowedAt,easing:'ease-out'},
  {progress:0},
 ]:null;
 const pulse=openingFrames
  ?shell.animate(openingFrames.map(({progress,...timing})=>({...timing,scale:portalScale(progress)})),
   {id:'portal-pulse',duration:duration+retractDuration})
  :shell.animate([{scale:1},{scale:portalScale(1),offset:.26},{scale:1}],
   {id:'portal-pulse',duration,easing:'ease-in-out'});
 const motion=drag
  ?copy.animate([
   {translate:wordTranslation(drag.offset,drag.vertical),scale:String(drag.squeeze),
    easing:approachEasing},
   ...(approachAt>0?[{translate:wordTranslation(mouthX,dy),scale:String(scale),offset:approachAt,easing:'cubic-bezier(.28,.28,.73,1)'}]:[]),
   {translate:wordTranslation(hiddenX,dy),scale:String(scale)},
  ],{id:'word-absorption',duration,fill:'forwards'})
  :animateHudWord(copy,true);
 if(drag)motion.finished.then(()=>layer.remove(),()=>layer.remove());
 if(drag){
  const arrival=animateHudWord(copyWordForMotion(),false,duration);
  const cover=live.animate([{opacity:0},{opacity:0}],{
   id:'word-settlement',duration:arrival.effect.getTiming().delay+125,
  });
  const shadow=portal.querySelector('.portalShadow').animate(
   openingFrames.map(({progress,...timing})=>({...timing,opacity:.48*progress,scale:portalScale(progress,0)})),
   {id:'portal-shadow',duration:duration+retractDuration});
  return [motion,arrival,cover,pulse,shadow];
 }
 const restored=copyWordForMotion();
 const exitLayer=document.createElement('div');
 exitLayer.className='wordMotionLayer';
 exitLayer.style.clipPath=clip;
 exitLayer.append(restored);
 game.append(exitLayer);
 const exit=restored.animate([
  {translate:wordTranslation(hiddenX,dy),scale:String(scale)},
  {translate:wordTranslation(mouthX,dy),scale:String(scale),offset:.34},
  centerFrame,
 ],{id:'word-ejection',duration,fill:'forwards'});
 const cover=live.animate([{opacity:0},{opacity:0}],{id:'word-settlement',duration});
 exit.finished.then(()=>exitLayer.remove(),()=>exitLayer.remove());
 return [motion,exit,cover,pulse];
}
function bindGameSwipe(){
 const game=$('game');
 const wordBox=$('word');
 const halves=[$('pass'),$('correct')];
 const portals=[...game.querySelectorAll('.wordPortal')];
 let gesture=null;
 let suppressClick=false;
 let animations=[];

 function updatePortalOpening(activePortal,progress=0){
  for(const portal of portals){
   const shell=portal.querySelector('.portalShell');
   const shadow=portal.querySelector('.portalShadow');
   if(portal===activePortal){
    shell.style.scale=portalScale(progress);
    shadow.style.opacity=.48*progress;
    shadow.style.scale=portalScale(progress,0);
   }else{
    shell.style.removeProperty('scale');
    shadow.style.removeProperty('opacity');
    shadow.style.removeProperty('scale');
   }
  }
 }

 function stopSettlement(){
  animations.forEach(animation=>animation.cancel());
  animations=[];
  for(const element of [wordBox,...halves]){
   element.getAnimations().filter(animation=>animation.id==='word-settlement').forEach(animation=>animation.cancel());
  }
  game.querySelectorAll('.wordMotionLayer').forEach(layer=>layer.remove());
  updatePortalOpening();
  game.style.removeProperty('--game-split');
  wordBox.style.removeProperty('translate');
  wordBox.style.removeProperty('scale');
 }

 function settleDivider(split,kind){
  game.style.removeProperty('--game-split');
  if(kind)flashTapSide(kind,false,reduceMotion.matches?0:85);
  if(reduceMotion.matches)return;
  const to=kind==='correct'?0:100;
  animations=halves.map((half,index)=>{
   const width=left=>`${index?100-left:left}%`;
   const frames=kind
    ?[{width:width(split),easing:'ease-out'},{width:width(to),offset:.25},
      {width:width(to),offset:.42,easing:'ease-out'},
      {width:width(to===0?54:46),offset:.78,easing:'ease-in-out'},{width:'50%'}]
    :[{width:width(split)},{width:'50%'}];
   return half.animate(frames,{duration:kind?340:160,easing:'ease-out'});
  });
 }

 function settleWord(drag,kind,snapshot){
  updatePortalOpening();
  wordBox.style.removeProperty('translate');
  wordBox.style.removeProperty('scale');
  if(reduceMotion.matches||phase!==STATES.RUNNING)return;
  if(kind){
   animations=animatePortalWord(kind,snapshot,drag);
  }else{
   animations=[wordBox.animate([
    {translate:wordTranslation(drag.offset,drag.vertical),scale:String(drag.squeeze)},{translate:wordTranslation(),scale:'1'},
   ],{duration:200,easing:'ease-out'})];
  }
 }

 function settleSelection(drag,kind){
  if(kind&&drag.wordMode&&!reduceMotion.matches){
   drag.path=drag.paths?.[kind]??wordPortalPath(kind,wordBox);
  }
  const snapshot=kind&&drag.wordMode&&!reduceMotion.matches?copyWordForMotion():null;
  const accepted=kind&&action(kind,true)?kind:null;
  if(drag.wordMode)settleWord(drag,accepted,snapshot);
  else if(accepted||drag.dragging)settleDivider(drag.split,accepted);
 }

 game.addEventListener('pointerdown',event=>{
  if(!event.isPrimary||event.button!==0)return;
  suppressClick=false;
  gesture=null;
  if(event.target.closest('button')){stopSettlement();return}
  if(!canSelectWord())return;
  stopSettlement();
  gesture={id:event.pointerId,x:event.clientX,y:event.clientY,lastX:event.clientX,
   lastTime:event.timeStamp,speed:0,dragging:false,offset:0,vertical:0,squeeze:1,split:50,wordMode:game.dataset.swipeStyle==='word'};
  if(gesture.wordMode&&!reduceMotion.matches){
   gesture.paths={pass:wordPortalPath('pass',wordBox),correct:wordPortalPath('correct',wordBox)};
  }
 });
 game.addEventListener('pointermove',event=>{
  if(!gesture||event.pointerId!==gesture.id)return;
  if(phase!==STATES.RUNNING){gesture=null;stopSettlement();return}
  const dx=event.clientX-gesture.x;
  const dy=event.clientY-gesture.y;
  if(!gesture.dragging){
   if(Math.abs(dx)<10||Math.abs(dx)<=Math.abs(dy))return;
   gesture.dragging=true;
   try{game.setPointerCapture(event.pointerId)}catch{}
  }
  const elapsed=event.timeStamp-gesture.lastTime;
  if(elapsed>=5){
   gesture.speed=(event.clientX-gesture.lastX)/elapsed;
   gesture.lastTime=event.timeStamp;
   gesture.lastX=event.clientX;
  }
  if(reduceMotion.matches)return;
  if(!gesture.wordMode){
   gesture.split=Math.max(0,Math.min(100,50+dx/game.clientWidth*100));
   game.style.setProperty('--game-split',gesture.split+'%');
   return;
  }
  const path=gesture.paths[dx<0?'pass':'correct'];
  const mouthDistance=Math.abs(path.mouthX);
  const softStart=Math.max(0,mouthDistance-28);
  const distance=Math.abs(dx);
  // Ease into resistance before the opening while keeping the drag reversible.
  gesture.motionMultiplier=Math.exp(-Math.max(0,distance-softStart)/35);
  const offset=distance<=softStart?distance:softStart+35*(1-gesture.motionMultiplier);
  const progress=Math.min(1,offset/Math.max(1,mouthDistance));
  gesture.path=path;
  gesture.offset=Math.sign(path.mouthX)*offset;
  gesture.vertical=path.dy*progress;
  gesture.squeeze=1+(path.scale-1)*progress;
  wordBox.style.translate=wordTranslation(gesture.offset,gesture.vertical);
  wordBox.style.scale=String(gesture.squeeze);
  updatePortalOpening(path.portal,progress);
 });
 game.addEventListener('pointerup',event=>{
  if(!gesture||gesture.id!==event.pointerId)return;
  const drag=gesture;
  gesture=null;
  if(!drag.dragging)return;
  suppressClick=true;
  const dx=event.clientX-drag.x;
  const enough=Math.abs(dx)>=Math.min(104,game.clientWidth*.17);
  const flick=Math.abs(dx)>=35&&event.timeStamp-drag.lastTime<110&&
   Math.abs(drag.speed)>=.75&&Math.sign(drag.speed)===Math.sign(dx);
  const kind=(drag.wordMode?dx>0:dx<0)?'correct':'pass';
  drag.releaseSpeed=event.timeStamp-drag.lastTime<90
   ?Math.max(0,Math.sign(dx)*drag.speed)*(drag.motionMultiplier??1):0;
  settleSelection(drag,enough||flick?kind:null);
 });
 game.addEventListener('pointercancel',event=>{
  if(!gesture||gesture.id!==event.pointerId)return;
  gesture=null;
  stopSettlement();
 });
 game.addEventListener('click',event=>{
  const half=event.target.closest('.tapzone');
  if(!half&&event.target!==game)return;
  if(suppressClick){
   event.preventDefault();
   suppressClick=false;
   return;
  }
  const middle=game.getBoundingClientRect().left+game.clientWidth/2;
  const kind=event.detail?(event.clientX<middle?'pass':'correct'):half?.id;
  if(!kind||!canSelectWord())return;
  stopSettlement();
  settleSelection({wordMode:game.dataset.swipeStyle==='word',offset:0,vertical:0,squeeze:1,split:50},kind);
 });
}
function bind(){
 const swipePreference=$('swipePreference');
 const applySwipeStyle=()=>{
  const style=swipePreference.querySelector(':checked').value;
  $('game').dataset.swipeStyle=style;
  $('pass').querySelector('.swipeHint').setAttribute('aria-label',style==='word'?'左滑跳过':'右滑跳过');
  $('correct').querySelector('.swipeHint').setAttribute('aria-label',style==='word'?'右滑猜中':'左滑猜中');
 };
 applySwipeStyle();
 swipePreference.addEventListener('change',()=>{applySwipeStyle();rememberSettings()});
 bindSetupDetails();
 bindTitleFireworks();
 bindGameSwipe();
 const hudObserver=new ResizeObserver(fitUrgentTimer);
 for(const element of [$('timer').parentElement,$('timer'),$('who'),$('score')])hudObserver.observe(element);
 for(const type of ['gesturestart','gesturechange']){
  document.addEventListener(type,event=>event.preventDefault(),{passive:false});
 }
 $('messageClose').addEventListener('click',()=>$('messageDialog').close());
 $('mode').addEventListener('change',configTeams);$('teamCount').addEventListener('input',configTeams);$('soloCount').addEventListener('input',renderNames);$('duration').addEventListener('input',syncLaunch);$('penalty').addEventListener('change',syncLaunch);
 $('toggleCategories').addEventListener('click',event=>{
  const button=event.currentTarget;
  const expanded=button.getAttribute('aria-expanded')!=='true';
  button.setAttribute('aria-expanded',String(expanded));
  button.setAttribute('aria-label',expanded?'折叠词库类别':'展开全部词库类别');
  syncCategoryPreview();
 });
 $('all').addEventListener('click',()=>{if(selected.size===Object.keys(BANK).length)selected.clear();else Object.keys(BANK).forEach(k=>selected.add(k));renderCats()});
 bindContinue('start',startGame);bindContinue('startTop',startGame);bindContinue('landscapeLaunchButton',startGame);
 $('undoAction').addEventListener('click',undo);$('pauseAction').addEventListener('click',pause);bindContinue('resumeAction',resume);
 $('roundReviewFilters').addEventListener('click',event=>{
  const button=event.target.closest('button[data-filter]');
  if(button)renderRoundReview(button.dataset.filter);
 });
 bindContinue('nextPlayer',()=>{if(phase!==STATES.ROUND_END||!landscape())return;if(roundIndex===players.length-1)showFinal();else{roundIndex++;beginRound()}});
 bindContinue('restart',newGame);$('showHistory').addEventListener('click',()=>{refreshHistory();screen('historyScreen')});$('backSetup').addEventListener('click',()=>{screen('setup');renderCats()});
 for(const id of ['restartRoundAction','portraitEnd']){
  $(id).addEventListener('click',()=>{
   if(canEndGame())$('endDialog').classList.add('on');
  });
 }
 $('endCancel').addEventListener('click',()=>$('endDialog').classList.remove('on'));
 $('endConfirm').addEventListener('click',()=>{
  $('endDialog').classList.remove('on');
  if(!canEndGame())return;
  audit('game_ended');
  newGame();
 });
 ['exportData','historyExport','finalExport'].forEach(id=>$(id).addEventListener('click',exportData));$('shareResult').addEventListener('click',shareResult);
 ['importData','historyImport'].forEach(id=>$(id).addEventListener('click',()=>$('importFile').click()));$('importFile').addEventListener('change',e=>importFile(e.target.files?.[0]));$('importWorkCancel').addEventListener('click',()=>{if(importReader?.readyState===1)importReader.abort();closeImportWork()});$('confirmImport').addEventListener('click',()=>{if(!pendingImport)return;try{const p=pendingImport;DATA.merge(p);pendingImport=null;$('importPreview').classList.remove('on');renderCats();refreshHistory();showMessage('导入成功：新增已用词 '+p.seen.size+' 个，新增对局 '+p.matches.length+' 局')}catch(e){showMessage('合并失败：'+e.message)}});$('cancelImport').addEventListener('click',()=>{pendingImport=null;$('importPreview').classList.remove('on')});
 let pendingReset=null;
 let resetTrigger=null;
 const resetDialog=$('resetConfirmDialog');
 function chooseReset(button,title,description,apply){
  $(button).addEventListener('click',event=>{
   pendingReset=apply;
   resetTrigger=event.currentTarget;
   $('resetConfirmTitle').textContent=title;
   $('resetConfirmDescription').textContent=description;
   resetDialog.classList.add('on');
   $('resetCancel').focus({preventScroll:true});
  });
 }
 function closeReset(){
  pendingReset=null;
  resetDialog.classList.remove('on');
  resetTrigger?.focus({preventScroll:true});
 }
 chooseReset('clearNicknames','确定清空全部昵称？','清空后将使用默认玩家称呼。',()=>{
  nameValues.clear();
  document.querySelectorAll('#nameInputs input').forEach(input=>{input.value=''});
  renderNames();
 });
 for(const prefix of ['setup','launch']){
  bindContinue(prefix+'Restore',resumeSavedMatch);
  chooseReset(prefix+'Discard','确定放弃未完成的对局？','已完成的回合将保存在中断日志。',discardSavedMatch);
 }
 chooseReset('resetSeen','确定清空所有已出现词？','清空后，之前出现过的词可以再次抽到。已有对局记录不会删除。',()=>{
  const empty=new Set();
  if(DATA.save(empty))DATA.seen=empty;
  renderCats();refreshHistory();
 });
 chooseReset('resetHistory','确定清空全部对局记录？','所有历史对局将删除，已出现词仍然保留。',()=>{
  if(DATA.save(DATA.seen,[]))DATA.matches=[];
  renderCats();refreshHistory();
 });
 $('resetCancel').addEventListener('click',closeReset);
 resetDialog.addEventListener('keydown',event=>{if(event.key==='Escape')closeReset()});
 $('resetConfirm').addEventListener('click',()=>{
  const apply=pendingReset;
  closeReset();
  try{apply?.()}catch(error){showMessage('清空失败：'+error.message)}
 });
 window.addEventListener('resize',()=>{if(screenId==='game'&&landscape())refreshWord()},{passive:true});
 orientation.addEventListener('change',()=>{renderOrientation();syncLaunch()});document.addEventListener('visibilitychange',()=>{if(document.hidden)pause()});window.addEventListener('pagehide',pause);
}
function init(){const notice=$('rotateNotice');notice.innerHTML='<div class="portraitProgress"><div class="portraitProgressTitle">请将手机横过来 ↻</div><div class="portraitProgressHint">游戏仅在横屏进行 · 竖屏查看已完成进度</div><div class="portraitProgressCount" id="portraitProgressCount"></div><div class="portraitProgressList" id="portraitProgressList"></div><button type="button" id="portraitEnd">结束游戏</button></div>';loadProgress();loadWords();const savedSizes=restoreSettings();bind();bindWordManager();configTeams(savedSizes);upgradeSteppers();renderCats();screen('setup')}
init();
if('serviceWorker' in navigator && /^https?:$/.test(location.protocol)){
 navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).then(async ()=>{
  await navigator.serviceWorker.ready;
  $('offlineStatus').textContent='离线资源已就绪。';
 }).catch(error=>{
  console.warn('离线资源未就绪',error);
  $('offlineStatus').textContent='离线资源暂未就绪，请联网后重新打开。';
 });
}
