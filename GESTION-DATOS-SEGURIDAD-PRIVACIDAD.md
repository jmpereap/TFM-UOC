# Gestión de Datos, Seguridad y Privacidad

## Resumen Ejecutivo

Esta aplicación **NO almacena datos de forma permanente** en servidores. Todos los datos se procesan en memoria y solo se guardan temporalmente en el navegador del usuario (localStorage). No hay base de datos, no hay almacenamiento persistente en servidor, y todos los archivos temporales se eliminan automáticamente.

---

## 1. Almacenamiento de Datos

### 1.1 Almacenamiento en el Cliente (localStorage)

**Ubicación:** Navegador del usuario (localStorage)

**Datos almacenados:**

```typescript
// Clave: 'tfm_pdf'
{
  fileName: string,        // Nombre del archivo PDF
  blocks: Block[],         // Bloques de texto procesados
  meta: {                  // Metadatos del PDF
    numPages: number,
    info: object,
    blockSize: number,
    overlap: number,
    fileHash: string       // Hash SHA1 del PDF
  }
}
```

**Características:**
- ✅ **Solo en el navegador del usuario**
- ✅ **Persistencia entre sesiones** (hasta que el usuario limpie localStorage)
- ✅ **Datos del PDF procesado** (texto extraído, no el PDF original)
- ✅ **No incluye el PDF completo** (solo texto y metadatos)

**Hook utilizado:** `hooks/useLocalStorage.ts`

**Uso:**
- Se guarda automáticamente después de procesar un PDF
- Se carga automáticamente al iniciar la aplicación
- Permite continuar trabajando sin volver a subir el PDF

**Limitaciones:**
- Tamaño máximo de localStorage: ~5-10MB (depende del navegador)
- Puede fallar si el PDF es muy grande
- Se pierde si el usuario limpia datos del navegador

### 1.2 Almacenamiento en Servidor

**❌ NO HAY ALMACENAMIENTO PERMANENTE EN SERVIDOR**

- ❌ No hay base de datos
- ❌ No se guardan PDFs en disco
- ❌ No se guardan esquemas mentales
- ❌ No se guardan resúmenes
- ❌ No se guardan fichas

**Procesamiento:**
- Todo se procesa **en memoria** durante la request
- Los datos se retornan al cliente y se eliminan de memoria
- No hay persistencia entre requests

### 1.3 Archivos Temporales

**Ubicación:** Directorio temporal del sistema operativo

**Uso:**
- **PyMuPDF (Python)**: Crea archivo temporal del PDF para extraer bookmarks
- **Limpieza automática**: Se eliminan inmediatamente después de usar

**Ejemplo:**
```typescript
// En lib/pdf/extractBookmarks.ts
const tempFilePath = path.join(
  os.tmpdir(), 
  `pdf-bookmarks-${Date.now()}-${Math.random().toString(36).substring(7)}.pdf`
)

// Después de usar:
fs.unlinkSync(tempFilePath)  // Eliminación inmediata
```

**Características:**
- ✅ Se crean con nombres únicos (timestamp + random)
- ✅ Se eliminan automáticamente después de usar
- ✅ Incluso si hay error, se intenta eliminar en el bloque `finally`
- ✅ No se acumulan archivos temporales

### 1.4 Logs del Sistema

**Ubicación:** `logs/app.jsonl` (en el servidor)

**Formato:** JSONL (JSON Lines) - una línea por evento

**Contenido:**
```json
{
  "ts": "2025-11-24T10:30:00.000Z",
  "event": "mentalOutline.generate.fromBookmarks.start",
  "payload": {
    "source": "Ley Orgánica...",
    "bookmarksCount": 150
  }
}
```

**Datos registrados:**
- ✅ Eventos del sistema (inicio/fin de operaciones)
- ✅ Errores y advertencias
- ✅ Estadísticas de procesamiento
- ✅ Metadatos de operaciones (no contenido completo)
- ⚠️ **Puede incluir previews de texto** (primeros 500-1000 caracteres)

**Características:**
- ✅ Solo en servidor (no accesible desde cliente)
- ✅ Formato estructurado para análisis
- ✅ Rotación manual (no automática)
- ⚠️ Puede crecer indefinidamente si no se limpia

**Exclusión de Git:**
- Los logs están en `.gitignore`
- No se commitean al repositorio

---

## 2. Datos Procesados y Transmitidos

