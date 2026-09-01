# Diseño: Materias + asignación docente-materia-grupo

## Contexto

Segunda de las 3 piezas para soportar la captura de calificaciones (ver
`docs/superpowers/specs/2026-09-01-autenticacion-docente-design.md`
para la primera, ya construida — login + rol Docente). Antes de poder
capturar una calificación hace falta saber qué materias existen, a qué
grado pertenecen, y qué maestro da cada una en qué grupo — esta pieza
resuelve eso.

## Alcance de esta pieza

- Tabla `materias`: cada materia pertenece a un grado específico
  ("Matemáticas 1" y "Matemáticas 2" son materias distintas, no la
  misma materia repetida por grado).
- Asignación docente-materia-grupo-ciclo: exactamente un maestro por
  materia+grupo+ciclo.
- Lista de alumnos por materia: por defecto es el grupo completo
  inscrito; Dirección puede sobreescribirla a mano para casos donde una
  materia no cubre a todo el grupo (ej. inglés con niveles —
  principiantes/medios/avanzados son materias distintas, cada una con
  su propio subconjunto de alumnos del mismo grupo).
- Pantalla de administración ("Materias" en el nav) para dar de alta
  materias, asignar/reasignar maestro, y armar la lista propia de una
  materia cuando haga falta. Visible a `super_admin` y `direccion`.
- Se endurece el tipo de `rol` en el código (de `string` suelto a una
  unión de los 4 valores reales) — quedó pendiente de la revisión final
  de la pieza de Auth, justo para cuando los checks de rol empezaran a
  multiplicarse, que es exactamente lo que pasa en esta pieza.

## Explícitamente fuera de alcance

- Cualquier pantalla para el maestro (ver "mis materias", descargar
  listas, pasar asistencia, capturar calificaciones) — eso es la pieza
  3, que es donde el maestro realmente necesita hacer algo con esa
  lista. Por ahora un maestro logueado sigue sin ver nada nuevo.
- Materias de Secundaria/Primaria/Villa — el modelo de datos no lo
  impide (`materias.grado_id` acepta cualquier grado), pero el trabajo
  real y los datos sembrados son para Prepa, que es el problema
  concreto que arrancó todo esto.
- RLS en las tablas nuevas — mismo criterio que el resto del proyecto
  hoy: sin exponer esto fuera de la red del colegio, RLS por rol en
  todas las tablas sigue pendiente como se documenta en
  `CONTEXTO_CLAUDE_CODE.md`.

## Modelo de datos

```sql
create table materias (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,           -- 'Matemáticas 1', 'Inglés Medios'
  grado_id uuid not null references grados(id),
  orden int
);
create unique index idx_materias_nombre_por_grado on materias(grado_id, nombre);

create table asignaciones (
  id uuid primary key default gen_random_uuid(),
  materia_id uuid not null references materias(id),
  grupo_id uuid not null references grupos(id),
  docente_perfil_id uuid not null references perfiles(id),
  ciclo_escolar_id uuid not null references ciclos_escolares(id)
);
create unique index idx_asignaciones_unica on asignaciones(materia_id, grupo_id, ciclo_escolar_id);

-- Solo se llena para materias con lista propia (ej. niveles de inglés).
-- Si no hay filas para una materia+ciclo, la lista es el grupo completo
-- inscrito en el grupo de su asignación para ese ciclo.
create table materia_alumnos (
  id uuid primary key default gen_random_uuid(),
  materia_id uuid not null references materias(id),
  alumno_id uuid not null references alumnos(id),
  ciclo_escolar_id uuid not null references ciclos_escolares(id)
);
create unique index idx_materia_alumnos_unica on materia_alumnos(materia_id, alumno_id, ciclo_escolar_id);
```

