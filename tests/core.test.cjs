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
new vm.Script(readFileSync(path.join(__dirname,'../app.js'),'utf8'));
console.log(`${count} tests passed; application syntax valid.`);
