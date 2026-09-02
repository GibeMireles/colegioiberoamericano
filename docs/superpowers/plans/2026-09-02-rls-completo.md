# RLS completo + login en Alumnos/Pagos/Asistencia Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Activar RLS en las 15 tablas que hoy no lo tienen (`perfiles` ya lo tiene), y agregar login + roles a Alumnos/Pagos/Asistencia — sin eso, activar RLS en esas tablas rompería esas pantallas por completo.

**Architecture:** Funciones helper `security definer` (mismo patrón que `es_super_admin()`) para cada chequeo de rol/alcance; una política por tabla y operación siguiendo la matriz del spec; `requerirRol`/`requerirRolPagina` agregados a Alumnos/Pagos/Asistencia (mismo patrón ya usado en Materias/Calificaciones); RLS se activa al final del plan, después de que todo el código que depende de las políticas ya está en su lugar, para minimizar la ventana en la que las tablas quedarían bloqueadas sin que el código las acompañe.

**Tech Stack:** Next.js 16 App Router, Supabase (Postgres RLS), Zod, Vitest — mismo stack del resto del proyecto, sin dependencias nuevas.

**Spec:** `docs/superpowers/specs/2026-09-02-rls-completo-design.md`

## Global Constraints

- `docente` es de **solo lectura** en Alumnos, y **solo ve los alumnos de sus propios grupos asignados** (vía `asignaciones` → `grupo_id`, ciclo activo) — nunca toda la escuela.
- `caja` necesita SELECT en `alumnos`/`inscripciones` (para Pagos) aunque no tenga pantalla propia en el módulo Alumnos — el acceso a nivel de tabla (RLS) es independiente del acceso a nivel de pantalla (`requerirRolPagina`).
- Pagos: `super_admin`/`direccion`/`caja`. Asistencia: `super_admin`/`direccion`/`docente` (scoped a sus grupos). Ninguno de los dos módulos gana funcionalidad nueva en esta pieza — siguen siendo placeholders, solo se protege la ruta.
- Las páginas de alta/edición de alumno (`nuevo`, `editar`) se restringen a `["super_admin", "direccion"]` únicamente (sin `docente`) — un docente de solo lectura no debe poder abrir un formulario de escritura, aunque la Server Action también lo rechazaría. Las otras 4 páginas de Alumnos (listado de niveles, grados, grupos, alumnos) sí incluyen `docente`.
- Todas las funciones helper nuevas son `security definer` + `stable`, consultando `perfiles`/`asignaciones`/`ciclos_escolares` directamente — igual que `es_super_admin()`, evita la recursión infinita de RLS auto-referenciándose.
- Orden de aplicación: las políticas se crean en Prerequisites (sin activar RLS todavía); el código que las necesita se construye en los tasks intermedios; RLS se activa recién en el último task del plan.
- Verificar con una sesión SQL directa (vía MCP) que una política RLS deja pasar exactamente lo correcto **no es posible** — el MCP corre con privilegios de servicio y siempre ve todo, sin importar RLS. La verificación de cada task se hace trazando cada política contra la matriz del spec (Sección B), nunca ejecutándola de verdad. La verificación real con las 4 cuentas reales queda como pendiente explícito para el usuario, igual que con Captura de calificaciones pero con más peso al ser seguridad y no solo UX.

---

## Prerequisites (las ejecuta el orquestador antes del Task 1, no un subagente)

Aplicar esta migración a la base real vía `apply_migration`. **No activa RLS todavía** — solo crea las funciones y las políticas.

