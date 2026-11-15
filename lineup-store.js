/* Images and lineup text stay in IndexedDB, outside the existing journal key. */
(function(root){
'use strict';
let connection;
function open(){
 if(connection)return connection;
 connection=new Promise((resolve,reject)=>{
  if(!root.indexedDB){reject(Error('此浏览器不支持阵容存储，请使用支持 IndexedDB 的浏览器'));return;}
  const request=indexedDB.open('yys-lineups-v1',1);let blocked=false;
  request.onupgradeneeded=()=>request.result.createObjectStore('lineups',{keyPath:'id'});
  request.onsuccess=()=>{const db=request.result;if(blocked){db.close();return;}db.onversionchange=()=>{db.close();connection=null;};resolve(db);};
  request.onerror=()=>reject(Error('阵容数据库无法打开，请检查浏览器存储权限'));
  request.onblocked=()=>{blocked=true;reject(Error('阵容数据库被其他页面占用，请关闭其他手帖页面后重试'));};
 }).catch(e=>{connection=null;throw e;});
 return connection;
}
async function all(){
 const db=await open();
 return new Promise((resolve,reject)=>{const tx=db.transaction('lineups','readonly'),req=tx.objectStore('lineups').getAll();tx.oncomplete=()=>{try{resolve(JournalCore.validateLineups(req.result));}catch(e){reject(e);}};tx.onabort=tx.onerror=()=>reject(Error('无法读取阵容数据，原有数据已保留'));});
}
async function write(action,beforeCommit){
 const db=await open();
 return new Promise((resolve,reject)=>{
  const tx=db.transaction('lineups','readwrite');let rollback,error;
  tx.oncomplete=()=>resolve();
  tx.onabort=()=>{try{rollback?.();}catch(e){error=Error('导入未完成，原始备份已下载，请重新导入恢复');}reject(error||Error('阵容保存失败，请检查浏览器存储空间后重试'));};
  tx.onerror=()=>{};
  try{
   action(tx.objectStore('lineups'));
   // This final request runs after all writes. A journal storage failure aborts
   // the image transaction; a later transaction failure restores the journal.
   const barrier=tx.objectStore('lineups').count();
   barrier.onsuccess=()=>{try{rollback=beforeCommit?.();}catch(e){error=e;tx.abort();}};
  }catch(e){error=e;tx.abort();}
 });
}
async function put(item){
 const clean=JournalCore.validateLineups([item])[0],db=await open();
 return new Promise((resolve,reject)=>{
  const tx=db.transaction('lineups','readwrite'),store=tx.objectStore('lineups');let error;
  tx.oncomplete=()=>resolve();tx.onerror=()=>{};
  tx.onabort=()=>reject(error||Error('阵容保存失败，请检查浏览器存储空间后重试'));
  const request=store.getAll();
  request.onsuccess=()=>{try{JournalCore.validateLineups([...request.result.filter(l=>l.id!==clean.id),clean]);store.put(clean);}catch(e){error=e;tx.abort();}};
 });
}
async function remove(id){await write(store=>store.delete(id));}
async function replace(items,beforeCommit){const clean=JournalCore.validateLineups(items);await write(store=>{store.clear();for(const item of clean)store.put(item);},beforeCommit);}
root.LineupStore={all,put,remove,replace};
})(globalThis);
