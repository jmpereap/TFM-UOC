# Entorno Técnico y Configuración

## Stack Tecnológico

### Framework y Lenguaje Principal

- **Next.js**: `14.2.5`
  - App Router (no Pages Router)
  - React Server Components
  - API Routes
  
- **React**: `18.3.1`
- **React DOM**: `18.3.1`
- **TypeScript**: `5.5.4`

### Requisitos del Sistema

- **Node.js**: `>=18.17.0` (especificado en `package.json`)
- **npm**: `>=9` (recomendado)

---

## Librerías y Dependencias

### Procesamiento de PDF

#### Librerías Principales

- **`pdf-parse`**: `^1.1.1`
  - Parseo principal del PDF
  - Extracción de texto página por página
  - Preservación de estructura y formato

- **`pdfjs-dist`**: `^4.10.38`
  - Fallback para extracción de bookmarks
  - Procesamiento de outline del PDF
  - Compatible con Next.js (configurado en `next.config.mjs`)

- **`pdf2json`**: `^4.0.0`
  - Método alternativo de parseo (no usado actualmente)
  - Disponible como fallback

- **`pdf-lib`**: `^1.17.1`
  - Manipulación de PDFs
  - Creación y edición de documentos PDF

#### Dependencias Externas (Python)

- **PyMuPDF (fitz)**: Requerido para extracción de bookmarks
  - Instalación: `pip install pymupdf`
  - Versión: Python 3.7+
  - Script: `scripts/extract-bookmarks.py`
  - Método preferido para bookmarks (más confiable que pdfjs-dist)

### Procesamiento de Lenguaje Natural (IA)

- **OpenAI SDK**: `^4.71.1`
  - Cliente oficial de OpenAI
  - Compatible con Edge y Node.js
  - Usa `fetch` por defecto

### Validación y Esquemas

- **`zod`**: `^3.23.8`
  - Validación de esquemas TypeScript
  - Validación de datos en runtime

- **`ajv`**: `^8.17.1`
  - Validador JSON Schema
  - Validación de respuestas de IA

- **`ajv-formats`**: `^2.1.1`
  - Formatos adicionales para AJV

### Generación de Documentos

- **`docx`**: `^8.5.0`
  - Generación de documentos Word
  - Exportación de prompts y resultados

### Utilidades

- **`uuid`**: `^9.0.1`
  - Generación de identificadores únicos
  - IDs de requests y logs

### Desarrollo

- **`eslint`**: `8.57.0`
- **`eslint-config-next`**: `14.2.5`
- **`prettier`**: `^3.3.3`
- **`autoprefixer`**: `^10.4.20`
- **`postcss`**: `^8.4.47`
- **`tailwindcss`**: `^3.4.12`
- **`tsx`**: `^4.16.2` (ejecución de TypeScript)

### Tipos TypeScript

- **`@types/node`**: `^20.14.9`
- **`@types/react`**: `^18.3.3`
- **`@types/react-dom`**: `^18.3.0`
- **`@types/pdf-parse`**: `^1.1.3`

---

## Nota sobre NLP, Embeddings y FAISS

**El proyecto NO utiliza actualmente:**
- ❌ spaCy
- ❌ NLTK
- ❌ Embeddings vectoriales
- ❌ FAISS (búsqueda vectorial)
- ❌ Modelos de embeddings locales

**En su lugar, utiliza:**
- ✅ OpenAI API directamente para procesamiento de lenguaje
- ✅ Procesamiento de texto con regex y algoritmos propios
- ✅ Segmentación legal personalizada (`lib/utils/legalSegment.ts`)

---

## Configuración de TypeScript

**Archivo:** `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./*"]
    }
  }
}
```

**Características:**
- Modo estricto habilitado
- Path aliases: `@/*` apunta a la raíz
- Target: ES2022
- No permite JavaScript (solo TypeScript)

---

## Configuración de Next.js

**Archivo:** `next.config.mjs`

