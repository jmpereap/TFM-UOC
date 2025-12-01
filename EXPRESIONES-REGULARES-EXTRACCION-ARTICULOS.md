# Expresiones Regulares para Extracción de Artículos del PDF

Este documento contiene todas las expresiones regulares utilizadas para extraer el texto de artículos legales desde archivos PDF.

**Archivo principal:** `app/api/mental-outline/extract-article/route.ts`

---

## 1. Patrones de Cabeceras y Pies de Página

### Cabeceras del BOE
```typescript
const RX_BOE_HEADER = /BOLET[ÍI]N\s+OFICIAL\s+DEL\s+ESTADO|LEGISLACI[ÓO]N\s+CONSOLIDADA/gi
```

**Descripción:** Detecta cabeceras del Boletín Oficial del Estado o Legislación Consolidada.

**Flags:**
- `g`: Global (busca todas las ocurrencias)
- `i`: Case insensitive (no distingue mayúsculas/minúsculas)

**Ejemplos que coinciden:**
- "BOLETÍN OFICIAL DEL ESTADO"
- "boletín oficial del estado"
- "LEGISLACIÓN CONSOLIDADA"
- "Legislación Consolidada"

---

### Pie de Página del BOE
```typescript
const RX_BOE_FOOTER = /BOLET[ÍI]N\s+OFICIAL\s+DEL\s+ESTADO.*?P(?:[áa]gina|\.)\s*\d+/gim
```

**Descripción:** Detecta pies de página que contienen "BOLETÍN OFICIAL DEL ESTADO" seguido de "Página X" o "Pág. X" o "P. X".

**Flags:**
- `g`: Global
- `i`: Case insensitive
- `m`: Multiline (^ y $ coinciden con inicio/fin de línea)

**Ejemplos que coinciden:**
- "BOLETÍN OFICIAL DEL ESTADO ... Página 15"
- "boletín oficial del estado ... Pág. 20"
- "BOLETÍN OFICIAL DEL ESTADO ... P. 5"

---

## 2. Normalización del Número de Artículo

### Extraer número del artículo
```typescript
/(\d+|[IVXLCDM]+|bis|ter)/i
```

**Descripción:** Extrae el número del artículo, aceptando:
- Números arábigos: `1`, `51`, `100`
- Números romanos: `I`, `V`, `X`, `L`, `C`, `D`, `M`
- Variantes: `bis`, `ter`

**Ejemplos:**
- "Artículo 51" → `51`
- "Artículo I" → `I`
- "Artículo 1 bis" → `1` (solo extrae la primera parte)
- "Artículo ter" → `ter`

### Eliminar prefijo "Artículo"
```typescript
/Art[íi]culo\s+/i
```

**Descripción:** Elimina el prefijo "Artículo" o "Artículo" (con tilde) seguido de espacios.

**Ejemplos:**
- "Artículo 51" → `51`
- "Artículo 1" → `1`

---

## 3. Búsqueda del Inicio del Artículo

### Patrón principal (inicio de línea)
```typescript
new RegExp(
  `^Artículo\\s+${normalizedNum}(?:\\s*(?:bis|ter|quater|quinquies|sexies|septies|octies|nonies|decies))?\\s*\\.`,
  'im'
)
```

**Descripción:** Busca "Artículo X." al inicio de línea, donde X es el número normalizado.

**Variantes soportadas:**
- `bis`, `ter`, `quater`, `quinquies`, `sexies`, `septies`, `octies`, `nonies`, `decies`

**Flags:**
- `i`: Case insensitive
- `m`: Multiline (^ coincide con inicio de línea)

**Ejemplos que coinciden:**
- "Artículo 1."
- "Artículo 51."
- "Artículo 1 bis."
- "Artículo 2 ter."
- "artículo 5." (case insensitive)

**Ejemplo con número 51:**
```
^Artículo\s+51(?:\s*(?:bis|ter|quater|quinquies|sexies|septies|octies|nonies|decies))?\s*\.
```

