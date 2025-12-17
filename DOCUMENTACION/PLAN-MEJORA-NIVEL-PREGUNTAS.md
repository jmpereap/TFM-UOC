# Plan de Mejora: Selección de Nivel de Dificultad (Básico/Medio/Avanzado)

## Objetivo
Permitir al usuario elegir entre nivel **Básico**, **Medio** y **Avanzado** para la generación de preguntas. Cuando se selecciona un nivel, al menos el 90% de las preguntas generadas deben ser de ese nivel (idealmente 100%). Si no se selecciona nada, se mantiene el comportamiento actual.

## Cambios Requeridos

### 1. Interfaz de Usuario (`app/generate/page.tsx`)

#### 1.1. Agregar selector de nivel preferido
- **Ubicación**: En la sección de controles de generación (cerca del input de número de preguntas)
- **Componente**: Selector con cuatro opciones:
  - "Sin preferencia" (valor por defecto, comportamiento actual)
  - "Básico" (al menos 90% de preguntas básicas)
  - "Medio" (al menos 90% de preguntas medias)
  - "Avanzado" (al menos 90% de preguntas avanzadas)
- **Estado**: Nuevo estado `preferredLevel: 'basico' | 'medio' | 'avanzado' | null`
- **Persistencia**: Guardar en localStorage con clave `'tfm.preferredLevel'`

#### 1.2. Modificar controles de distribución de dificultad
- **Ocultar o simplificar** los controles actuales de distribución manual (`difficultyDistribution`) cuando hay un nivel preferido seleccionado
- **Mostrar indicador visual** del nivel seleccionado
- **Mantener compatibilidad**: Si el usuario no selecciona nivel, mostrar los controles actuales

### 2. Lógica de Distribución (`lib/qa/distribute.ts`)

#### 2.1. Nueva función: `distributeByPreferredLevel`
```typescript
/**
 * Distribuye preguntas priorizando un nivel específico
 * @param n - Número total de preguntas
 * @param preferredLevel - Nivel preferido ('basico' | 'medio' | 'avanzado' | null)
 * @param m - Número de bloques
 * @returns Array de objetos con distribución por bloque
 */
export function distributeByPreferredLevel(
  n: number,
  preferredLevel: 'basico' | 'medio' | 'avanzado' | null,
  m: number
): Array<DifficultyDistribution>
```

**Lógica de distribución:**
- Si `preferredLevel === null`: Usar distribución actual (uniforme o la que el usuario configure)
- Si `preferredLevel === 'basico'`:
  - Al menos 90% de preguntas básicas: `Math.ceil(n * 0.9)` preguntas básicas
  - El resto (máximo 10%): distribuir entre medio y avanzado (o solo medio si es muy poco)
- Si `preferredLevel === 'medio'`:
  - Al menos 90% de preguntas medias: `Math.ceil(n * 0.9)` preguntas medias
  - El resto (máximo 10%): distribuir entre básico y avanzado (o solo avanzado si es muy poco)
- Si `preferredLevel === 'avanzado'`:
  - Al menos 90% de preguntas avanzadas: `Math.ceil(n * 0.9)` preguntas avanzadas
  - El resto (máximo 10%): distribuir entre básico y medio (o solo medio si es muy poco)

**Distribución entre bloques:**
- Usar `distributeQuestions` para distribuir las preguntas del nivel preferido entre los bloques
- Distribuir el resto (10%) de manera uniforme entre los bloques

### 3. API de Generación (`app/api/generate/route.ts`)

#### 3.1. Actualizar esquema de entrada
- Agregar campo opcional `preferredLevel?: 'basico' | 'medio' | 'avanzado' | null` al `InputSchema`

#### 3.2. Modificar lógica de distribución
- Si `preferredLevel` está presente, usar `distributeByPreferredLevel` en lugar de `distributeByDifficulty`
- Si `preferredLevel` es `null` y `difficultyDistribution` está presente, usar la lógica actual
- Si ambos son `null/undefined`, usar distribución uniforme actual

**Prioridad:**
1. `preferredLevel` (si está presente)
2. `difficultyDistribution` (si está presente y `preferredLevel` no)
3. Distribución uniforme (por defecto)

### 4. Construcción de Prompts (`lib/qa/prompt.ts`)

#### 4.1. Actualizar función `buildPrompt`
- Agregar parámetro opcional `preferredLevel?: 'basico' | 'medio' | 'avanzado' | null`
- Si `preferredLevel` está presente, modificar el texto del prompt para enfatizar:
  - "La mayoría (al menos 90%) de las preguntas deben ser de nivel [preferredLevel]"
  - "El resto puede ser de otros niveles si es necesario"