```javascript
{
  reactStrictMode: true,
  webpack: {
    // Configuración para pdfjs-dist
    resolve: {
      alias: {
        canvas: false  // Deshabilitar canvas en servidor
      }
    },
    experiments: {
      topLevelAwait: true  // Permitir await de nivel superior
    }
  }
}
```

**Características:**
- React Strict Mode habilitado
- Configuración especial para `pdfjs-dist`
- Soporte para módulos ESM

---

## Parámetros del Modelo de IA

### Configuración por Defecto

#### Función `callModel()` (Generación de Preguntas)

**Archivo:** `lib/qa/callModel.ts`

```typescript
{
  model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  temperature: 0.2,
  top_p: 1,
  max_tokens: 1200,
  timeout: 30000  // 30 segundos
}
```

**Parámetros:**
- **Modelo**: `gpt-4o-mini` (por defecto)
- **Temperatura**: `0.2` (baja, para respuestas más deterministas)
- **Top P**: `1` (sin restricción)
- **Max Tokens**: `1200` (para respuestas de preguntas)
- **Timeout**: `30000ms` (30 segundos)

#### Función `callModelJSON()` (Respuestas JSON)

**Archivo:** `lib/qa/callModel.ts`

```typescript
{
  model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  temperature: 0,
  top_p: 1,
  max_tokens: 500,  // Configurable por llamada
  response_format: { type: 'json_object' },
  timeout: 20000  // 20 segundos (por defecto)
}
```

**Parámetros:**
- **Modelo**: `gpt-4o-mini` (por defecto)
- **Temperatura**: `0` (muy baja, para respuestas deterministas)
- **Top P**: `1`
- **Max Tokens**: `500` (por defecto, configurable)
- **Response Format**: `json_object` (fuerza respuesta JSON)
- **Timeout**: `20000ms` (20 segundos por defecto, configurable)

#### Resumen de Artículos

**Archivo:** `lib/utils/articleSummary.ts`

```typescript
{
  model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  temperature: 0,  // Implícito en callModelJSON
  max_tokens: 1500,  // Específico para resúmenes
  timeout: 30000  // 30 segundos
}
```

**Parámetros:**
- **Max Tokens**: `1500` (aumentado de 800 para resúmenes más largos)
- **Timeout**: `30000ms` (30 segundos)

---

## Variables de Entorno

### Archivo de Configuración

**Archivo:** `.env.example` (plantilla)
**Archivo real:** `.env.local` (no se commitea)

### Variables Disponibles

#### Configuración del Proveedor de IA

```bash
# Proveedor de LLM (actualmente solo 'openai')
LLM_PROVIDER=openai

# Modelo de OpenAI a usar
OPENAI_MODEL=gpt-4o-mini

# Clave API de OpenAI (requerida)
OPENAI_API_KEY=sk-...

# URL base personalizada (opcional, para proxies o servicios compatibles)
OPENAI_BASE_URL=https://api.openai.com/v1
```

#### Configuración de Resumen (Rendimiento)

```bash
# Concurrencia para procesamiento paralelo de resúmenes
SUMMARY_CONCURRENCY=6

# Timeout para cada operación MAP (milisegundos)
SUMMARY_MAP_TIMEOUT_MS=28000

# Tamaño de grupo para procesamiento por lotes
SUMMARY_GROUP_SIZE=6
```

#### Configuración de Resumen Rápido (Fast Path)

```bash
# Número de unidades a seleccionar para resumen rápido
FAST_UNITS_K=12

# Tamaño de slice por unidad (caracteres)
FAST_UNIT_SLICE=1800

# Presupuesto total de caracteres para resumen rápido
FAST_SUMMARY_CHAR_BUDGET=16000

# Deadline para resumen rápido (milisegundos)
FAST_DEADLINE_MS=28000
```

### Valores por Defecto

Si las variables no están definidas, se usan estos valores:

