#!/usr/bin/env python3
"""
Script para extraer bookmarks de un PDF usando PyMuPDF (fitz)
Uso: python scripts/extract-bookmarks.py <ruta_al_pdf>
"""

import sys
import json
import base64

try:
    import fitz  # PyMuPDF
except ImportError:
    print(json.dumps({"error": "PyMuPDF no está instalado. Ejecuta: pip install pymupdf"}, ensure_ascii=False))
    sys.exit(1)

def extract_bookmarks(pdf_path_or_data):
    """
    Extrae bookmarks de un PDF.
    Puede recibir una ruta de archivo o datos base64 del PDF.
    """
    try:
        # Si es base64, decodificar primero
        if pdf_path_or_data.startswith('base64:'):
            pdf_data = base64.b64decode(pdf_path_or_data[7:])
            doc = fitz.open(stream=pdf_data, filetype="pdf")
        else:
            # Es una ruta de archivo
            import os
            if not os.path.exists(pdf_path_or_data):
                return {
                    "ok": False,
                    "error": f"El archivo no existe: {pdf_path_or_data}"
                }
            doc = fitz.open(pdf_path_or_data)
        
        # Obtener tabla de contenidos (bookmarks)
        # simple=True → formato más limpio: [(nivel, título, página), ...]
        toc = doc.get_toc(simple=True)
        
        # Convertir a formato JSON
        bookmarks = []
        
        def convert_bookmark(level, title, page, parent=None):
            """Convierte un bookmark a formato JSON con hijos"""
            bookmark = {
                "title": title,
                "pageNumber": page + 1,  # PyMuPDF usa índice 0, nosotros usamos 1
                "children": []
            }
            
            # Buscar hijos (bookmarks con nivel mayor)
            if parent is not None:
                # Si hay un siguiente bookmark con nivel mayor, es hijo
                pass
            
            return bookmark
        
        # Convertir TOC a estructura jerárquica
        # PyMuPDF retorna: [(nivel, título, página), ...]
        # Nivel 1 = raíz, nivel 2 = hijo de nivel 1, etc.
        
        stack = []  # Pila para manejar la jerarquía: [(level, bookmark), ...]
        
        for level, title, page in toc:
            bookmark = {
                "title": title,
                "pageNumber": page + 1,  # PyMuPDF usa índice 0, nosotros usamos 1
                "children": []
            }
            
            # Ajustar la pila: eliminar bookmarks con nivel mayor o igual
            # (volver hacia arriba en la jerarquía)
            while stack and stack[-1][0] >= level:
                stack.pop()
            
            # Agregar a la estructura
            if not stack:
                # Es un bookmark de nivel superior (raíz)
                bookmarks.append(bookmark)
            else:
                # Es hijo del último bookmark en la pila
                parent_bookmark = stack[-1][1]
                parent_bookmark["children"].append(bookmark)
            
            # Agregar a la pila para posibles hijos
            stack.append((level, bookmark))
        
        doc.close()
        
        return {
            "ok": True,
            "bookmarks": bookmarks
        }
        
    except Exception as e:
        import traceback
        error_details = {
            "error": str(e),
            "type": type(e).__name__,
            "traceback": traceback.format_exc()
        }
        return {
            "ok": False,
            "error": str(e),
            "details": error_details
        }

if __name__ == "__main__":
    if len(sys.argv) < 2:
        error_msg = json.dumps({"error": "Uso: python extract-bookmarks.py <ruta_pdf_o_base64>"}, ensure_ascii=False)
        print(error_msg, file=sys.stderr)
        print(error_msg)  # También en stdout para compatibilidad
        sys.exit(1)
    
    try:
        pdf_input = sys.argv[1]
        result = extract_bookmarks(pdf_input)
        output = json.dumps(result, ensure_ascii=False)
        print(output)
        
        # Si hay error, también imprimirlo en stderr
        if not result.get("ok"):
            print(f"Error: {result.get('error', 'Error desconocido')}", file=sys.stderr)
        
        sys.exit(0 if result.get("ok") else 1)
    except Exception as e:
        import traceback
        error_result = {
            "ok": False,
            "error": str(e),
            "type": type(e).__name__,
            "traceback": traceback.format_exc()
        }
        output = json.dumps(error_result, ensure_ascii=False)
        print(output)
        print(f"Error fatal: {str(e)}", file=sys.stderr)
        print(traceback.format_exc(), file=sys.stderr)
        sys.exit(1)