### 2.1 Datos del PDF

**En el servidor (temporalmente):**
- ✅ Buffer completo del PDF (en memoria durante procesamiento)
- ✅ Texto extraído de cada página
- ✅ Metadatos del PDF (título, autor, etc.)
- ✅ Bookmarks/marcadores del PDF
- ✅ Hash SHA1 del PDF (para identificación)

**Enviado al cliente:**
- ✅ Texto extraído (no el PDF original)
- ✅ Bloques de texto procesados
- ✅ Metadatos
- ✅ Bookmarks
- ✅ Hash SHA1

**NO se envía:**
- ❌ PDF original completo (solo texto extraído)
- ❌ Imágenes del PDF
- ❌ Formularios o campos interactivos

### 2.2 Datos Enviados a OpenAI

**Endpoints de OpenAI utilizados:**
- `chat.completions.create()` - Generación de contenido

**Datos enviados:**

1. **Generación de Preguntas:**
   - Texto de bloques del PDF
   - Instrucciones del prompt
   - NO se envía el PDF completo

2. **Resumen de Artículos:**
   - Texto completo del artículo extraído
   - Rúbrica del artículo
   - Número del artículo
   - NO se envía el PDF original

3. **Generación de Esquema Mental:**
   - Texto del índice (si está disponible)
   - Fragmentos de texto del PDF
   - Instrucciones del prompt
   - NO se envía el PDF completo

**Política de datos:**
- ✅ Solo se envía **texto extraído**, no el PDF original
- ✅ Los prompts incluyen instrucciones, no datos sensibles
- ⚠️ El texto puede contener información legal (pública en BOE)
- ⚠️ OpenAI puede usar estos datos para entrenar modelos (según su política)

**Recomendación:**
- Para documentos confidenciales, considerar desactivar el uso de IA
- Revisar política de privacidad de OpenAI antes de usar

### 2.3 Datos en Tránsito

**Comunicación Cliente-Servidor:**
- ✅ HTTPS (en producción)
- ✅ HTTP (en desarrollo local)
- ⚠️ Los datos viajan sin cifrado adicional (solo TLS/HTTPS)

**Comunicación Servidor-OpenAI:**
- ✅ HTTPS obligatorio
- ✅ Autenticación con Bearer token (API key)
- ✅ No se almacenan las respuestas de OpenAI

---

## 3. Seguridad

### 3.1 Gestión de Claves API

**Ubicación:** Variables de entorno (`.env.local`)

**Claves utilizadas:**
- `OPENAI_API_KEY` - Clave API de OpenAI

**Protección:**
- ✅ **NO se commitean** al repositorio
- ✅ `.env.local` está en `.gitignore`
- ✅ Solo `.env.example` (sin valores reales) se commitea
- ✅ Se cargan desde variables de entorno del sistema

**Uso en código:**
```typescript
// lib/qa/callModel.ts
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,  // Desde variable de entorno
  baseURL: process.env.OPENAI_BASE_URL || undefined
})
```

**Buenas prácticas:**
- ✅ Nunca se hardcodean en el código
- ✅ Nunca se loguean o muestran en errores
- ✅ Solo se usan en el servidor (no se exponen al cliente)

### 3.2 Validación de Entrada

**Validaciones implementadas:**
- ✅ Validación de tipos con TypeScript
- ✅ Validación de esquemas con Zod/AJV
- ✅ Validación de tamaño de archivo (implícita por límites de memoria)
- ✅ Validación de formato (solo PDFs aceptados)

**Sanitización:**
- ✅ Normalización de texto (eliminación de caracteres especiales)
- ✅ Limpieza de HTML/scripts (no aplicable, solo texto plano)
- ✅ Validación de estructura de datos

### 3.3 Protección contra Ataques

**Protecciones implementadas:**
- ✅ Validación de tipos en endpoints
- ✅ Manejo de errores sin exponer detalles internos
- ✅ Timeouts en llamadas a APIs externas
- ✅ Límites de tamaño implícitos (memoria del servidor)

**No implementado (mejoras futuras):**
- ❌ Rate limiting
- ❌ Autenticación de usuarios
- ❌ CORS configurado explícitamente
- ❌ Validación de tamaño máximo de archivo explícita
- ❌ Protección contra DoS

### 3.4 Hash de Archivos

**Algoritmo:** SHA1

