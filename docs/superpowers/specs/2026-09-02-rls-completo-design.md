# Diseño: RLS completo + login en Alumnos/Pagos/Asistencia

## Estado de este documento

Completo — escrito incrementalmente durante la sesión de brainstorming,
sección por sección, conforme el usuario aprobaba cada una (y commiteado a
git en cada paso). Esto fue deliberado: una sesión anterior avanzó en este
mismo diseño de forma solo conversacional y el trabajo no quedó
documentado en ningún archivo, así que hubo que reconstruirlo. Si esta
sesión se corta, el archivo ya tiene todo lo acordado.

## Contexto

Desde la pieza de Autenticación + rol Docente, `perfiles` es la única tabla
con RLS activado; las otras 15 tablas siguen expuestas por completo a la
anon key. Esto era una decisión explícita mientras Alumnos/Pagos/Asistencia
no pedían login — pero ya no hay razón para seguir esperando: Materias y
Calificaciones ya piden login y usan patrones de acceso por rol
(`requerirRol`, `requerirRolPagina`, `requerirAccesoAsignacion`), y esta
pieza cierra el hueco en el resto del esquema.

**Decisión de alcance confirmada con el usuario:** activar RLS en las
tablas de Alumnos/Pagos/Asistencia sin más cambios rompería esas pantallas
por completo (hoy no piden login, corren con la anon key sin sesión — RLS
bloquea todo lo que no tenga política explícita). Se decidió agregar login
también a esas 3 rutas como parte de esta misma pieza, en vez de dejar RLS
a medias.

**Matriz de acceso por rol confirmada:**
- **Alumnos y grados**: `super_admin`/`direccion` (control total), `docente`
  (solo lectura, **solo de los alumnos en sus propios grupos asignados** —
  no toda la escuela). `caja` no tiene pantalla propia aquí, pero sí
  necesita leer la tabla `alumnos` (para Pagos) — ver la matriz de tablas
  abajo, el acceso a nivel de tabla (RLS) es independiente del acceso a
  nivel de pantalla (middleware/`requerirRolPagina`).
- **Pagos / colegiaturas**: `super_admin`, `direccion`, `caja` (control
  total). `docente` sin acceso.
- **Listas / Asistencia**: `super_admin`, `direccion`, `docente` (control
  total sobre sus propios grupos). `caja` sin acceso.

**Bug real ya existente, encontrado durante este diseño (no introducido por
esta pieza, pero se corrige aquí):** `perfiles` solo tiene política de
lectura total para `super_admin` (`es_super_admin()`), no para `direccion`.
Como resultado, hoy un usuario `direccion` que abre `/materias/grado/[id]`
para asignar un maestro recibe una lista de docentes **vacía** —
`obtenerDocentes()` en `src/lib/perfiles/docentes.ts` consulta `perfiles`
con `rol = 'docente'`, y RLS oculta esas filas para cualquiera que no sea
`super_admin`. Se corrige generalizando la política a
`es_super_admin_o_direccion()`.

## A. Arquitectura: funciones helper de seguridad

Se extiende el patrón `security definer` ya establecido con
`es_super_admin()` (`docs/../database/schema.sql`, agregado en la pieza de
Auth) — una función `security definer` consulta `perfiles` sin volver a
disparar el RLS de esa misma tabla, evitando la recursión infinita que ya
se documentó y corrigió una vez en esa pieza.

```sql
-- Ya existe (pieza de Auth):
-- es_super_admin() returns boolean

create or replace function es_direccion()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from perfiles
    where usuario_auth_id = auth.uid() and rol = 'direccion'
  );
$$;

create or replace function es_super_admin_o_direccion()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select es_super_admin() or es_direccion();
$$;

create or replace function es_docente()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from perfiles
    where usuario_auth_id = auth.uid() and rol = 'docente'
  );
$$;

create or replace function es_caja()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from perfiles
    where usuario_auth_id = auth.uid() and rol = 'caja'
  );
$$;

create or replace function mi_perfil_id()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select id from perfiles where usuario_auth_id = auth.uid();
$$;

-- ¿El docente actual tiene una asignación activa a este grupo, en el
-- ciclo escolar activo? (cualquier materia)
create or replace function docente_tiene_grupo(p_grupo_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from asignaciones a
    join ciclos_escolares c on c.id = a.ciclo_escolar_id and c.activo = true
    where a.docente_perfil_id = mi_perfil_id() and a.grupo_id = p_grupo_id
  );
$$;

-- ¿El docente actual tiene una asignación activa a esta materia, en el
-- ciclo escolar activo? (cualquier grupo) — usado por materia_alumnos.
create or replace function docente_tiene_materia(p_materia_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from asignaciones a
    join ciclos_escolares c on c.id = a.ciclo_escolar_id and c.activo = true
    where a.docente_perfil_id = mi_perfil_id() and a.materia_id = p_materia_id
  );
$$;

-- ¿Es el docente dueño de esta asignación específica?
create or replace function docente_tiene_asignacion(p_asignacion_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from asignaciones
    where id = p_asignacion_id and docente_perfil_id = mi_perfil_id()
  );
$$;
```