**Regla de la lista de alumnos** (`obtenerAlumnosDeMateria(materiaId,
cicloId)`): si existe al menos una fila en `materia_alumnos` para esa
materia+ciclo, esa es la lista completa (el override reemplaza, no se
suma al grupo). Si no existe ninguna, la lista es todo `inscripciones`
del grupo de la asignación de esa materia en ese ciclo.

No se agrega restricción a nivel de base de que `docente_perfil_id`
tenga `rol = 'docente'` en `perfiles` — se valida a nivel de app en el
selector de maestro (mismo criterio de simplicidad que el resto del
proyecto: la UI solo ofrece perfiles con `rol = 'docente'` como
opciones).

## Permisos

- `super_admin` y `direccion` pueden: crear/renombrar/eliminar
  materias, crear/editar/eliminar asignaciones, y armar/editar la lista
  propia de una materia.
- `docente` no tiene ninguna pantalla ni capacidad nueva en esta pieza.
- Mismo patrón de defensa en profundidad que `/usuarios`: cada pantalla
  revisa el rol antes de renderizar contenido sensible, y cada Server
  Action de escritura lo vuelve a revisar de forma independiente — no
  confía en que la UI ocultó el botón.
- `PerfilActual.rol` (hoy `string`) pasa a ser
  `"super_admin" | "direccion" | "caja" | "docente"`, y los checks de
  rol (`rol !== "super_admin"`, `rolesPermitidos` en `nav.ts`, etc.) se
  actualizan al nuevo tipo. Esto endurece en tiempo de compilación
  exactamente el tipo de error que hoy pasaría inadvertido (un typo en
  un valor de rol que compila pero nunca hace match).

## Pantallas

- Nuevo ítem "Materias" en el nav, visible a `super_admin` y
  `direccion` (usa el mismo `rolesPermitidos` de `nav.ts`, ahora con
  dos roles en la lista en vez de uno).
- Navegación `/materias` → tarjetas de Nivel → `/materias/nivel/[id]`
  → tarjetas de Grado — mismo patrón visual que Alumnos, pero de solo
  lectura: no se puede renombrar/crear/eliminar niveles o grados desde
  aquí, eso sigue viviendo exclusivamente en Alumnos. Estas tarjetas
  son solo para ubicar rápido dónde estás.
- `/materias/grado/[gradoId]`: lista de las materias de ese grado, cada
  una mostrando el maestro asignado (o "Sin asignar") y el grupo.
  Inline: crear materia, editar/quitar asignación de maestro (selector
  de maestro + selector de grupo). Para las materias que lo necesiten,
  un botón aparte "Lista propia" que abre la selección de alumnos del
  grupo para esa materia (checkboxes sobre la lista de inscritos del
  grupo).

## Manejo de errores

- Nombre de materia duplicado en el mismo grado → "Ya existe una
  materia con ese nombre en este grado" (mismo patrón que
  niveles/grados/grupos, mapeando el código `23505` de Postgres).
- Intentar asignar dos maestros a la misma materia+grupo+ciclo → el
  índice único lo rechaza, mensaje claro ("Ya hay un maestro asignado a
  esta materia en este grupo y ciclo").
- Intentar eliminar una materia con asignación activa → bloqueado,
  mismo criterio que niveles/grados/grupos (primero hay que quitar la
  asignación).
- Quien no sea `super_admin`/`direccion` intenta cualquier escritura →
  rechazado explícitamente en la Server Action antes de tocar la base.

## Testing

- Zod schemas para materia (nombre) y asignación (materia + grupo +
  maestro seleccionados) — mismo patrón TDD que el resto del proyecto.
- `obtenerAlumnosDeMateria` sin test unitario (es I/O, como
  `obtenerCicloActivoId`). Verificación real: crear una materia con
  lista propia (ej. simular "Inglés Medios") y confirmar que la lista
  no es todo el grupo; crear una materia sin override y confirmar que
  sí es el grupo completo.
- Test del nuevo tipo de `rol` estrecho: confirmar que `nav.ts`/checks
  existentes siguen compilando y pasando con la unión de 4 valores.
