'use strict';
const C=JournalCore,$=s=>document.querySelector(s),KEY='yys-journal-v1';
const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state=C.fresh(),tab='daily',search='',filter='all',historyDate='',onSubmit=null,lastPeriod='',storageBroken=false,readBroken=false;
let toastTimer,modalBusy=false,lineups=[],lineupsReady=false,lineupError='',lineupSearch='',lineupCategory='';
const lineupChannel=typeof BroadcastChannel==='function'?new BroadcastChannel('yys-lineups'):null;
let lineupLoad=loadLineups();
function toast(t){$('#toast').textContent=t;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),3000);}
function storageWarning(t){const el=$('#storage-warning');el.hidden=false;el.textContent=t;}
try{const raw=localStorage.getItem(KEY);if(raw)state=C.validate(JSON.parse(raw));}catch(e){readBroken=true;storageWarning('原有数据无法读取，已暂停写入。请在设置中下载原始数据，或导入有效备份后继续。');}
function save(){
 if(readBroken){toast('当前为只读模式，请先恢复备份');return false;}
 try{localStorage.setItem(KEY,JSON.stringify(state));if(storageBroken){storageBroken=false;$('#storage-warning').hidden=true;}return true;}
 catch(e){storageBroken=true;storageWarning('浏览器未能保存数据。本次改动仍在页面中，请立即导出备份，勿关闭页面。');return false;}
}
function mutate(fn){if(readBroken)throw Error('当前为只读模式，请先恢复备份');fn();save();render();}
function isDone(t){return !!state.records[C.recordKey(t,new Date(),state.settings.resetHour)]?.done;}
const fmt=n=>new Intl.NumberFormat('zh-CN').format(n);
function resourceAmount(k,n){const [whole,fraction]=C.resourceInput(k,Math.abs(n)).split('.');return (n<0?'-':'')+fmt(Number(whole))+(fraction?'.'+fraction:'');}
const resourceText=(k,n)=>resourceAmount(k,n)+C.RESOURCES[k][1];
const time=t=>new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(t));
function renderSummary(){
 const name=state.settings.gameName,level=state.settings.gameLevel;
 $('#player-name').textContent=name||'设置游戏名称';$('#player-name').title=name||'设置游戏名称';
 $('#player-avatar').textContent=name?Array.from(name)[0]:'陰';
 $('#player-hint').textContent=name||level!==null?'点击编辑游戏资料':'点击填写游戏名称与等级';
 $('#player-level').hidden=level===null;$('#player-level').textContent=level===null?'':'Lv. '+level;
 const p=C.periods(new Date(),state.settings.resetHour);lastPeriod=p.day+'|'+p.week;
 $('#today-label').textContent=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'long',day:'numeric',weekday:'long'}).format(new Date());
 for(const [cycle,prefix] of [['daily','daily'],['weekly','weekly']]){const ts=state.tasks.filter(t=>t.cycle===cycle),done=ts.filter(isDone).length;$('#'+prefix+'-count').textContent=`${done} / ${ts.length}`;$('#'+prefix+'-progress').style.width=(ts.length?done/ts.length*100:0)+'%';}
 const f=state.resources.fragment,rem=f%50;
 $('#fragment-count').innerHTML=`${fmt(f)} <small>/ 50 片</small>`;
 $('#fragment-hint').textContent=f>=50?`可合成 ${fmt(Math.floor(f/50))} 颗御行达摩`:`距离下一颗黑蛋还差 ${50-f} 片`;
 $('#egg-ratio').textContent=`${rem} / 50`;
 $('#egg-progress').style.width=rem/50*100+'%';
 $('#egg-hint').textContent=f>=50?`已有 ${Math.floor(f/50)} 颗可合成；余 ${rem} 片。`:`再收集 ${50-f} 片，就能合成一颗。`;
 $('#synthesize').disabled=f<50;
 $('#resource-list').innerHTML=Object.entries(C.RESOURCES).map(([k,[n,u,icon]])=>`<div class="resource-row"><span class="resource-name"><span class="resource-icon" aria-hidden="true">${icon}</span>${n}</span><span><strong>${resourceAmount(k,state.resources[k])}</strong>${u?`<small>${u}</small>`:''}</span></div>`).join('');
 $('#reset-label').textContent=`北京时间每日 ${String(state.settings.resetHour).padStart(2,'0')}:00 重置 · 周一重置周常`;
 document.body.classList.toggle('scenery',state.settings.scenery);
 $('.tabs').querySelectorAll('a').forEach(a=>{a.classList.toggle('active',a.dataset.tab===tab);if(a.dataset.tab===tab)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
}
function empty(title,subtitle){return `<div class="empty"><strong>${title}</strong>${subtitle}</div>`;}
function renderTasks(){
 const titles={daily:['每日待办','一点一滴，都是今天的收获。'],weekly:['每周待办','本周的挑战与兑换，一件也不漏。'],once:['奖励追踪','一次性奖励与非固定周期商店，单独记下。']};
 const all=state.tasks.filter(t=>t.cycle===tab),done=all.filter(isDone).length;
 const filtered=all.filter(t=>(filter==='all'||(filter==='done'?isDone(t):!isDone(t)))&&[t.title,t.note,t.reward,t.group].some(s=>s.toLowerCase().includes(search.toLowerCase())));
 let html=`<div class="view-heading"><div><h2>${titles[tab][0]} <span class="pill">${done} / ${all.length}</span></h2><p class="caption">${titles[tab][1]}</p></div><button class="primary" data-action="add">＋ 添加待办</button></div><div class="toolbar"><input id="search" type="search" maxlength="100" placeholder="搜索任务、奖励…" aria-label="搜索待办" value="${esc(search)}"><select id="filter" aria-label="筛选完成状态"><option value="all">全部任务</option><option value="todo">未完成</option><option value="done">已完成</option></select></div>`;
 if(!filtered.length)html+=empty(all.length?'暂时没有匹配的待办':'这页还是空白的','点击「添加待办」，写下下一份收获。');
 html+='<div class="task-grid">';
 for(const g of [...new Set(filtered.map(t=>t.group))]){html+=`<section class="task-group"><h3 class="group-label">${esc(g||'我的待办')}</h3>`;for(const t of filtered.filter(t=>t.group===g)){const done=isDone(t);html+=`<div class="task ${done?'done':''}"><input type="checkbox" id="task-${esc(t.id)}" data-task="${esc(t.id)}" ${done?'checked':''}><div class="task-body"><label class="task-title" for="task-${esc(t.id)}">${esc(t.title)}</label>${t.note?`<details class="task-details"><summary>${esc(t.reward||'查看备注')}</summary><div class="task-note">${esc(t.note)}</div></details>`:t.reward?`<span class="task-tag">${esc(t.reward)}</span>`:''}</div><button class="task-edit" data-edit="${esc(t.id)}" aria-label="编辑${esc(t.title)}">⋯</button></div>`;}html+='</section>';}
 html+='</div>';
 html+=`<p class="list-foot">${tab==='once'?'此页不自动重置。神龛等非固定周期项目，请在实际刷新后取消勾选。':'周期切换时自动显示新一轮待办，旧记录会保留。'}<br>预置来源与奖励说明可编辑；标为「待核对」的项目请以游戏内当前版本为准。勾选不会自动增加资源。</p>`;
 $('#view').innerHTML=html;$('#filter').value=filter;
 $('#search').addEventListener('input',e=>{const start=e.target.selectionStart;search=e.target.value;renderTasks();$('#search').focus();$('#search').setSelectionRange(start,start);});
 $('#filter').addEventListener('change',e=>{filter=e.target.value;renderTasks();});
}
function renderResources(){
 let html=`<div class="view-heading"><div><h2>资源账本</h2><p class="caption">实际余额与每一次变化，都留有记录。</p></div><button class="primary" data-action="resources">更新余额</button></div>`;
 if(!state.ledger.length)html+=empty('还没有资源变动','从右侧「更新」录入游戏内的真实余额。');
 else html+=`<table class="ledger"><thead><tr><th>时间 / 备注</th><th>资源变动</th><th>变动后</th></tr></thead><tbody>${state.ledger.slice(0,200).map(l=>`<tr><td>${time(l.at)}<br><span class="caption">${esc(l.note)}</span></td><td>${Object.entries(l.delta).map(([k,v])=>`${C.RESOURCES[k][0]} <span style="color:${v>0?'#6b866a':'#9d5470'}">${v>0?'+':''}${resourceText(k,v)}</span>`).join('<br>')}</td><td>${Object.keys(l.delta).map(k=>resourceText(k,l.balance[k])).join('<br>')}</td></tr>`).join('')}</tbody></table><p class="list-foot">展示最近 200 条变动，完整记录保存在导出备份中。</p>`;
 $('#view').innerHTML=html;
}
function renderHistory(){
 const events=state.events.filter(e=>!historyDate||C.periods(new Date(e.at),state.settings.resetHour).day===historyDate);
 const completed=Object.values(state.records).filter(r=>r.done&&(!historyDate||r.period==='d:'+historyDate||r.period==='w:'+C.periods(new Date(historyDate+'T12:00:00+08:00'),state.settings.resetHour).week||r.period==='once'));
 let html=`<div class="view-heading"><div><h2>历史记录</h2><p class="caption">完成、取消和删除操作均保留在这里。</p></div></div><div class="toolbar"><input id="history-date" type="date" aria-label="筛选操作日期" value="${esc(historyDate)}"><button class="quiet" data-action="clear-date">全部日期</button></div><p class="caption">${historyDate?'该游戏日':'全部'}操作 ${fmt(events.length)} 次 · ${historyDate?'对应周期':'所有周期'}当前保留 ${fmt(completed.length)} 条完成记录</p>`;
 if(!events.length)html+=empty('还没有操作记录','勾选一个待办，就从这里留下足迹。');
 else html+=events.slice(0,200).map(e=>`<div class="log-entry">${esc(e.title)}<span class="pill">${esc(e.action)}</span><small>${time(e.at)} · ${e.period==='once'?'一次性 / 手动重置':(e.period.startsWith('d:')?'游戏日 ':'周起始 ')+esc(e.period.slice(2))}</small></div>`).join('')+'<p class="list-foot">展示最近 200 条操作，完整历史随备份导出。</p>';
 $('#view').innerHTML=html;$('#history-date').onchange=e=>{historyDate=e.target.value;renderHistory();};
}
function render(){renderSummary();document.body.dataset.page=tab;if(['daily','weekly','once'].includes(tab))renderTasks();else if(tab==='resources')renderResources();else if(tab==='lineups')renderLineups();else renderHistory();}
function navigate(){const next=location.hash.slice(1);tab=['daily','weekly','once','resources','history','lineups'].includes(next)?next:'daily';search='';filter='all';render();}
window.addEventListener('hashchange',navigate);
function field(name,label,type,value,extra=''){return `<label class="field">${label}<input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;}
function openModal(title,content,handler,saveLabel='保存'){$('#modal').classList.remove('image-modal');$('#modal-title').textContent=title;$('#modal-content').innerHTML=content;$('#save-modal').textContent=saveLabel;onSubmit=handler;$('#modal').showModal();}
function closeModal(){if(modalBusy)return;$('#modal').close();onSubmit=null;}
$('#modal').addEventListener('cancel',e=>{if(modalBusy)e.preventDefault();else onSubmit=null;});
$('#close-modal').onclick=closeModal;$('#cancel-modal').onclick=closeModal;
$('#modal-form').onsubmit=async e=>{
 e.preventDefault();if(modalBusy)return;
 const data=new FormData(e.target),handler=onSubmit;modalBusy=true;
 for(const id of ['save-modal','cancel-modal','close-modal'])$('#'+id).disabled=true;
 let close=false;
 try{close=(await handler?.(data))!==false;}catch(err){toast(err.message);}
 finally{modalBusy=false;for(const id of ['save-modal','cancel-modal','close-modal'])$('#'+id).disabled=false;}
 if(close)closeModal();
};
function editTask(id){
 const existing=state.tasks.find(t=>t.id===id),t=existing||{title:'',note:'',reward:'',group:'我的待办',cycle:['daily','weekly','once'].includes(tab)?tab:'daily'};
 openModal(existing?'编辑待办':'添加待办',`${field('title','待办名称','text',t.title,'required maxlength="100"')}<div class="form-grid"><label class="field">周期<select name="cycle" ${existing?'disabled':''}><option value="daily">每日</option><option value="weekly">每周</option><option value="once">一次性 / 手动重置</option></select></label>${field('group','分组','text',t.group,'maxlength="50"')}</div><label class="field">备注<textarea name="note" maxlength="500">${esc(t.note)}</textarea></label>${field('reward','奖励说明','text',t.reward,'maxlength="150"')}${existing?'<p class="modal-note">保留原周期可避免本周期记录错位。需要另一周期时，请新建待办。</p><button type="button" class="text-button danger" id="delete-task">删除此待办</button>':''}`,data=>{
  const title=data.get('title').trim();if(!title)throw Error('请填写待办名称');
  mutate(()=>{const task={id:existing?.id||'t-'+cryptoId(),title,cycle:existing?.cycle||data.get('cycle'),group:data.get('group').trim()||'我的待办',note:data.get('note').trim(),reward:data.get('reward').trim()};if(existing)state.tasks[state.tasks.indexOf(existing)]=task;else state.tasks.push(task);});
 });
 $('#modal-content select[name=cycle]').value=t.cycle;
 if(existing)$('#delete-task').onclick=()=>{openModal('删除待办',`<p class="modal-note">将删除「${esc(t.title)}」。过去的完成记录仍会保留。</p>`,()=>mutate(()=>{state.tasks=state.tasks.filter(x=>x.id!==id);state.events.unshift({at:new Date().toISOString(),title:t.title,action:'删除待办',period:C.period(t,new Date(),state.settings.resetHour)});}), '确认删除');};
}
function cryptoId(){return globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);}
function editResources(){openModal('更新资源余额',`<p class="modal-note">金币和体力按「万」填写，例如 12.5 表示 12.5 万；支持 4 位小数。其余资源填写整数，系统自动记录差值。</p><div class="form-grid">${Object.entries(C.RESOURCES).map(([k,[n,u]])=>field(k,n+(u?`（${u}）`:''),'number',C.resourceInput(k,state.resources[k]),`required min="0" max="${C.resourceInput(k,Number.MAX_SAFE_INTEGER)}" step="${C.scaledResource(k)?'0.0001':'1'}" inputmode="${C.scaledResource(k)?'decimal':'numeric'}"`)).join('')}</div>${field('note','本次备注','text','','maxlength="500" placeholder="例如：周常结算、抽卡或手动盘点"')}`,data=>{mutate(()=>C.updateResources(state,Object.fromEntries(Object.keys(C.RESOURCES).map(k=>[k,C.parseResourceInput(k,data.get(k))])),data.get('note').trim()));});}
$('#edit-resources').onclick=editResources;
$('#synthesize').onclick=()=>openModal('记录黑蛋合成',`<p class="modal-note">确认你已在游戏内合成：账本将扣除 50 片黑碎，增加 1 颗黑蛋。</p>`,()=>mutate(()=>C.synthesize(state)),'记录合成');
$('#go-weekly').onclick=()=>{location.hash='weekly';};
function download(text,name,type='application/json'){const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function completeBackup(){
 if(readBroken)throw Error('待办数据无法读取，请先在设置中下载原始数据');
 const saved=await LineupStore.all();return {version:2,journal:C.validate(state),lineups:saved};
}
async function exportData(){try{const text=JSON.stringify(await completeBackup(),null,2);if(new Blob([text]).size>128*1024*1024)throw Error('备份超过 128 MB，请先减少阵容图片');download(text,'痒痒鼠备份-'+C.periods().day+'.json');toast('完整备份已导出，包含阵容图片');}catch(e){toast('未导出：'+e.message+'。设置中可仅导出待办与资源');}}
function exportJournal(){try{if(readBroken)throw Error('请先下载原始数据');download(JSON.stringify(C.validate(state),null,2),'痒痒鼠待办备份-'+C.periods().day+'.json');toast('待办与资源已导出，此文件不含阵容');}catch(e){toast(e.message);}}
$('#export').onclick=exportData;
function settings(){openModal('偏好与数据',`<h3 class="settings-heading">我的游戏资料</h3><div class="form-grid">${field('gameName','游戏名称','text',state.settings.gameName,'maxlength="40" autocomplete="off" placeholder="填写游戏中的名称"')}${field('gameLevel','游戏等级','number',state.settings.gameLevel??'','min="1" max="999" step="1" inputmode="numeric" placeholder="可留空"')}</div><p class="modal-note">保存后展示在左上方。名称与等级均可留空，资料随备份一起保存。</p><h3 class="settings-heading">手帖偏好</h3><label class="field">每日重置时间（北京时间）<select name="resetHour">${Array.from({length:24},(_,i)=>`<option value="${i}">${String(i).padStart(2,'0')}:00</option>`).join('')}</select></label><p class="modal-note">周常在周一同一时间重置。调整时间会改变当天归属，旧记录保留。默认 00:00，可按游戏实际规则调整。</p><label class="field"><input style="display:inline;width:auto" type="checkbox" name="scenery" ${state.settings.scenery?'checked':''}> 展开背景欣赏模式</label><p class="modal-note">数据仅存在当前浏览器，换浏览器或清理网站数据前请备份。本地文件与 localhost 预览属于不同存储空间，请固定使用一种入口。</p><div class="settings-row"><button type="button" class="quiet" id="settings-export">导出备份</button><button type="button" class="quiet" id="settings-import">导入备份</button><button type="button" class="quiet" id="journal-export">仅导出待办与资源</button>${readBroken?'<button type="button" class="quiet" id="raw-export">下载原始数据</button>':''}</div><p class="modal-note">任务来源与奖励说明见项目内「奖励来源.md」。预置清单是可编辑的检查项，不自动计算奖励收入。</p>`,data=>{const gameName=data.get('gameName').trim(),rawLevel=data.get('gameLevel').trim(),gameLevel=rawLevel===''?null:Number(rawLevel);if(gameName.length>40||gameLevel!==null&&(!Number.isInteger(gameLevel)||gameLevel<1||gameLevel>999))throw Error('游戏名称最多 40 字，等级请填写 1–999 的整数或留空');mutate(()=>{state.settings.gameName=gameName;state.settings.gameLevel=gameLevel;state.settings.resetHour=Number(data.get('resetHour'));state.settings.scenery=data.get('scenery')==='on';});});$('#modal-content select').value=state.settings.resetHour;$('#settings-export').onclick=exportData;$('#journal-export').onclick=exportJournal;$('#settings-import').onclick=()=>$('#import-file').click();if($('#raw-export'))$('#raw-export').onclick=()=>{try{download(localStorage.getItem(KEY)||'','痒痒鼠原始数据.json');}catch(e){toast('浏览器无法读取原始存储');}};}
$('#settings').onclick=settings;
$('#player-profile').onclick=()=>{settings();$('#modal-content [name=gameName]').focus();};
$('#import-file').onchange=async e=>{
 const file=e.target.files[0];e.target.value='';if(!file)return;
 try{
  if(file.size>128*1024*1024)throw Error('备份不能超过 128 MB');
  const incoming=C.validateBackup(JSON.parse(await file.text()));
  await verifyImages(incoming.lineups||[]);
  // Never offer a replacement when the existing lineup database cannot be read.
  await LineupStore.all();
  if($('#modal').open)closeModal();
  openModal('导入备份',`<p class="modal-note">文件：${esc(file.name)}<br>包含 ${incoming.journal.tasks.length} 项待办、${Object.keys(incoming.journal.records).length} 条周期记录、${incoming.journal.ledger.length} 条资源变动。<br>${incoming.lineups===null?'这是旧版备份：当前阵容及图片将保留。':`包含 ${incoming.lineups.length} 条阵容、${incoming.lineups.reduce((n,l)=>n+l.images.length,0)} 张图片，将替换当前阵容。`}</p><p class="modal-note">点击「备份并导入」会先下载当前完整数据，再恢复所选备份。</p>`,async()=>{
   const previousRaw=localStorage.getItem(KEY);
   if(readBroken)download(previousRaw||'','痒痒鼠原始数据.json');
   const currentLineups=await LineupStore.all();
   download(JSON.stringify({version:2,journal:state,lineups:currentLineups},null,2),'痒痒鼠导入前备份-'+Date.now()+'.json');
   await LineupStore.replace(incoming.lineups===null?currentLineups:incoming.lineups,()=>{
    try{localStorage.setItem(KEY,JSON.stringify(incoming.journal));}catch(err){throw Error('浏览器无法写入备份，原有数据未替换');}
    return ()=>{if(previousRaw===null)localStorage.removeItem(KEY);else localStorage.setItem(KEY,previousRaw);};
   });
   state=incoming.journal;readBroken=false;storageBroken=false;$('#storage-warning').hidden=true;
   await loadLineups();lineupChannel?.postMessage('changed');render();toast('备份已恢复');
  },'备份并导入');
 }catch(err){toast(err instanceof SyntaxError?'文件不是有效的 JSON 备份':err.message);}
};
$('#view').addEventListener('click',e=>{const lineupEdit=e.target.closest('[data-lineup-edit]');if(lineupEdit){editLineup(lineupEdit.dataset.lineupEdit);return;}const copy=e.target.closest('[data-copy]');if(copy){copyCode(copy.dataset.copy);return;}const image=e.target.closest('[data-image-lineup]');if(image){viewImage(image.dataset.imageLineup,Number(image.dataset.imageIndex));return;}const edit=e.target.closest('[data-edit]');if(edit){editTask(edit.dataset.edit);return;}const action=e.target.closest('[data-action]')?.dataset.action;if(action==='add-lineup')editLineup();if(action==='retry-lineups')lineupLoad=loadLineups();if(action==='add')editTask();if(action==='resources')editResources();if(action==='clear-date'){historyDate='';renderHistory();}});
$('#view').addEventListener('change',e=>{if(e.target.matches('[data-task]')){const t=state.tasks.find(x=>x.id===e.target.dataset.task);try{mutate(()=>C.toggle(state,t));}catch(err){toast(err.message);render();}}});
window.addEventListener('storage',e=>{if(e.key!==KEY)return;if(!e.newValue){storageWarning('另一个页面清除了本地数据。本页数据仍在，可导出备份后重新打开。');return;}try{state=C.validate(JSON.parse(e.newValue));readBroken=false;render();toast('已同步另一页面的修改');}catch(err){storageWarning('另一页面写入的数据无效，已保留本页内容。');}});
function checkPeriod(){const p=C.periods(new Date(),state.settings.resetHour);if(lastPeriod!==p.day+'|'+p.week){render();toast('已进入新的待办周期，历史记录已保留');}}
setInterval(checkPeriod,30000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkPeriod();});
navigate();

async function loadLineups(){
 try{lineups=await LineupStore.all();lineupsReady=true;lineupError='';$('#lineup-warning').hidden=true;}
 catch(e){lineupsReady=false;lineupError=e.message;$('#lineup-warning').hidden=false;$('#lineup-warning').textContent='阵容数据暂不可用：'+e.message+'。待办功能仍可使用。';}
 if(tab==='lineups')renderLineups();
}
lineupChannel?.addEventListener('message',()=>{lineupLoad=loadLineups();});
window.addEventListener('focus',()=>{lineupLoad=loadLineups();});
function renderLineups(){
 let html=`<div class="view-heading"><div><h2>阵容码管理 <span class="pill">${lineupsReady?lineups.length:'—'}</span></h2><p class="caption">把常用阵容、截图和配速，放在一处。</p></div><button class="primary" data-action="add-lineup" ${lineupsReady?'':'disabled'}>＋ 新增阵容</button></div>`;
 if(!lineupsReady){$('#view').innerHTML=html+empty(lineupError?'暂时无法读取阵容':'正在读取阵容',lineupError?`${esc(lineupError)}<br><button class="quiet" data-action="retry-lineups">重新读取</button>`:'请稍候…');return;}
 const categories=[...new Set(lineups.map(l=>l.category))].sort((a,b)=>a.localeCompare(b,'zh-CN'));
 if(lineupCategory&&!categories.includes(lineupCategory))lineupCategory='';
 const query=lineupSearch.trim().toLowerCase();
 const selected=lineups.filter(l=>(!lineupCategory||l.category===lineupCategory)&&[l.title,l.category,l.note,l.code].some(v=>v.toLowerCase().includes(query))).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
 html+=`<div class="toolbar"><input id="lineup-search" type="search" maxlength="100" aria-label="搜索阵容" placeholder="搜索名称、阵容码或备注…" value="${esc(lineupSearch)}"><select id="lineup-category" aria-label="筛选玩法分类"><option value="">全部分类</option>${categories.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('')}</select></div>`;
 if(!selected.length)html+=empty(lineups.length?'没有匹配的阵容':'收好下一套心仪阵容','可单独保存阵容码文本、截图，或同时保存。');
 html+='<div class="lineup-grid">';
 for(const item of selected){
  html+=`<article class="lineup-card"><div class="lineup-heading"><div><span class="task-tag">${esc(item.category)}</span><h3>${esc(item.title)}</h3></div><button class="task-edit" data-lineup-edit="${esc(item.id)}" aria-label="编辑${esc(item.title)}">⋯</button></div>${item.images.length?`<div class="lineup-images">${item.images.map((img,i)=>`<button type="button" data-image-lineup="${esc(item.id)}" data-image-index="${i}" aria-label="查看${esc(item.title)}图片${i+1}"><img loading="lazy" src="${img.data}" alt="${esc(img.name)}"></button>`).join('')}</div>`:''}${item.code?`<div class="code-box"><pre>${esc(item.code)}</pre><button class="quiet" data-copy="${esc(item.id)}">复制阵容码</button></div>`:''}${item.note?`<p class="lineup-note">${esc(item.note)}</p>`:''}<div class="lineup-footer"><span>更新于 ${time(item.updatedAt)}</span><button class="text-button" data-lineup-edit="${esc(item.id)}">编辑阵容 ↗</button></div></article>`;
 }
 $('#view').innerHTML=html+'</div><p class="list-foot">阵容与图片保存在当前浏览器；导出完整备份可一并保存。每套最多 4 张图片，单张不超过 8 MB。</p>';
 $('#lineup-category').value=lineupCategory;
 $('#lineup-search').oninput=e=>{const start=e.target.selectionStart;lineupSearch=e.target.value;renderLineups();$('#lineup-search').focus();$('#lineup-search').setSelectionRange(start,start);};
 $('#lineup-category').onchange=e=>{lineupCategory=e.target.value;renderLineups();};
}
function decodeImage(data){return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>img.naturalWidth&&img.naturalHeight?resolve():reject(Error('图片无法读取'));img.onerror=()=>reject(Error('图片已损坏或格式不受支持'));img.src=data;});}
async function verifyImages(items){for(const item of items)for(const img of item.images)await decodeImage(img.data);}
function readImage(file){
 if(!['image/png','image/jpeg','image/webp','image/gif'].includes(file.type))throw Error('请选择 PNG、JPG、WebP 或 GIF 图片');
 if(file.size>8*1024*1024)throw Error('单张图片不能超过 8 MB');
 return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(Error('图片读取失败，请重新选择'));reader.onload=async()=>{try{await decodeImage(reader.result);resolve({name:file.name.slice(0,255),type:file.type,data:reader.result});}catch(e){reject(e);}};reader.readAsDataURL(file);});
}
function editLineup(id){
 if(!lineupsReady){toast('请先等待阵容数据读取完成');return;}
 const existing=lineups.find(l=>l.id===id);
 let images=existing?existing.images.map(i=>({...i})):[],uploading=false;
 const categories=[...new Set(['御魂','觉醒','探索','活动','斗技','其他',...lineups.map(l=>l.category)])];
 openModal(existing?'编辑阵容':'新增阵容',`${field('title','阵容名称','text',existing?.title||'','required maxlength="100" placeholder="例如：魂土速刷阵容"')}${field('category','玩法分类','text',existing?.category||'御魂','required maxlength="50" list="category-options"')}<datalist id="category-options">${categories.map(c=>`<option value="${esc(c)}">`).join('')}</datalist><label class="field">阵容码文本<textarea name="code" maxlength="20000" rows="4" placeholder="粘贴完整阵容码，也可以仅上传图片">${esc(existing?.code||'')}</textarea></label><label class="field">阵容截图<input id="lineup-files" type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif"></label><p class="caption">最多 4 张，单张不超过 8 MB。可删除后上传新图；保存后生效。</p><p id="image-status" class="caption" role="status"></p><div id="image-previews" class="image-previews"></div><label class="field">备注<textarea name="note" maxlength="2000" placeholder="记录配速、御魂要求或操作说明">${esc(existing?.note||'')}</textarea></label>${existing?'<button type="button" class="text-button danger" id="delete-lineup">删除此阵容</button>':''}`,async data=>{
  if(uploading)throw Error('图片还在读取，请稍候再保存');
  const title=data.get('title').trim(),category=data.get('category').trim(),code=data.get('code').trim(),note=data.get('note').trim();
  if(!title||!category)throw Error('请填写阵容名称和玩法分类');
  if(!code&&!images.length)throw Error('请至少填写阵容码文本或上传一张图片');
  const now=new Date().toISOString(),item={id:existing?.id||'l-'+cryptoId(),title,category,code,note,images,createdAt:existing?.createdAt||now,updatedAt:now};
  await LineupStore.put(item);
  lineupCategory='';await loadLineups();lineupChannel?.postMessage('changed');toast('阵容已保存');
 });
 const preview=()=>{
  $('#image-previews').innerHTML=images.map((img,i)=>`<div><img src="${img.data}" alt="${esc(img.name)}"><button type="button" class="quiet" data-remove-image="${i}">移除图片 ${i+1}</button></div>`).join('');
 };
 preview();
 $('#image-previews').onclick=e=>{const button=e.target.closest('[data-remove-image]');if(button&&!modalBusy&&!uploading){images.splice(Number(button.dataset.removeImage),1);preview();}};
 $('#lineup-files').onchange=async e=>{
  const files=[...e.target.files];e.target.value='';if(!files.length)return;
  if(images.length+files.length>4){toast('每套阵容最多保存 4 张图片');return;}
  uploading=true;const status=$('#image-status'),input=e.target;input.disabled=true;status.textContent='正在读取图片…';
  try{const added=[];for(const file of files)added.push(await readImage(file));if(!$('#modal').open||!status.isConnected)return;images.push(...added);preview();status.textContent=`已准备 ${images.length} 张图片，保存后生效。`;}
  catch(err){toast(err.message);status.textContent=err.message;}
  finally{uploading=false;input.disabled=false;}
 };
 if(existing)$('#delete-lineup').onclick=()=>{if(modalBusy||uploading)return;openModal('删除阵容',`<p class="modal-note">确定删除「${esc(existing.title)}」及其 ${existing.images.length} 张图片？可先取消并导出完整备份。</p>`,async()=>{await LineupStore.remove(existing.id);await loadLineups();lineupChannel?.postMessage('changed');toast('阵容已删除');},'确认删除');};
}
async function copyCode(id){
 const code=lineups.find(l=>l.id===id)?.code;if(!code)return;
 try{
  if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(code);toast('阵容码已复制');return;}
 }catch(e){}
 const area=document.createElement('textarea');area.value=code;area.style.cssText='position:fixed;left:-9999px';document.body.append(area);area.select();
 let copied=false;try{copied=document.execCommand('copy');}catch(e){}area.remove();
 if(copied)toast('阵容码已复制');else{openModal('复制阵容码',`<p class="modal-note">浏览器未允许自动复制，请选中下方文本后复制。</p><label class="field">阵容码<textarea id="manual-copy" readonly rows="6">${esc(code)}</textarea></label>`,null,'关闭');$('#manual-copy').select();}
}
function viewImage(id,index){
 const item=lineups.find(l=>l.id===id),img=item?.images[index];if(!img)return;
 openModal(item.title,`<img class="full-image" src="${img.data}" alt="${esc(img.name)}"><p class="modal-note">${esc(img.name)}</p><a class="quiet image-download" href="${img.data}" download="${esc(img.name)}">下载图片 ↗</a>`,null,'关闭');$('#modal').classList.add('image-modal');
}
