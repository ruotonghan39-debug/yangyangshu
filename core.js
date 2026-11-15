/* Pure data operations; runs in browsers and in the regression test runner. */
(function(root){
'use strict';
const RESOURCES={jade:['勾玉','','◈'],gold:['金币','万','◎'],ticket:['蓝票','','▱'],energy:['体力','万','ϟ'],egg:['黑蛋','','●'],fragment:['黑碎','','◕']};
const scaledResource=k=>k==='gold'||k==='energy';
// Keep existing balances and ledger entries in whole game units.
function resourceInput(k,n){
 if(!scaledResource(k))return String(n);
 const whole=Math.floor(n/10000),fraction=String(n%10000).padStart(4,'0').replace(/0+$/,'');
 return String(whole)+(fraction?'.'+fraction:'');
}
function parseResourceInput(k,value){
 const text=String(value).trim(),scaled=scaledResource(k);
 if(!(scaled?/^(?:\d+(?:\.\d{0,4})?|\.\d{1,4})$/:/^\d+$/).test(text))throw Error(scaled?'金币和体力按万填写，最多支持 4 位小数':'资源数量需为非负整数');
 const [whole,fraction='']=text.split('.'),n=BigInt(whole||'0')*BigInt(scaled?10000:1)+(scaled?BigInt(fraction.padEnd(4,'0')):0n);
 if(n>BigInt(Number.MAX_SAFE_INTEGER))throw Error('资源数量超出允许范围');
 return Number(n);
}
const dateKey=d=>new Date(d).toISOString().slice(0,10);
function periods(now=new Date(),hour=0){
 const game=new Date(now.getTime()+8*3600000-hour*3600000);
 const day=dateKey(game),monday=new Date(day+'T00:00:00Z');
 monday.setUTCDate(monday.getUTCDate()-((monday.getUTCDay()+6)%7));
 return {day,week:dateKey(monday)};
}
function period(task,now,hour){const p=periods(now,hour);return task.cycle==='daily'?'d:'+p.day:task.cycle==='weekly'?'w:'+p.week:'once';}
function recordKey(task,now,hour){return period(task,now,hour)+'|'+task.id;}
function fresh(){
 const defs=[
 ['daily','签到与免费礼包','登录签到，查看商店免费礼包。','日常收获','签到 / 免费礼包'],
 ['daily','每日任务与活跃奖励','完成日常并领取活跃度奖励。','日常收获','以游戏内奖励为准'],
 ['daily','悬赏封印','检查两轮悬赏与好友协作邀请。','日常收获','勾玉 / 金币等'],
 ['daily','地域鬼王挑战','按已解锁的挑战次数完成，记得领取结算。','日常收获','勾玉等 · 按实际结算'],
 ['daily','逢魔之时','参与逢魔并检查首领奖励、宝箱与邮件。','黑蛋黑碎','概率 / 条件奖励 · 待核对'],
 ['daily','结界卡与好友寄养','领取太鼓、斗鱼收益，安排下一轮寄养。','日常收获','勾玉 / 体力等'],
 ['daily','阴阳寮日常','检查寮任务、捐赠、道馆与当日寮活动。','阴阳寮','功勋 / 勋章等'],
 ['daily','阴界之门 / 寮宴会检查','仅开放日参与；具体开放时间由所在寮安排。','黑蛋黑碎','随机 / 条件奖励 · 待核对'],
 ['weekly','地域鬼王战绩分享','完成本周首次分享后，确认奖励已领取。','分享奖励','勾玉 · 数量待核对'],
 ['weekly','秘闻竞速 / 百战','检查本周开放副本，完成力所能及的层数。','周常挑战','勾玉 / 金币等'],
 ['weekly','秘闻战绩分享','与通关奖励分开检查，避免漏掉本周分享。','分享奖励','勾玉 · 数量待核对'],
 ['weekly','式神图鉴分享','进入式神图鉴，完成本周首次分享。','分享奖励','蓝票 · 数量待核对'],
 ['weekly','勋章商店兑换','检查御行达摩与蓝票的本周兑换额度。','黑蛋黑碎','黑蛋 / 蓝票 · 待核对'],
 ['weekly','荣誉商店兑换','检查御行达摩碎片的本周限购。','黑蛋黑碎','黑碎 · 待核对'],
 ['weekly','阴阳寮功勋商店','检查御行达摩碎片与蓝票兑换额度。','黑蛋黑碎','黑碎 / 蓝票 · 待核对'],
 ['weekly','魅力商店兑换','检查商店是否开放及黑碎剩余兑换次数。','黑蛋黑碎','黑碎 · 待核对'],
 ['weekly','斗技与周结算','完成自己的周目标并检查结算邮件。','周常挑战','勾玉 / 荣誉等'],
 ['once','神龛本期御行达摩','按神龛实际刷新周期检查；下期可手动取消勾选。','商店刷新','黑蛋 · 待核对'],
 ['once','秘闻副本首次通关','可为每个副本新增独立记录，追踪尚未领取的首通奖励。','一次性奖励','按副本实际奖励填写'],
 ['once','地域鬼王成就','仅记录尚未完成的成就，具体奖励逐条核对。','一次性奖励','条件奖励 · 待核对'],
 ['once','式神传记奖励','按式神逐条核对传记奖励，可新增单独条目。','一次性奖励','具体奖励待核对'],
 ['once','逢魔成就奖励','检查未完成的首领成就与一次性奖励。','一次性奖励','黑碎等 · 待核对']];
 return {version:1,tasks:defs.map((d,i)=>({id:'seed-'+i,cycle:d[0],title:d[1],note:d[2],group:d[3],reward:d[4]})),records:{},resources:Object.fromEntries(Object.keys(RESOURCES).map(k=>[k,0])),ledger:[],events:[],settings:{resetHour:0,scenery:false,gameName:'',gameLevel:null},createdAt:new Date().toISOString()};
}
function toggle(s,task,now=new Date()){
 const key=recordKey(task,now,s.settings.resetHour),prev=s.records[key];
 const checked=!(prev&&prev.done);
 s.records[key]={taskId:task.id,title:task.title,cycle:task.cycle,period:period(task,now,s.settings.resetHour),done:checked,at:now.toISOString()};
 s.events.unshift({at:now.toISOString(),title:task.title,action:checked?'完成待办':'取消完成',period:period(task,now,s.settings.resetHour)});
 return checked;
}
function updateResources(s,values,note,now=new Date()){
 for(const k of Object.keys(RESOURCES)){if(!Number.isSafeInteger(values[k])||values[k]<0)throw Error('资源数量需为非负整数');}
 const delta=Object.fromEntries(Object.keys(RESOURCES).filter(k=>values[k]!==s.resources[k]).map(k=>[k,values[k]-s.resources[k]]));
 if(!Object.keys(delta).length)return false;
 s.ledger.unshift({at:now.toISOString(),note:note||'手动更新余额',delta,balance:{...values}});s.resources={...values};return true;
}
function synthesize(s,now=new Date()){
 if(s.resources.fragment<50)throw Error('至少需要 50 片黑碎');
 return updateResources(s,{...s.resources,fragment:s.resources.fragment-50,egg:s.resources.egg+1},'合成 1 颗御行达摩（50 黑碎）',now);
}
function validate(v){
 const fail=()=>{throw Error('备份格式不正确或包含无效数据');};
 const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
 const str=(x,max=500)=>typeof x==='string'&&x.length<=max;
 const validDate=x=>str(x,40)&&Number.isFinite(Date.parse(x));
 const int=x=>Number.isSafeInteger(x)&&x>=0;
 const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
 const validPeriod=p=>p==='once'||(str(p,12)&&/^[dw]:\d{4}-\d{2}-\d{2}$/.test(p)&&Number.isFinite(Date.parse(p.slice(2))));
 if(!plain(v)||v.version!==1||!Array.isArray(v.tasks)||v.tasks.length>1000||!plain(v.records)||!plain(v.resources)||!Array.isArray(v.events)||!Array.isArray(v.ledger)||!plain(v.settings))fail();
 if(!Number.isInteger(v.settings.resetHour)||v.settings.resetHour<0||v.settings.resetHour>23||typeof v.settings.scenery!=='boolean'||!validDate(v.createdAt))fail();
 const gameName=own(v.settings,'gameName')?v.settings.gameName:'',gameLevel=own(v.settings,'gameLevel')?v.settings.gameLevel:null;
 if(!str(gameName,40)||(gameLevel!==null&&(!Number.isInteger(gameLevel)||gameLevel<1||gameLevel>999)))fail();
 const ids=new Set();
 for(const t of v.tasks){if(!plain(t)||!str(t.id,80)||!/^[\w-]+$/.test(t.id)||ids.has(t.id)||!['daily','weekly','once'].includes(t.cycle)||!str(t.title,100)||!t.title.trim()||!str(t.note)||!str(t.group,50)||!str(t.reward,150))fail();ids.add(t.id);}
 const records=Object.entries(v.records);if(records.length>100000||v.events.length>100000||v.ledger.length>100000)fail();
 for(const [key,r] of records){if(!plain(r)||!str(r.taskId,80)||!/^[\w-]+$/.test(r.taskId)||!str(r.title,100)||!['daily','weekly','once'].includes(r.cycle)||!validPeriod(r.period)||key!==r.period+'|'+r.taskId||typeof r.done!=='boolean'||!validDate(r.at))fail();}
 for(const k of Object.keys(RESOURCES)){if(!own(v.resources,k)||!int(v.resources[k]))fail();}
 for(const e of v.events){if(!plain(e)||!validDate(e.at)||!str(e.title,100)||!['完成待办','取消完成','删除待办'].includes(e.action)||!validPeriod(e.period))fail();}
 for(const l of v.ledger){if(!plain(l)||!validDate(l.at)||!str(l.note,500)||!plain(l.delta)||!plain(l.balance))fail();for(const k of Object.keys(RESOURCES))if(!int(l.balance[k]))fail();for(const [k,n] of Object.entries(l.delta))if(!own(RESOURCES,k)||!Number.isSafeInteger(n))fail();}
 // Reconstruct only supported fields; imported object keys never enter application prototypes.
 return {version:1,tasks:v.tasks.map(t=>({id:t.id,cycle:t.cycle,title:t.title,note:t.note,group:t.group,reward:t.reward})),records:Object.fromEntries(records.map(([k,r])=>[k,{taskId:r.taskId,title:r.title,cycle:r.cycle,period:r.period,done:r.done,at:r.at}])),resources:Object.fromEntries(Object.keys(RESOURCES).map(k=>[k,v.resources[k]])),ledger:v.ledger.map(l=>({at:l.at,note:l.note,delta:{...l.delta},balance:Object.fromEntries(Object.keys(RESOURCES).map(k=>[k,l.balance[k]]))})),events:v.events.map(e=>({at:e.at,title:e.title,action:e.action,period:e.period})),settings:{resetHour:v.settings.resetHour,scenery:v.settings.scenery,gameName,gameLevel},createdAt:v.createdAt};
}
function validateLineups(items){
 const fail=()=>{throw Error('阵容数据格式不正确，或超过容量上限（500 套、图片合计 90 MB）');};
 const str=(s,n)=>typeof s==='string'&&s.length<=n;
 const date=s=>str(s,40)&&Number.isFinite(Date.parse(s));
 if(!Array.isArray(items)||items.length>500)fail();
 const ids=new Set();let total=0;
 return items.map(item=>{
  if(!item||typeof item!=='object'||!str(item.id,80)||!/^[\w-]+$/.test(item.id)||ids.has(item.id)||!str(item.title,100)||!item.title.trim()||!str(item.category,50)||!item.category.trim()||!str(item.code,20000)||!str(item.note,2000)||!date(item.createdAt)||!date(item.updatedAt)||!Array.isArray(item.images)||item.images.length>4||(!item.code.trim()&&!item.images.length))fail();
  ids.add(item.id);
  const images=item.images.map(img=>{
   if(!img||!str(img.name,255)||!['image/png','image/jpeg','image/webp','image/gif'].includes(img.type)||!str(img.data,11200000))fail();
   const prefix='data:'+img.type+';base64,';
   if(!img.data.startsWith(prefix)||!img.data.slice(prefix.length)||!/^[A-Za-z0-9+/]+={0,2}$/.test(img.data.slice(prefix.length))||img.data.slice(prefix.length).length%4!==0)fail();
   const bytes=img.data.slice(prefix.length).length/4*3-(img.data.endsWith('==')?2:img.data.endsWith('=')?1:0);
   if(bytes>8*1024*1024)fail();total+=img.data.length;if(total>90*1024*1024)fail();
   return {name:img.name,type:img.type,data:img.data};
  });
  return {id:item.id,title:item.title,category:item.category,code:item.code,note:item.note,images,createdAt:item.createdAt,updatedAt:item.updatedAt};
 });
}
function validateBackup(value){
 if(value?.version===1)return {journal:validate(value),lineups:null};
 if(value?.version!==2)throw Error('备份版本不受支持');
 return {journal:validate(value.journal),lineups:validateLineups(value.lineups)};
}
root.JournalCore={RESOURCES,scaledResource,resourceInput,parseResourceInput,periods,period,recordKey,fresh,toggle,updateResources,synthesize,validate,validateLineups,validateBackup};
})(globalThis);