---

### Patrón fallback (cualquier posición)
```typescript
new RegExp(
  `Artículo\\s+${normalizedNum}(?:\\s*(?:bis|ter|quater|quinquies|sexies|septies|octies|nonies|decies))?[.\\-:]`,
  'i'
)
```

**Descripción:** Busca "Artículo X" seguido de punto, guion o dos puntos, en cualquier posición del texto (no requiere inicio de línea).

**Ejemplos que coinciden:**
- "Artículo 1."
- "Artículo 1-"
- "Artículo 1:"
- "Texto previo Artículo 51."

---

### Búsqueda de artículos similares (para debug)
```typescript
/Art[íi]culo\s+\d+/gi
```

**Descripción:** Busca cualquier artículo con número para mostrar en mensajes de error.

**Ejemplos:**
- "Artículo 1"
- "Artículo 51"
- "artículo 100"

---

## 4. Extracción de la Rúbrica

### Patrón de rúbrica
```typescript
/^\s*([^.:\n]+?)(?:\.|:)(?:\s|$|\n)/
```

**Descripción:** Extrae el texto después de "Artículo X." hasta el primer punto o dos puntos.

**Grupos de captura:**
- Grupo 1: `([^.:\n]+?)` - La rúbrica (texto que no contiene punto, dos puntos o salto de línea)

**Ejemplos:**
- "Artículo 1. Objeto y ámbito de aplicación." → Rúbrica: `Objeto y ámbito de aplicación`
- "Artículo 5: Derecho a la información:" → Rúbrica: `Derecho a la información`

---

### Validación: No es solo un número
```typescript
/^\d+[.)]?$/
```

**Descripción:** Verifica si la rúbrica es solo un número seguido opcionalmente de punto o paréntesis.

**Ejemplos que coinciden (rechazados):**
- "1"
- "1."
- "1)"
- "2."

**Ejemplos que NO coinciden (aceptados):**
- "Objeto"
- "Derecho a la información"
- "1. Objeto" (tiene texto además del número)

---

### Validación: Contiene letras
```typescript
/[a-zA-ZáéíóúüñÁÉÍÓÚÜÑ]/
```

**Descripción:** Verifica que la rúbrica contenga al menos una letra (incluye caracteres acentuados en español).

**Ejemplos que coinciden (aceptados):**
- "Objeto"
- "Derecho a la información"
- "Ámbito"

**Ejemplos que NO coinciden (rechazados):**
- "1"
- "123"
- "..."

---

## 5. Búsqueda del Final del Artículo

### Patrón de delimitador siguiente (excluyendo artículo actual)
```typescript
new RegExp(
  `(?:^|\\n)\\s*(?:Artículo\\s+(?!${normalizedNum}(?:\\s*(?:bis|ter|quater|quinquies|sexies|septies|octies|nonies|decies))?\\s*\\.)[\\d]+(?:\\s*(?:bis|ter|quater|quinquies|sexies|septies|octies|nonies|decies))?\\s*\\.|TÍTULO|CAPÍTULO|SECCIÓN|DISPOSICIÓN)`,
  'gim'
)
```

**Descripción:** Busca el siguiente delimitador que marca el final del artículo:
- Otro artículo (diferente al actual)
- TÍTULO
- CAPÍTULO
- SECCIÓN
- DISPOSICIÓN

**Características:**
- Usa negative lookahead `(?!...)` para excluir el artículo actual
- Busca al inicio de línea o después de salto de línea

**Ejemplo con artículo 51:**
```
(?:^|\n)\s*(?:Artículo\s+(?!51(?:\s*(?:bis|ter|quater|quinquies|sexies|septies|octies|nonies|decies))?\s*\.)[\d]+(?:\s*(?:bis|ter|quater|quinquies|sexies|septies|octies|nonies|decies))?\s*\.|TÍTULO|CAPÍTULO|SECCIÓN|DISPOSICIÓN)
```

