// These functions execute inside the isolated website. They never access cookies,
// credentials, private APIs, or the local filesystem.
function snapshot(includeReply=false){
  const visible=el=>!!el&&el.getClientRects().length>0&&getComputedStyle(el).display!=='none'&&getComputedStyle(el).visibility!=='hidden';
  const input=[...document.querySelectorAll('textarea#chat-input,textarea,[contenteditable="true"][role="textbox"]')].find(visible);
  const body=(document.body?.innerText||'').slice(0,12000);
  if(/Human Verification|Just a moment|人机验证/i.test(document.title)||(!input&&/verify (?:that )?you are human|验证您是真人|完成人机验证/i.test(body)))return {state:'verification',message:'DeepSeek 要求人机验证，请打开网页手动完成。'};
  const dialogs=[...document.querySelectorAll('[role="dialog"],.ds-modal,.ds-dialog')].filter(visible);
  if(dialogs.some(el=>/登录|Sign in|Log in/i.test(el.innerText))||(!input&&/登录|Sign in|Log in/i.test(body)))return {state:'login',message:'请先在内置网页登录 DeepSeek，再回到鲸台对话。'};
  if(!input)return {state:document.readyState==='complete'?'unsupported':'loading',message:'尚未找到 DeepSeek 输入框；页面可能仍在加载，或网页结构已变化。'};
  const controls=[...document.querySelectorAll('button,[role="button"],.ds-icon-button')].filter(visible);
  const label=el=>[el.getAttribute('aria-label'),el.getAttribute('title'),el.getAttribute('data-testid'),el.innerText].filter(Boolean).join(' ').trim();
  const stop=controls.find(el=>/停止生成|停止回答|停止响应|Stop generating|Stop response|stop-button|stop-generating-button/i.test(label(el)));
  const send=controls.find(el=>/^(?:发送|发送消息|Send|Send message|send-button|chat-input-send-button)(?:\s|$)/i.test(label(el)));
  const disabled=el=>!!el&&(el.disabled||el.getAttribute('aria-disabled')==='true');
  let candidates=[...document.querySelectorAll('[data-message-author-role="assistant"],[data-role="assistant"]')];
  if(!candidates.length)candidates=[...document.querySelectorAll('.ds-markdown,.markdown')].filter(el=>!el.closest('[data-message-author-role="user"],[data-role="user"],.ds-think-content,.ds-reasoning-content,[data-role="reasoning"]'));
  // Avoid counting both a response container and its nested markdown as messages.
  candidates=candidates.filter(el=>!candidates.some(other=>other!==el&&other.contains(el)));
  const latest=candidates.at(-1);
  const result={state:'ready',generating:!!stop,inputDisabled:!!input.disabled||input.getAttribute('aria-disabled')==='true',hasDraft:!!(input.value??input.textContent??'').trim(),sendReady:send?!disabled(send):null,assistantCount:candidates.length};
  if(includeReply){
    result.text=(latest?.innerText||'').slice(0,250000);
    const blocks=latest?[...latest.querySelectorAll('pre')].map(el=>(el.querySelector('code')||el).innerText.replace(/^json\s*\n/i,'')).filter(t=>t.includes('"whaledesk"')):[];
    result.planText=blocks.length?'```json\n'+blocks.at(-1)+'\n```':result.text;
  }
  return result;
}
function submit(){
  const visible=el=>el.getClientRects().length>0&&getComputedStyle(el).display!=='none'&&getComputedStyle(el).visibility!=='hidden';
  const controls=[...document.querySelectorAll('button,[role="button"],.ds-icon-button')].filter(visible);
  const button=controls.find(el=>/^(?:发送|发送消息|Send|Send message|send-button|chat-input-send-button)(?:\s|$)/i.test([el.getAttribute('aria-label'),el.getAttribute('title'),el.getAttribute('data-testid'),el.innerText].filter(Boolean).join(' ').trim()));
  if(button){if(button.disabled||button.getAttribute('aria-disabled')==='true')return {clicked:false,disabled:true};button.click();return {clicked:true,method:'button'};}
  const input=document.querySelector('textarea#chat-input,textarea,[contenteditable="true"][role="textbox"]');
  if(!input)return {clicked:false,error:'输入框不可用。'};
  input.focus();return {clicked:false,needsEnter:true};
}
function stopGeneration(){
  const controls=[...document.querySelectorAll('button,[role="button"],.ds-icon-button')];
  const stop=controls.find(el=>el.getClientRects().length>0&&/停止生成|停止回答|停止响应|Stop generating|Stop response|stop-button|stop-generating-button/i.test([el.getAttribute('aria-label'),el.getAttribute('title'),el.getAttribute('data-testid'),el.innerText].filter(Boolean).join(' ')));
  if(stop){stop.click();return {clicked:true};}return {clicked:false};
}
module.exports={snapshot,submit,stopGeneration};
