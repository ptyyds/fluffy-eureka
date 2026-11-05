const {app,BrowserWindow,WebContentsView,ipcMain,dialog,session,clipboard,shell}=require('electron');
const path=require('node:path');
const fs=require('node:fs/promises');
const {pathToFileURL}=require('node:url');
const {spawn}=require('node:child_process');
const {Workspace,parsePlan,systemPrompt}=require('./core.cjs');
const adapter=require('./adapter.cjs');
const {readDocument,formatOf}=require('./documents.cjs');
const {SessionBridge}=require('./session-bridge.cjs');
const sessionAdapter=require('./session-adapter.cjs');
let win,web,workspace,bridge,approvedPlan=null,busy=false,stopped=false,child=null;
let events=[],recipes=[],commandEnabled=false,lastRoot=null,attachments=[],lastWebError=null;
const pageURL=pathToFileURL(path.join(__dirname,'index.html')).href;
const dataPath=()=>path.join(app.getPath('userData'),'whaledesk-state.json');
const emit=async(kind,message)=>{
  events.unshift({id:crypto.randomUUID(),time:new Date().toISOString(),kind,message});
  events=events.slice(0,200); await persist();
};
async function persist(){await fs.writeFile(dataPath(),JSON.stringify({events,recipes,root:workspace?.root||lastRoot},null,2),'utf8');}
function trusted(event){if(event.sender!==win.webContents || event.senderFrame?.url!==pageURL) throw Error('拒绝来自网页的本地工具请求。');}
function handle(name,fn){ipcMain.handle('whale:'+name,async(event,...args)=>{try{trusted(event);return {ok:true,data:await fn(...args)};}catch(e){return {ok:false,error:e.message};}});}
function needWorkspace(){if(!workspace) throw Error('请先选择一个工作文件夹。');}
function canChange(){if(busy)throw Error('任务执行中，请先停止。');if(bridge?.active)throw Error('正在等待 DeepSeek 回复，请先等待或停止对话。');}
function allowedURL(raw){try{const u=new URL(raw);return u.protocol==='https:' && ['chat.deepseek.com','www.deepseek.com','deepseek.com'].includes(u.hostname);}catch{return false;}}
function attachmentViews(){return attachments.map(({filename,...view})=>view);}
async function addAttachment(filename){
  const existing=attachments.find(a=>a.filename.toLowerCase()===filename.toLowerCase());
  if(!existing&&attachments.length>=8)throw Error('最多添加 8 个文件，请先移除不需要的文件。');
  const document=await readDocument(filename);
  const relative=workspace?path.relative(workspace.root,filename):null;
  const relativePath=relative&&!path.isAbsolute(relative)&&relative!=='..'&&!relative.startsWith('..'+path.sep)?relative:null;
  const item={id:existing?.id||crypto.randomUUID(),filename,name:path.basename(filename),relativePath,...document};
  attachments=attachments.filter(a=>a.id!==item.id);attachments.push(item);return item;
}
async function taskPayload(task,options={}){
  if(typeof task!=='string'||!task.trim()||task.length>12000)throw Error('请填写 12000 字以内的任务。');
  if(!workspace&&!attachments.length)throw Error('请先添加本地文件，或选择工作文件夹。');
  let directory=null;
  if(workspace&&options.includeDirectory!==false){
    const directoryPath=typeof options.directory==='string'?options.directory:'.';
    const listing=await workspace.execute({tool:'list_files',path:directoryPath});
    directory={path:directoryPath,...listing,entries:listing.entries.map(e=>({...e,path:path.join(directoryPath,e.name),format:e.type==='file'?formatOf(e.name):undefined}))};
  }
  let remaining=100000;
  const files=attachmentViews().map(item=>{const content=item.content.slice(0,remaining);remaining-=content.length;return {...item,content,truncated:item.truncated||content.length<item.content.length};});
  const context={workspaceName:workspace?path.basename(workspace.root):null,directory,files};
  return {text:systemPrompt(task,context),fileCount:files.filter(f=>f.content.length).length,directoryCount:directory?.entries.length||0,truncated:files.some(f=>f.truncated)};
}

