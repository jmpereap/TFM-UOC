# TFM UOC IA

Aplicación base con Next.js (App Router), TypeScript y Tailwind CSS. Incluye endpoints mínimos para subir un PDF y generar preguntas (mock), utilidades de parsing/splitting, scripts y un workflow de autocommit.

## Requisitos
- Node.js >= 18.17
- npm >= 9 (o pnpm/yarn si prefieres)

## Instalación y ejecución
```bash
npm install
npm run dev
```

Producción:
```bash
npm run build
npm start
```

## Scripts útiles
- `npm run dev`: desarrollo
- `npm run build`: build de producción
- `npm start`: servidor de producción
- `npm run lint`: lint con ESLint
- `npm run format`: formatea con Prettier
- `npm run typecheck`: comprobación de tipos
- `npm run commit` / `npm run commit:win`: commit/push rápido (bash o PowerShell)
- `npm run export:prompts`: ejemplo de export a DOCX (placeholder)

## Estructura
```
app/                 # App Router (páginas y endpoints)
  api/
  upload/
  generate/
lib/                 # Utilidades (PDF, QA, logging, utils)
public/              # Recursos estáticos
styles/              # Tailwind CSS
scripts/             # utilidades locales
.github/workflows/   # CI
docs/                # documentación y plantillas
```

## Notas
- El endpoint `/api/upload` recibe un `FormData` con el campo `file` (PDF), lo parsea y devuelve bloques de texto (split básico).
- El endpoint `/api/generate` devuelve preguntas mock (sin LLM) para probar el flujo.
- El `scripts/export-prompts-to-docx.ts` crea un DOCX de ejemplo en `docs/prompts/validated/`.

## Pendiente / Extensiones
- Integración de modelo (LLM) real en `api/generate`.
- Ajustes de `splitIntoBlocks` según heurísticas específicas.
- Mejoras de UI/UX y validaciones.

"# TFM-UOC" 
