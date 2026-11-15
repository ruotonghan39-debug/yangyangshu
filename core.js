/* Pure data operations; runs in browsers and in the regression test runner. */
(function(root){
'use strict';
const RESOURCES={jade:['勾玉','枚','◈'],gold:['金币','枚','◎'],ticket:['蓝票','张','▱'],energy:['体力','点','ϟ'],egg:['黑蛋','颗','●'],fragment:['黑碎','片','◕']};
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
 return {version:1,tasks:defs.map((d,i)=>({id:'seed-'+i,cycle:d[0],title:d[1],note:d[2],group:d[3],reward:d[4]})),records:{},resources:Object.fromEntries(Object.keys(RESOURCES).map(k=>[k,0])),ledger:[],events:[],settings:{resetHour:0,scenery:false},createdAt:new Date().toISOString()};
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
 const ids=new Set();
 for(const t of v.tasks){if(!plain(t)||!str(t.id,80)||!/^[\w-]+$/.test(t.id)||ids.has(t.id)||!['daily','weekly','once'].includes(t.cycle)||!str(t.title,100)||!t.title.trim()||!str(t.note)||!str(t.group,50)||!str(t.reward,150))fail();ids.add(t.id);}
 const records=Object.entries(v.records);if(records.length>100000||v.events.length>100000||v.ledger.length>100000)fail();
 for(const [key,r] of records){if(!plain(r)||!str(r.taskId,80)||!/^[\w-]+$/.test(r.taskId)||!str(r.title,100)||!['daily','weekly','once'].includes(r.cycle)||!validPeriod(r.period)||key!==r.period+'|'+r.taskId||typeof r.done!=='boolean'||!validDate(r.at))fail();}
 for(const k of Object.keys(RESOURCES)){if(!own(v.resources,k)||!int(v.resources[k]))fail();}
 for(const e of v.events){if(!plain(e)||!validDate(e.at)||!str(e.title,100)||!['完成待办','取消完成','删除待办'].includes(e.action)||!validPeriod(e.period))fail();}
 for(const l of v.ledger){if(!plain(l)||!validDate(l.at)||!str(l.note,500)||!plain(l.delta)||!plain(l.balance))fail();for(const k of Object.keys(RESOURCES))if(!int(l.balance[k]))fail();for(const [k,n] of Object.entries(l.delta))if(!own(RESOURCES,k)||!Number.isSafeInteger(n))fail();}
 // Reconstruct only supported fields; imported object keys never enter application prototypes.
 return {version:1,tasks:v.tasks.map(t=>({id:t.id,cycle:t.cycle,title:t.title,note:t.note,group:t.group,reward:t.reward})),records:Object.fromEntries(records.map(([k,r])=>[k,{taskId:r.taskId,title:r.title,cycle:r.cycle,period:r.period,done:r.done,at:r.at}])),resources:Object.fromEntries(Object.keys(RESOURCES).map(k=>[k,v.resources[k]])),ledger:v.ledger.map(l=>({at:l.at,note:l.note,delta:{...l.delta},balance:Object.fromEntries(Object.keys(RESOURCES).map(k=>[k,l.balance[k]]))})),events:v.events.map(e=>({at:e.at,title:e.title,action:e.action,period:e.period})),settings:{resetHour:v.settings.resetHour,scenery:v.settings.scenery},createdAt:v.createdAt};
}
root.JournalCore={RESOURCES,periods,period,recordKey,fresh,toggle,updateResources,synthesize,validate};
})(globalThis);