| Variable | Valor por Defecto | Ubicación |
|----------|-------------------|-----------|
| `LLM_PROVIDER` | `'openai'` | `lib/qa/model.ts` |
| `OPENAI_MODEL` | `'gpt-4o-mini'` | `lib/qa/callModel.ts` |
| `OPENAI_BASE_URL` | `undefined` (usa OpenAI oficial) | `lib/qa/callModel.ts` |
| `SUMMARY_CONCURRENCY` | `6` | `app/api/summarize/route.ts` |
| `SUMMARY_MAP_TIMEOUT_MS` | `28000` | `app/api/summarize/route.ts` |
| `SUMMARY_GROUP_SIZE` | `6` | `app/api/summarize/route.ts` |
| `FAST_UNITS_K` | `8` | `app/api/summarize/route.ts` |
| `FAST_UNIT_SLICE` | `1500` | `app/api/summarize/route.ts` |
| `FAST_SUMMARY_CHAR_BUDGET` | `12000` | `app/api/summarize/route.ts` |
| `FAST_DEADLINE_MS` | `28000` | `app/api/summarize/route.ts` |

---

## Entornos de Ejecución

### Desarrollo (Local)

**Comando:** `npm run dev`

**Características:**
- Hot reload habilitado
- Errores detallados en consola
- Logging extensivo
- Variables de entorno desde `.env.local`

**Variables de entorno:**
- Cargadas desde `.env.local`
- No se commitean al repositorio

### Producción

**Comandos:**
```bash
npm run build  # Build de producción
npm start      # Servidor de producción
```

**Características:**
- Optimizaciones habilitadas
- Minificación de código
- Variables de entorno desde sistema o `.env.production`

**Variables de entorno:**
- Configuradas en el servidor/hosting
- Pueden estar en `.env.production` (no se commitea)

### Detección de Entorno

El código detecta el entorno usando:

```typescript
process.env.NODE_ENV
// Valores: 'development' | 'production' | 'test'
```

**Uso en el código:**
- Logging condicional (solo en desarrollo)
- Manejo de errores diferente
- Configuraciones de debugging

---

## Configuración de Timeouts

### Timeouts por Operación

| Operación | Timeout (ms) | Ubicación |
|-----------|--------------|-----------|
| Generación de preguntas | `30000` (30s) | `callModel()` |
| Respuestas JSON | `20000` (20s) | `callModelJSON()` (por defecto) |
| Resumen de artículos | `30000` (30s) | `generateArticleSummaryWithAI()` |
| Resumen rápido | `28000` (28s) | `app/api/summarize/route.ts` |
| Operaciones MAP | `28000` (28s) | `app/api/summarize/route.ts` |

### Manejo de Timeouts

- Usa `AbortController` para cancelar requests
- Logging de timeouts para debugging
- Reintentos no implementados (falla silenciosamente o lanza error)

---

## Configuración de Concurrencia

### Procesamiento Paralelo

**Resumen de documentos:**
- **Concurrencia**: `6` operaciones paralelas (configurable)
- **Grupo de tamaño**: `6` unidades por lote
- **Timeout por operación**: `28000ms`

**Optimizaciones:**
- Procesamiento por lotes (chunks)
- Límite de concurrencia para evitar sobrecarga
- Timeout individual por operación

---

## Configuración de PostCSS y Tailwind

### PostCSS

**Archivo:** `postcss.config.mjs`

```javascript
{
  plugins: {
    tailwindcss: {},
    autoprefixer: {}
  }
}
```

### Tailwind CSS

**Archivo:** `tailwind.config.ts`

```typescript
{
  content: [
    './app/**/*.{ts,tsx}',
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}'
  ],
  theme: { extend: {} },
  plugins: []
}
```

**Características:**
- Purge automático de CSS no usado
- Soporte para App Router
- Sin plugins adicionales

---

## Scripts Disponibles

### Scripts NPM

