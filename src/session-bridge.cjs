class SessionBridge{
  constructor({read,fill,submit,stop,emit=()=>{},now=()=>Date.now(),sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),interval=450,stableMs=1800,fallbackMs=8000,ackTimeout=12000,timeout=180000}){
    Object.assign(this,{read,fill,submit,stop,emit,now,sleep,interval,stableMs,fallbackMs,ackTimeout,timeout});this.active=null;
  }
  async probe(){return this.read(false);}
  async cancel(){if(!this.active)return {active:false};this.active.cancelled=true;let remoteStopped=false;try{remoteStopped=!!(await this.stop())?.clicked;}catch{}return {active:true,remoteStopped};}
  async send(text){
    if(this.active)throw Error('上一条消息仍在等待回复，请先停止或等待完成。');
    if(typeof text!=='string'||!text.trim()||text.length>300000)throw Error('消息为空或过长。');
    const job={id:globalThis.crypto.randomUUID(),cancelled:false};this.active=job;
    let latestText='',planText='',confirmed=false;
    const event=(state,extra={})=>this.emit({id:job.id,state,...extra});
    try{
      const baseline=await this.read(true);
      if(baseline.state!=='ready')throw Error(baseline.message||'网页会话尚未就绪。');
      if(baseline.generating||baseline.inputDisabled)throw Error('DeepSeek 网页正在处理其他消息，请等待完成。');
      if(baseline.hasDraft)throw Error('网页里有未发送的内容，请先在网页处理草稿，避免覆盖。');
      if(job.cancelled)return {id:job.id,state:'stopped',text:'',confirmed:false};
      const filled=await this.fill(text);if(!filled?.ok)throw Error(filled?.error||'无法填入网页输入框。');
      await this.sleep(180);
      if(job.cancelled)return {id:job.id,state:'stopped',text:'',confirmed:false};
      const sent=await this.submit();if(!sent?.clicked)throw Error(sent?.error||'网页发送按钮未就绪，请打开网页检查；不会自动重发。');
      event('waiting',{message:'已触发网页发送，正在等待回复确认…'});
      const started=this.now();let lastChange=started,acknowledged=false,sawGenerating=false,sawFresh=false;
      while(this.now()-started<this.timeout){
        if(job.cancelled){event('stopped',{text:latestText});return {id:job.id,state:'stopped',text:latestText,planText,confirmed:false};}
        let sample;
        try{sample=await this.read(true);}catch(error){event('interrupted',{message:'网页发生跳转或连接中断，请查看网页后再试。',text:latestText});return {id:job.id,state:'interrupted',text:latestText,confirmed:false};}
        if(sample.state!=='ready'){event('attention',{message:sample.message||'网页需要处理登录或验证。',text:latestText});return {id:job.id,state:'attention',text:latestText,confirmed:false,message:sample.message};}
        acknowledged=acknowledged||!sample.hasDraft;
        sawGenerating=sawGenerating||!!sample.generating;
        const fresh=!!sample.text&&(sample.assistantCount>baseline.assistantCount||sample.text!==baseline.text);
        if(acknowledged&&fresh){
          sawFresh=true;
          if(sample.text!==latestText){latestText=sample.text;planText=sample.planText||sample.text;lastChange=this.now();event('streaming',{text:latestText});}
          const stableFor=this.now()-lastChange;
          confirmed=!sample.generating&&stableFor>=this.stableMs&&(sawGenerating||sample.sendReady===true);
          if(confirmed){event('complete',{text:latestText});return {id:job.id,state:'complete',text:latestText,planText,confirmed:true};}
          if(!sample.generating&&stableFor>=this.fallbackMs){event('stable',{text:latestText,message:'回复已稳定，但无法确认网页是否结束生成；请检查后继续。'});return {id:job.id,state:'stable',text:latestText,planText,confirmed:false};}
        }
        if(!acknowledged&&this.now()-started>=this.ackTimeout)throw Error('未确认网页已发送，请打开网页检查；为避免重复消息，不会自动重发。');
        await this.sleep(this.interval);
      }
      const message=sawFresh?'等待超时，已保留收到的部分回复；网页可能仍在生成。':'等待超时，没有收到新的回复；请打开网页检查。';
      event('timeout',{text:latestText,message});return {id:job.id,state:'timeout',text:latestText,planText,confirmed:false,message};
    }catch(error){event('error',{message:error.message,text:latestText});throw error;}
    finally{this.active=null;}
  }
}
module.exports={SessionBridge};
