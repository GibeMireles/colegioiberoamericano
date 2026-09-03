# Diseño: Listas / Asistencia

## Contexto

Tercer módulo del MVP (junto a Alumnos y Pagos — ver "Alcance del MVP" en
`CONTEXTO_CLAUDE_CODE.md`). Hoy `/asistencia` es un placeholder con el
rol ya protegido (`super_admin`/`direccion`/`docente`) desde la pieza de
RLS completo. Esta pieza construye la funcionalidad real.

**Decisiones confirmadas con el usuario:**
- Coordinación Académica (Loyda) necesita el pase del día en general;
  cada maestro lleva su propia lista por materia. Se resuelve como **una
  sola fuente de verdad**: cada maestro captura asistencia por su propia
  asignación (materia+grupo+ciclo), y Coordinación ve un **reporte** que
  resume esas capturas por grupo y fecha — sin captura propia separada,
  para que nunca haya dos versiones de la verdad.
- Estatus: `presente`, `ausente`, `retardo`, `justificado`.

La tabla `asistencias` ya existe pero solo tiene `alumno_id`, `grupo_id`,
`fecha`, `estatus`, `registrado_por` — sin materia ni asignación. Está
vacía (0 filas, nunca se usó), así que es seguro redefinirla sin
migración de datos.

## Alcance de esta pieza

- Migrar `asistencias` de scope por grupo a scope por **asignación**
  (materia+grupo+docente+ciclo) — mismo patrón que `calificaciones`.
- Pantalla de captura por maestro (`/asistencia/[asignacionId]`): elige
  fecha (hoy por defecto), un estatus por alumno del roster de esa
  asignación, guarda. Al guardar se bloquea la edición (mismo patrón de
  `?editar=1`/`?guardado=1` recién construido en Calificaciones), scoped
  por fecha — cada día se bloquea/edita de forma independiente.
- Lista `/asistencia` (mismo patrón que `/calificaciones`): docente ve
  "Mis materias" (sus propias asignaciones); `super_admin`/`direccion`
  ven todas las asignaciones (supervisión, igual que Calificaciones) más
  un enlace al reporte por grupo.
- Reporte por grupo (`/asistencia/reporte` → Nivel → Grado → Grupo,
  calcado de la navegación de Materias, sin edición) para
  `super_admin`/`direccion`: elige grupo y fecha, ve una matriz
  alumno × materia con el estatus que cada maestro capturó ese día (o
  "—" si nadie lo ha capturado todavía). Sin captura propia — es
  únicamente lectura de lo que ya existe en `asistencias`.
- RLS: reutiliza `docente_tiene_asignacion()` y
  `alumno_en_grupo_de_asignacion()` (ya existen, de Calificaciones) — se
  reescriben las políticas de `asistencias` para usarlas en vez de
  `docente_tiene_grupo(grupo_id)`. La validación de roster
  (`alumno_en_grupo_de_asignacion`) se incluye desde el inicio, sin
  esperar a que una revisión final la encuentre faltante como pasó en
  Calificaciones.

## Explícitamente fuera de alcance

- Captura general independiente para Coordinación — es solo reporte,
  confirmado con el usuario.
- Notificar a padres/tutores por inasistencias.
- Justificantes con documento adjunto — `justificado` es solo un
  estatus más, sin flujo de aprobación ni archivo.
- Horarios/periodos de clase — no existe ese concepto en el sistema
  hoy; la fecha es el único eje temporal, no "primera hora" vs "segunda
  hora".

## Modelo de datos

```sql
alter table asistencias drop column grupo_id;
alter table asistencias add column asignacion_id uuid not null references asignaciones(id);
alter table asistencias add constraint asistencias_estatus_check
  check (estatus = any (array['presente', 'ausente', 'retardo', 'justificado']));
create unique index idx_asistencias_unica on asistencias(asignacion_id, alumno_id, fecha);
```

`registrado_por` (ya existe, `uuid` nullable) se sigue llenando con
`mi_perfil_id()` del docente/admin que guarda, igual que
`actualizado_en` en `calificaciones`.

## Permisos

- Acceso a una captura (`/asistencia/[asignacionId]`): el docente dueño
  de esa asignación, o `super_admin`/`direccion` — mismo helper
  `requerirAccesoAsignacion`/`requerirAccesoAsignacionPagina` ya
  existente, reutilizado tal cual (sin cambios).
- Acceso al reporte (`/asistencia/reporte/...`): solo
  `super_admin`/`direccion` — `caja` y `docente` no entran.
- RLS: `super_admin`/`direccion` acceso total; `docente` solo
  lectura/escritura de su propia asignación, y solo para alumnos que sí
  pertenecen al grupo de esa asignación (`alumno_en_grupo_de_asignacion`,
  igual que en `calificaciones`).

## Pantallas

- `/asistencia`: docente ve "Mis materias" (sus asignaciones); admin ve
  todas las asignaciones (para supervisión directa, como hoy en
  Calificaciones) más un enlace "Reporte por grupo" arriba.
- `/asistencia/reporte`, `/asistencia/reporte/nivel/[nivelId]`: tarjetas
  de navegación Nivel → Grado, calcadas de `/materias` (solo lectura,
  sin crear/editar nada).
- `/asistencia/reporte/grado/[gradoId]`: tarjetas de Grupo.
- `/asistencia/reporte/grupo/[grupoId]`: selector de fecha (`?fecha=`,
  hoy por defecto) + matriz de solo lectura — filas alumnos del grupo
  (vía `inscripciones`), columnas las materias asignadas a ese grupo
  (vía `asignaciones` → `materias`), celdas el estatus capturado por
  cada maestro para esa fecha (o "—").
- `/asistencia/[asignacionId]`: selector de fecha (`?fecha=`, hoy por
  defecto), tabla con un select de estatus por alumno (roster vía
  `obtenerAlumnosDeAsignacion`, con "Presente" precargado por defecto —
  el caso más común, el maestro solo cambia las excepciones). Guardar
  bloquea la edición para esa fecha específica y muestra "✓ Se ha
  guardado la asistencia.", con botón "Editar asistencia" para volver a
  abrirla — mismo patrón que Calificaciones, pero el bloqueo/edición es
  independiente por cada fecha (cambiar de fecha no hereda el estado de
  bloqueo de otra fecha).

## Manejo de errores

- Alumno capturado que no pertenece al grupo de esa asignación →
  rechazado por RLS (`alumno_en_grupo_de_asignacion`), defensa en
  profundidad además de que la app solo ofrece alumnos del roster real.
- Sin ciclo escolar activo → mismo mensaje ya usado en el resto del
  proyecto ("No hay un ciclo escolar activo.").
- Quien no sea el maestro dueño ni `super_admin`/`direccion` → rechazado
  en la pantalla (`notFound`) y en la Server Action, igual que
  Calificaciones.

## Testing

- Sin funciones de cálculo nuevas que valga la pena aislar (a
  diferencia de Calificaciones, aquí no hay subtotales) — no hay un
  Task de TDD equivalente al de `calculos.ts`.
- Zod schema para el estatus (`"presente" | "ausente" | "retardo" |
  "justificado"`) con test unitario, mismo patrón que
  `calificacionSchema`.
- El resto (roster, reporte, Server Actions) es I/O, verificado en vivo
  contra Supabase real, mismo criterio que el resto del proyecto.
