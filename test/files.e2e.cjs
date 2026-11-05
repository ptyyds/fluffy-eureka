const {_electron}=require('playwright');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const project=path.resolve(__dirname,'..');
const {fixtures}=require(path.join(project,'test/fixtures.cjs'));
(async()=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'whaledesk-file-e2e-'));
  const files=await fixtures(temp);await fs.mkdir(path.join(temp,'子文件夹'));await fs.writeFile(path.join(temp,'子文件夹/内部.txt'),'子目录里的真实内容');
  const packaged=process.env.TEST_PACKAGED==='1';
  const executablePath=packaged?path.join(project,'release-0.2.0/win-unpacked/WhaleDesk.exe'):path.join(project,'node_modules/electron/dist/electron.exe');
  const profile=path.join(temp,'profile');let app,passed=[];const oldClipboard={value:null};
  const launch=()=>_electron.launch({timeout:25000,executablePath,args:[...(packaged?[]:[project]),'--disable-gpu','--user-data-dir='+profile],env:{...process.env,WHALEDESK_E2E:'1'}});
  async function localPage(){await app.firstWindow();for(let i=0;i<50;i++){const page=app.windows().find(p=>p.url().startsWith('file:'));if(page){page.setDefaultTimeout(20000);return page;}await new Promise(r=>setTimeout(r,100));}throw Error('No app page');}
  const pass=message=>{passed.push(message);console.log('PASS',message);};
  try{
    app=await launch();const page=await localPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    oldClipboard.value=await app.evaluate(({clipboard})=>clipboard.readText());
    await app.evaluate(({dialog},{temp,files})=>{dialog.showOpenDialog=async(_win,options)=>({canceled:false,filePaths:options.properties.includes('openFile')?files.map(n=>temp+'\\'+n):[temp]});}, {temp,files});
    await page.locator('#addFiles').click();await page.waitForFunction(()=>document.querySelectorAll('.attachment-row').length===4);assert((await page.locator('#attachmentList').textContent()).includes('测试文档.docx'));pass('adding local files identifies DOCX, XLSX, PDF and text in the real app');
    await page.locator('[data-preview]').first().click();assert((await page.locator('.document-preview').textContent()).includes('合同金额 12345'));await page.locator('#modalConfirm').click();pass('preview shows the extracted document body');
    await page.locator('#task').fill('分析这些本地文件');await page.locator('#copyTask').click();const preview=await page.locator('#taskPreview').inputValue();for(const text of ['合同金额 12345','销售明细','本地数据','Hello Local PDF','本地文件已经被实际读取'])assert(preview.includes(text));await page.locator('#modalCancel').click();assert.equal(await app.evaluate(({clipboard})=>clipboard.readText()),oldClipboard.value);pass('all actual document contents appear in the send preview; cancel does not copy');
    await page.locator('#copyTask').click();await page.locator('#modalConfirm').click();assert((await app.evaluate(({clipboard})=>clipboard.readText())).includes('合同金额 12345'));pass('copy mode includes document text rather than an empty task prompt');
    await app.evaluate(async({session,webContents,BrowserWindow})=>{
      const ses=session.fromPartition('persist:deepseek');await ses.protocol.handle('https',()=>new Response('<html><body><textarea id="chat-input"></textarea></body></html>',{headers:{'content-type':'text/html; charset=utf-8'}}));
      const local=BrowserWindow.getAllWindows()[0].webContents.id;const remote=webContents.getAllWebContents().find(w=>w.id!==local);remote.stop();await remote.loadURL('https://chat.deepseek.com/');
    });
    await page.locator('#prepare').click();await page.locator('#modalConfirm').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('文件内容已填入'));
    const delivered=await app.evaluate(async({webContents,BrowserWindow})=>{const id=BrowserWindow.getAllWindows()[0].webContents.id;return webContents.getAllWebContents().find(w=>w.id!==id).executeJavaScript('document.querySelector("textarea").value');});
    for(const text of ['合同金额 12345','Hello Local PDF','销售明细'])assert(delivered.includes(text));pass('prepared task delivers real file contents to the website composer through the actual adapter');
    // Hide native child view so the remaining tests address the local UI.
    await page.locator('#toggleWeb').click();
    await page.locator('#files .file-name').filter({hasText:'子文件夹'}).click();await page.waitForFunction(()=>document.querySelector('#files').textContent.includes('内部.txt'));await page.locator('#files .file-name').filter({hasText:'内部.txt'}).click();await page.waitForFunction(()=>document.querySelectorAll('.attachment-row').length===5);pass('subfolders can be opened and their files can be recognized');
    await page.locator('#upDirectory').click();await page.waitForFunction(()=>document.querySelector('#files').textContent.includes('测试文档.docx'));pass('directory navigation returns to the workspace root');
    await page.locator('[data-remove]').first().click();await page.waitForFunction(()=>document.querySelectorAll('.attachment-row').length===4);pass('removing an attachment excludes it from subsequent model context');
    await page.screenshot({path:path.join(project,packaged?'preview-0.2-packaged.png':'preview-0.2.png')});assert.deepEqual(errors,[]);pass('no renderer errors during the complete file flow');
    await app.evaluate(({clipboard},value)=>clipboard.writeText(value),oldClipboard.value);oldClipboard.value=null;
    await app.close();app=null;
    app=await launch();const restored=await localPage();await restored.waitForFunction(()=>document.querySelector('#files').textContent.includes('测试文档.docx'));const state=await restored.evaluate(()=>window.whale.state());assert.equal(state.data.root,temp);assert.equal(state.data.attachments.length,0);pass('workspace restores after restart; document contents are not persisted');
    console.log(JSON.stringify({packaged,checks:passed.length,passed},null,2));
  }finally{
    if(app){if(oldClipboard.value!==null)await app.evaluate(({clipboard},value)=>clipboard.writeText(value),oldClipboard.value).catch(()=>{});await app.close();}
    assert.equal(path.dirname(path.resolve(temp)),path.resolve(os.tmpdir()));assert(path.basename(temp).startsWith('whaledesk-file-e2e-'));await fs.rm(temp,{recursive:true,force:true,maxRetries:5,retryDelay:200});
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
