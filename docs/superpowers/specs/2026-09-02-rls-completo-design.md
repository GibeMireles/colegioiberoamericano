# Diseño: RLS completo + login en Alumnos/Pagos/Asistencia

## Estado de este documento

**En progreso — se está escribiendo incrementalmente durante la sesión de
brainstorming, sección por sección, conforme el usuario aprueba cada una.**
Esto es deliberado: una sesión anterior avanzó en este mismo diseño de forma
solo conversacional y el trabajo no quedó documentado en ningún archivo, así
que hubo que reconstruirlo. Este archivo se actualiza en vivo para que eso
no vuelva a pasar.

## Contexto

Desde la pieza de Autenticación + rol Docente, `perfiles` es la única tabla
con RLS activado; las otras 14 tablas siguen expuestas por completo a la
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

*(Aprobado por el usuario.)*

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

*(Aprobado por el usuario — siguiente: login/UI en Alumnos, Pagos y Asistencia.)*
