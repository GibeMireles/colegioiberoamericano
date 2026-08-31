# Diseño: Alumnos — navegación y gestión por Nivel / Grado / Grupo

## Contexto

El módulo de Alumnos (ver `docs/superpowers/specs/2026-08-31-alumnos-piloto-1ro-prepa-design.md`)
se construyó fijo a un solo grupo real ("1° Preparatoria, Grupo 1°A")
vía las variables de entorno `GRUPO_PILOTO_ID`/`CICLO_PILOTO_ID`, a
propósito, porque cuando se escribió ese era el único salón real del
colegio.

Eso dejó de ser cierto: el colegio necesita dar de alta, en este mismo
ciclo escolar, alumnos de **13 grados reales** repartidos en 4 niveles:

- **Villa** (preescolar/kinder) — Villa 1, Villa 2, Villa 3
- **Primaria** — 1° a 6° Primaria
- **Secundaria** — 1° a 3° Secundaria
- **Preparatoria** — 1° Preparatoria (ya en uso, con alumnos reales)

Hoy cada uno de esos 13 grados tiene un solo grupo. Eso va a cambiar
con el tiempo (el colegio va a querer agregar un segundo grupo a un
grado, o renombrar algo), y **el personal administrativo necesita
poder hacerlo sin depender de que alguien lo siembre por SQL.** Este
documento diseña esa navegación y su gestión.

## Decisión de alcance: gestión (crear/renombrar/eliminar) integrada en las tarjetas

A diferencia de la spec del piloto (que excluía cualquier UI de
administración de grados/grupos), aquí sí se construye: crear,
renombrar y eliminar niveles, grados y grupos, directo desde las
mismas pantallas de tarjetas — sin una pantalla de "Administración"
aparte. Cada tarjeta tiene un lápiz para renombrar, y al final de cada
grid hay una tarjeta "+ Agregar" para crear un nivel/grado/grupo
nuevo ahí mismo.

**Eliminar solo si está vacío.** No se puede borrar un nivel con
grados adentro, ni un grado con grupos, ni un grupo con alumnos
inscritos — el control de eliminar se desactiva (con un texto
explicando por qué) en vez de arriesgar huérfanos o un borrado en
cascada. Esto se valida tanto en la UI (deshabilitar el botón, ya que
el conteo de hijos se muestra igual en la tarjeta) como en el Server
Action correspondiente (nunca confiar solo en que la UI lo bloqueó).

No hay login/roles todavía (sigue fuera de alcance, ver
`CONTEXTO_CLAUDE_CODE.md`), así que esta gestión queda abierta a
quien tenga acceso a la app, igual que el resto del sistema hoy.

## Modelo de datos

**Niveles deja de ser una lista fija en código — pasa a ser una tabla
real**, porque ahora es contenido editable, no un enum de 4 valores
que nunca cambia:

```sql
create table niveles (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  orden int
);

alter table grados
  add column nivel_id uuid references niveles(id);

-- (después de sembrar los 4 niveles iniciales, backfill:)
-- update grados set nivel_id = '<id de Preparatoria>' where nombre = '1° Preparatoria';
-- alter table grados alter column nivel_id set not null;
```

`grados.orden` sigue ordenando dentro del nivel. Se agregan índices
de unicidad ligeros para evitar duplicados accidentales desde la UI:

```sql
create unique index idx_grados_nombre_por_nivel on grados(nivel_id, nombre);
create unique index idx_grupos_nombre_por_grado on grupos(grado_id, ciclo_escolar_id, nombre);
```

`inscripciones` no cambia — ahí ya vive correctamente la relación
alumno↔grupo desde el piloto, así que los 2 alumnos ya dados de alta
en Preparatoria no requieren ninguna migración de datos.

**Ciclo escolar:** deja de pedirse en la URL o en variables de
entorno. Se resuelve solo, consultando `ciclos_escolares` por
`activo = true` — el personal no navega entre ciclos en el día a día.
Crear un grupo nuevo desde la UI no pide ciclo escolar: usa el ciclo
activo automáticamente.

## Navegación y rutas

Reemplaza `src/app/(dashboard)/alumnos/page.tsx` (que hoy es el
listado directo) y agrega rutas nuevas dentro de
`src/app/(dashboard)/alumnos/`:

```
/alumnos                              → tarjetas de nivel
/alumnos/nivel/[nivelId]              → tarjetas de grado de ese nivel
/alumnos/grado/[gradoId]              → tarjetas de grupo de ese grado
/alumnos/grupo/[grupoId]              → listado de alumnos (lo que hoy es /alumnos)
/alumnos/grupo/[grupoId]/nuevo        → alta, inscribe en ese grupo
/alumnos/grupo/[grupoId]/[id]/editar  → edición de alumno (mismo formulario de hoy)
```

Se usa el `id` real (UUID) de cada nivel/grado/grupo en la URL, no su
nombre — así un renombre no rompe enlaces guardados.

**Regla de "saltar cuando hay un solo hijo":** si un nivel tiene
exactamente 1 grado, `/alumnos/nivel/[nivelId]` redirige directo a ese
grado. Igual para grado→grupo: si un grado tiene exactamente 1 grupo,
`/alumnos/grado/[gradoId]` redirige directo a
`/alumnos/grupo/[grupoId]`. Hoy, con los 13 grados reales teniendo
todos 1 solo grupo, esto significa que cada grado llega al listado en
un clic extra sobre el nivel — en cuanto un grado tenga 2+ grupos, ese
paso deja de saltarse solo para ese grado.

El nivel "Alumnos y grados" en el sidebar (`src/lib/nav.ts`) sigue
apuntando a `/alumnos` sin cambios.

### Contenido de cada pantalla de tarjetas

- **Nivel** (`/alumnos`): una tarjeta por nivel (orden por
  `niveles.orden`), con el nombre y "N grados". Estilo aprobado en
  brainstorming: tarjeta redondeada de color sólido, 4 tonos
  derivados del rojo institucional (`#E3312D`, `#c02926`, `#8a3a38`,
  `#5a2a29`, hardcodeados por ahora — si se replica a otra escuela con
  otro color de marca, se revisita entonces). Si hay más de 4 niveles
  en el futuro, los tonos se ciclan o se recalculan; no es un caso que
  exista hoy.
- **Grado** (`/alumnos/nivel/[nivelId]`): tarjetas por cada grado del
  nivel, con "N grupos". Breadcrumb "← Niveles / {Nivel}" arriba.
- **Grupo** (`/alumnos/grado/[gradoId]`): tarjetas por cada grupo del
  grado, con "N alumnos" (activos, del ciclo activo). Breadcrumb
  "← {Nivel} / {Grado}" arriba.
- **Listado** (`/alumnos/grupo/[grupoId]`): el mismo listado que existe
  hoy (tabla con nombre/matrícula/tutor/estatus/acciones), con
  breadcrumb "← {Grado} / {Grupo}" arriba y el título cambiado a
  "Alumnos — {Grado}, {Grupo}".

Cada tarjeta de nivel/grado/grupo (no las de alumno) lleva un lápiz
que la pone en modo edición: el nombre se vuelve un campo de texto con
"Guardar"/"Cancelar", sin navegar a otra página. Al final de cada
grid, una tarjeta con borde punteado "+ Agregar {nivel/grado/grupo}"
abre el mismo tipo de campo de texto para crear uno nuevo.

Mockups del recorrido de navegación (sin la parte de edición, que se
agregó después) aprobados en la sesión de brainstorming — no
versionados en el repo.

## Gestión: Server Actions de niveles/grados/grupos

Archivo nuevo: `src/app/(dashboard)/alumnos/estructura-actions.ts`.
Todas validan el nombre con un schema Zod compartido (no vacío,
recortado — mismo patrón que `src/lib/alumnos/schema.ts`), y todas las
de eliminar cuentan hijos antes de borrar y rechazan si hay alguno:

- `crearNivel(nombre: string)`, `renombrarNivel(id, nombre: string)`,
  `eliminarNivel(id: string)` — rechaza si tiene grados.
- `crearGrado(nivelId: string, nombre: string)`,
  `renombrarGrado(id, nombre: string)`, `eliminarGrado(id: string)` —
  rechaza si tiene grupos.
- `crearGrupo(gradoId: string, nombre: string)` (usa el ciclo activo
  automáticamente), `renombrarGrupo(id, nombre: string)`,
  `eliminarGrupo(id: string)` — rechaza si tiene inscripciones.

`crearNivel`/`crearGrado` asignan `orden` automáticamente como
`(máximo orden existente en ese padre) + 1` (o `1` si es el primero) —
no se pide como campo en el formulario de alta. `grupos` no tiene
columna `orden`, así que `crearGrupo` no aplica aquí.

Componentes nuevos y compartidos entre las 3 pantallas de tarjetas:

- `src/components/alumnos/TarjetaEditable.tsx` — tarjeta con
  navegación + lápiz de renombrar, usada para nivel/grado/grupo.
- `src/components/alumnos/TarjetaAgregar.tsx` — la tarjeta "+
  Agregar" al final del grid.

## Server Actions de alumnos (cambio de firma)

`src/app/(dashboard)/alumnos/actions.ts`:

- `crearAlumno(grupoId: string, formData: FormData)` — cambia de
  firma: ya no lee `GRUPO_PILOTO_ID`/`CICLO_PILOTO_ID` de
  `process.env`, recibe `grupoId` como parámetro (viene de la URL) y
  resuelve el ciclo activo internamente.
- `actualizarAlumno(id, formData)` y `alternarActivoAlumno(id, activo)`
  — sin cambios, no necesitan contexto de grupo.

`GRUPO_PILOTO_ID` y `CICLO_PILOTO_ID` quedan obsoletas y se retiran de
`.env.local`/`.env.example`. `src/lib/grupos/piloto.ts` se elimina —
ya no hay un "grupo piloto" fijo que resolver.

## Manejo de errores

- `nivelId`/`gradoId`/`grupoId` que no existen → `notFound()` (mismo
  patrón que ya usa hoy "editar alumno").
- Intentar eliminar un nivel/grado/grupo que tiene hijos → el Server
  Action lanza un error legible en español; en la UI el botón de
  eliminar ya viene deshabilitado para ese caso, así que este es el
  respaldo del lado servidor, no el camino esperado.
- Nombre duplicado dentro del mismo padre (choca con el índice único)
  → mensaje "Ya existe un {nivel/grado/grupo} con ese nombre aquí."
- Nivel/grado sin hijos (nivel sin grados, grado sin grupos) →
  mensaje de estado vacío en la pantalla de tarjetas, igual que el
  listado ya maneja "Todavía no hay alumnos registrados."

## Testing

`src/lib/estructura/schema.ts` (nombre de nivel/grado/grupo — no
vacío, recortado) se prueba con Vitest igual que
`src/lib/alumnos/schema.ts`. Las páginas de tarjetas y los Server
Actions de estructura no se prueban con RTL/jsdom, mismo criterio que
el resto del proyecto.

**Verificación real:** `npm run build` + `npm run lint` limpios, y
verificación manual contra Supabase real:

1. Sembrar los 4 niveles iniciales (Villa, Primaria, Secundaria,
   Preparatoria) — único paso que sigue siendo por SQL, ver "Datos a
   sembrar" abajo.
2. Desde la UI: crear los 13 grados reales dentro de sus niveles, cada
   uno con su grupo (usando "+ Agregar").
3. Confirmar que Preparatoria (1 grado, 1 grupo) sigue llegando al
   listado existente (con Ana Torres y Luis Hernández) sin pasos de
   más.
4. Agregar un segundo grupo a un grado cualquiera y confirmar que ahí
   sí aparece la pantalla de tarjetas de grupo (deja de saltarse).
5. Intentar eliminar un nivel/grado/grupo con hijos y confirmar que se
   bloquea; eliminar uno vacío y confirmar que sí funciona.
6. Renombrar un nivel/grado/grupo y confirmar que el cambio se refleja
   en breadcrumbs y listados sin romper nada.

## Explícitamente fuera de alcance

- Pantalla de "Administración" separada — la gestión vive integrada en
  las tarjetas de navegación.
- Colores de tarjeta configurables por instancia/marca — hardcoded por
  ahora.
- Reordenar niveles/grados por drag-and-drop — el `orden` se puede
  ajustar por SQL si hace falta; no hay control de UI para esto.
- Cualquier trabajo sobre Pagos o Listas/Asistencia (ver nota en
  `CONTEXTO_CLAUDE_CODE.md` sobre decidir el patrón de escrituras
  acotadas por grupo antes de planear esos módulos).
- Login, roles, RLS — sigue pendiente como trabajo aparte.

## Datos a sembrar antes de implementar

Solo los 4 niveles iniciales (Villa, Primaria, Secundaria,
Preparatoria) — todo lo demás (los 13 grados reales y sus grupos) se
crea desde la UI una vez implementado esto, usando los nombres que ya
dio el usuario: Villa 1/2/3, 1°-6° Primaria, 1°-3° Secundaria, 1°
Preparatoria (este último ya existe y solo necesita el backfill de
`nivel_id`).