---

### Patrón de cualquier artículo (para findArticleEnd)
```typescript
new RegExp(
  `(?:^|\\n|\\s)Artículo\\s+(?!${currentArticleNum}(?:\\s*(?:bis|ter|quater|quinquies|sexies|septies|octies|nonies|decies))?\\s*\\.)[\\d]+(?:\\s*(?:bis|ter|quater|quinquies|sexies|septies|octies|nonies|decies))?\\s*\\.`,
  'gim'
)
```

**Descripción:** Similar al anterior, pero también busca artículos que pueden estar precedidos por espacio (no solo inicio de línea).

---

### Patrón de siguiente artículo (verificación adicional)
```typescript
new RegExp(
  `Artículo\\s+(?!${normalizedNum}(?:\\s*(?:bis|ter|quater|quinquies|sexies|septies|octies|nonies|decies))?\\s*\\.)[\\d]+(?:\\s*(?:bis|ter|quater|quinquies|sexies|septies|octies|nonies|decies))?\\s*\\.`,
  'i'
)
```

**Descripción:** Busca cualquier artículo diferente al actual, sin requerir inicio de línea.

---

### Patrones de delimitadores estructurales
```typescript
/(?:^|\n)\s*TÍTULO\s+[IVXLCDM\d]+/gim
/(?:^|\n)\s*CAPÍTULO\s+[IVXLCDM\d]+/gim
/(?:^|\n)\s*SECCIÓN\s+[IVXLCDM\d]+/gim
/(?:^|\n)\s*DISPOSICIÓN\s+(?:ADICIONAL|TRANSITORIA|DEROGATORIA|FINAL)/gim
```

**Descripción:** Buscan encabezados de estructura legal:
- TÍTULO seguido de número romano o arábigo
- CAPÍTULO seguido de número romano o arábigo
- SECCIÓN seguida de número romano o arábigo
- DISPOSICIÓN seguida de tipo (ADICIONAL, TRANSITORIA, DEROGATORIA, FINAL)

**Ejemplos que coinciden:**
- "TÍTULO I"
- "Título 5"
- "CAPÍTULO III"
- "SECCIÓN 2"
- "DISPOSICIÓN ADICIONAL"
- "Disposición Transitoria"

---

## 6. Limpieza del Texto del Artículo

### Eliminar líneas que son solo números
```typescript
/^\s*\d+\s*$/gm
```

**Descripción:** Elimina líneas que contienen solo un número (típicamente números de página en el pie).

**Flags:**
- `g`: Global
- `m`: Multiline

**Ejemplos eliminados:**
- "15"
- "  20  "
- "100"

---

### Eliminar líneas con formato de índice (puntos y números)
```typescript
/^\s*\.+\s*\d+\s*$/gm
```

**Descripción:** Elimina líneas con formato de índice (puntos seguidos de número).

**Ejemplos eliminados:**
- "....15"
- "......20"
- "  ...100  "

---

### Eliminar líneas del índice con formato "Artículo X. Texto... 15"
```typescript
/^\s*Artículo\s+\d+\.\s+[^.]+\s+\.{3,}\s+\d+\s*$/gm
```

**Descripción:** Elimina líneas del índice que tienen formato "Artículo X. Texto... NúmeroPágina".

**Ejemplos eliminados:**
- "Artículo 1. Objeto y ámbito... 15"
- "Artículo 51. Competencia territorial...... 20"

---

### Eliminar múltiples puntos consecutivos del índice
```typescript
/\.{6,}/g
```

**Descripción:** Elimina secuencias de 6 o más puntos consecutivos (formato de índice).

**Ejemplos:**
- "Artículo 1. Texto......15" → "Artículo 1. Texto15"
- "Texto......más texto" → "Textomás texto"

---

### Normalizar saltos de línea múltiples
```typescript
/\n{3,}/g
```

