const fs=require('node:fs/promises');
const path=require('node:path');
const {Worker}=require('node:worker_threads');
const MAX_BYTES=20*1024*1024;
const MAX_CHARS=50000;
const textExtensions=new Set(['','.txt','.md','.csv','.tsv','.json','.jsonl','.xml','.html','.htm','.css','.js','.cjs','.mjs','.ts','.tsx','.jsx','.py','.yml','.yaml','.ini','.cfg','.conf','.log','.sql','.sh','.ps1','.bat','.toml','.rs','.go','.java','.c','.h','.cpp','.hpp','.svg','.tex','.srt','.vtt','.rtf']);
function formatOf(filename){const extension=path.extname(filename).toLowerCase();if(extension==='.docx')return 'Word';if(['.xlsx','.xlsm'].includes(extension))return 'Excel';if(extension==='.pdf')return 'PDF';if(textExtensions.has(extension)||path.basename(filename).startsWith('.'))return '文本';return '暂不支持解析';}
function decodeText(data){
  if(data[0]===0xff&&data[1]===0xfe)return {content:new TextDecoder('utf-16le',{fatal:true}).decode(data),encoding:'UTF-16LE'};
  if(data[0]===0xfe&&data[1]===0xff)return {content:new TextDecoder('utf-16be',{fatal:true}).decode(data),encoding:'UTF-16BE'};
  if(data.includes(0))throw Error('文件包含二进制数据，不能当作文本读取。');
  try{return {content:new TextDecoder('utf-8',{fatal:true}).decode(data),encoding:'UTF-8'};}catch{}
  try{return {content:new TextDecoder('gb18030',{fatal:true}).decode(data),encoding:'GB18030 / GBK'};}catch{throw Error('无法识别文本编码，请另存为 UTF-8 后重试。');}
}
async function readDocument(filename){
  const stat=await fs.stat(filename);if(!stat.isFile())throw Error('请选择普通文件。');
  if(stat.size>MAX_BYTES)throw Error('文件超过 20 MB，请拆分后再添加。');
  const format=formatOf(filename);
  if(format==='暂不支持解析')throw Error('暂不支持 '+(path.extname(filename)||'此')+' 格式；支持 DOCX、XLSX、XLSM、文字 PDF 和常见文本。旧 DOC/XLS 请先另存为 DOCX/XLSX；图片和 CAD 原生文件暂不支持内容解析。');
  if(format==='文本'){
    const decoded=decodeText(await fs.readFile(filename));
    return {format,...decoded,content:decoded.content.slice(0,MAX_CHARS),truncated:decoded.content.length>MAX_CHARS,bytes:stat.size,warnings:[],modified:stat.mtime.toISOString()};
  }
  const result=await new Promise((resolve,reject)=>{
    const worker=new Worker(path.join(__dirname,'file-worker.cjs'),{workerData:{filename,format,maxChars:MAX_CHARS},resourceLimits:{maxOldGenerationSizeMb:384}});
    const timer=setTimeout(()=>{worker.terminate();reject(Error('文件解析超过 25 秒，请拆分文件后重试。'));},25000);
    worker.once('message',message=>{clearTimeout(timer);worker.terminate();message.ok?resolve(message.result):reject(Error(message.error));});
    worker.once('error',error=>{clearTimeout(timer);reject(Error('文件解析失败：'+error.message));});
    worker.once('exit',code=>{clearTimeout(timer);if(code!==0)reject(Error('解析进程退出，文件可能过大或已损坏。'));});
  });
  return {...result,format,bytes:stat.size,modified:stat.mtime.toISOString()};
}
module.exports={readDocument,decodeText,formatOf,MAX_CHARS};
