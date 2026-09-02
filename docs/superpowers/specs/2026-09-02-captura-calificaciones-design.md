# Diseño: Captura de calificaciones

## Contexto

Tercera y última de las 3 piezas para soportar calificaciones (ver
`docs/superpowers/specs/2026-09-01-autenticacion-docente-design.md` para
la primera — login + rol Docente — y
`docs/superpowers/specs/2026-09-01-materias-asignacion-design.md` para la
segunda — materias, asignación docente-materia-grupo, lista de alumnos por
materia). Esta pieza es la captura en sí: la pantalla donde el maestro
entra realmente las calificaciones de sus alumnos.

Se calcó del Excel real que usa un maestro de Iberoamericano cada
semestre (`Captura Gilberto Mireles.xlsx`, hoja "ACV II"). Esa hoja
confirmó la estructura exacta: cada materia se califica en 2 parciales
(cada uno con un puntaje de ADAS — actividades de aprendizaje/evaluación
continua — más un examen) y un Producto final (proyecto más examen),
sumando un Total. La hoja también trae una tabla de referencia con
puntaje máximo por parcial/producto y el puntaje mínimo aprobatorio
(70% del máximo), aunque esta pieza no reproduce esa tabla de
aprobado/reprobado — ver "Explícitamente fuera de alcance".

Decisiones confirmadas con el usuario (quien es, además, el maestro
cuyo Excel se usó como referencia):

- La estructura (Parcial 1: ADAS+Examen, Parcial 2: ADAS+Examen,
  Producto: Proyecto+Examen, Total) es la misma para **todas** las
  materias, sin importar el tipo (Ocupacional, formación básica, etc.).
- Las columnas E/F que aparecen vacías en el Excel real (dentro del
  rango que suma `Calif 1`) son de reserva sin uso — no se modelan.
- Cada ciclo escolar tiene 2 semestres, y cada semestre tiene su
  **propia lista de materias** (nombres distintos, ej. "Física 1" en
  otoño vs. "Química 1" en primavera) — el semestre queda implícito en
  qué materia existe. No se agrega una columna de semestre en ningún
  lado.
- El puntaje máximo por parcial/producto (ej. 30/30/40 en el Excel real)
  lo define el maestro, no Dirección, la primera vez que abre la
  captura de su asignación — y es por **asignación** (grupo+maestro),
  no por materia: dos maestros que imparten la misma materia a grupos
  distintos pueden ponderar diferente.
- La validación de máximo es solo a nivel de subtotal del parcial
  (ADAS+Examen juntos), no por campo individual — igual que en el
  Excel, donde `Calif 1 = SUMA(ADAS, Examen)` sin límite propio para
  cada uno.
- La captura de recuperación (RECU) queda fuera de esta pieza.
- Pueden ver y editar calificaciones el maestro dueño de la asignación,
  y también `super_admin`/`direccion` (supervisión) — mismo patrón de
  defensa en profundidad del resto del proyecto.

## Alcance de esta pieza

- Tabla `calificaciones`: una fila por alumno por asignación, con los 6
  campos capturables (parcial1_adas, parcial1_examen, parcial2_adas,
  parcial2_examen, producto_proyecto, producto_examen). Los subtotales
  (Calif 1, Calif 2, Subtotal producto) y el Total no se guardan — se
  calculan al vuelo, igual que el Excel con `SUMA()`.
- 3 columnas nuevas en `asignaciones` (parcial1_max, parcial2_max,
  producto_max) — la ponderación de esa asignación específica.
- Pantalla `/calificaciones`: lista de asignaciones — "Mis materias"
  para un `docente` (filtradas a las suyas), todas las asignaciones
  para `super_admin`/`direccion` (supervisión).
- Pantalla `/calificaciones/[asignacionId]`: si la ponderación de esa
  asignación aún no está definida, primero pide los 3 puntajes máximos;
  ya definida, muestra la tabla de captura (una fila por alumno, 6
  campos editables + columnas calculadas de solo lectura) con un solo
  botón "Guardar" que manda todas las filas en una Server Action.
