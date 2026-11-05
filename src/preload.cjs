const {contextBridge,ipcRenderer}=require('electron');
const methods=['state','chooseWorkspace','listWorkspace','chooseFiles','attachWorkspaceFile','removeAttachment','clearAttachments','taskPayload','parsePlan','resetPlan','execute','undo','history','webLayout','webFill','webRead','webReload','stop','saveRecipe','recipes','clearLogin','copyTask','copyText','openBrowser','bridgeProbe','bridgeSend','bridgeStop'];
contextBridge.exposeInMainWorld('whale',{
  ...Object.fromEntries(methods.map(name=>[name,(...args)=>ipcRenderer.invoke('whale:'+name,...args)])),
  onChatEvent:callback=>{if(typeof callback!=='function')throw Error('回调必须是函数。');const listener=(_event,data)=>callback(data);ipcRenderer.on('whale:chatEvent',listener);return ()=>ipcRenderer.removeListener('whale:chatEvent',listener);}
});