```sql
-- ==========================================================
-- Funciones helper de seguridad (RLS)
-- ==========================================================
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

-- ==========================================================
-- Corrección del bug real en perfiles (direccion no leía a nadie)
-- ==========================================================
drop policy if exists "super_admin lee todos los perfiles" on perfiles;
create policy "super_admin y direccion leen todos los perfiles"
  on perfiles for select
  using (es_super_admin_o_direccion());

-- ==========================================================
-- Políticas nuevas (RLS se activa hasta el último task del plan)
-- ==========================================================

-- configuracion: lectura pública (la necesita /login antes de iniciar sesión)
create policy "configuracion lectura publica" on configuracion
  for select using (true);
create policy "configuracion solo super_admin escribe" on configuracion
  for all using (es_super_admin()) with check (es_super_admin());

-- ciclos_escolares, niveles, grados, grupos: lectura para cualquier
-- autenticado, escritura super_admin/direccion
create policy "ciclos_escolares lectura autenticados" on ciclos_escolares
  for select using (auth.uid() is not null);
create policy "ciclos_escolares escritura admin" on ciclos_escolares
  for all using (es_super_admin_o_direccion()) with check (es_super_admin_o_direccion());

create policy "niveles lectura autenticados" on niveles
  for select using (auth.uid() is not null);
create policy "niveles escritura admin" on niveles
  for all using (es_super_admin_o_direccion()) with check (es_super_admin_o_direccion());

create policy "grados lectura autenticados" on grados
  for select using (auth.uid() is not null);
create policy "grados escritura admin" on grados
  for all using (es_super_admin_o_direccion()) with check (es_super_admin_o_direccion());

create policy "grupos lectura autenticados" on grupos
  for select using (auth.uid() is not null);
create policy "grupos escritura admin" on grupos
  for all using (es_super_admin_o_direccion()) with check (es_super_admin_o_direccion());

-- materias: igual que niveles/grados/grupos (nombres no sensibles)
create policy "materias lectura autenticados" on materias
  for select using (auth.uid() is not null);
create policy "materias escritura admin" on materias
  for all using (es_super_admin_o_direccion()) with check (es_super_admin_o_direccion());

-- alumnos: admin+caja todo, docente solo lectura de sus grupos
create policy "alumnos lectura admin y caja" on alumnos
  for select using (es_super_admin_o_direccion() or es_caja());
create policy "alumnos lectura docente propio grupo" on alumnos
  for select using (
    es_docente() and exists (
      select 1 from inscripciones i
      where i.alumno_id = alumnos.id and docente_tiene_grupo(i.grupo_id)
    )
  );
create policy "alumnos escritura admin" on alumnos
  for all using (es_super_admin_o_direccion()) with check (es_super_admin_o_direccion());

-- inscripciones: mismo criterio que alumnos
create policy "inscripciones lectura admin y caja" on inscripciones
  for select using (es_super_admin_o_direccion() or es_caja());
create policy "inscripciones lectura docente propio grupo" on inscripciones
  for select using (es_docente() and docente_tiene_grupo(grupo_id));
create policy "inscripciones escritura admin" on inscripciones
  for all using (es_super_admin_o_direccion()) with check (es_super_admin_o_direccion());

-- asignaciones: admin todo, docente solo sus propias filas
create policy "asignaciones lectura admin" on asignaciones
  for select using (es_super_admin_o_direccion());
create policy "asignaciones lectura docente propia" on asignaciones
  for select using (es_docente() and docente_perfil_id = mi_perfil_id());
create policy "asignaciones escritura admin" on asignaciones
  for all using (es_super_admin_o_direccion()) with check (es_super_admin_o_direccion());

-- materia_alumnos: admin todo, docente scoped a sus materias
create policy "materia_alumnos lectura admin" on materia_alumnos
  for select using (es_super_admin_o_direccion());
create policy "materia_alumnos lectura docente propia materia" on materia_alumnos
  for select using (es_docente() and docente_tiene_materia(materia_id));
create policy "materia_alumnos escritura admin" on materia_alumnos
  for all using (es_super_admin_o_direccion()) with check (es_super_admin_o_direccion());

-- calificaciones: admin todo, docente scoped a su propia asignacion
create policy "calificaciones lectura admin" on calificaciones
  for select using (es_super_admin_o_direccion());
create policy "calificaciones lectura docente propia asignacion" on calificaciones
  for select using (es_docente() and docente_tiene_asignacion(asignacion_id));
create policy "calificaciones escritura admin" on calificaciones
  for insert with check (es_super_admin_o_direccion());
create policy "calificaciones escritura docente propia asignacion insert" on calificaciones
  for insert with check (es_docente() and docente_tiene_asignacion(asignacion_id));
create policy "calificaciones actualizacion admin" on calificaciones
  for update using (es_super_admin_o_direccion()) with check (es_super_admin_o_direccion());
create policy "calificaciones actualizacion docente propia asignacion" on calificaciones
  for update using (es_docente() and docente_tiene_asignacion(asignacion_id))
  with check (es_docente() and docente_tiene_asignacion(asignacion_id));
create policy "calificaciones borrado super_admin" on calificaciones
  for delete using (es_super_admin());

-- conceptos_pago, cargos, pagos: admin+direccion+caja, todo
create policy "conceptos_pago admin caja" on conceptos_pago
  for all using (es_super_admin_o_direccion() or es_caja())
  with check (es_super_admin_o_direccion() or es_caja());
create policy "cargos admin caja" on cargos
  for all using (es_super_admin_o_direccion() or es_caja())
  with check (es_super_admin_o_direccion() or es_caja());
create policy "pagos admin caja" on pagos
  for all using (es_super_admin_o_direccion() or es_caja())
  with check (es_super_admin_o_direccion() or es_caja());

-- asistencias: admin+docente scoped a su grupo
create policy "asistencias lectura admin" on asistencias
  for select using (es_super_admin_o_direccion());
create policy "asistencias lectura docente propio grupo" on asistencias
  for select using (es_docente() and docente_tiene_grupo(grupo_id));
create policy "asistencias escritura admin" on asistencias
  for insert with check (es_super_admin_o_direccion());
create policy "asistencias escritura docente propio grupo insert" on asistencias
  for insert with check (es_docente() and docente_tiene_grupo(grupo_id));
create policy "asistencias actualizacion admin" on asistencias
  for update using (es_super_admin_o_direccion()) with check (es_super_admin_o_direccion());
create policy "asistencias actualizacion docente propio grupo" on asistencias
  for update using (es_docente() and docente_tiene_grupo(grupo_id))
  with check (es_docente() and docente_tiene_grupo(grupo_id));
create policy "asistencias borrado admin" on asistencias
  for delete using (es_super_admin_o_direccion());
```