**Uso:**
```typescript
const fileHash = crypto.createHash('sha1')
  .update(buffer)
  .digest('hex')
```

**Propósito:**
- Identificación única del archivo
- Detección de archivos duplicados (futuro)
- Cacheo potencial (no implementado)

**Características:**
- ✅ Determinístico (mismo archivo = mismo hash)
- ✅ Rápido de calcular
- ⚠️ SHA1 es considerado débil para seguridad, pero suficiente para identificación

---

## 4. Privacidad

### 4.1 Datos del Usuario

**Datos recopilados:**
- ✅ Nombre del archivo PDF (opcional, puede ser anónimo)
- ✅ Contenido del PDF procesado (texto extraído)
- ✅ Metadatos del PDF (título, autor, etc.)

**Datos NO recopilados:**
- ❌ Información personal del usuario
- ❌ Dirección IP (no se registra explícitamente)
- ❌ Cookies de seguimiento
- ❌ Datos de navegación

### 4.2 Retención de Datos

**En el servidor:**
- ✅ **Cero retención**: Los datos se eliminan inmediatamente después de procesar
- ✅ Solo logs se mantienen (en `logs/app.jsonl`)
- ✅ Archivos temporales se eliminan automáticamente

**En el cliente:**
- ✅ Datos en localStorage **persisten hasta que el usuario los elimine**
- ✅ No hay expiración automática
- ✅ El usuario puede limpiar localStorage manualmente

**Recomendación:**
- Considerar implementar expiración automática de datos en localStorage
- Considerar opción de "modo privado" que no guarde datos

### 4.3 Compartir Datos con Terceros

**OpenAI:**
- ⚠️ **SÍ se comparten datos** con OpenAI para procesamiento
- ⚠️ Texto de artículos y prompts se envían a OpenAI
- ⚠️ Según política de OpenAI, pueden usar datos para entrenar modelos
- ✅ NO se envía el PDF original completo
- ✅ Solo texto extraído se envía

**Otros terceros:**
- ❌ No se comparten datos con otros servicios
- ❌ No hay analytics de terceros
- ❌ No hay publicidad

### 4.4 Derechos del Usuario

**Control de datos:**
- ✅ Usuario puede eliminar datos de localStorage manualmente
- ✅ Usuario puede no subir PDFs (uso opcional)
- ✅ Usuario puede limpiar logs del servidor (si tiene acceso)

**Derechos no implementados (mejoras futuras):**
- ❌ Exportar datos del usuario
- ❌ Solicitar eliminación de logs
- ❌ Política de privacidad explícita en la UI
- ❌ Consentimiento explícito antes de procesar

---

## 5. Cumplimiento Normativo

### 5.1 RGPD (Reglamento General de Protección de Datos)

**Estado actual:**
- ⚠️ **No completamente cumplido**
- ⚠️ No hay política de privacidad explícita
- ⚠️ No hay consentimiento explícito
- ⚠️ No hay mecanismo de eliminación de datos

**Mejoras necesarias:**
- [ ] Añadir política de privacidad
- [ ] Añadir consentimiento explícito antes de procesar
- [ ] Implementar derecho al olvido
- [ ] Implementar exportación de datos
- [ ] Documentar base legal del procesamiento

### 5.2 Ley Orgánica de Protección de Datos (LOPD)

**Consideraciones:**
- ⚠️ Si se procesan datos personales, se requiere cumplimiento
- ⚠️ Los PDFs legales pueden contener datos personales
- ✅ Actualmente no se almacenan datos permanentemente
- ⚠️ Los logs pueden contener información sensible

**Recomendaciones:**
- [ ] Revisar si los PDFs procesados contienen datos personales
- [ ] Implementar anonimización en logs
- [ ] Añadir advertencias sobre datos personales

---

## 6. Mejores Prácticas Implementadas

### ✅ Implementado

1. **Variables de entorno para secretos**
   - Claves API en `.env.local` (no commiteadas)

2. **Eliminación automática de temporales**
   - Archivos temporales se eliminan después de usar

3. **Sin almacenamiento persistente**
   - No hay base de datos
   - No se guardan PDFs en disco

4. **Logging estructurado**
   - Logs en formato JSONL para análisis
   - No se loguean datos sensibles (claves API)

5. **Validación de entrada**
   - Validación de tipos y esquemas
   - Sanitización de datos

### ❌ No Implementado (Mejoras Futuras)