```json
{
  "dev": "next dev",                    // Desarrollo
  "build": "next build",                // Build de producción
  "start": "next start",                 // Servidor de producción
  "lint": "next lint",                  // Linting con ESLint
  "format": "prettier --write .",       // Formateo con Prettier
  "typecheck": "tsc --noEmit",          // Verificación de tipos
  "commit": "bash scripts/commit.sh",    // Commit rápido (bash)
  "commit:win": "powershell ...",       // Commit rápido (PowerShell)
  "export:prompts": "tsx scripts/export-prompts-to-docx.ts"
}
```

---

## Configuración de Logging

### Sistema de Logging

**Archivo:** `lib/logging/logger.ts`

**Características:**
- Logging estructurado
- Eventos con metadatos
- Persistencia opcional en archivos
- Logging condicional según entorno

**Eventos principales:**
- `model.success` / `model.error` / `model.timeout`
- `ai.call.json` / `ai.response.json`
- `mentalOutline.*` (varios eventos)
- `articleSummary.*` (varios eventos)

---

## Configuración de Seguridad

### Variables Sensibles

**NUNCA se commitean:**
- `.env.local`
- `.env.production`
- Cualquier archivo `.env` con claves API

**Siempre se commitean:**
- `.env.example` (plantilla sin valores reales)

### Validación de Entrada

- Validación de tipos con TypeScript
- Validación de esquemas con Zod/AJV
- Sanitización de inputs en endpoints

---

## Resumen de Configuración por Entorno

### Desarrollo

```bash
# .env.local
LLM_PROVIDER=openai
OPENAI_MODEL=gpt-4o-mini
OPENAI_API_KEY=sk-tu-clave-aqui

SUMMARY_CONCURRENCY=6
SUMMARY_MAP_TIMEOUT_MS=28000
SUMMARY_GROUP_SIZE=6

FAST_UNITS_K=12
FAST_UNIT_SLICE=1800
FAST_SUMMARY_CHAR_BUDGET=16000
FAST_DEADLINE_MS=28000
```

### Producción

```bash
# Variables de entorno del servidor
# (configuradas en el hosting, no en archivo)
LLM_PROVIDER=openai
OPENAI_MODEL=gpt-4o-mini
OPENAI_API_KEY=sk-clave-produccion

# Ajustes de rendimiento (pueden variar)
SUMMARY_CONCURRENCY=8  # Más concurrencia en prod
SUMMARY_MAP_TIMEOUT_MS=30000  # Más tiempo
SUMMARY_GROUP_SIZE=8

FAST_UNITS_K=15
FAST_UNIT_SLICE=2000
FAST_SUMMARY_CHAR_BUDGET=20000
FAST_DEADLINE_MS=30000
```

---

## Notas de Configuración

### Modelo de IA

- **Modelo por defecto**: `gpt-4o-mini` (económico y rápido)
- **Modelo alternativo**: Puede cambiarse a `gpt-4o` o `gpt-4-turbo` para mejor calidad
- **Temperatura baja**: Para respuestas deterministas y consistentes

### Rendimiento

- **Concurrencia**: Ajustar según capacidad del servidor
- **Timeouts**: Aumentar para documentos muy largos
- **Fast path**: Optimizado para respuestas rápidas en resúmenes cortos

### Escalabilidad

- **Procesamiento paralelo**: Limitado por `SUMMARY_CONCURRENCY`
- **Límites de tokens**: Ajustables según necesidad
- **Timeouts**: Configurables por operación

---

## Troubleshooting

### Problemas Comunes

1. **Error de API Key**:
   - Verificar que `OPENAI_API_KEY` esté configurada
   - Verificar que la clave sea válida

2. **Timeouts frecuentes**:
   - Aumentar `SUMMARY_MAP_TIMEOUT_MS`
   - Reducir `SUMMARY_CONCURRENCY`
   - Reducir tamaño de bloques

3. **Bookmarks no se extraen**:
   - Verificar que Python esté instalado
   - Verificar que PyMuPDF esté instalado: `pip install pymupdf`
   - Verificar que el PDF tenga bookmarks

4. **Errores de build**:
   - Verificar versión de Node.js (`>=18.17.0`)
   - Limpiar `.next` y `node_modules`
   - Reinstalar dependencias