---

### Task 1: Proteger el módulo Alumnos (Server Actions + páginas + UI de solo lectura para docente)

**Files:**
- Modify: `src/app/(dashboard)/alumnos/actions.ts`
- Modify: `src/app/(dashboard)/alumnos/estructura-actions.ts`
- Modify: `src/app/(dashboard)/alumnos/page.tsx`
- Modify: `src/app/(dashboard)/alumnos/nivel/[nivelId]/page.tsx`
- Modify: `src/app/(dashboard)/alumnos/grado/[gradoId]/page.tsx`
- Modify: `src/app/(dashboard)/alumnos/grupo/[grupoId]/page.tsx`
- Modify: `src/app/(dashboard)/alumnos/grupo/[grupoId]/nuevo/page.tsx`
- Modify: `src/app/(dashboard)/alumnos/grupo/[grupoId]/[id]/editar/page.tsx`

**Interfaces:**
- Consumes: `requerirRol` de `@/lib/perfiles/requerirRol`, `requerirRolPagina` de `@/lib/perfiles/requerirRolPagina` (ambos ya existen, de la pieza de Auth/Materias).
- No produce interfaces nuevas — solo agrega el chequeo de acceso ya establecido a código existente.

- [ ] **Step 1: `src/app/(dashboard)/alumnos/actions.ts`**

Agregar el import al inicio:

```ts
import { requerirRol } from "@/lib/perfiles/requerirRol";
```