### 5. Frontend: Envío de Datos (`app/generate/page.tsx`)

#### 5.1. Modificar función `onGenerate`
- Incluir `preferredLevel` en el body de la petición a `/api/generate`
- Si `preferredLevel` está seleccionado, no enviar `difficultyDistribution` (o enviarlo como `null`)
- Si `preferredLevel` es `null`, enviar `difficultyDistribution` como antes

## Implementación Detallada

### Paso 1: Actualizar tipos
- No se requieren cambios en tipos existentes, solo agregar el nuevo parámetro opcional

### Paso 2: Implementar función de distribución
- Crear `distributeByPreferredLevel` en `lib/qa/distribute.ts`
- Probar con diferentes valores de `n` y `m`

### Paso 3: Actualizar UI
- Agregar selector de nivel en `app/generate/page.tsx`
- Agregar estado y persistencia en localStorage
- Ocultar/mostrar controles según el modo seleccionado

### Paso 4: Actualizar API
- Modificar `app/api/generate/route.ts` para aceptar `preferredLevel`
- Integrar nueva función de distribución

### Paso 5: Actualizar prompts
- Modificar `lib/qa/prompt.ts` para incluir instrucciones sobre el nivel preferido

## Consideraciones

### Compatibilidad hacia atrás
- Si `preferredLevel` no se envía, el sistema debe comportarse exactamente como antes
- Los usuarios existentes que no seleccionen nivel verán el comportamiento actual

### Validación
- Asegurar que la suma de preguntas siempre sea igual a `n`
- Validar que al menos el 90% de las preguntas sean del nivel preferido (verificar en los resultados)

### UX
- Mostrar un mensaje informativo: "Se generarán al menos X preguntas de nivel [Básico/Medio/Avanzado]"
- Indicar visualmente cuando se está usando el modo de nivel preferido vs. distribución manual

## Ejemplo de Uso

### Escenario 1: Usuario selecciona "Básico" con 10 preguntas
- Resultado esperado: Al menos 9 preguntas básicas, máximo 1 de otro nivel
- Distribución ejemplo: `{ basico: 9, medio: 1, avanzado: 0 }` o `{ basico: 10, medio: 0, avanzado: 0 }`

### Escenario 2: Usuario selecciona "Medio" con 15 preguntas
- Resultado esperado: Al menos 14 preguntas nivel medio, máximo 1 de otro nivel
- Distribución ejemplo: `{ basico: 0, medio: 14, avanzado: 1 }` o `{ basico: 0, medio: 15, avanzado: 0 }`

### Escenario 3: Usuario selecciona "Avanzado" con 15 preguntas
- Resultado esperado: Al menos 14 preguntas avanzadas, máximo 1 de otro nivel
- Distribución ejemplo: `{ basico: 0, medio: 1, avanzado: 14 }` o `{ basico: 0, medio: 0, avanzado: 15 }`

### Escenario 4: Usuario no selecciona nivel (comportamiento actual)
- Resultado esperado: Distribución según `difficultyDistribution` o uniforme
- No se aplican restricciones de 90%

## Notas de Implementación

1. **Mínimo de preguntas**: Si `n < 10`, el 90% puede ser menos de 1 pregunta. En ese caso, usar 100% del nivel preferido.

2. **Distribución del 10% restante**: 
   - Si `preferredLevel === 'basico'`: El 10% restante puede ser medio o avanzado (preferir medio para contraste)
   - Si `preferredLevel === 'medio'`: El 10% restante puede ser básico o avanzado (preferir avanzado para contraste)
   - Si `preferredLevel === 'avanzado'`: El 10% restante puede ser básico o medio (preferir medio para contraste)

3. **Mensajes al usuario**: 
   - "Generando preguntas con nivel preferido: [Básico/Medio/Avanzado]"
   - "Se generarán al menos X preguntas de nivel [Básico/Medio/Avanzado]"

## Archivos a Modificar

1. `app/generate/page.tsx` - UI y estado
2. `lib/qa/distribute.ts` - Nueva función de distribución
3. `app/api/generate/route.ts` - Lógica de API
4. `lib/qa/prompt.ts` - Actualización de prompts

## Archivos que NO se Modifican

- `lib/qa/model.ts` - No requiere cambios
- `lib/qa/callModel.ts` - No requiere cambios
- `types/mcq.ts` - No requiere cambios (los tipos existentes son suficientes)

