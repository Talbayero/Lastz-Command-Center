const Tesseract = require('./node_modules/tesseract.js');
const path = require('path');

async function testOcr() {
  const imagePath = 'C:\\Users\\Teddy A\\OneDrive\\Escritorio\\Last Z\\BOM\\Screenshot 2026-03-16 104455.png';
  console.log(`Testing OCR on: ${imagePath}`);
  
  try {
    const result = await Tesseract.recognize(imagePath, 'eng');
    console.log('--- RAW OCR START ---');
    console.log(result.data.text);
    console.log('--- RAW OCR END ---');
  } catch (err) {
    console.error('OCR Error:', err);
  }
}

testOcr();
