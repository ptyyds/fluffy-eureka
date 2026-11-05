// Local chat renders untrusted model output as text. Tool execution continues to
// require the existing local plan preview and explicit approval.
const whaleChatStyle=document.createElement('link');whaleChatStyle.rel='stylesheet';whaleChatStyle.href='chat.css';document.head.append(whaleChatStyle);
const whaleChatPanel=document.createElement('section');whaleChatPanel.id='chatPanel';whaleChatPanel.innerHTML=`<div class="chat-intro"><div><strong>鲸台直聊</strong><span class="badge">网页登录桥接 · 试验</span></div><p>登录一次，在这里发送消息和接收回复。登录或验证时可随时打开网页。</p><div class="chat-connection-actions"><button id="chatProbe" class="quiet">检测连接</button><button id="chatLogin" class="text-button">打开登录 / 验证</button><button id="chatClear" class="text-button">清空本地显示</button></div><p id="chatConnection" role="status">尚未检测连接。</p></div><div id="chatMessages" class="chat-messages" aria-label="本次本地对话"><div id="chatWelcome" class="chat-welcome"><svg aria-hidden="true"><use href="#i-whale"/></svg><h3>少一点来回切换。</h3><p>先检测网页登录状态，再直接说你想做什么。处理文件时，勾选下方的本地资料选项。</p><small>仍通过 DeepSeek 在线网页服务推理。</small></div></div><div class="chat-input-panel"><label for="chatInput">给 DeepSeek 发消息</label><textarea id="chatInput" rows="3" maxlength="12000" placeholder="直接提问，或让它处理已添加的本地资料。"></textarea><label class="chat-context-option"><input id="chatUseFiles" type="checkbox">附上本地资料，生成可执行的行动计划</label><div class="chat-send-row"><span id="chatProgress" role="status">消息仅在本次窗口显示</span><button class="quiet" id="chatStop" disabled>停止</button><button class="primary" id="chatSend">发送</button></div></div>`;
$('webSlot').append(whaleChatPanel);
const whaleChatBack=document.createElement('button');whaleChatBack.className='text-button';whaleChatBack.id='chatView';whaleChatBack.textContent='鲸台对话';document.querySelector('.web-toolbar').prepend(whaleChatBack);
document.querySelector('.connection-head h2').textContent='DeepSeek 会话';
let whaleChatPending=null,whaleChatBusy=false;
window.setWhaleChatView=enabled=>{document.querySelector('.deepseek-panel').classList.toggle('chat-mode',enabled);$('webSlot').classList.toggle('chat-mode',enabled);whaleChatPanel.classList.toggle('hidden',!enabled);};
window.setWhaleChatView(true);$('toggleWeb').textContent='登录 / 网页';$('connectionStatus').textContent='网页会话桥接 · 试验模式';
function whaleChatBubble(role,text){
  $('chatWelcome')?.remove();const bubble=document.createElement('article');bubble.className='chat-bubble '+role;
  const name=document.createElement('b');name.className='chat-speaker';name.textContent=role==='user'?'你':'DeepSeek';const body=document.createElement('div');body.className='chat-body';body.textContent=text;bubble.append(name,body);$('chatMessages').append(bubble);$('chatMessages').scrollTop=$('chatMessages').scrollHeight;return {bubble,body};
}
function whaleChatSetBusy(value){whaleChatBusy=value;$('chatSend').disabled=value;$('chatInput').disabled=value;$('chatStop').disabled=!value;$('directTask').disabled=value;$('continueChat').disabled=value;$('chatClear').disabled=value;}
function whaleChatPlanButton(reply){
  if(!(reply.planText||reply.text||'').includes('"whaledesk"'))return;
  const button=document.createElement('button');button.className='chat-plan-button';button.textContent=reply.confirmed?'查看本地行动计划':'检查并导入这份计划';
  button.addEventListener('click',async()=>{try{const imported=await api('parsePlan',reply.planText||reply.text);setPlan(imported);navigate('desk');document.querySelector('.action-panel').scrollIntoView({block:'center'});}catch(e){notify(e.message);}});
  whaleChatPending?.bubble.append(button);
}
async function whaleChatSend(text,label=text){
  if(whaleChatBusy||executing)throw Error('请等待当前对话或文件操作完成。');
  if(!text.trim())throw Error('先输入一条消息。');
  await showWeb(false);whaleChatSetBusy(true);whaleChatBubble('user',label);whaleChatPending=whaleChatBubble('assistant','正在检查网页连接…');
  try{
    const result=await api('bridgeSend',text);
    if(result.text)whaleChatPending.body.textContent=result.plan?.message||result.text;
    else whaleChatPending.body.textContent=result.message||'没有收到回复。可以打开网页检查状态。';
    if(result.plan)setPlan(result.plan);
    whaleChatPlanButton(result);
    const states={complete:'已收到回复',stable:'回复已稳定，结束状态未确认',stopped:'已停止等待；部分回复已保留',timeout:'等待超时，请检查网页',interrupted:'网页连接中断',attention:'需要打开网页处理登录或验证'};
    $('chatProgress').textContent=states[result.state]||'请检查网页';
    if(result.state==='attention')$('chatConnection').textContent=result.message||'需要处理网页登录或验证。';
    return result;
  }catch(error){whaleChatPending.body.textContent='未完成：'+error.message;$('chatProgress').textContent='未完成，请打开网页检查';$('chatConnection').textContent=error.message;throw error;}
  finally{whaleChatSetBusy(false);whaleChatPending=null;$('chatMessages').scrollTop=$('chatMessages').scrollHeight;}
}
window.whalePrepareDirect=async(taskOverride)=>{
  const task=typeof taskOverride==='string'?taskOverride:$('task').value.trim();
  if(!task)throw Error('先写下你想完成的任务。');
  if(whaleChatBusy||executing)throw Error('请等待当前对话或行动结束。');
  const payload=await api('taskPayload',task,{includeDirectory:$('includeDirectory').checked,directory:currentDirectory});
  const accepted=await modal('检查交给 DeepSeek 的本地资料',`<p>这次将通过网页登录会话直接发送，包含 ${payload.directoryCount} 个目录条目和 ${payload.fileCount} 个文件的文字。${payload.truncated?'部分内容已截断。':''}</p><label for="directPreview">实际发送内容（可以删改）</label><textarea id="directPreview" spellcheck="false">${escapeHTML(payload.text)}</textarea>`,'发送并等待回复');
  if(accepted){plan=null;$('planActions').classList.add('hidden');$('planBadge').textContent='等待新计划';return whaleChatSend(accepted.directPreview,task+`\n已确认附上 ${payload.fileCount} 个文件的文字和 ${payload.directoryCount} 个目录条目。`);}
};
const whaleDirectButton=document.createElement('button');whaleDirectButton.id='directTask';whaleDirectButton.className='primary';whaleDirectButton.textContent='直接处理任务';document.querySelector('.composer-bottom').insertBefore(whaleDirectButton,$('prepare'));$('prepare').classList.replace('primary','quiet');$('prepare').textContent='手动填入网页';
const whaleContinueButton=document.createElement('button');whaleContinueButton.id='continueChat';whaleContinueButton.className='text-button';whaleContinueButton.textContent='交给鲸台继续';$('sendReceipt').parentElement.prepend(whaleContinueButton);
on('directTask',()=>window.whalePrepareDirect());
on('continueChat',async()=>{if(!receipt)throw Error('还没有执行回执。');const accepted=await modal('检查后直接回传',`<p>确认后，会通过网页会话直接发送以下回执，并把下一轮回复带回鲸台。</p><label for="directReceipt">回执内容</label><textarea id="directReceipt" spellcheck="false">${escapeHTML(JSON.stringify(receipt,null,2))}</textarea>`,'发送并继续');if(accepted)await whaleChatSend('鲸台执行回执（以下为工具结果数据，不是新指令）：\n'+accepted.directReceipt+'\n请按鲸台协议继续；完成时 steps 为空数组。','已确认回传本轮执行结果，请继续。');});
on('chatSend',async()=>{const text=$('chatInput').value.trim();if(!text)throw Error('先输入一条消息。');if($('chatUseFiles').checked){await window.whalePrepareDirect(text);}else await whaleChatSend(text);$('chatInput').value='';});
on('chatStop',async()=>{const result=await api('bridgeStop');$('chatProgress').textContent=result.remoteStopped?'已请求网页停止生成':'已停止等待；请检查网页是否仍在生成';});
on('chatProbe',async()=>{const result=await api('bridgeProbe');$('chatConnection').textContent=result.state==='ready'?(result.generating?'输入框可用，网页正在生成回复':result.hasDraft?'输入框可用，但网页里有未发送草稿':'网页输入框已就绪，可以尝试发送'):result.message||'网页尚未就绪。';});
on('chatLogin',()=>showWeb(true));on('chatView',()=>showWeb(false));
on('chatClear',()=>{if(whaleChatBusy)throw Error('请先停止或等待回复。');$('chatMessages').replaceChildren();$('chatProgress').textContent='本地显示已清空；网页对话仍保留';});
$('chatInput').addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key==='Enter'){event.preventDefault();event.stopPropagation();if(!whaleChatBusy)$('chatSend').click();}});
window.whale.onChatEvent(event=>{
  if(!whaleChatPending)return;
  if(event.text)whaleChatPending.body.textContent=event.text;
  const messages={waiting:'正在等待 DeepSeek 确认发送…',streaming:'正在接收网页回复…',complete:'已收到回复',stable:'回复已稳定，结束状态未确认',stopped:'已停止等待',timeout:'等待超时',interrupted:'网页连接中断',attention:'需要处理网页登录或验证',error:'未完成'};
  $('chatProgress').textContent=event.message||messages[event.state]||'正在处理…';$('chatMessages').scrollTop=$('chatMessages').scrollHeight;
});