- `obtenerAlumnosDeAsignacion(asignacionId)`: resuelve correctamente la
  lista de alumnos de una asignación específica — reutiliza y corrige
  el pendiente que quedó abierto en la pieza de Materias (ver
  "Modelo de datos" abajo).
- Bloqueo en `eliminarAsignacion` (pieza de Materias): no se puede
  eliminar una asignación que ya tiene calificaciones capturadas.

## Explícitamente fuera de alcance

- Captura de recuperación (RECU) para alumnos reprobados.
- Bloquear edición de calificaciones ya capturadas, o de la ponderación
  una vez usada — el maestro puede seguir ajustando ambas en cualquier
  momento, sin candado.
- Indicador visual de aprobado/reprobado por parcial o total (el Excel
  lo calcula como referencia mediante `Puntaje mínimo aprobatorio =
  Puntaje Máximo * 0.7`, pero no se pidió para esta pieza).
- Boletas, exportación a PDF/Excel, o cualquier vista de reporte
  consolidado — la pantalla es solo de captura.
- RLS en las tablas nuevas — mismo criterio pendiente del resto del
  proyecto, documentado en `CONTEXTO_CLAUDE_CODE.md`.

## Modelo de datos

```sql
alter table asignaciones
  add column parcial1_max numeric,
  add column parcial2_max numeric,
  add column producto_max numeric;

create table calificaciones (
  id uuid primary key default gen_random_uuid(),
  asignacion_id uuid not null references asignaciones(id),
  alumno_id uuid not null references alumnos(id),
  parcial1_adas numeric,
  parcial1_examen numeric,
  parcial2_adas numeric,
  parcial2_examen numeric,
  producto_proyecto numeric,
  producto_examen numeric,
  actualizado_en timestamptz not null default now()
);
create unique index idx_calificaciones_unica on calificaciones(asignacion_id, alumno_id);
```

Los 6 campos de `calificaciones` son nullable: el maestro captura lo que
tenga listo (ADAS conforme avanzan las actividades, examen cuando se
aplica), sin exigir todo de golpe. Un campo vacío cuenta como 0 para el
subtotal, igual que `SUMA()` en Excel trata una celda vacía.

**Resolución del pendiente de roster por grupo** (marcado como parqueado
en la revisión final de la pieza de Materias: `obtenerAlumnosDeMateria`
no distinguía grupo cuando una materia tenía más de una asignación).
Esta pieza es la primera que consume una lista de alumnos por
asignación específica, así que se resuelve aquí con una función nueva
en vez de modificar el esquema de `materia_alumnos` (lo que hubiera
obligado a tocar la pantalla de "Lista propia" ya construida y probada):

```
obtenerAlumnosDeAsignacion(asignacionId):
  1. Lee la asignación → materia_id, grupo_id, ciclo_escolar_id.
  2. Alumnos inscritos en ESE grupo específico (no en todos los grupos
     de la materia) — vía inscripciones, mismo embed sancionado que ya
     usa el resto del proyecto.
  3. Si existen filas en materia_alumnos para esa materia+ciclo:
       resultado = (alumnos de esa lista propia) ∩ (alumnos de ese grupo)
     Si no existen:
       resultado = todos los alumnos de ese grupo (paso 2)
```

Esto cubre correctamente los dos casos reales: una "lista propia" que
subdivide un solo grupo (el caso de diseño original — niveles de
inglés) sigue funcionando idéntico a como funciona hoy; y si una
materia llega a tener 2+ grupos con una lista propia compartida entre
ellos, cada maestro ve solo a los alumnos de su propio grupo, sin fuga
de alumnos de otro grupo. No requiere migración a `materia_alumnos` ni
cambios a la pantalla `/materias/[materiaId]/lista` ya existente.

## Permisos

- Puede ver y editar la captura de una asignación: el `docente` dueño
  de esa asignación (`asignacion.docente_perfil_id === perfil.id`), o
  cualquier `super_admin`/`direccion` (supervisión).
