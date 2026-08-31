# Diseño: módulo Alumnos — piloto 1° de Preparatoria

## Contexto

El layout base y el shell de navegación ya existen (ver spec/plan del
2026-08-28). El módulo "Alumnos y grados" es hoy solo una página
placeholder. Este documento diseña su primera versión funcional,
alcance reducido a propósito: 1° de Preparatoria es el único
salón/grupo real que existe en el Colegio Iberoamericano hoy, con
pocos alumnos — sirve como prueba piloto antes de replicar el patrón a
los demás grados cuando existan.

Depende de que exista un proyecto de Supabase real conectado (en
progreso al escribir este documento — el usuario está reconectando el
conector MCP a una cuenta de Supabase nueva, separada de sus otros
clientes, para evitar el límite de proyectos gratuitos). El código de
este módulo se puede escribir sin esa conexión, pero la verificación
end-to-end (crear un alumno real y confirmar que persiste) requiere el
proyecto activo.

## Alcance de este piloto

- Alta, edición, listado y baja lógica de alumnos.
- Fijo a un solo grupo ("1° Preparatoria, Grupo A", ciclo escolar
  actual) — sin selector de escuela, grado, grupo o ciclo en la UI.
- Sin autenticación ni control de acceso por rol (se agrega como pieza
  propia más adelante, sin tocar este CRUD).
- Sin importación de CSV/Excel — alta uno por uno desde la UI.

Explícitamente fuera de alcance: UI de administración de
`ciclos_escolares`/`grados`/`grupos` (se sembrará una sola fila de cada
uno directamente en la base al conectar Supabase), pagos, asistencia,
cualquier variante de login.

## Modelo de datos

Usa las tablas que ya existen en `database/schema.sql`, sin cambios de
esquema. Al conectar el proyecto real se siembra, una sola vez:

1. Una fila en `ciclos_escolares` (ciclo actual).
2. Una fila en `grados` ("1° Preparatoria").
3. Una fila en `grupos` ("1°A"), referenciando las dos anteriores.

Los IDs resultantes se guardan como variables de entorno privadas
(**no** `NEXT_PUBLIC_*`, porque solo se usan del lado servidor):

```
GRUPO_PILOTO_ID=<uuid>
CICLO_PILOTO_ID=<uuid>
```

Dar de alta un alumno crea, en la misma Server Action, su fila en
`inscripciones` (`alumno_id`, `grupo_id=GRUPO_PILOTO_ID`,
`ciclo_escolar_id=CICLO_PILOTO_ID`) — invisible en la UI de este
piloto. Esto es forward-compatible: cuando exista un 2° grado en la
misma escuela, la página de alumnos se extiende para filtrar por
grupo (selector o ruta por grupo) sin migrar datos, porque la relación
alumno→grupo ya vive correctamente en `inscripciones` desde el día
uno, no en una columna directa sobre `alumnos`.

**Listado:** la query de `/alumnos` filtra alumnos vía
`inscripciones.grupo_id = GRUPO_PILOTO_ID`, no lista la tabla
`alumnos` completa — así, cuando se agreguen más grupos a esta misma
base de datos, esta página sigue mostrando solo a los de 1°A.

## Acceso a datos

- `src/lib/supabase/server.ts` — crea un cliente de Supabase
  (`@supabase/supabase-js`) usando `NEXT_PUBLIC_SUPABASE_URL` y
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` (ambas públicas y seguras de
  exponer). Nunca se usa ni se solicita la service role key ni el
  password de la base de datos.
- Todas las mutaciones (crear, editar, baja lógica) son **Server
  Actions** de Next.js — corren en el servidor, no exponen lógica de
  escritura al cliente.
- El acceso funciona hoy porque RLS todavía no está activado en el
  proyecto (paso ya documentado como pendiente en
  `CONTEXTO_CLAUDE_CODE.md`). Cuando se agregue Auth + RLS más
  adelante, el mismo cliente/Server Actions siguen funcionando; solo
  se endurece el acceso en la base, no se reescribe este módulo.

## UI

- `src/app/(dashboard)/alumnos/page.tsx` — Server Component. Lista de
  alumnos del grupo piloto: nombre, matrícula, tutor, estatus
  (activo/inactivo). Botón "Agregar alumno".
- `src/app/(dashboard)/alumnos/nuevo/page.tsx` — formulario de alta.
- `src/app/(dashboard)/alumnos/[id]/editar/page.tsx` — formulario de
  edición, precargado con los datos actuales.
- `src/app/(dashboard)/alumnos/actions.ts` — Server Actions:
  `crearAlumno`, `actualizarAlumno`, `alternarActivoAlumno` (baja
  lógica / reactivar).
- "Eliminar" nunca borra la fila: alterna `alumnos.activo`. Reversible,
  consistente con el campo que ya existe en el schema.
- Un componente de formulario compartido (`AlumnoForm.tsx`, client
  component) se reutiliza entre alta y edición.

## Validación

Un schema de Zod (`src/lib/alumnos/schema.ts`) define las reglas de
un alumno, compartido entre el formulario (validación en cliente,
feedback inmediato) y la Server Action (validación en servidor, fuente
de verdad):

- `nombre_completo`: string, requerido, no vacío.
- `fecha_nacimiento`, `matricula`, `tutor_nombre`, `tutor_telefono`,
  `tutor_email`: opcionales, igual que su nullability en
  `database/schema.sql`.
- `tutor_email`, si viene, debe tener formato de email válido.

Este schema es la única lógica de este módulo con valor real para
testear con Vitest (reglas puras, sin I/O) — sigue el patrón ya
establecido en el proyecto (`src/lib/config.ts`, `src/lib/nav.ts`).

## Testing

- Vitest para `src/lib/alumnos/schema.ts` (casos válidos e inválidos
  por campo).
- Sin React Testing Library/jsdom para los formularios ni las páginas
  — mismo criterio que el resto del proyecto.
- Verificación real: `npm run build` + `npm run lint` limpios, y
  verificación manual contra el proyecto de Supabase real (dar de alta
  un alumno desde la UI, confirmar que persiste y aparece en el
  listado, editarlo, darlo de baja y confirmar que desaparece del
  listado activo pero sigue existiendo en la base).

## Explícitamente fuera de alcance

- Selector de escuela, grado, grupo o ciclo escolar en la UI.
- Login, roles, RLS.
- Importación de CSV/Excel.
- Cualquier trabajo sobre los módulos de pagos o listas/asistencia.
