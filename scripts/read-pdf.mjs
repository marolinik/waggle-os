import fs from 'node:fs';
import { PDFParse } from 'pdf-parse';

const path = process.argv[2];
if (!path) {
  console.error('Usage: node read-pdf.mjs <pdf-path>');
  process.exit(1);
}

const buf = fs.readFileSync(path);
const parser = new PDFParse({ data: buf });
await parser.load();
const info = await parser.getInfo();
const text = await parser.getText();
console.log('Pages:', info.numPages);
console.log('Title:', info.info?.Title || 'none');
console.log('Author:', info.info?.Author || 'none');
console.log('---CONTENT---');
console.log(text.text);
await parser.destroy();