Agregar `await requerirRol(["super_admin", "direccion"]);` como primera línea del cuerpo de cada una de estas 3 funciones (antes de cualquier otra instrucción): `crearAlumno`, `actualizarAlumno`, `alternarActivoAlumno`.

Ejemplo para `crearAlumno` (las otras 2 siguen el mismo patrón — una sola línea nueva al principio, nada más cambia):

```ts
export async function crearAlumno(grupoId: string, formData: FormData) {
  await requerirRol(["super_admin", "direccion"]);
  const datos = parseAlumnoFormData(formData);
  const supabase = await createClient();
  // ... resto de la función sin cambios
```

- [ ] **Step 2: `src/app/(dashboard)/alumnos/estructura-actions.ts`**

Agregar el import al inicio:

```ts
import { requerirRol } from "@/lib/perfiles/requerirRol";
```

Agregar `await requerirRol(["super_admin", "direccion"]);` como primera línea del cuerpo de cada una de estas 9 funciones (mismo patrón exacto que el Step 1): `crearNivel`, `renombrarNivel`, `eliminarNivel`, `crearGrado`, `renombrarGrado`, `eliminarGrado`, `crearGrupo`, `renombrarGrupo`, `eliminarGrupo`.

- [ ] **Step 3: `src/app/(dashboard)/alumnos/page.tsx`**

Agregar el import:

```ts
import { requerirRolPagina } from "@/lib/perfiles/requerirRolPagina";
```

Agregar `await requerirRolPagina(["super_admin", "direccion", "docente"]);` como primera línea dentro de `AlumnosPage`:

```tsx
export default async function AlumnosPage() {
  await requerirRolPagina(["super_admin", "direccion", "docente"]);
  const niveles = await obtenerNiveles();
  // ... resto sin cambios
```

- [ ] **Step 4: `src/app/(dashboard)/alumnos/nivel/[nivelId]/page.tsx`**

Mismo patrón que el Step 3 — agregar el import y `await requerirRolPagina(["super_admin", "direccion", "docente"]);` como primera línea dentro de `GradoCardsPage`, antes de `const { nivelId } = await params;`.

- [ ] **Step 5: `src/app/(dashboard)/alumnos/grado/[gradoId]/page.tsx`**

Mismo patrón — agregar el import y `await requerirRolPagina(["super_admin", "direccion", "docente"]);` como primera línea dentro de `GrupoCardsPage`, antes de `const { gradoId } = await params;`.

- [ ] **Step 6: `src/app/(dashboard)/alumnos/grupo/[grupoId]/nuevo/page.tsx`**

A diferencia de las anteriores, esta página **no** incluye `docente` (ver Global Constraints — las páginas de escritura quedan fuera de su alcance de lectura). Agregar el import y, como primera línea dentro de `NuevoAlumnoPage`:

```ts
await requerirRolPagina(["super_admin", "direccion"]);
```

- [ ] **Step 7: `src/app/(dashboard)/alumnos/grupo/[grupoId]/[id]/editar/page.tsx`**

Mismo patrón que el Step 6 (sin `docente`) — agregar el import y `await requerirRolPagina(["super_admin", "direccion"]);` como primera línea dentro de `EditarAlumnoPage`.

- [ ] **Step 8: `src/app/(dashboard)/alumnos/grupo/[grupoId]/page.tsx` — reemplazo completo**

Esta es la única página que además cambia su UI (oculta "Agregar alumno" y la columna "Acciones" cuando el rol es `docente`). Reemplazar el archivo completo:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requerirRolPagina } from "@/lib/perfiles/requerirRolPagina";
import { alternarActivoAlumno } from "../../actions";

export const dynamic = "force-dynamic";

interface AlumnoListado {
  id: string;
  nombres: string;
  apellido_paterno: string | null;
  apellido_materno: string | null;
  matricula: string | null;
  tutor_nombre: string | null;
  activo: boolean;
}

