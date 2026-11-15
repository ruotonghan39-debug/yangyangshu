// Run with: node tests/core.test.cjs — no dependencies.
const {readFileSync}=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const path=require('node:path');
const sandbox={};vm.createContext(sandbox);
vm.runInContext(readFileSync(path.join(__dirname,'../core.js'),'utf8'),sandbox);
const C=sandbox.JournalCore;
let count=0;
function test(name,fn){fn();count++;console.log('PASS '+name);}
test('北京时间跨日',()=>{assert.equal(C.periods(new Date('2026-11-15T15:59:59Z')).day,'2026-11-15');assert.equal(C.periods(new Date('2026-11-15T16:00:00Z')).day,'2026-11-16');});
test('周一跨周',()=>{assert.equal(C.periods(new Date('2026-11-15T15:59:59Z')).week,'2026-11-09');assert.equal(C.periods(new Date('2026-11-15T16:00:00Z')).week,'2026-11-16');});
test('自定义凌晨5点重置',()=>{assert.equal(C.periods(new Date('2026-11-15T20:59:59Z'),5).day,'2026-11-15');assert.equal(C.periods(new Date('2026-11-15T21:00:00Z'),5).day,'2026-11-16');});
test('跨年周归属',()=>{assert.equal(C.periods(new Date('2027-01-01T04:00:00Z')).week,'2026-12-28');});
test('完成、取消与历史保留',()=>{const s=C.fresh(),t=s.tasks[0],n=new Date('2026-11-15T12:00:00Z');C.toggle(s,t,n);assert(s.records[C.recordKey(t,n,0)].done);assert(!s.records[C.recordKey(t,new Date('2026-11-16T12:00:00Z'),0)]);C.toggle(s,t,n);assert(!s.records[C.recordKey(t,n,0)].done);assert.equal(s.events.length,2);});
test('周常当周持续，下周清空',()=>{const s=C.fresh(),t=s.tasks.find(t=>t.cycle==='weekly'),n=new Date('2026-11-10T04:00:00Z');C.toggle(s,t,n);assert(s.records[C.recordKey(t,new Date('2026-11-15T04:00:00Z'),0)].done);assert(!s.records[C.recordKey(t,new Date('2026-11-16T04:00:00Z'),0)]);});
test('一次性任务不自动重置',()=>{const s=C.fresh(),t=s.tasks.find(t=>t.cycle==='once');C.toggle(s,t,new Date('2026-11-15T12:00:00Z'));assert(s.records[C.recordKey(t,new Date('2027-01-01T12:00:00Z'),0)].done);});
test('勾选不会增加资源',()=>{const s=C.fresh(),before=JSON.stringify(s.resources);C.toggle(s,s.tasks[0]);assert.equal(JSON.stringify(s.resources),before);});
test('合成和账本保持一致',()=>{const s=C.fresh();C.updateResources(s,{...s.resources,fragment:101},'盘点');C.synthesize(s);C.synthesize(s);assert.equal(s.resources.egg,2);assert.equal(s.resources.fragment,1);assert.equal(s.ledger.length,3);assert.throws(()=>C.synthesize(s));assert.equal(s.ledger.length,3);});
test('资源无变化不记账，非法数量拒绝',()=>{const s=C.fresh();assert.equal(C.updateResources(s,{...s.resources},''),false);assert.throws(()=>C.updateResources(s,{...s.resources,egg:-1},''));assert.throws(()=>C.updateResources(s,{...s.resources,gold:1.5},''));assert.equal(s.ledger.length,0);});
test('备份往返完整保留',()=>{const s=C.fresh();C.toggle(s,s.tasks[0]);C.updateResources(s,{...s.resources,jade:999},'盘点');assert.equal(JSON.stringify(C.validate(JSON.parse(JSON.stringify(s)))),JSON.stringify(s));});
test('畸形备份被拒绝',()=>{for(const change of [s=>s.version=2,s=>s.resources.egg=-1,s=>s.resources.gold=1.5,s=>s.tasks.push(s.tasks[0]),s=>s.tasks[0].title='',s=>s.settings.resetHour=24,s=>s.events.push({}),s=>s.records.bad={}]){const s=C.fresh();change(s);assert.throws(()=>C.validate(s));}});
test('万单位输入与旧整数余额精确往返',()=>{
 for(const k of ['gold','energy'])for(const n of [0,1,10,9999,10000,123456,123456789,Number.MAX_SAFE_INTEGER])assert.equal(C.parseResourceInput(k,C.resourceInput(k,n)),n);
 assert.equal(C.resourceInput('gold',123456),'12.3456');
 assert.equal(C.parseResourceInput('gold','12.3456'),123456);
 assert.equal(C.parseResourceInput('energy','.5'),5000);
 assert.equal(C.parseResourceInput('energy','0.0001'),1);
 assert.equal(C.parseResourceInput('jade','123'),123);
});
test('万单位更新精确记录一单位差值，备份格式保持兼容',()=>{
 const s=C.fresh();C.updateResources(s,{...s.resources,gold:123456,energy:1},'旧余额');
 C.updateResources(s,{...s.resources,gold:C.parseResourceInput('gold','12.3455'),energy:C.parseResourceInput('energy','0.125')},'小数更新');
 assert.equal(s.ledger[0].delta.gold,-1);assert.equal(s.ledger[0].delta.energy,1249);
 assert.equal(s.resources.gold,123455);assert.equal(s.resources.energy,1250);
 assert.equal(JSON.stringify(C.validate(s)),JSON.stringify(s));
 for(const [k,v] of [['gold','-1'],['gold','0.00001'],['energy','NaN'],['energy','Infinity'],['gold','900719925474.0992'],['egg','1.5'],['jade',''],['fragment','1e3']])assert.throws(()=>C.parseResourceInput(k,v));
});
test('游戏名称和等级随新旧备份保存与恢复',()=>{
 const s=C.fresh();s.settings.gameName='晴明 <测试>';s.settings.gameLevel=60;
 assert.equal(JSON.stringify(C.validate(s)),JSON.stringify(s));
 assert.equal(C.validateBackup({version:2,journal:s,lineups:[]}).journal.settings.gameName,'晴明 <测试>');
 const legacy=JSON.parse(JSON.stringify(s));delete legacy.settings.gameName;delete legacy.settings.gameLevel;
 const restored=C.validate(legacy);assert.equal(restored.settings.gameName,'');assert.equal(restored.settings.gameLevel,null);
 assert.equal(JSON.stringify(restored.tasks),JSON.stringify(s.tasks));assert.equal(JSON.stringify(restored.resources),JSON.stringify(s.resources));
});
test('拒绝无效游戏资料，允许只填名称或等级及清空',()=>{
 for(const profile of [{gameName:'阴阳师',gameLevel:null},{gameName:'',gameLevel:60},{gameName:'',gameLevel:null}])assert.doesNotThrow(()=>C.validate({...C.fresh(),settings:{...C.fresh().settings,...profile}}));
 for(const profile of [{gameName:null},{gameName:'x'.repeat(41)},{gameLevel:0},{gameLevel:-1},{gameLevel:1.5},{gameLevel:1000},{gameLevel:'60'}])assert.throws(()=>C.validate({...C.fresh(),settings:{...C.fresh().settings,...profile}}));
});
const lineup=(overrides={})=>({id:'l-test',title:'魂土速刷',category:'御魂',code:'CODE\n第二行',note:'配速 155',images:[],createdAt:'2026-11-15T10:00:00Z',updatedAt:'2026-11-15T10:00:00Z',...overrides});
test('阵容文字、图片和混合数据往返保留',()=>{
 const image={name:'截图.png',type:'image/png',data:'data:image/png;base64,aGVsbG8='};
 for(const item of [lineup(),lineup({code:'',images:[image]}),lineup({images:[image]})])assert.equal(JSON.stringify(C.validateLineups([item])),JSON.stringify([item]));
});
test('旧版备份兼容且不携带覆盖阵容指令',()=>{const journal=C.fresh(),backup=C.validateBackup(journal);assert.equal(JSON.stringify(backup.journal),JSON.stringify(journal));assert.equal(backup.lineups,null);});
test('完整备份保留原任务、账本、历史和阵容',()=>{const journal=C.fresh();C.toggle(journal,journal.tasks[0]);C.updateResources(journal,{...journal.resources,jade:1000},'测试');const backup={version:2,journal,lineups:[lineup()]};assert.equal(JSON.stringify(C.validateBackup(JSON.parse(JSON.stringify(backup)))),JSON.stringify({journal,lineups:backup.lineups}));});
test('拒绝空阵容、重复标识、无效图片和过量图片',()=>{
 for(const items of [[lineup({code:''})],[lineup({title:' '})],[lineup(),lineup()],[lineup({images:[{name:'x',type:'image/svg+xml',data:'data:image/svg+xml;base64,AAAA'}]})],[lineup({images:[{name:'x',type:'image/png',data:'data:image/png;base64,<script>'}]})],[lineup({images:Array(5).fill({name:'x',type:'image/png',data:'data:image/png;base64,AAAA'})})],[lineup({code:'x'.repeat(20001)})]])assert.throws(()=>C.validateLineups(items));
 assert.throws(()=>C.validateBackup({version:2,journal:C.fresh()}));
 assert.throws(()=>C.validateBackup({version:3}));
});
new vm.Script(readFileSync(path.join(__dirname,'../lineup-store.js'),'utf8'));
new vm.Script(readFileSync(path.join(__dirname,'../app.js'),'utf8'));
console.log(`${count} tests passed; application syntax valid.`);