- `caja` no tiene acceso a `/calificaciones`.
- Nuevo helper `requerirAccesoAsignacion(asignacionId)`: a diferencia de
  `requerirRol`/`requerirRolPagina` (que solo revisan una lista fija de
  roles), este primero lee la asignación y compara dueño — mismo
  patrón dual throw/notFound (variante para Server Action, variante
  para página) ya establecido con `requerirRol`/`requerirRolPagina`.
- Cada Server Action de escritura vuelve a revisar el acceso de forma
  independiente, sin confiar en que la pantalla ya lo verificó — mismo
  patrón de defensa en profundidad del resto del proyecto.

## Pantallas

- `/calificaciones`: lista de asignaciones. Para `docente`, filtrada a
  las asignaciones donde es el dueño ("Mis materias"). Para
  `super_admin`/`direccion`, todas las asignaciones del sistema
  (supervisión) — un solo punto de entrada compartido por los 3 roles,
  sin duplicar la navegación por tarjetas Nivel→Grado que ya existe en
  `/materias`. Cada fila muestra materia, grado, grupo y maestro, y
  enlaza a la captura.
- Se agrega "Calificaciones" a `NAV_ITEMS` (`rolesPermitidos:
  ["super_admin", "direccion", "docente"]`) y `/calificaciones` a las
  rutas protegidas del middleware.
- `/calificaciones/[asignacionId]`:
  - Si `parcial1_max`/`parcial2_max`/`producto_max` de esa asignación
    son `null`: muestra primero un formulario simple pidiendo los 3
    puntajes máximos, sin valor por default forzado (no se asume
    30/30/40). Al guardar, pasa a mostrar la tabla de captura.
  - Ya definida la ponderación: muestra la tabla de captura — una fila
    por alumno de `obtenerAlumnosDeAsignacion`, con 6 campos editables
    (ADAS parcial 1, Examen parcial 1, ADAS parcial 2, Examen parcial
    2, Proyecto, Examen producto) y columnas calculadas de solo lectura
    (Calif 1, Calif 2, Subtotal producto, Total). Un botón "Guardar"
    manda todas las filas en una sola Server Action — mismo patrón de
    guardado masivo que ya usa "Lista propia" en la pieza de Materias.
  - La ponderación ya definida queda editable siempre (sin candado) por
    si el maestro necesita ajustarla a medio semestre.

## Manejo de errores

- Cada campo capturado debe ser un número ≥ 0 (Zod).
- El subtotal de un parcial (ADAS+Examen) no puede superar su máximo
  configurado — validación a nivel de subtotal, no por campo
  individual. Si se supera, la Server Action rechaza esa fila con un
  mensaje claro identificando alumno y parcial.
- Intentar guardar calificaciones antes de definir la ponderación →
  rechazado ("Define la ponderación antes de capturar calificaciones").
- Intentar eliminar una asignación con calificaciones capturadas →
  bloqueado, mismo criterio que eliminar una materia con asignación
  activa ("No se puede eliminar: esta asignación tiene calificaciones
  capturadas").
- Quien no sea el maestro dueño ni `super_admin`/`direccion` intenta
  ver o guardar → rechazado en la pantalla (`notFound`) y de forma
  independiente en la Server Action.
- Grupo sin alumnos inscritos → mismo mensaje que ya usa "Lista propia"
  ("Este grupo todavía no tiene alumnos").

## Testing

- Zod schemas (fila de calificación, formulario de ponderación) con
  tests unitarios — mismo patrón que `asignacionSchema`.
- Funciones puras de cálculo (`calcularSubtotal`, `calcularTotal`)
  extraídas a un módulo propio y probadas por separado — es la única
  lógica de negocio real de esta pieza, y es trivial de aislar.
- `obtenerAlumnosDeAsignacion` sin test unitario (es I/O, como el resto
  de funciones de roster) — verificación real contra Supabase: crear
  una asignación de prueba, confirmar que la lista es exactamente los
  alumnos de ese grupo (sin lista propia) y que la intersección con una
  lista propia excluye correctamente a alumnos de otros grupos.