function formatearNombre(alumno: AlumnoListado): string {
  const apellidos = [alumno.apellido_paterno, alumno.apellido_materno]
    .filter((valor): valor is string => Boolean(valor))
    .join(" ");

  return apellidos ? `${apellidos}, ${alumno.nombres}` : alumno.nombres;
}

function compararAlumnos(a: AlumnoListado, b: AlumnoListado): number {
  const aTieneApellido = a.apellido_paterno !== null;
  const bTieneApellido = b.apellido_paterno !== null;

  if (aTieneApellido !== bTieneApellido) {
    return aTieneApellido ? -1 : 1;
  }

  return (
    (a.apellido_paterno ?? "").localeCompare(b.apellido_paterno ?? "", "es") ||
    (a.apellido_materno ?? "").localeCompare(b.apellido_materno ?? "", "es") ||
    a.nombres.localeCompare(b.nombres, "es")
  );
}

interface ContextoGrupo {
  gradoId: string;
  gradoNombre: string;
  grupoNombre: string;
}

async function obtenerContexto(grupoId: string): Promise<ContextoGrupo | null> {
  const supabase = await createClient();

  const { data: grupo, error: errorGrupo } = await supabase
    .from("grupos")
    .select("nombre, grado_id")
    .eq("id", grupoId)
    .single();

  if (errorGrupo || !grupo) {
    return null;
  }

  const { data: grado, error: errorGrado } = await supabase
    .from("grados")
    .select("nombre")
    .eq("id", grupo.grado_id)
    .single();

  if (errorGrado || !grado) {
    return null;
  }

  return {
    gradoId: grupo.grado_id,
    gradoNombre: grado.nombre,
    grupoNombre: grupo.nombre,
  };
}

async function obtenerAlumnosDelGrupo(grupoId: string): Promise<AlumnoListado[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("inscripciones")
    .select(
      "alumnos(id, nombres, apellido_paterno, apellido_materno, matricula, tutor_nombre, activo)"
    )
    .eq("grupo_id", grupoId);

  if (error) {
    throw new Error(`No se pudo cargar la lista de alumnos: ${error.message}`);
  }

  return (data ?? [])
    .flatMap((inscripcion) => (inscripcion.alumnos ? [inscripcion.alumnos] : []))
    .sort(compararAlumnos);
}