1. **Autenticación y autorización**
   - No hay usuarios ni sesiones
   - Cualquiera puede usar la aplicación

2. **Rate limiting**
   - No hay límites de requests
   - Vulnerable a abuso

3. **Cifrado de datos en reposo**
   - No aplicable (no hay almacenamiento persistente)
   - Pero localStorage no está cifrado

4. **Auditoría de acceso**
   - No se registra quién accede
   - No hay logs de acceso

5. **Política de privacidad explícita**
   - No hay documento de política de privacidad
   - No hay consentimiento explícito

---

## 7. Recomendaciones de Seguridad

### Para Desarrollo

1. **Nunca commitear `.env.local`**
   - Ya está en `.gitignore`
   - Verificar antes de cada commit

2. **Rotar claves API regularmente**
   - Cambiar `OPENAI_API_KEY` periódicamente
   - Revocar claves antiguas en OpenAI

3. **Revisar logs regularmente**
   - Verificar que no contengan datos sensibles
   - Limpiar logs antiguos

4. **Usar HTTPS en producción**
   - Configurar certificado SSL
   - Forzar redirección HTTP → HTTPS

### Para Producción

1. **Implementar autenticación**
   - Sistema de usuarios
   - Sesiones seguras

2. **Añadir rate limiting**
   - Limitar requests por IP
   - Limitar tamaño de archivos

3. **Monitoreo de seguridad**
   - Alertas de errores
   - Monitoreo de uso anómalo

4. **Backup de logs**
   - Si se necesitan logs para auditoría
   - Cifrar backups

5. **Política de privacidad**
   - Documento explícito
   - Consentimiento antes de procesar

---

## 8. Resumen de Datos por Ubicación

| Ubicación | Datos Almacenados | Retención | Acceso |
|-----------|-------------------|-----------|--------|
| **localStorage (cliente)** | PDF procesado, bloques, metadatos | Hasta que usuario limpie | Solo usuario |
| **Memoria servidor** | PDF buffer, texto extraído | Durante request únicamente | Solo servidor |
| **Archivos temporales** | PDF temporal (PyMuPDF) | Eliminado inmediatamente | Solo servidor |
| **Logs (servidor)** | Eventos, errores, previews | Indefinida (manual) | Solo servidor |
| **OpenAI** | Texto de artículos, prompts | Según política OpenAI | OpenAI + usuario |

---

## 9. Checklist de Privacidad

### Datos del Usuario
- [x] No se recopila información personal explícita
- [x] No se usan cookies de seguimiento
- [ ] Política de privacidad explícita
- [ ] Consentimiento explícito antes de procesar

### Almacenamiento
- [x] No hay base de datos
- [x] No se guardan PDFs en servidor
- [x] Datos solo en localStorage del usuario
- [ ] Expiración automática de datos en localStorage

### Compartir con Terceros
- [x] Solo se comparte con OpenAI (texto extraído)
- [ ] Advertencia explícita sobre compartir con OpenAI
- [ ] Opción de no usar IA

### Seguridad
- [x] Claves API en variables de entorno
- [x] No se commitean secretos
- [x] Validación de entrada
- [ ] Rate limiting
- [ ] Autenticación de usuarios

### Cumplimiento
- [ ] Política de privacidad RGPD
- [ ] Derecho al olvido
- [ ] Exportación de datos
- [ ] Auditoría de acceso

---

## 10. Contacto y Soporte

**Para preguntas sobre privacidad:**
- Revisar este documento
- Consultar código fuente para detalles técnicos
- Contactar al desarrollador para dudas específicas

**Para reportar problemas de seguridad:**
- Reportar de forma responsable
- No exponer vulnerabilidades públicamente
- Contactar directamente al desarrollador

---

## Conclusión

La aplicación está diseñada con **privacidad por defecto**: no almacena datos permanentemente en servidor, procesa todo en memoria, y solo guarda datos temporalmente en el navegador del usuario. Sin embargo, **comparte datos con OpenAI** para procesamiento, lo cual debe ser comunicado claramente a los usuarios.

**Principales puntos:**
- ✅ No hay almacenamiento persistente en servidor
- ✅ Datos solo en localStorage del usuario
- ⚠️ Se comparten datos con OpenAI
- ⚠️ Falta política de privacidad explícita
- ⚠️ Falta consentimiento explícito

**Recomendación principal:** Implementar política de privacidad explícita y consentimiento antes de procesar documentos.


