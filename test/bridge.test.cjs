const {test}=require('node:test');const assert=require('node:assert/strict');const {SessionBridge}=require('../src/session-bridge.cjs');
const ready={state:'ready',generating:false,inputDisabled:false,hasDraft:false,sendReady:true,assistantCount:0,text:'',planText:''};
function makeBridge(frames,options={}){
  let clock=0,sent=0,filled=0,index=0;const events=[];
  const bridge=new SessionBridge({read:async()=>sent?(frames[Math.min(index++,frames.length-1)]||ready):(options.baseline||ready),fill:async()=>{filled++;return {ok:true};},submit:async()=>{sent++;return {clicked:true};},stop:async()=>({clicked:true}),now:()=>clock,sleep:async ms=>{clock+=ms;},emit:event=>events.push(event),interval:10,stableMs:30,fallbackMs:80,ackTimeout:40,timeout:200,...options});
  return {bridge,events,get sent(){return sent;},get filled(){return filled;}};
}
test('streams a fresh reply and waits for generation to finish',async()=>{
  const ctx=makeBridge([{...ready,generating:true},{...ready,generating:true,assistantCount:1,text:'新'},{...ready,generating:false,assistantCount:1,text:'新的回复',planText:'新的回复'}]);
  const result=await ctx.bridge.send('你好');assert.equal(result.text,'新的回复');assert(result.confirmed);assert.equal(ctx.sent,1);assert(ctx.events.some(e=>e.state==='streaming'&&e.text==='新'));
});
test('never returns a stale historical response as a new answer',async()=>{
  const stale={...ready,assistantCount:1,text:'历史回复'};const ctx=makeBridge([stale],{baseline:stale});const result=await ctx.bridge.send('新问题');assert.equal(result.state,'timeout');assert.equal(result.text,'');assert(!ctx.events.some(e=>e.text==='历史回复'));
});
test('verification and login are surfaced before any fill or send',async()=>{
  for(const state of ['verification','login']){const ctx=makeBridge([],{baseline:{state,message:'请先手动处理 '+state}});await assert.rejects(ctx.bridge.send('测试'),/手动处理/);assert.equal(ctx.sent,0);assert.equal(ctx.filled,0);}
});
test('existing drafts are not overwritten',async()=>{const ctx=makeBridge([],{baseline:{...ready,hasDraft:true}});await assert.rejects(ctx.bridge.send('新消息'),/草稿/);assert.equal(ctx.filled,0);});
test('missing acknowledgment fails without duplicate submits',async()=>{const ctx=makeBridge([{...ready,hasDraft:true}]);await assert.rejects(ctx.bridge.send('不要重发'),/不会自动重发/);assert.equal(ctx.sent,1);});
test('unknown end-of-generation is explicitly marked unconfirmed',async()=>{const ctx=makeBridge([{...ready,assistantCount:1,text:'暂时稳定',sendReady:null}]);const result=await ctx.bridge.send('测试');assert.equal(result.state,'stable');assert.equal(result.confirmed,false);});
test('cancellation stops waiting and releases the single-flight lock',async()=>{let ctx;ctx=makeBridge([{...ready,generating:true}],{sleep:async()=>{if(ctx.bridge.active)ctx.bridge.active.cancelled=true;}});const result=await ctx.bridge.send('停止测试');assert.equal(result.state,'stopped');assert.equal(ctx.bridge.active,null);assert.equal(ctx.sent,0);});
test('concurrent sends are refused rather than mixed',async()=>{const ctx=makeBridge([]);ctx.bridge.active={id:'ongoing'};await assert.rejects(ctx.bridge.send('another'),/上一条消息/);});