export default async function ListadoAlumnosPage({
  params,
}: {
  params: Promise<{ grupoId: string }>;
}) {
  const perfil = await requerirRolPagina(["super_admin", "direccion", "docente"]);
  const puedeEditar = perfil.rol !== "docente";

  const { grupoId } = await params;
  const contexto = await obtenerContexto(grupoId);

  if (!contexto) {
    notFound();
  }

  const alumnos = await obtenerAlumnosDelGrupo(grupoId);

  return (
    <div>
      <p className="text-sm text-zinc-600">
        <Link
          href={`/alumnos/grado/${contexto.gradoId}?ver=todos`}
          className="hover:underline"
        >
          ← {contexto.gradoNombre}
        </Link>{" "}
        / <span className="font-medium text-zinc-900">Grupo {contexto.grupoNombre}</span>
      </p>
      <div className="mt-1 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-zinc-900">
          Alumnos — {contexto.gradoNombre}, Grupo {contexto.grupoNombre}
        </h1>
        {puedeEditar && (
          <Link
            href={`/alumnos/grupo/${grupoId}/nuevo`}
            className="rounded-md bg-primario px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            Agregar alumno
          </Link>
        )}
      </div>

      {alumnos.length === 0 ? (
        <p className="mt-6 text-zinc-600">Todavía no hay alumnos registrados.</p>
      ) : (
        <table className="mt-6 w-full text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-zinc-500">
              <th className="py-2 font-medium">Nombre</th>
              <th className="py-2 font-medium">Matrícula</th>
              <th className="py-2 font-medium">Tutor</th>
              <th className="py-2 font-medium">Estatus</th>
              {puedeEditar && <th className="py-2 font-medium">Acciones</th>}
            </tr>
          </thead>
          <tbody>
            {alumnos.map((alumno) => (
              <tr key={alumno.id} className="border-b border-zinc-100">
                <td className="py-2 text-zinc-900">{formatearNombre(alumno)}</td>
                <td className="py-2 text-zinc-600">{alumno.matricula ?? "—"}</td>
                <td className="py-2 text-zinc-600">{alumno.tutor_nombre ?? "—"}</td>
                <td className="py-2 text-zinc-600">
                  {alumno.activo ? "Activo" : "Inactivo"}
                </td>
                {puedeEditar && (
                  <td className="py-2">
                    <Link
                      href={`/alumnos/grupo/${grupoId}/${alumno.id}/editar`}
                      className="text-primario hover:underline"
                    >
                      Editar
                    </Link>
                    <form
                      action={alternarActivoAlumno.bind(
                        null,
                        alumno.id,
                        grupoId,
                        alumno.activo
                      )}
                      className="inline"
                    >
                      <button type="submit" className="ml-3 text-zinc-600 hover:underline">
                        {alumno.activo ? "Dar de baja" : "Reactivar"}
                      </button>
                    </form>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

(El único cambio funcional además de agregar `requerirRolPagina` y las condicionales de `puedeEditar`: `obtenerAlumnosDelGrupo` ahora filtra embeds `null` en vez de asumir que `inscripcion.alumnos` siempre viene — ver Task 3, que hace este mismo cambio en el resto de los lugares con el mismo patrón. Se incluye aquí porque implica reescribir la función completa de todos modos.)

- [ ] **Step 9: Verificar el build**

Run: `npm run build`
Expected: build limpio.

- [ ] **Step 10: Correr la suite completa**

Run: `npm test`
Expected: todos los tests pasan (este módulo no tiene tests unitarios propios de página/Server Action — es I/O, mismo criterio que Materias/Calificaciones).

- [ ] **Step 11: Verificación manual (limitada — ver Global Constraints)**

No es posible simular una sesión de `docente` o `caja` real desde este entorno (requiere login real con enlace mágico). Verificar por lectura de código: confirmar que las 12 Server Actions y las 6 páginas efectivamente llaman a `requerirRol`/`requerirRolPagina` como primera instrucción (no después de ningún `await` a Supabase), y que `puedeEditar` controla exactamente los 2 lugares de la UI que deben ocultarse. Dejar constancia en el reporte de que la verificación con una cuenta `docente` real queda pendiente para el usuario.

- [ ] **Step 12: Commit**

```bash
git add src/app/\(dashboard\)/alumnos
git commit -m "feat: exigir login y roles en el módulo Alumnos"
```

---

### Task 2: Proteger Pagos y Asistencia, actualizar middleware

**Files:**
- Modify: `src/app/(dashboard)/pagos/page.tsx`
- Modify: `src/app/(dashboard)/asistencia/page.tsx`
- Modify: `src/middleware.ts`

**Interfaces:**
- Consumes: `requerirRolPagina` de `@/lib/perfiles/requerirRolPagina`.

- [ ] **Step 1: `src/app/(dashboard)/pagos/page.tsx` — reemplazo completo**

```tsx
import { requerirRolPagina } from "@/lib/perfiles/requerirRolPagina";

export default async function PagosPage() {
  await requerirRolPagina(["super_admin", "direccion", "caja"]);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900">Pagos</h1>
      <p className="mt-2 text-zinc-600">Próximamente.</p>
    </div>
  );
}
```

- [ ] **Step 2: `src/app/(dashboard)/asistencia/page.tsx` — reemplazo completo**

```tsx
import { requerirRolPagina } from "@/lib/perfiles/requerirRolPagina";

export default async function AsistenciaPage() {
  await requerirRolPagina(["super_admin", "direccion", "docente"]);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900">
        Listas / Asistencia
      </h1>
      <p className="mt-2 text-zinc-600">Próximamente.</p>
    </div>
  );
}
```

- [ ] **Step 3: Actualizar `src/middleware.ts`**

Cambiar la línea:

```ts
const RUTAS_PROTEGIDAS = ["/usuarios", "/materias", "/calificaciones", "/alumnos", "/pagos", "/asistencia"];
```

- [ ] **Step 4: Verificar el build**

Run: `npm run build`
Expected: build limpio.

- [ ] **Step 5: Correr la suite completa**

Run: `npm test`
Expected: todos los tests pasan.

- [ ] **Step 6: Commit**

```bash
git add src/app/\(dashboard\)/pagos/page.tsx src/app/\(dashboard\)/asistencia/page.tsx src/middleware.ts
git commit -m "feat: proteger Pagos y Asistencia con login y roles"
```

---

### Task 3: Fixes defensivos de embed nulo

**Files:**
- Modify: `src/lib/materias/roster.ts`
- Modify: `src/lib/calificaciones/roster.ts`

Nota: `alumnos/grupo/[grupoId]/page.tsx` ya recibió este mismo fix en el Task 1 (Step 8), como parte del reemplazo completo de ese archivo — no se repite aquí.

**Interfaces:**
- No cambia ninguna firma pública — mismo tipo de entrada/salida, solo cambia cómo se maneja un embed `null`.

- [ ] **Step 1: `src/lib/materias/roster.ts`**

En `obtenerAlumnosDelGrupoDeMateria`, cambiar:

```ts
  return (inscripciones ?? []).flatMap((inscripcion) => inscripcion.alumnos);
```

por:

```ts
  return (inscripciones ?? []).flatMap((inscripcion) =>
    inscripcion.alumnos ? [inscripcion.alumnos] : []
  );
```

En `obtenerAlumnosDeMateria`, cambiar:

```ts
  if (listaPropia && listaPropia.length > 0) {
    return listaPropia.flatMap((fila) => fila.alumnos);
  }
```

por:

```ts
  if (listaPropia && listaPropia.length > 0) {
    return listaPropia.flatMap((fila) => (fila.alumnos ? [fila.alumnos] : []));
  }
```

- [ ] **Step 2: `src/lib/calificaciones/roster.ts`**

En `obtenerAlumnosDeAsignacion`, cambiar:

```ts
  const alumnosDelGrupo = (inscripciones ?? []).flatMap((inscripcion) => inscripcion.alumnos);
```

por:

```ts
  const alumnosDelGrupo = (inscripciones ?? []).flatMap((inscripcion) =>
    inscripcion.alumnos ? [inscripcion.alumnos] : []
  );
```

y cambiar:

```ts
  const idsListaPropia = new Set(
    listaPropia.flatMap((fila) => fila.alumnos).map((alumno) => alumno.id)
  );
```

por:

```ts
  const idsListaPropia = new Set(
    listaPropia
      .flatMap((fila) => (fila.alumnos ? [fila.alumnos] : []))
      .map((alumno) => alumno.id)
  );
```

- [ ] **Step 3: Verificar el build**

Run: `npm run build`
Expected: build limpio.

- [ ] **Step 4: Correr la suite completa**

Run: `npm test`
Expected: todos los tests pasan (estas funciones no tienen test unitario propio, son I/O — el cambio es puramente defensivo, no cambia el comportamiento cuando el embed sí viene, que es el caso de hoy sin RLS activo).

- [ ] **Step 5: Commit**

```bash
git add src/lib/materias/roster.ts src/lib/calificaciones/roster.ts
git commit -m "fix: filtrar embeds nulos en funciones de roster para cuando RLS oculte filas"
```

---

### Task 4: Activar RLS

**Files:**
- Ninguno en el repo — este task solo aplica una migración a la base real.

**Interfaces:** ninguna.

Este task se ejecuta **después** de que los Tasks 1-3 ya están commiteados y verificados — es literalmente "encender el switch" ahora que el código que depende de las políticas ya existe.

- [ ] **Step 1: Aplicar la migración que activa RLS**

Vía `apply_migration`:

```sql
alter table configuracion enable row level security;
alter table ciclos_escolares enable row level security;
alter table niveles enable row level security;
alter table grados enable row level security;
alter table grupos enable row level security;
alter table materias enable row level security;
alter table alumnos enable row level security;
alter table inscripciones enable row level security;
alter table asignaciones enable row level security;
alter table materia_alumnos enable row level security;
alter table calificaciones enable row level security;
alter table conceptos_pago enable row level security;
alter table cargos enable row level security;
alter table pagos enable row level security;
alter table asistencias enable row level security;
```

- [ ] **Step 2: Verificar con `get_advisors` que ya no reporta tablas sin RLS**

Confirmar que el advisory `rls_disabled` deja de listar estas 15 tablas (o desaparece por completo, si `perfiles` era la única que ya estaba fuera de la lista).

- [ ] **Step 3: Verificación limitada por consulta directa**

Con el MCP de Supabase (que corre con privilegios de servicio y por lo tanto **no** se ve afectado por RLS), confirmar únicamente que las tablas siguen respondiendo con datos normalmente para una consulta administrativa simple (ej. `select count(*) from alumnos`) — esto NO prueba que las políticas filtran correctamente por rol, solo que la migración no rompió la tabla por un error de sintaxis o un typo en un nombre de columna. La prueba real de "cada rol ve exactamente lo que debe" requiere una sesión autenticada de verdad y queda fuera del alcance de esta verificación — ver Global Constraints y el reporte final del plan.

- [ ] **Step 4: Commit**

Este task no genera un commit de código (solo una migración de base de datos) — anotar en el reporte del task los resultados de `get_advisors` y de la verificación del Step 3. El siguiente task (Documentación) sí commitea el registro de esta migración en `database/schema.sql`.

---

### Task 5: Documentación

**Files:**
- Modify: `database/schema.sql`
- Modify: `CONTEXTO_CLAUDE_CODE.md`

- [ ] **Step 1: Actualizar `database/schema.sql`**

Agregar, después del bloque de "Captura de calificaciones" al final del archivo, las funciones helper, la corrección de la política de `perfiles`, todas las políticas nuevas (el bloque completo de SQL de "Prerequisites" arriba, tal cual), y al final los 15 `alter table ... enable row level security` del Task 4.

- [ ] **Step 2: Actualizar `CONTEXTO_CLAUDE_CODE.md`**

Agregar una entrada en "Estado actual" describiendo: las funciones helper nuevas y el patrón que extienden; la matriz de acceso por rol (Alumnos: admin+caja todo, docente solo lectura de sus propios grupos; Pagos: admin+caja; Asistencia: admin+docente scoped); que Alumnos/Pagos/Asistencia ahora exigen login (con la nota de que las Server Actions de Alumnos no tenían NINGÚN chequeo de rol hasta esta pieza, porque el módulo se construyó antes de que existiera login); el bug real encontrado y corregido (`direccion` no podía leer otros `perfiles`, lo que dejaba vacía la lista de maestros al asignar en Materias); y la limitación de verificación (ninguna política de RLS se pudo probar con una sesión real, solo se trazó contra la matriz del spec — pendiente explícito, con más peso que el de Captura de calificaciones por ser un asunto de seguridad). Actualizar "Próximos pasos pendientes": el pendiente de RLS que existía desde la pieza de Auth queda resuelto (marcarlo como completo), y agregar como nuevo pendiente #0 la verificación real con las 4 cuentas — mismo lugar donde ya vive el pendiente de probar Captura de calificaciones en el navegador, se pueden hacer juntos en la misma sesión de pruebas.

- [ ] **Step 3: Verificar build y suite completa**

Run: `npm run build && npm test`
Expected: build limpio, todos los tests pasan.

- [ ] **Step 4: Commit**

```bash
git add database/schema.sql CONTEXTO_CLAUDE_CODE.md
git commit -m "docs: documentar RLS completo y login en Alumnos/Pagos/Asistencia"
```
