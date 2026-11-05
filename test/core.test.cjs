const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {Workspace,parsePlan}=require('../src/core.cjs');
async function fixture(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'whaledesk-test-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));return new Workspace(root,root);}
test('only explicit, valid tool protocol can create a plan',()=>{
  assert.throws(()=>parsePlan('{"steps":[]}'));
  assert.throws(()=>parsePlan('{"whaledesk":1,"steps":[{"tool":"delete","path":"x"}]}'));
  assert.throws(()=>parsePlan(JSON.stringify({whaledesk:1,steps:Array(13).fill({tool:'list_files',path:'.'})})));
  assert.equal(parsePlan('说明\n```json\n{"whaledesk":1,"title":"清单","steps":[{"tool":"list_files","path":"."}]}\n```').steps.length,1);
});
test('workspace rejects traversal, absolute paths and alternate data streams',async t=>{
  const w=await fixture(t);
  for(const p of ['../escape.txt','C:\\Windows\\win.ini','file.txt:stream','/tmp/x'])await assert.rejects(w.resolve(p,true));
});
test('write never overwrites, and undo refuses changed content',async t=>{
  const w=await fixture(t);await w.execute({tool:'write_text',path:'new.txt',content:'original'});
  await assert.rejects(w.execute({tool:'write_text',path:'new.txt',content:'replacement'}));
  await fs.writeFile(path.join(w.root,'new.txt'),'changed');await assert.rejects(w.undo());
  assert.equal(await fs.readFile(path.join(w.root,'new.txt'),'utf8'),'changed');
});
test('file creation, reading and moving are genuinely reversible',async t=>{
  const w=await fixture(t);
  await w.execute({tool:'make_directory',path:'folder'});
  await w.execute({tool:'write_text',path:'a.txt',content:'鲸台测试'});
  await w.execute({tool:'move_file',path:'a.txt',to:'folder/a.txt'});
  assert.equal((await w.execute({tool:'read_text',path:'folder/a.txt'})).content,'鲸台测试');
  await w.undo();assert.equal(await fs.readFile(path.join(w.root,'a.txt'),'utf8'),'鲸台测试');
  await w.undo();await w.undo();assert.deepEqual(await fs.readdir(w.root),[]);
});
test('move collision preserves both original files',async t=>{
  const w=await fixture(t);await fs.writeFile(path.join(w.root,'a'),'a');await fs.writeFile(path.join(w.root,'b'),'b');
  await assert.rejects(w.execute({tool:'move_file',path:'a',to:'b'}));assert.equal(await fs.readFile(path.join(w.root,'a'),'utf8'),'a');assert.equal(await fs.readFile(path.join(w.root,'b'),'utf8'),'b');
});
test('junctions cannot escape the workspace',async t=>{
  const w=await fixture(t);const outside=await fs.mkdtemp(path.join(os.tmpdir(),'whaledesk-outside-'));t.after(()=>fs.rm(outside,{recursive:true,force:true}));
  await fs.symlink(outside,path.join(w.root,'link'),'junction');await assert.rejects(w.resolve('link/escape.txt',true));
});
test('binary and oversized files do not become model input',async t=>{
  const w=await fixture(t);await fs.writeFile(path.join(w.root,'binary'),Buffer.from([0,1,2]));await fs.writeFile(path.join(w.root,'large'),'x'.repeat(200001));
  await assert.rejects(w.execute({tool:'read_text',path:'binary'}));await assert.rejects(w.execute({tool:'read_text',path:'large'}));
});
