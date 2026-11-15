"""Run with Python + playwright; uses an isolated temporary Chrome profile.
Start `python3 -m http.server 8765 --bind 127.0.0.1` first.
Set YYS_BROWSER if Chrome is installed elsewhere.
"""
import asyncio, base64, json, os, tempfile
from pathlib import Path
from playwright.async_api import async_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
URL = os.environ.get('YYS_TEST_URL', 'http://127.0.0.1:8765')
CHROME = os.environ.get('YYS_BROWSER', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5XcAAAAASUVORK5CYII=')

async def main():
 async with async_playwright() as p:
  browser = await p.chromium.launch(executable_path=CHROME, headless=True)
  context = await browser.new_context(viewport={'width':1440,'height':900}, permissions=['clipboard-read','clipboard-write'], accept_downloads=True)
  page = await context.new_page()
  errors = []
  page.on('pageerror', lambda e: errors.append(str(e)))
  checks = []
  def passed(name):
   checks.append(name);print('PASS',name,flush=True)
  async def tab(name):
   await page.locator(f'.tabs [data-tab={name}]').click()
   await expect(page.locator('body')).to_have_attribute('data-page',name)
  async def submit():
   await page.locator('#save-modal').click()
   await expect(page.locator('#modal')).not_to_be_visible()
  async def add_lineup(title, code='', image=False, category='御魂'):
   await page.locator('[data-action=add-lineup]').click()
   await page.locator('[name=title]').fill(title)
   await page.locator('[name=category]').fill(category)
   await page.locator('[name=code]').fill(code)
   if image:
    await page.locator('#lineup-files').set_input_files({'name':'截图.png','mimeType':'image/png','buffer':PNG})
    await expect(page.locator('#image-previews img')).to_have_count(1)
   await submit()
  async def import_value(value, success=True):
   await page.locator('#settings').click()
   await page.locator('#import-file').set_input_files({'name':'backup.json','mimeType':'application/json','buffer':json.dumps(value,ensure_ascii=False).encode()})
   await expect(page.locator('#modal-title')).to_have_text('导入备份')
   if success:
    async with page.expect_download():
     await submit()
   else:
    await page.locator('#save-modal').click()
    await expect(page.locator('#toast')).to_contain_text('原有数据未替换')
    await expect(page.locator('#modal')).to_be_visible()
    await page.locator('#cancel-modal').click()
  await page.goto(URL)
  await page.wait_for_function('lineupsReady')
  # Simulate an existing version-1 journal with real history and balances.
  original = await page.evaluate('''()=>{const s=C.fresh();C.toggle(s,s.tasks[0]);C.updateResources(s,{...s.resources,jade:1234,gold:123456,energy:1234567,fragment:101},'原有账本');s.tasks.push({id:'custom-old',cycle:'once',title:'原有自定义待办',group:'自建',note:'旧备注',reward:'旧奖励'});localStorage.setItem(KEY,JSON.stringify(s));return s;}''')
  raw = await page.evaluate('localStorage.getItem(KEY)')
  await page.reload();await page.wait_for_function('lineupsReady')
  assert await page.evaluate('localStorage.getItem(KEY)') == raw
  assert await page.evaluate('state') == original
  await expect(page.locator('[data-task=seed-0]')).to_be_checked()
  passed('旧版待办、历史、余额和设置原样读取，加载不写回')
  for width,height in [(1440,900),(1280,800),(1280,720),(1024,768),(390,844),(320,700)]:
   await page.set_viewport_size({'width':width,'height':height})
   assert await page.evaluate('document.documentElement.scrollWidth <= innerWidth'), f'overflow at {width}'
   if width>=1280:
    assert await page.evaluate('Math.max(...[...document.querySelectorAll(".task")].map(e=>e.getBoundingClientRect().bottom))<innerHeight'),f'tasks below fold {width}'
  await page.set_viewport_size({'width':1440,'height':900})
  passed('六种窗口无横向溢出，MacBook 尺寸默认每日待办一屏可见')
  await page.locator('#player-profile').click()
  await page.locator('[name=gameName]').fill('晴明 <测试>')
  await page.locator('[name=gameLevel]').fill('60')
  await submit()
  await expect(page.locator('#player-name')).to_have_text('晴明 <测试>')
  await expect(page.locator('#player-level')).to_have_text('Lv. 60')
  assert await page.evaluate('state.resources')==original['resources']
  assert await page.evaluate('state.settings.resetHour')==original['settings']['resetHour']
  await page.reload();await page.wait_for_function('lineupsReady')
  await expect(page.locator('#player-name')).to_have_text('晴明 <测试>')
  await page.locator('#settings').click()
  await expect(page.locator('[name=gameName]')).to_have_value('晴明 <测试>')
  await expect(page.locator('[name=gameLevel]')).to_have_value('60')
  await page.locator('[name=gameName]').fill('取消后不保存')
  await page.locator('#cancel-modal').click()
  await expect(page.locator('#player-name')).to_have_text('晴明 <测试>')
  await page.locator('#player-profile').click()
  await page.locator('[name=gameLevel]').fill('1.5')
  await page.locator('#save-modal').click()
  await expect(page.locator('#modal')).to_be_visible()
  await page.locator('[name=gameName]').fill('')
  await page.locator('[name=gameLevel]').fill('')
  await submit()
  await expect(page.locator('#player-name')).to_have_text('设置游戏名称')
  await expect(page.locator('#player-level')).not_to_be_visible()
  await page.locator('#player-profile').click()
  await page.locator('[name=gameName]').fill('阴阳师'*13)
  await page.locator('[name=gameLevel]').fill('60')
  await submit()
  await page.set_viewport_size({'width':320,'height':700})
  assert await page.evaluate('document.documentElement.scrollWidth <= innerWidth')
  await expect(page.locator('#player-level')).to_be_visible()
  await page.set_viewport_size({'width':1440,'height':900})
  passed('游戏资料设置、展示、刷新保存、取消、清空、非法等级与手机长名称适配')
  await page.locator('.task-details summary').first.click()
  await expect(page.locator('.task-note').first).to_be_visible()
  await page.locator('#search').fill('领取太鼓')
  await expect(page.locator('.task')).to_have_count(1)
  await page.locator('#search').fill('')
  await page.locator('#filter').select_option('done')
  await expect(page.locator('.task')).to_have_count(1)
  await page.locator('#filter').select_option('all')
  await page.locator('[data-task=seed-0]').uncheck()
  await page.locator('[data-task=seed-0]').check()
  await tab('weekly');await page.locator('[data-task=seed-8]').check()
  await tab('once');await expect(page.locator('#view')).to_contain_text('原有自定义待办')
  await tab('history');await expect(page.locator('.log-entry').first).to_contain_text('完成待办')
  await tab('resources');await expect(page.locator('.ledger')).to_contain_text('原有账本')
  await page.locator('#synthesize').click();await submit()
  assert await page.evaluate('state.resources.fragment') == 51
  assert await page.evaluate('state.resources.egg') == 1
  passed('任务勾选、搜索、筛选、周常、奖励、历史、账本与合成回归')
  await page.locator('#edit-resources').click()
  await expect(page.locator('[name=gold]')).to_have_value('12.3456')
  await expect(page.locator('[name=energy]')).to_have_value('123.4567')
  before_count=await page.evaluate('state.ledger.length')
  await submit()
  assert await page.evaluate('state.ledger.length')==before_count
  await page.locator('#edit-resources').click()
  await page.locator('[name=gold]').fill('12.3455')
  await page.locator('[name=energy]').fill('0.125')
  await submit()
  assert await page.evaluate('state.resources.gold')==123455
  assert await page.evaluate('state.resources.energy')==1250
  assert await page.evaluate('state.ledger[0].delta.gold')==-1
  await expect(page.locator('.resource-row').nth(1)).to_contain_text('12.3455万')
  await expect(page.locator('.resource-row').nth(3)).to_contain_text('0.125万')
  await expect(page.locator('.resource-row small')).to_have_count(2)
  await expect(page.locator('.ledger tbody tr').first).to_contain_text('-0.0001万')
  await page.reload();await page.wait_for_function('lineupsReady')
  assert await page.evaluate('state.resources.gold')==123455
  assert await page.evaluate('state.resources.energy')==1250
  passed('万单位小数输入、旧余额无损换算、一单位差值、无修改不记账及刷新持久化')

  await tab('daily');await page.locator('[data-action=add]').click()
  await page.locator('[name=title]').fill('测试新增任务');await submit()
  await page.get_by_role('button',name='编辑测试新增任务',exact=True).click()
  await page.locator('[name=title]').fill('测试编辑任务');await submit()
  await page.get_by_role('button',name='编辑测试编辑任务',exact=True).click()
  await page.locator('#delete-task').click();await submit()
  assert await page.evaluate('state.events[0].action') == '删除待办'
  passed('原有待办新增、编辑、删除和删除历史')
  await tab('lineups')
  await page.locator('[data-action=add-lineup]').click()
  await page.locator('[name=title]').fill('空阵容')
  await page.locator('#save-modal').click()
  await expect(page.locator('#toast')).to_contain_text('至少填写')
  await expect(page.locator('#modal')).to_be_visible();await page.locator('#cancel-modal').click()
  await add_lineup('文本阵容','完整阵容码\nCODE-123',category='斗技')
  await add_lineup('截图阵容',image=True)
  await add_lineup('混合阵容','CODE-MIX',image=True,category='活动')
  await expect(page.locator('.lineup-card')).to_have_count(3)
  await page.locator('#lineup-search').fill('CODE-123')
  await expect(page.locator('.lineup-card')).to_have_count(1)
  await page.locator('[data-copy]').click()
  assert await page.evaluate('navigator.clipboard.readText()') == '完整阵容码\nCODE-123'
  await page.locator('#lineup-search').fill('')
  await page.locator('#lineup-category').select_option('活动')
  await expect(page.locator('.lineup-card')).to_have_count(1)
  await page.locator('[data-image-lineup]').click()
  await expect(page.locator('.full-image')).to_be_visible();await submit()
  await page.locator('#lineup-category').select_option('')
  await page.reload();await page.wait_for_function('lineupsReady')
  await expect(page.locator('.lineup-card')).to_have_count(3)
  passed('文字、图片、混合阵容新增；分类、搜索、复制、预览、刷新持久化')
  card = page.locator('.lineup-card').filter(has=page.get_by_role('heading',name='混合阵容',exact=True))
  await card.get_by_text('编辑阵容').click()
  await page.locator('[data-remove-image]').click()
  await page.locator('#cancel-modal').click()
  assert await page.evaluate('lineups.find(l=>l.title==="混合阵容").images.length')==1
  await card.get_by_text('编辑阵容').click()
  await page.locator('[name=title]').fill('混合阵容已编辑')
  await page.locator('[data-remove-image]').click()
  await page.locator('#lineup-files').set_input_files({'name':'新截图.png','mimeType':'image/png','buffer':PNG})
  await expect(page.locator('#image-previews img')).to_have_count(1)
  await page.locator('[name=note]').fill('配速 155\n操作说明');await submit()
  await page.get_by_role('button',name='编辑混合阵容已编辑',exact=True).click()
  await page.locator('#delete-lineup').click();await page.locator('#cancel-modal').click()
  await expect(page.locator('.lineup-card')).to_have_count(3)
  passed('阵容编辑、图片移除/更换、取消编辑与取消删除保留原图')
  # Reject invalid images while leaving the edit dialog and database intact.
  await page.get_by_role('button',name='编辑截图阵容',exact=True).click()
  await page.locator('#lineup-files').set_input_files({'name':'bad.png','mimeType':'image/png','buffer':b'not-an-image'})
  await expect(page.locator('#toast')).to_contain_text('图片已损坏')
  await page.locator('#lineup-files').set_input_files({'name':'x.svg','mimeType':'image/svg+xml','buffer':b'<svg/>'})
  await expect(page.locator('#toast')).to_contain_text('请选择 PNG')
  await page.locator('#lineup-files').set_input_files({'name':'huge.png','mimeType':'image/png','buffer':b'x'*(8*1024*1024+1)})
  await expect(page.locator('#toast')).to_contain_text('不能超过 8 MB')
  await page.locator('#cancel-modal').click()
  passed('拒绝损坏图片、SVG 与超限文件，已有图片不变')
  # Real storage failure injection: IDB write abort must keep saved content.
  before = await page.evaluate('LineupStore.all()')
  await page.get_by_role('button',name='编辑文本阵容',exact=True).click()
  await page.locator('[name=title]').fill('不应保存')
  await page.evaluate('()=>{window.originalPut=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(){throw new DOMException("quota","QuotaExceededError")};}')
  await page.locator('#save-modal').click()
  await expect(page.locator('#toast')).to_contain_text('quota')
  await expect(page.locator('#modal')).to_be_visible()
  await page.evaluate('()=>{IDBObjectStore.prototype.put=window.originalPut;}')
  await page.locator('#cancel-modal').click()
  assert await page.evaluate('LineupStore.all()') == before
  passed('IndexedDB 写入失败保留旧阵容，编辑弹窗保持可重试')
  async with page.expect_download() as download_info:
   await page.locator('#export').click()
  download = await download_info.value
  backup = json.loads(Path(await download.path()).read_text())
  assert backup['version']==2 and len(backup['lineups'])==3
  assert backup['lineups'][1]['images'] or backup['lineups'][2]['images']
  assert backup['journal'] == await page.evaluate('state')
  assert backup['journal']['settings']['gameLevel']==60
  assert backup['journal']['settings']['gameName']=='阴阳师'*13
  await page.get_by_role('button',name='编辑截图阵容',exact=True).click()
  await page.locator('#delete-lineup').click();await submit()
  await expect(page.locator('.lineup-card')).to_have_count(2)
  await import_value(backup)
  assert await page.evaluate('LineupStore.all()') == backup['lineups']
  assert await page.evaluate('state') == backup['journal']
  await expect(page.locator('#player-level')).to_have_text('Lv. 60')
  # A legacy journal backup deliberately retains all current lineup data.
  await import_value(original)
  assert await page.evaluate('state') == original
  assert await page.evaluate('LineupStore.all()') == backup['lineups']
  passed('完整备份含原图并可恢复；旧版导入保留阵容与图片')
  # Cross-store failure: localStorage failure aborts the image transaction too.
  before_journal = await page.evaluate('localStorage.getItem(KEY)')
  before_lineups = await page.evaluate('LineupStore.all()')
  await page.evaluate('()=>{window.originalSet=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k===KEY)throw new DOMException("quota","QuotaExceededError");return window.originalSet.call(this,k,v)};}')
  await import_value(backup,False)
  await page.evaluate('()=>{Storage.prototype.setItem=window.originalSet;}')
  assert await page.evaluate('localStorage.getItem(KEY)') == before_journal
  assert await page.evaluate('LineupStore.all()') == before_lineups
  passed('导入时旧存储写入失败：待办和图片同时保持原样')
  # Fail after the journal write but before IDB completion; rollback restores it.
  result = await page.evaluate('''async()=>{
   const previous=localStorage.getItem(KEY),items=await LineupStore.all(),originalCount=IDBObjectStore.prototype.count;
   IDBObjectStore.prototype.count=function(...args){window.lastImportTx=this.transaction;return originalCount.apply(this,args);};
   let failed=false;
   try{await LineupStore.replace([],()=>{localStorage.setItem(KEY,'temporary');window.lastImportTx.abort();return ()=>localStorage.setItem(KEY,previous);});}catch(e){failed=true;}
   finally{IDBObjectStore.prototype.count=originalCount;}
   return failed&&localStorage.getItem(KEY)===previous&&JSON.stringify(await LineupStore.all())===JSON.stringify(items);
  }''')
  assert result
  passed('导入事务末尾失败：已写入的待办回滚，阵容图片保留')
  # Invalid JSON/schema must not replace anything.
  await page.locator('#settings').click()
  await page.locator('#import-file').set_input_files({'name':'invalid.json','mimeType':'application/json','buffer':b'{"version":2}'})
  await expect(page.locator('#toast')).to_contain_text('备份格式不正确')
  assert await page.evaluate('LineupStore.all()') == before_lineups
  await page.locator('#cancel-modal').click()
  # Unavailable IndexedDB must leave the original journal usable and exportable.
  unavailable=await browser.new_context(accept_downloads=True)
  await unavailable.add_init_script("Object.defineProperty(window,'indexedDB',{value:undefined});")
  blocked_page=await unavailable.new_page();await blocked_page.goto(URL)
  await expect(blocked_page.locator('#lineup-warning')).to_be_visible()
  await blocked_page.locator('[data-task=seed-0]').check()
  await expect(blocked_page.locator('[data-task=seed-0]')).to_be_checked()
  await blocked_page.locator('#settings').click()
  async with blocked_page.expect_download() as journal_download:
   await blocked_page.locator('#journal-export').click()
  partial=json.loads(Path(await (await journal_download.value).path()).read_text())
  assert partial['version']==1 and len(partial['records'])==1
  await unavailable.close()
  passed('阵容数据库不可用时，原有待办仍可保存和导出')
  corrupted=await browser.new_context(accept_downloads=True)
  await corrupted.add_init_script("localStorage.setItem('yys-journal-v1','{broken');")
  corrupt_page=await corrupted.new_page();await corrupt_page.goto(URL)
  await expect(corrupt_page.locator('#storage-warning')).to_be_visible()
  await corrupt_page.locator('[data-task=seed-0]').click()
  await expect(corrupt_page.locator('[data-task=seed-0]')).not_to_be_checked()
  assert await corrupt_page.evaluate("localStorage.getItem('yys-journal-v1')")=='{broken'
  await corrupt_page.locator('#settings').click()
  async with corrupt_page.expect_download() as raw_download:
   await corrupt_page.locator('#raw-export').click()
  assert Path(await (await raw_download.value).path()).read_text()=='{broken'
  await corrupted.close()
  passed('损坏的原始数据只读保护及原文下载，不被新数据覆盖')
  # Invalid persisted lineup data rejects promptly rather than hanging a read.
  await page.evaluate('''async()=>{const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('yys-lineups-v1',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});await new Promise((resolve,reject)=>{const tx=db.transaction('lineups','readwrite');tx.objectStore('lineups').put({id:'invalid'});tx.oncomplete=resolve;tx.onabort=reject;});db.close();await loadLineups();}''')
  await expect(page.locator('#lineup-warning')).to_be_visible()
  assert await page.evaluate('lineupsReady') is False
  assert await page.evaluate('localStorage.getItem(KEY)') == before_journal
  await page.evaluate('(items)=>LineupStore.replace(items)',before_lineups)
  await page.evaluate('loadLineups()')
  await expect(page.locator('#lineup-warning')).not_to_be_visible()
  passed('损坏阵容数据及时提示、保留待办，恢复后可重新读取')
  # Another tab sees committed lineup updates through BroadcastChannel.
  page2=await context.new_page();await page2.goto(URL+'/#lineups');await page2.wait_for_function('lineupsReady')
  await add_lineup('多页面同步','SYNC')
  await expect(page2.locator('.lineup-card')).to_have_count(4)
  await page2.close()
  passed('无效备份不覆盖；同源多页面阵容更新通知')
  # File entry remains usable and keeps the same localStorage journal key.
  file_context=await browser.new_context()
  file_page=await file_context.new_page();await file_page.goto((ROOT/'index.html').as_uri())
  await file_page.wait_for_function('lineupsReady')
  await file_page.locator('.tabs [data-tab=lineups]').click()
  await file_page.locator('[data-action=add-lineup]').click()
  await file_page.locator('[name=title]').fill('本地文件阵容')
  await file_page.locator('[name=code]').fill('FILE-CODE')
  await file_page.locator('#save-modal').click();await expect(file_page.locator('#modal')).not_to_be_visible()
  await file_page.reload();await file_page.wait_for_function('lineupsReady')
  await expect(file_page.locator('.lineup-card')).to_have_count(1)
  await file_context.close()
  passed('双击本地 HTML 入口：IndexedDB 阵容保存与刷新恢复')
  # Screenshots use only the isolated test profile.
  output=Path(os.environ.get('YYS_SCREENSHOTS',tempfile.mkdtemp(prefix='yys-screenshots-')));output.mkdir(parents=True,exist_ok=True)
  await tab('daily');await page.locator('#toast').evaluate("e=>e.classList.remove('show')");await page.screenshot(path=str(output/'desktop.png'),full_page=True)
  await tab('lineups');await page.screenshot(path=str(output/'lineups.png'),full_page=True)
  await page.set_viewport_size({'width':390,'height':844});await page.screenshot(path=str(output/'mobile.png'),full_page=True)
  assert not errors,errors
  passed('浏览器运行无脚本异常')
  print(f'{len(checks)} browser checks passed; screenshots: {output}',flush=True)
  await browser.close()

asyncio.run(main())
