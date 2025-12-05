// Script Node.js para verificar si un PDF tiene bookmarks
// Uso: node scripts/check-pdf-bookmarks.js "ruta/al/archivo.pdf"

const fs = require('fs');
const path = require('path');

const pdfPath = process.argv[2];

if (!pdfPath) {
  console.error('Error: Proporciona la ruta al archivo PDF');
  console.log('Uso: node scripts/check-pdf-bookmarks.js "ruta/al/archivo.pdf"');
  process.exit(1);
}

if (!fs.existsSync(pdfPath)) {
  console.error(`Error: El archivo no existe: ${pdfPath}`);
  process.exit(1);
}

console.log(`Verificando bookmarks en: ${pdfPath}`);

try {
  // Leer el PDF como binario
  const pdfBuffer = fs.readFileSync(pdfPath);
  const pdfText = pdfBuffer.toString('latin1'); // Usar latin1 para preservar bytes

  // Buscar indicadores de bookmarks en el PDF
  // Los bookmarks suelen estar en objetos con /Outlines o /First
  const hasOutlines = /\/Outlines/.test(pdfText);
  const hasFirst = /\/First\s+\d+\s+\d+\s+R/.test(pdfText);
  const hasBookmarks = /\/Bookmark/.test(pdfText);
  const hasOutlineDict = /\/Type\s*\/Outlines/.test(pdfText);

  if (hasOutlines || hasFirst || hasBookmarks || hasOutlineDict) {
    console.log('✓ El PDF parece tener bookmarks/marcadores');
    console.log('  Indicadores encontrados:');
    if (hasOutlines) console.log('    - /Outlines encontrado');
    if (hasFirst) console.log('    - /First encontrado');
    if (hasBookmarks) console.log('    - /Bookmark encontrado');
    if (hasOutlineDict) console.log('    - /Type /Outlines encontrado');
    process.exit(0);
  } else {
    console.log('✗ El PDF NO parece tener bookmarks/marcadores');
    console.log('  (Esto es una verificación básica, puede haber falsos negativos)');
    process.exit(1);
  }
} catch (error) {
  console.error('Error leyendo el PDF:', error.message);
  process.exit(1);
}