**Descripción:** Reemplaza 3 o más saltos de línea consecutivos por solo 2 saltos de línea.

**Ejemplos:**
- "\n\n\n\n" → "\n\n"
- "Texto\n\n\n\nMás texto" → "Texto\n\nMás texto"

---

## 7. Extracción de Números de Página del Pie

### Línea que contiene solo un número (1-3 dígitos)
```typescript
/^\d{1,3}$/
```

**Descripción:** Busca líneas que contienen solo un número de 1 a 3 dígitos (números de página normales).

**Ejemplos que coinciden:**
- "1"
- "15"
- "100"

**Ejemplos que NO coinciden:**
- "1000" (4 dígitos, probablemente un año)
- "12345" (5 dígitos)

---

### Patrones de pie de página
```typescript
/p[áa]g\.?\s*(\d{1,3})/i
/p[áa]gina\s+(\d{1,3})/i
/p\.\s*(\d{1,3})/i
/(\d{1,3})\s*\/\s*\d+/
```

**Descripción:** Buscan números de página en diferentes formatos:
1. "pág. X" o "pag. X" o "pág X"
2. "página X" o "pagina X"
3. "p. X"
4. "X / Y" (página X de Y total)

**Grupos de captura:**
- Grupo 1: `(\d{1,3})` - El número de página (1-3 dígitos)

**Ejemplos que coinciden:**
- "pág. 15" → Captura: `15`
- "pagina 20" → Captura: `20`
- "p. 5" → Captura: `5`
- "15 / 100" → Captura: `15`

---

## 8. Detección de Contenido de Índice

### Detectar múltiples puntos seguidos
```typescript
/\.\s*\./g
```

**Descripción:** Busca secuencias de punto-espacio-punto (formato típico de índice).

**Ejemplos:**
- "Artículo 1. Texto... 15" → Encuentra 2 coincidencias (".." y "..")
- "Texto...más texto" → Encuentra 2 coincidencias

**Uso:** Si hay más de 5 coincidencias, se considera contenido de índice.

---

### Detectar línea que empieza con puntos
```typescript
/^\.\s*\./m
```

**Descripción:** Detecta líneas que empiezan con puntos (formato de índice).

**Ejemplos que coinciden:**
- "....15"
- "......texto"

---

## 9. Limpieza de Patrones "Página X"

### Eliminar patrón "Página X"
```typescript
/P[áa]gina\s+\d+/gi
```

**Descripción:** Elimina referencias a números de página en el texto del artículo.

**Ejemplos eliminados:**
- "Página 15"
- "pagina 20"
- "PÁGINA 5"

---

## Resumen de Flags de Expresiones Regulares

| Flag | Nombre | Descripción |
|------|--------|-------------|
| `g` | Global | Busca todas las ocurrencias, no solo la primera |
| `i` | Case Insensitive | No distingue mayúsculas/minúsculas |
| `m` | Multiline | `^` y `$` coinciden con inicio/fin de línea, no solo inicio/fin de string |

---

## Flujo de Extracción

1. **Normalizar número de artículo** → Extraer solo el número
2. **Buscar inicio del artículo** → Patrón principal o fallback
3. **Extraer rúbrica** → Texto hasta primer punto o dos puntos
4. **Validar rúbrica** → No debe ser solo número, debe tener letras
5. **Buscar final del artículo** → Siguiente artículo, TÍTULO, CAPÍTULO, SECCIÓN o DISPOSICIÓN
6. **Limpiar texto** → Eliminar cabeceras, pies, índices, normalizar saltos de línea
7. **Eliminar cabeceras/pies** → Siempre se eliminan del texto final

---

## Archivos Relacionados

- `app/api/mental-outline/extract-article/route.ts` - Implementación principal
- `lib/legal/fragments.ts` - Definición de `RX_BOE_FOOTER`
- `lib/utils/articleSummary.ts` - Generación de resumen (usa el texto extraído)





