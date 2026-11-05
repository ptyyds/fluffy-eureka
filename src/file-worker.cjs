const {parentPort,workerData}=require('node:worker_threads');
const fs=require('node:fs/promises');
(async()=>{
  const {filename,format,maxChars}=workerData;
  let content='',truncated=false,details={},warnings=[];
  if(format==='Word'){
    const result=await require('mammoth').extractRawText({path:filename});content=result.value;warnings=result.messages.map(m=>m.message).slice(0,8);
  }else if(format==='Excel'){
    const ExcelJS=require('exceljs');const workbook=new ExcelJS.Workbook();await workbook.xlsx.readFile(filename);
    let cells=0,sheets=0;
    function cellText(value){if(value==null)return '';if(value instanceof Date)return value.toISOString();if(typeof value==='object'){if('formula' in value||'sharedFormula' in value)return (value.result==null?'[公式未缓存结果]':cellText(value.result))+' [公式]';if(value.richText)return value.richText.map(t=>t.text).join('');return String(value.text??value.error??'');}return String(value);}
    for(const sheet of workbook.worksheets){
      if(sheet.state==='veryHidden'){warnings.push('已跳过 veryHidden 工作表：'+sheet.name);continue;}
      content+='\n## 工作表：'+sheet.name+'\n';sheets++;
      sheet.eachRow((row,index)=>{
        if(content.length>maxChars||cells>=15000){truncated=true;return;}
        const values=[];row.eachCell({includeEmpty:true},cell=>{if(values.length<100){values.push(cellText(cell.value).replace(/[\t\r\n]+/g,' '));cells++;}});
        if(row.cellCount>100)truncated=true;
        content+=index+'\t'+values.join('\t')+'\n';
      });
      if(content.length>maxChars||cells>=15000)break;
    }
    details={sheets,totalSheets:workbook.worksheets.length,cells};
    if(sheets<workbook.worksheets.filter(s=>s.state!=='veryHidden').length)truncated=true;
  }else if(format==='PDF'){
    const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');
    const path=require('node:path');const resources=path.dirname(require.resolve('pdfjs-dist/package.json'));
    const resourceURL=folder=>require('node:url').pathToFileURL(path.join(resources,folder)+path.sep).href;
    const loading=getDocument({data:new Uint8Array(await fs.readFile(filename)),isEvalSupported:false,useSystemFonts:true,disableFontFace:true,cMapUrl:resourceURL('cmaps'),cMapPacked:true,standardFontDataUrl:resourceURL('standard_fonts'),wasmUrl:resourceURL('wasm')});
    const doc=await loading.promise;
    try{
      let extractedPages=0;
      for(let pageNo=1;pageNo<=Math.min(doc.numPages,60);pageNo++){
        const page=await doc.getPage(pageNo);const text=await page.getTextContent();
        content+='\n## 第 '+pageNo+' 页\n'+text.items.map(item=>item.str+(item.hasEOL?'\n':' ')).join('');extractedPages++;
        if(content.length>maxChars){truncated=true;break;}
      }
      details={pages:doc.numPages,extractedPages};if(extractedPages<doc.numPages)truncated=true;
      if(!content.replace(/## 第 \d+ 页/g,'').trim())throw Error('PDF 没有可提取的文字，可能是扫描件。当前版本未提供 OCR，请先识别文字或使用可选中文字的 PDF。');
    }finally{await loading.destroy();}
  }
  truncated=truncated||content.length>maxChars;
  parentPort.postMessage({ok:true,result:{content:content.slice(0,maxChars),truncated,details,warnings}});
})().catch(error=>parentPort.postMessage({ok:false,error:error.message}));