async function command(step){
  if(!commandEnabled) throw Error('本轮没有授权运行命令。');
  const result=await dialog.showMessageBox(win,{type:'warning',title:'确认运行 PowerShell',message:'命令可以访问工作区之外，且无法一键撤销。',detail:step.command,buttons:['取消','运行这条命令'],defaultId:0,cancelId:0,noLink:true});
  if(result.response!==1 || stopped)throw Error('已取消命令。');
  return new Promise((resolve,reject)=>{
    const encoded=Buffer.from('[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false);\n'+step.command,'utf16le').toString('base64');
    child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',encoded],{cwd:workspace.root,windowsHide:true,stdio:['ignore','pipe','pipe']});
    let output='',timedOut=false;const append=b=>{output=(output+b.toString()).slice(-40000);};
    child.stdout.on('data',append);child.stderr.on('data',append);
    const timer=setTimeout(()=>{timedOut=true;stopChild();},60000);
    child.on('error',e=>{clearTimeout(timer);child=null;reject(e);});
    child.on('close',code=>{clearTimeout(timer);child=null;resolve({exitCode:code,output,stopped,timedOut,notice:timedOut?'命令超过 60 秒，已请求终止。':'命令不可通过文件撤销恢复。'});});
  });
}
function stopChild(){if(child?.pid){const killer=spawn('taskkill.exe',['/pid',String(child.pid),'/t','/f'],{windowsHide:true,stdio:'ignore'});killer.on('error',()=>child?.kill());}}