Todas son `security definer` + `stable`, así que Postgres puede cachear su
resultado dentro de la misma consulta y no hay riesgo de recursión: como
corren con los privilegios de quien las creó (no del usuario que dispara la
política), consultan `perfiles`/`asignaciones`/`ciclos_escolares` sin
volver a evaluar el RLS de esas tablas.

## B. Matriz de políticas por tabla

| Tabla | SELECT | INSERT/UPDATE/DELETE |
|---|---|---|
| `configuracion` | pública (anon + autenticado) — la necesita `/login` antes de iniciar sesión | `super_admin` |
| `ciclos_escolares`, `niveles`, `grados`, `grupos` | cualquier usuario autenticado | `super_admin`/`direccion` |
| `materias` | cualquier usuario autenticado (nombres de materia no son sensibles) | `super_admin`/`direccion` |
| `alumnos` | `super_admin`/`direccion`/`caja` (todos), `docente` (solo alumnos de sus grupos vía `inscripciones`) | `super_admin`/`direccion` |
| `inscripciones` | `super_admin`/`direccion`/`caja` (todas), `docente` (`docente_tiene_grupo(grupo_id)`) | `super_admin`/`direccion` |
| `asignaciones` | `super_admin`/`direccion` (todas), `docente` (`docente_perfil_id = mi_perfil_id()`) | `super_admin`/`direccion` |
| `materia_alumnos` | `super_admin`/`direccion` (todas), `docente` (`docente_tiene_materia(materia_id)`) | `super_admin`/`direccion` |
| `calificaciones` | `super_admin`/`direccion` (todas), `docente` (`docente_tiene_asignacion(asignacion_id)`) | igual para INSERT/UPDATE; DELETE solo `super_admin` (no hay función de borrado en la app hoy, es solo red de seguridad) |
| `conceptos_pago`, `cargos`, `pagos` | `super_admin`/`direccion`/`caja` | `super_admin`/`direccion`/`caja` |
| `asistencias` | `super_admin`/`direccion`/`docente` (`docente_tiene_grupo(grupo_id)`) | igual; DELETE solo `super_admin`/`direccion` |
| `perfiles` | ya existe: cada quien su fila + `super_admin` todas → **se cambia a `es_super_admin_o_direccion()`** (corrige el bug real) | sin cambios (los inserts/updates pasan por `service_role` en la Server Action de invitar maestro) |

## C. Login y roles en Alumnos, Pagos y Asistencia

Alumnos se construyó **antes** de que existiera login en el proyecto, así
que ninguna de sus 12 Server Actions (`src/app/(dashboard)/alumnos/actions.ts`,
`estructura-actions.ts`) tiene hoy ninguna verificación de rol — dependen
por completo de que la anon key tenga acceso total a la tabla (sin RLS).
Esta pieza agrega esa verificación por primera vez ahí, no solo la
política de base de datos.

**Alumnos** (6 pantallas + 12 Server Actions):
- Las 6 páginas (`page.tsx`, `nivel/[nivelId]/page.tsx`,
  `grado/[gradoId]/page.tsx`, `grupo/[grupoId]/page.tsx`,
  `grupo/[grupoId]/nuevo/page.tsx`,
  `grupo/[grupoId]/[id]/editar/page.tsx`) pasan a usar
  `requerirRolPagina(["super_admin", "direccion", "docente"])`.
- Las 12 Server Actions (`crearAlumno`, `actualizarAlumno`,
  `alternarActivoAlumno` en `actions.ts`; `crearNivel`, `renombrarNivel`,
  `eliminarNivel`, `crearGrado`, `renombrarGrado`, `eliminarGrado`,
  `crearGrupo`, `renombrarGrupo`, `eliminarGrupo` en
  `estructura-actions.ts`) pasan a usar
  `requerirRol(["super_admin", "direccion"])` — un `docente` nunca escribe,
  aunque pueda ver las pantallas.
- `grupo/[grupoId]/page.tsx` (el listado) oculta "Agregar alumno",
  "Editar" y "Dar de baja/Reactivar" cuando el rol es `docente` — ve la
  tabla, no los controles. El resto de la UI queda igual.
