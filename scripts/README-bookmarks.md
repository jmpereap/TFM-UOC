# Extracción de Bookmarks desde PDFs

Este proyecto soporta múltiples métodos para extraer bookmarks/marcadores de PDFs.

## Método Principal: PyMuPDF (fitz)

El método recomendado es usar **PyMuPDF** vía un script Python, ya que es más confiable y no tiene problemas de worker como `pdfjs-dist`.

### Instalación

1. Instala Python 3.7+ si no lo tienes instalado
2. Instala PyMuPDF:
   ```bash
   pip install pymupdf
   ```

### Uso

El script se ejecuta automáticamente desde Node.js cuando se sube un PDF. También puedes ejecutarlo manualmente:

```bash
# Con ruta de archivo
python scripts/extract-bookmarks.py "ruta/al/archivo.pdf"

# Con datos base64 (desde Node.js)
python scripts/extract-bookmarks.py "base64:..."
```

### Formato de salida

El script retorna JSON con la siguiente estructura:

```json
{
  "ok": true,
  "bookmarks": [
    {
      "title": "Título del bookmark",
      "pageNumber": 1,
      "children": [
        {
          "title": "Sub-bookmark",
          "pageNumber": 5,
          "children": []
        }
      ]
    }
  ]
}
```

## Método Alternativo: pdfjs-dist

Si PyMuPDF no está disponible, se intenta usar `pdfjs-dist` como fallback, aunque puede tener problemas con el worker en Next.js.

## Verificación de Bookmarks

Para verificar si un PDF tiene bookmarks antes de subirlo:

1. **Scripts de línea de comandos:**
   ```powershell
   .\scripts\check-pdf-bookmarks.ps1 "archivo.pdf"
   ```
   ```bash
   node scripts/check-pdf-bookmarks.js "archivo.pdf"
   ```

2. **Adobe Acrobat Reader:**
   - Abre el PDF
   - Presiona `Ctrl+B` o ve a `Ver → Paneles de navegación → Marcadores`
   - Si hay marcadores, aparecerán en el panel lateral

3. **En la aplicación:**
   - Después de subir el PDF, la app indica si hay bookmarks disponibles
   - Si hay bookmarks, aparece un mensaje verde con el número de elementos

