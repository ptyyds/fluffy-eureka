const { _electron }=require('playwright');
const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
const os=require('node:os');
const project=path.resolve(__dirname,'..');
(async()=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'whaledesk-e2e-'));
 await fs.writeFile(path.join(temp,'source.txt'),'来自真实文件的内容');
 console.log('launching');
 const app=await _electron.launch({timeout:20000,executablePath:path.join(project,'node_modules/electron/dist/electron.exe'),args:[project,'--disable-gpu','--user-data-dir='+path.join(temp,'profile')],env:{...process.env,WHALEDESK_E2E:'1'}});
 let passed=[];passed.push=(...items)=>{console.log('PASS',...items);return Array.prototype.push.apply(passed,items);};
 try{
  console.log('launched');await app.firstWindow();let page;for(let i=0;i<40;i++){page=app.windows().find(p=>p.url().startsWith('file:'));if(page)break;await new Promise(r=>setTimeout(r,100));}if(!page)throw Error('Local app window not ready');page.setDefaultTimeout(15000);await page.waitForSelector('#prepare');await page.screenshot({path:path.join(project,'preview.png')});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await app.evaluate(({dialog},root)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[root]});dialog.showMessageBox=async()=>({response:1});},temp);
  await page.locator('#chooseWorkspace').click();await page.waitForFunction(()=>document.querySelector('#files').textContent.includes('source.txt'));passed.push('native workspace selection and real directory listing');
  await page.locator('#task').fill('测试常用浏览器回退');await page.locator('#copyTask').click();await page.locator('#modalConfirm').click();const copied=await app.evaluate(({clipboard})=>clipboard.readText());assert(copied.includes('测试常用浏览器回退')&&copied.includes('"whaledesk":1'));passed.push('browser fallback copies the full tool protocol');
  const protocol={whaledesk:1,title:'真实文件闭环',message:'创建、移动、读取',steps:[{tool:'make_directory',path:'成果'},{tool:'write_text',path:'成果/hello.md',content:'# 鲸台\n真实生成的文件。'},{tool:'move_file',path:'source.txt',to:'成果/source.txt'},{tool:'read_text',path:'成果/source.txt'}]};
  await page.locator('#pastePlan').click();await page.locator('#planText').fill(JSON.stringify(protocol));await page.locator('#modalConfirm').click();await page.waitForFunction(()=>document.querySelector('#planBadge').textContent.includes('4 个'));
  await assert.rejects(fs.access(path.join(temp,'成果/hello.md')));passed.push('importing a plan does not execute it');
  await page.locator('#approve').click();await page.waitForSelector('#modal[open]');await assert.rejects(fs.access(path.join(temp,'成果/hello.md')));await page.locator('#modalConfirm').click();
  await page.waitForFunction(()=>document.querySelector('#planBadge').textContent==='本轮完成');
  assert.equal(await fs.readFile(path.join(temp,'成果/hello.md'),'utf8'),'# 鲸台\n真实生成的文件。');assert.equal(await fs.readFile(path.join(temp,'成果/source.txt'),'utf8'),'来自真实文件的内容');assert((await page.locator('#receipt').textContent()).includes('来自真实文件的内容'));passed.push('preview approval executes actual file tools and produces receipt');
  await page.locator('#sendReceipt').click();await page.waitForSelector('#receiptText');assert((await page.locator('#receiptText').inputValue()).includes('来自真实文件的内容'));await page.locator('#modalCancel').click();passed.push('receipt sharing can be reviewed and cancelled');
  await page.locator('#undo').click();await page.locator('#modalConfirm').click();await page.waitForFunction(()=>document.querySelector('#files').textContent.includes('source.txt'));assert.equal(await fs.readFile(path.join(temp,'source.txt'),'utf8'),'来自真实文件的内容');passed.push('UI undo restores the moved file');
  await page.locator('#task').fill('整理文本文件');await page.locator('#saveRecipe').count();
  await page.locator('[data-nav="recipes"]').click();await page.locator('#addRecipe').click();await page.locator('#recipeName').fill('我的测试技能');await page.locator('#recipeTask').fill('先查看目录，再汇总文本');await page.locator('#modalConfirm').click();await page.waitForSelector('.recipe-card');await page.locator('.recipe-card').first().click();assert.equal(await page.locator('#task').inputValue(),'先查看目录，再汇总文本');passed.push('recipe persistence and reuse');
  await page.locator('[data-nav="history"]').click();await page.waitForSelector('.history-item');assert((await page.locator('#historyList').textContent()).includes('move_file'));assert(!(await page.locator('#historyList').textContent()).includes('来自真实文件的内容'));passed.push('history excludes file contents');
  await page.locator('[data-nav="desk"]').click();await page.locator('#newTask').click();
  const stale=await page.evaluate(()=>window.whale.execute({}));assert.equal(stale.ok,false);passed.push('new task clears previous execution authorization');
  const cmd={whaledesk:1,title:'命令回执',steps:[{tool:'run_command',command:"Write-Output '鲸台命令测试'"}]};
  await page.locator('#pastePlan').click();await page.locator('#planText').fill(JSON.stringify(cmd));await page.locator('#modalConfirm').click();await page.locator('#approve').click();await page.locator('#commands').check();await page.locator('#modalConfirm').click();await page.waitForFunction(()=>document.querySelector('#planBadge').textContent==='本轮完成');assert((await page.locator('#receipt').textContent()).includes('鲸台命令测试'));passed.push('PowerShell executes with explicit permission and UTF-8 receipt');
  // Native remote page isolation, verified without contacting DeepSeek.
  const isolation=await app.evaluate(({webContents})=>webContents.getAllWebContents().filter(w=>w.getURL()==='about:blank').map(w=>({node:w.getLastWebPreferences().nodeIntegration,sandbox:w.getLastWebPreferences().sandbox,preload:w.getLastWebPreferences().preload})));
  assert.equal(isolation.length,1);assert(isolation.every(v=>v.node===false&&v.sandbox===true&&!v.preload));passed.push('remote view is sandboxed without Node or preload');
  // Exercise actual DOM adapter against an owned fixture rendered in the remote view.
  const adapter=require(path.join(project,'src/adapter.cjs'));
  const domResult=await app.evaluate(async({webContents},{read,fill})=>{
    const wc=webContents.getAllWebContents().find(w=>w.getURL()==='about:blank');
    await wc.executeJavaScript(`document.body.innerHTML='<textarea id="chat-input"></textarea><div class="ds-markdown"><p>好的，以下是计划</p><pre><code>{&quot;whaledesk&quot;:1,&quot;steps&quot;:[]}</code></pre></div>'`);
    const filled=await wc.executeJavaScript(`(${fill})('测试输入')`);const text=await wc.executeJavaScript(`(${read})()`);return {filled,text};
  },{read:adapter.readReply.toString(),fill:adapter.fillComposer.toString()});
  assert.equal(domResult.filled.ok,true);assert.equal(require(path.join(project,'src/core.cjs')).parsePlan(domResult.text).steps.length,0);passed.push('DOM bridge fills composer and parses rendered JSON code blocks');
  await page.screenshot({path:path.join(project,'verification.png')});
  // Narrow desktop size must not introduce page-level horizontal overflow.
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1100,760));
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));passed.push('1100px desktop layout fits');
  assert.deepEqual(errors,[]);passed.push('no renderer JavaScript errors');
  console.log(JSON.stringify({passed,count:passed.length},null,2));
 }finally{await app.close();await fs.rm(temp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