- Las páginas de alta/edición no quedan alcanzables por un `docente` en la
  práctica (nada enlaza a ellas si se ocultan los botones), pero se
  protegen igual a nivel de Server Action como red de seguridad —
  defensa en profundidad, mismo criterio del resto del proyecto.

**Pagos** (`src/app/(dashboard)/pagos/page.tsx`) y **Asistencia**
(`src/app/(dashboard)/asistencia/page.tsx`): hoy son placeholders
("Próximamente"), el cambio es mínimo — cada uno pasa a
`requerirRolPagina([...])` con su matriz ya acordada (Pagos:
`super_admin`/`direccion`/`caja`; Asistencia:
`super_admin`/`direccion`/`docente`). No hay Server Actions que proteger
todavía porque no hay funcionalidad real aún.

**Middleware**: `RUTAS_PROTEGIDAS` pasa a `["/usuarios", "/materias",
"/calificaciones", "/alumnos", "/pagos", "/asistencia"]`.

**Corrección del bug real en `perfiles`**: la política "super_admin lee
todos los perfiles" cambia a usar `es_super_admin_o_direccion()`.

**Fixes defensivos de embed nulo** (para cuando RLS empiece a poder ocultar
filas del embed): cambia el patrón `.flatMap((fila) => fila.alumnos)` (que
asume que el embed siempre viene) a una versión que filtra `null` en vez
de asumir presencia, en:
- `obtenerAlumnosDelGrupo` en `alumnos/grupo/[grupoId]/page.tsx`
- `obtenerAlumnosDelGrupoDeMateria` y `obtenerAlumnosDeMateria` en
  `src/lib/materias/roster.ts`
- `obtenerAlumnosDeAsignacion` en `src/lib/calificaciones/roster.ts`

## D. Orden de aplicación (rollout) y límites de verificación

**Por qué el orden importa:** activar RLS en una tabla bloquea *todo*
acceso que no tenga una política explícita — incluyendo el que usa hoy la
app sin login. Si se activa RLS antes de que el código tenga los nuevos
`requerirRolPagina`/`requerirRol`, Alumnos/Pagos/Asistencia se rompen por
completo hasta que el código alcance a la base de datos.

Orden elegido para minimizar esa ventana:
1. **Prerequisites** (antes del Task 1, igual que en piezas anteriores):
   se crean las funciones helper (Sección A) y **todas** las políticas
   (`CREATE POLICY`, Sección B) — pero **sin activar RLS todavía**
   (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY` se aplaza). Una política
   sin RLS activado en su tabla existe pero no se aplica — es seguro
   crearlas todas de una vez sin romper nada.
2. **Tasks intermedios**: todos los cambios de código (login/roles en
   Alumnos/Pagos/Asistencia, corrección del embed nulo, la política de
   `perfiles`).
3. **Último task del plan**: activar RLS en las 15 tablas restantes
   (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`), una vez que todo el
   código que depende de las políticas ya está en su lugar y probado.

**Límite real de verificación — más importante aquí que en piezas
anteriores:** confirmar que una política RLS deja pasar exactamente lo que
debe (ni más ni menos) requiere una sesión real autenticada como cada rol
(`auth.uid()` solo existe dentro de una petición autenticada de verdad) —
no se puede simular con una consulta SQL directa vía el MCP de Supabase,
que corre con privilegios de servicio y **siempre** ve todo,
independientemente de RLS. Esta pieza va a poder verificar por código
(trazando cada política y cada función helper contra la matriz de la
Sección B) que la lógica es la que se pidió, pero **no** va a poder
confirmar en este sandbox que un `docente` real, con sesión real, ve
exactamente sus propios alumnos y ningún cargo de Pagos — eso solo lo
puede confirmar una persona con las 4 cuentas reales (`super_admin`,
`direccion`, `caja`, `docente`) entrando de verdad. Dado que esto es
seguridad (no solo UX, como el pendiente de Captura de calificaciones),
esta pieza no se debe dar por "cerrada" hasta que eso pase — se documentará
como pendiente explícito, igual que el de Captura, pero con más peso.

## Explícitamente fuera de alcance

- Políticas RLS para escrituras de `docente` en `alumnos`/`inscripciones`
  (es de solo lectura, confirmado con el usuario) — no hay INSERT/UPDATE
  para `docente` en esas tablas.
- Cualquier funcionalidad nueva en Pagos o Asistencia más allá de
  proteger la ruta — siguen siendo placeholders de contenido.
- Migrar `perfiles` a un modelo distinto de RLS — solo se corrige la
  política existente para incluir a `direccion`.
