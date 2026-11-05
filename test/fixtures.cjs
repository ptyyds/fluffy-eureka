const fs=require('node:fs/promises');
const path=require('node:path');
const {createRequire}=require('node:module');
const ExcelJS=require('exceljs');
const JSZip=createRequire(require.resolve('exceljs'))('jszip');
function pdfBuffer(text='Hello Local PDF'){
  const stream=text?'BT /F1 12 Tf 72 720 Td ('+text+') Tj ET':'q Q';
  const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>','<< /Length '+Buffer.byteLength(stream)+' >>\nstream\n'+stream+'\nendstream','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  let source='%PDF-1.4\n',offsets=[0];
  for(let i=0;i<objects.length;i++){offsets.push(Buffer.byteLength(source));source+=(i+1)+' 0 obj\n'+objects[i]+'\nendobj\n';}
  const xref=Buffer.byteLength(source);source+='xref\n0 6\n0000000000 65535 f \n'+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF\n';return Buffer.from(source);
}
async function fixtures(root){
  const zip=new JSZip();zip.file('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/document.xml','<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>鲸台文件识别测试 合同金额 12345</w:t></w:r></w:p></w:body></w:document>');
  await fs.writeFile(path.join(root,'测试文档.docx'),await zip.generateAsync({type:'nodebuffer'}));
  const workbook=new ExcelJS.Workbook();const sheet=workbook.addWorksheet('销售明细');sheet.addRow(['项目','金额']);sheet.addRow(['本地数据',789]);sheet.addRow(['合计',{formula:'B2',result:789}]);await workbook.xlsx.writeFile(path.join(root,'测试表格.xlsx'));
  await fs.writeFile(path.join(root,'测试PDF.pdf'),pdfBuffer());await fs.writeFile(path.join(root,'说明.txt'),'本地文件已经被实际读取。');
  return ['测试文档.docx','测试表格.xlsx','测试PDF.pdf','说明.txt'];
}
module.exports={fixtures,pdfBuffer};
