// DOM adapter deliberately uses the visible website, never cookies or private APIs.
function fillComposer(text) {
  const input = document.querySelector('textarea#chat-input') || document.querySelector('textarea') || document.querySelector('[contenteditable="true"][role="textbox"]');
  if (!input) return {ok:false, error:'未找到输入框，请先登录或手动粘贴。'};
  input.focus();
  if (input.tagName === 'TEXTAREA') {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,text);
    input.dispatchEvent(new Event('input',{bubbles:true}));
  } else { input.textContent=text; input.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:text})); }
  return {ok:true};
}
function readReply() {
  const nodes = [...document.querySelectorAll('.ds-markdown, [data-message-author-role="assistant"], .markdown')];
  const latest=nodes.at(-1);
  const scope=latest||document;
  const codes=[...scope.querySelectorAll('pre')].map(e=>(e.querySelector('code')||e).innerText.replace(/^json\s*\n/i,'')).filter(t=>t.includes('"whaledesk"'));
  if(codes.length)return '```json\n'+codes.at(-1)+'\n```';
  return latest?.innerText||'';
}
module.exports={fillComposer,readReply};