app.whenReady().then(async()=>{
  try{const saved=JSON.parse(await fs.readFile(dataPath(),'utf8'));events=Array.isArray(saved.events)?saved.events:[];recipes=Array.isArray(saved.recipes)?saved.recipes:[];if(typeof saved.root==='string'&&(await fs.stat(saved.root)).isDirectory()){lastRoot=await fs.realpath(saved.root);workspace=new Workspace(lastRoot,app.getPath('userData'));}}catch{}
  win=new BrowserWindow({width:1500,height:980,minWidth:1080,minHeight:720,title:'鲸台 WhaleDesk',icon:path.join(__dirname,'../assets/whaledesk.png'),backgroundColor:'#edf2f7',autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true}});
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',(e,url)=>{if(url!==pageURL)e.preventDefault();});
  web=new WebContentsView({webPreferences:{partition:'persist:deepseek',nodeIntegration:false,contextIsolation:true,sandbox:true}});
  const ses=session.fromPartition('persist:deepseek');
  ses.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
  ses.setPermissionCheckHandler(()=>false);
  web.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  web.webContents.on('will-navigate',(event,url)=>{if(!allowedURL(url))event.preventDefault();});
  web.webContents.on('will-redirect',(event,url)=>{if(!allowedURL(url))event.preventDefault();});
  web.webContents.on('will-attach-webview',event=>event.preventDefault());
  web.webContents.on('did-fail-load',(_e,code,desc,_url,isMainFrame)=>{if(code!==-3&&isMainFrame!==false){lastWebError='DeepSeek 网页加载失败：'+desc;emit('网页',lastWebError).catch(()=>{});}});
  web.webContents.on('did-finish-load',()=>{if(allowedURL(web.webContents.getURL()))lastWebError=null;});
  win.contentView.addChildView(web);web.setVisible(false);
  if(!process.env.WHALEDESK_SMOKE && !(process.env.WHALEDESK_E2E==='1'&&!app.isPackaged))web.webContents.loadURL('https://chat.deepseek.com/').catch(()=>{});
  else web.webContents.loadURL('about:blank').catch(()=>{});
  const inSite=()=>{if(!allowedURL(web.webContents.getURL()))throw Error('DeepSeek 网页尚未就绪，请打开网页登录。');};
  const siteCall=async(fn,...args)=>{
    inSite();let timer;
    try{return await Promise.race([web.webContents.executeJavaScript(`(${fn.toString()})(...${JSON.stringify(args)})`),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('网页响应过慢，请打开网页检查。')),8000);})]);}
    finally{clearTimeout(timer);}
  };
  bridge=new SessionBridge({
    read:async includeReply=>{if(lastWebError&&!web.webContents.isLoading())return {state:'network',message:lastWebError+'。请打开网页刷新，或检查当前网络。'};if(!allowedURL(web.webContents.getURL()))return {state:web.webContents.isLoading()?'loading':'unsupported',message:'请打开 DeepSeek 网页，完成登录后再检测连接。'};return siteCall(sessionAdapter.snapshot,includeReply);},
    fill:text=>siteCall(adapter.fillComposer,text),
    submit:async()=>{const result=await siteCall(sessionAdapter.submit);if(result.needsEnter){web.webContents.sendInputEvent({type:'keyDown',keyCode:'Enter'});web.webContents.sendInputEvent({type:'keyUp',keyCode:'Enter'});return {clicked:true,method:'enter'};}return result;},
    stop:()=>siteCall(sessionAdapter.stopGeneration),
    emit:event=>{if(win&&!win.isDestroyed())win.webContents.send('whale:chatEvent',event);}
  });
  win.on('closed',()=>{stopped=true;stopChild();if(bridge?.active)bridge.active.cancelled=true;if(!web.webContents.isDestroyed())web.webContents.close();win=null;});

  handle('state',()=>({root:workspace?.root||null,attachments:attachmentViews(),version:app.getVersion(),undoCount:workspace?.undoStack.length||0,busy,chatBusy:!!bridge.active,webURL:web.webContents.getURL(),webLoading:web.webContents.isLoading()}));
  handle('bridgeProbe',()=>bridge.probe());
  handle('bridgeSend',async(text)=>{
    canChange();approvedPlan=null;const result=await bridge.send(text);
    if(result.confirmed){try{result.plan=approvedPlan=parsePlan(result.planText||result.text);}catch{}}
    return result;
  });
  handle('bridgeStop',()=>bridge.cancel());
  handle('chooseWorkspace',async()=>{
    canChange();const picked=await dialog.showOpenDialog(win,{title:'选择允许鲸台操作的文件夹',properties:['openDirectory','createDirectory']});
    if(picked.canceled)return null;
    lastRoot=await fs.realpath(picked.filePaths[0]);workspace=new Workspace(lastRoot,app.getPath('userData'));approvedPlan=null;attachments=[];
    await emit('工作区','选择了工作文件夹');return workspace.root;
  });
  handle('listWorkspace',async(directory='.')=>{needWorkspace();const listing=await workspace.execute({tool:'list_files',path:directory});return {...listing,entries:listing.entries.sort((a,b)=>(a.type==='folder'?0:1)-(b.type==='folder'?0:1)||a.name.localeCompare(b.name,'zh-CN')).map(e=>({...e,path:path.join(directory,e.name),format:e.type==='file'?formatOf(e.name):undefined}))};});
  handle('chooseFiles',async()=>{
    canChange();const picked=await dialog.showOpenDialog(win,{title:'添加要交给 DeepSeek 分析的本地文件',properties:['openFile','multiSelections'],filters:[{name:'文档和文本',extensions:['docx','xlsx','xlsm','pdf','txt','md','csv','tsv','json','log','py','js']},{name:'所有文件',extensions:['*']}]});
    if(picked.canceled)return {root:workspace?.root||null,items:attachmentViews(),errors:[]};
    if(!workspace){lastRoot=await fs.realpath(path.dirname(picked.filePaths[0]));workspace=new Workspace(lastRoot,app.getPath('userData'));approvedPlan=null;await persist();}
    const errors=[];
    for(const filename of picked.filePaths.slice(0,8)){try{await addAttachment(filename);}catch(e){errors.push({name:path.basename(filename),error:e.message});}}
    if(picked.filePaths.length>8)errors.push({name:'其余文件',error:'一次最多添加 8 个文件。'});
    return {root:workspace.root,items:attachmentViews(),errors};
  });
  handle('attachWorkspaceFile',async(relative)=>{canChange();needWorkspace();await addAttachment(await workspace.resolve(relative));return attachmentViews();});
  handle('removeAttachment',id=>{canChange();attachments=attachments.filter(a=>a.id!==id);return attachmentViews();});
  handle('clearAttachments',()=>{canChange();attachments=[];});
  handle('taskPayload',taskPayload);
  handle('parsePlan',async(text)=>{canChange();approvedPlan=parsePlan(text);return approvedPlan;});
  handle('resetPlan',()=>{canChange();approvedPlan=null;});
  handle('execute',async(options={})=>{
    canChange();needWorkspace();if(!approvedPlan)throw Error('请先读取或导入行动计划。');
    busy=true;stopped=false;commandEnabled=options.commands===true;
    const plan=approvedPlan;approvedPlan=null;const results=[];
    try{
      for(const step of plan.steps){
        if(stopped)break;
        try{const result=step.tool==='run_command'?await command(step):await workspace.execute(step);results.push({tool:step.tool,path:step.path,result});const failed=step.tool==='run_command'&&result.exitCode!==0;await emit(failed?'失败':'完成',`${step.tool} ${step.path||'PowerShell'}`);if(failed)break;}
        catch(e){results.push({tool:step.tool,error:e.message});await emit('失败',e.message);break;}
      }
      return {title:plan.title,results,stopped,undoCount:workspace.undoStack.length};
    }finally{busy=false;commandEnabled=false;}
  });
  handle('undo',async()=>{canChange();needWorkspace();const result=await workspace.undo();await emit('撤销','撤销了最近一次文件操作');return result;});
  handle('history',()=>events);
  handle('stop',async()=>{stopped=true;stopChild();return bridge.cancel();});
  handle('webLayout',(rect)=>{
    if(!rect?.visible){web.setVisible(false);return;}
    const [width,height]=win.getContentSize();
    const x=Math.max(0,Math.min(width,Math.round(Number(rect.x)||0))),y=Math.max(0,Math.min(height,Math.round(Number(rect.y)||0)));
    web.setBounds({x,y,width:Math.max(0,Math.min(width-x,Math.round(Number(rect.width)||0))),height:Math.max(0,Math.min(height-y,Math.round(Number(rect.height)||0)))});web.setVisible(true);
  });
  handle('webFill',async(text,isTask=false)=>{
    canChange();
    if(typeof text!=='string'||text.length>300000)throw Error('发送内容过长。');
    if(!allowedURL(web.webContents.getURL()))throw Error('当前页面不是 DeepSeek。');
    const prepared=isTask?(await taskPayload(text)).text:text;
    return web.webContents.executeJavaScript(`(${adapter.fillComposer.toString()})(${JSON.stringify(prepared)})`);
  });
  handle('webRead',async()=>{
    canChange();if(!allowedURL(web.webContents.getURL()))throw Error('请先打开 DeepSeek。');
    const text=await web.webContents.executeJavaScript(`(${adapter.readReply.toString()})()`);
    approvedPlan=parsePlan(text);return approvedPlan;
  });
  handle('webReload',()=>{canChange();lastWebError=null;if(allowedURL(web.webContents.getURL()))web.webContents.reload();else web.webContents.loadURL('https://chat.deepseek.com/').catch(()=>{});});
  handle('copyTask',async(text,options)=>{const payload=await taskPayload(text,options);clipboard.writeText(payload.text);return true;});
  handle('copyText',text=>{if(typeof text!=='string'||text.length>300000)throw Error('复制内容过长。');clipboard.writeText(text);return true;});
  handle('openBrowser',()=>shell.openExternal('https://chat.deepseek.com/'));
  handle('clearLogin',async()=>{canChange();await ses.clearStorageData();await ses.clearCache();web.webContents.loadURL('https://chat.deepseek.com/').catch(()=>{});return true;});
  handle('saveRecipe',async(recipe)=>{
    if(typeof recipe?.name!=='string'||typeof recipe?.task!=='string'||!recipe.name.trim()||!recipe.task.trim())throw Error('请填写技能名称和任务。');
    recipes.unshift({id:crypto.randomUUID(),name:recipe.name.slice(0,60),task:recipe.task.slice(0,5000)});recipes=recipes.slice(0,40);await persist();return recipes;
  });
  handle('recipes',()=>recipes);
  await win.loadFile(path.join(__dirname,'index.html'));
  // Opt-in local-only smoke mode does not load the remote website or require a login.
  if(process.env.WHALEDESK_SMOKE==='1'){
    web.webContents.stop();
    setTimeout(async()=>{
      try{
        const info=await win.webContents.executeJavaScript(`({title:document.title,heading:document.querySelector('h1').textContent,buttons:document.querySelectorAll('button').length,bridge:typeof window.whale.execute})`);
        console.log('WHALEDESK_SMOKE',JSON.stringify(info));
        await fs.writeFile(path.join(app.getPath('temp'),'whaledesk-smoke.png'),(await win.webContents.capturePage()).toPNG());
        app.exit(0);
      }catch(e){console.error(e);app.exit(1);}
    },1600);
  }
});
app.on('window-all-closed',()=>app.quit());
