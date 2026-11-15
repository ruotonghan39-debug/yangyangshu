'use strict';
const C=JournalCore,$=s=>document.querySelector(s),KEY='yys-journal-v1';
const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state=C.fresh(),tab='daily',search='',filter='all',historyDate='',onSubmit=null,lastPeriod='',storageBroken=false,readBroken=false;
let toastTimer;
function toast(t){$('#toast').textContent=t;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),3000);}
function storageWarning(t){const el=$('#storage-warning');el.hidden=false;el.textContent=t;}
try{const raw=localStorage.getItem(KEY);if(raw)state=C.validate(JSON.parse(raw));}catch(e){readBroken=true;storageWarning('原有数据无法读取，已暂停写入。请在设置中下载原始数据，或导入有效备份后继续。');}
function save(){
 if(readBroken){toast('当前为只读模式，请先恢复备份');return false;}
 try{localStorage.setItem(KEY,JSON.stringify(state));if(storageBroken){storageBroken=false;$('#storage-warning').hidden=true;}return true;}
 catch(e){storageBroken=true;storageWarning('浏览器未能保存数据。本次改动仍在页面中，请立即导出备份，勿关闭页面。');return false;}
}
function mutate(fn){if(readBroken){toast('当前为只读模式，请先恢复备份');return;}try{fn();save();render();}catch(e){toast(e.message);}}
function isDone(t){return !!state.records[C.recordKey(t,new Date(),state.settings.resetHour)]?.done;}
const fmt=n=>new Intl.NumberFormat('zh-CN').format(n);
const time=t=>new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(t));
function renderSummary(){
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
 $('#resource-list').innerHTML=Object.entries(C.RESOURCES).map(([k,[n,u,icon]])=>`<div class="resource-row"><span class="resource-name"><span class="resource-icon" aria-hidden="true">${icon}</span>${n}</span><span><strong>${fmt(state.resources[k])}</strong><small>${u}</small></span></div>`).join('');
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
 for(const g of [...new Set(filtered.map(t=>t.group))]){html+=`<div class="group-label">${esc(g||'我的待办')}</div>`;for(const t of filtered.filter(t=>t.group===g)){const done=isDone(t);html+=`<div class="task ${done?'done':''}"><input type="checkbox" id="task-${esc(t.id)}" data-task="${esc(t.id)}" ${done?'checked':''}><div class="task-body"><label class="task-title" for="task-${esc(t.id)}">${esc(t.title)}</label>${t.note?`<div class="task-note">${esc(t.note)}</div>`:''}${t.reward?`<span class="task-tag">${esc(t.reward)}</span>`:''}</div><button class="task-edit" data-edit="${esc(t.id)}" aria-label="编辑${esc(t.title)}">⋯</button></div>`;}}
 html+=`<p class="list-foot">${tab==='once'?'此页不自动重置。神龛等非固定周期项目，请在实际刷新后取消勾选。':'周期切换时自动显示新一轮待办，旧记录会保留。'}<br>预置来源与奖励说明可编辑；标为「待核对」的项目请以游戏内当前版本为准。勾选不会自动增加资源。</p>`;
 $('#view').innerHTML=html;$('#filter').value=filter;
 $('#search').addEventListener('input',e=>{const start=e.target.selectionStart;search=e.target.value;renderTasks();$('#search').focus();$('#search').setSelectionRange(start,start);});
 $('#filter').addEventListener('change',e=>{filter=e.target.value;renderTasks();});
}
function renderResources(){
 let html=`<div class="view-heading"><div><h2>资源账本</h2><p class="caption">实际余额与每一次变化，都留有记录。</p></div><button class="primary" data-action="resources">更新余额</button></div>`;
 if(!state.ledger.length)html+=empty('还没有资源变动','从右侧「更新」录入游戏内的真实余额。');
 else html+=`<table class="ledger"><thead><tr><th>时间 / 备注</th><th>资源变动</th><th>变动后</th></tr></thead><tbody>${state.ledger.slice(0,200).map(l=>`<tr><td>${time(l.at)}<br><span class="caption">${esc(l.note)}</span></td><td>${Object.entries(l.delta).map(([k,v])=>`${C.RESOURCES[k][0]} <span style="color:${v>0?'#6b866a':'#9d5470'}">${v>0?'+':''}${fmt(v)}</span>`).join('<br>')}</td><td>${Object.keys(l.delta).map(k=>fmt(l.balance[k])).join('<br>')}</td></tr>`).join('')}</tbody></table><p class="list-foot">展示最近 200 条变动，完整记录保存在导出备份中。</p>`;
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
function render(){renderSummary();if(['daily','weekly','once'].includes(tab))renderTasks();else if(tab==='resources')renderResources();else renderHistory();}
function navigate(){const next=location.hash.slice(1);tab=['daily','weekly','once','resources','history'].includes(next)?next:'daily';search='';filter='all';render();}
window.addEventListener('hashchange',navigate);
function field(name,label,type,value,extra=''){return `<label class="field">${label}<input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;}
function openModal(title,content,handler,saveLabel='保存'){$('#modal-title').textContent=title;$('#modal-content').innerHTML=content;$('#save-modal').textContent=saveLabel;onSubmit=handler;$('#modal').showModal();}
function closeModal(){$('#modal').close();onSubmit=null;}
$('#close-modal').onclick=closeModal;$('#cancel-modal').onclick=closeModal;
$('#modal-form').onsubmit=e=>{e.preventDefault();try{if(onSubmit?.(new FormData(e.target))!==false)closeModal();}catch(err){toast(err.message);}};
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
function editResources(){openModal('更新资源余额',`<p class="modal-note">填写游戏内当前余额，系统将记录与上次的差值。</p><div class="form-grid">${Object.entries(C.RESOURCES).map(([k,[n,u]])=>field(k,`${n}（${u}）`,'number',state.resources[k],'required min="0" max="9007199254740991" step="1"')).join('')}</div>${field('note','本次备注','text','','maxlength="500" placeholder="例如：周常结算、抽卡或手动盘点"')}`,data=>{mutate(()=>C.updateResources(state,Object.fromEntries(Object.keys(C.RESOURCES).map(k=>[k,Number(data.get(k))])),data.get('note').trim()));});}
$('#edit-resources').onclick=editResources;
$('#synthesize').onclick=()=>openModal('记录黑蛋合成',`<p class="modal-note">确认你已在游戏内合成：账本将扣除 50 片黑碎，增加 1 颗黑蛋。</p>`,()=>mutate(()=>C.synthesize(state)),'记录合成');
$('#go-weekly').onclick=()=>{location.hash='weekly';};
function download(text,name,type='application/json'){const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function exportData(){download(JSON.stringify(state,null,2),'痒痒鼠备份-'+C.periods().day+'.json');toast('备份已导出');}
$('#export').onclick=exportData;
function settings(){openModal('偏好与数据',`<label class="field">每日重置时间（北京时间）<select name="resetHour">${Array.from({length:24},(_,i)=>`<option value="${i}">${String(i).padStart(2,'0')}:00</option>`).join('')}</select></label><p class="modal-note">周常在周一同一时间重置。调整时间会改变当天归属，旧记录保留。默认 00:00，可按游戏实际规则调整。</p><label class="field"><input style="display:inline;width:auto" type="checkbox" name="scenery" ${state.settings.scenery?'checked':''}> 展开背景欣赏模式</label><p class="modal-note">数据仅存在当前浏览器，换浏览器或清理网站数据前请备份。本地文件与 localhost 预览属于不同存储空间，请固定使用一种入口。</p><div class="settings-row"><button type="button" class="quiet" id="settings-export">导出备份</button><button type="button" class="quiet" id="settings-import">导入备份</button>${readBroken?'<button type="button" class="quiet" id="raw-export">下载原始数据</button>':''}</div><p class="modal-note">任务来源与奖励说明见项目内「奖励来源.md」。预置清单是可编辑的检查项，不自动计算奖励收入。</p>`,data=>mutate(()=>{state.settings.resetHour=Number(data.get('resetHour'));state.settings.scenery=data.get('scenery')==='on';}));$('#modal-content select').value=state.settings.resetHour;$('#settings-export').onclick=exportData;$('#settings-import').onclick=()=>$('#import-file').click();if($('#raw-export'))$('#raw-export').onclick=()=>{try{download(localStorage.getItem(KEY)||'','痒痒鼠原始数据.json');}catch(e){toast('浏览器无法读取原始存储');}};}
$('#settings').onclick=settings;
$('#import-file').onchange=async e=>{
 const file=e.target.files[0];e.target.value='';if(!file)return;
 try{if(file.size>20*1024*1024)throw Error('备份不能超过 20 MB');const incoming=C.validate(JSON.parse(await file.text()));
 if($('#modal').open)closeModal();
 openModal('导入备份',`<p class="modal-note">文件：${esc(file.name)}<br>包含 ${incoming.tasks.length} 项待办、${Object.keys(incoming.records).length} 条周期记录、${incoming.ledger.length} 条资源变动。</p><p class="modal-note">导入将替换当前手帖。点击「备份并导入」会先下载当前数据，再恢复所选备份。</p>`,()=>{
 // Store first: if this fails, the existing in-memory journal remains intact.
 const previousRaw=readBroken?localStorage.getItem(KEY):JSON.stringify(state,null,2);
 try{localStorage.setItem(KEY,JSON.stringify(incoming));}catch(err){throw Error('浏览器无法写入备份，请检查存储权限或空间。');}
 download(previousRaw||JSON.stringify(state,null,2),'痒痒鼠导入前备份-'+Date.now()+'.json');
 state=incoming;readBroken=false;storageBroken=false;$('#storage-warning').hidden=true;render();toast('备份已恢复');
 },'备份并导入');
 }catch(err){toast(err instanceof SyntaxError?'文件不是有效的 JSON 备份':err.message);}
};
$('#view').addEventListener('click',e=>{const edit=e.target.closest('[data-edit]');if(edit){editTask(edit.dataset.edit);return;}const action=e.target.closest('[data-action]')?.dataset.action;if(action==='add')editTask();if(action==='resources')editResources();if(action==='clear-date'){historyDate='';renderHistory();}});
$('#view').addEventListener('change',e=>{if(e.target.matches('[data-task]')){const t=state.tasks.find(x=>x.id===e.target.dataset.task);mutate(()=>C.toggle(state,t));if(readBroken)render();}});
window.addEventListener('storage',e=>{if(e.key!==KEY)return;if(!e.newValue){storageWarning('另一个页面清除了本地数据。本页数据仍在，可导出备份后重新打开。');return;}try{state=C.validate(JSON.parse(e.newValue));readBroken=false;render();toast('已同步另一页面的修改');}catch(err){storageWarning('另一页面写入的数据无效，已保留本页内容。');}});
function checkPeriod(){const p=C.periods(new Date(),state.settings.resetHour);if(lastPeriod!==p.day+'|'+p.week){render();toast('已进入新的待办周期，历史记录已保留');}}
setInterval(checkPeriod,30000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkPeriod();});
navigate();
