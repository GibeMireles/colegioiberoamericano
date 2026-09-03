# Listas / Asistencia Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Captura de asistencia por maestro (por asignación, con estatus presente/ausente/retardo/justificado) y reporte de solo lectura para Coordinación (por grupo y fecha, resumiendo lo que cada maestro capturó) — tercer módulo del MVP.

**Architecture:** `asistencias` migra de scope por `grupo_id` a scope por `asignacion_id`, igual que `calificaciones`. La pantalla de captura reutiliza el mismo patrón de bloqueo-tras-guardar (`?editar=1`/`?guardado=1`) recién construido en Calificaciones, esta vez scoped también por fecha (`?fecha=`). El reporte es una navegación Nivel→Grado→Grupo de solo lectura (calcada de Materias) terminando en una matriz alumno × materia.

**Tech Stack:** Next.js 16 App Router, Supabase, Zod, Vitest — mismo stack del resto del proyecto, sin dependencias nuevas.

**Spec:** `docs/superpowers/specs/2026-09-03-asistencia-design.md`

## Global Constraints

- `asistencias` pasa a tener `asignacion_id` (no `grupo_id`) — una fila por alumno, por asignación, por fecha (`unique(asignacion_id, alumno_id, fecha)`).
- `estatus` es uno de `"presente" | "ausente" | "retardo" | "justificado"`, validado en Zod y reforzado con un `check` en la base.
- Coordinación (`super_admin`/`direccion`) NO tiene una captura propia de asistencia — solo un reporte de lectura que resume lo que cada maestro ya capturó. Nunca se escribe en `asistencias` desde el reporte.
- Acceso a una captura: el docente dueño de esa asignación, o `super_admin`/`direccion` — reutiliza `requerirAccesoAsignacion`/`requerirAccesoAsignacionPagina` ya existentes, sin cambios.
- Acceso al reporte: solo `super_admin`/`direccion`.
- RLS: reutiliza `docente_tiene_asignacion()` y `alumno_en_grupo_de_asignacion()` (ya existen, de Calificaciones) — la validación de roster se incluye desde el Prerequisites, no se deja para una revisión final como pasó en Calificaciones.
- El bloqueo tras guardar (mismo patrón `?editar=1`/`?guardado=1` de Calificaciones) es independiente por cada fecha — cambiar de fecha no hereda el estado de bloqueo de otra fecha.
- `obtenerAlumnosDeAsignacion` (ya existe en `src/lib/calificaciones/roster.ts`) se reutiliza tal cual para el roster de la captura de asistencia — es una función genérica de roster por asignación, no específica de calificaciones, aunque viva en ese archivo por dónde se construyó primero. No se mueve ni se duplica.

---

## Prerequisites (las ejecuta el orquestador antes del Task 1, no un subagente)

Aplicar esta migración a la base real vía `apply_migration`. Nota: hay que
soltar las políticas existentes de `asistencias` antes de poder soltar la
columna `grupo_id` (Postgres no deja soltar una columna referenciada por
una política).

```sql
-- ==========================================================
-- Asistencia: migrar de grupo_id a asignacion_id
-- ==========================================================

-- 1. Soltar políticas existentes (referencian grupo_id)
drop policy if exists "asistencias lectura admin" on asistencias;
drop policy if exists "asistencias lectura docente propio grupo" on asistencias;
drop policy if exists "asistencias escritura admin" on asistencias;
drop policy if exists "asistencias escritura docente propio grupo insert" on asistencias;
drop policy if exists "asistencias actualizacion admin" on asistencias;
drop policy if exists "asistencias actualizacion docente propio grupo" on asistencias;
drop policy if exists "asistencias borrado admin" on asistencias;

-- 2. Redefinir columnas
alter table asistencias drop column grupo_id;
alter table asistencias add column asignacion_id uuid not null references asignaciones(id);
alter table asistencias add constraint asistencias_estatus_check
  check (estatus = any (array['presente', 'ausente', 'retardo', 'justificado']));
create unique index idx_asistencias_unica on asistencias(asignacion_id, alumno_id, fecha);

-- 3. Recrear políticas scoped por asignacion_id (incluye validación de
--    roster desde el inicio, a diferencia de calificaciones que la
--    agregó después en una revisión final)
create policy "asistencias lectura admin" on asistencias
  for select using (es_super_admin_o_direccion());
create policy "asistencias lectura docente propia asignacion" on asistencias
  for select using (es_docente() and docente_tiene_asignacion(asignacion_id));
create policy "asistencias escritura admin insert" on asistencias
  for insert with check (es_super_admin_o_direccion());
create policy "asistencias escritura docente propia asignacion insert" on asistencias
  for insert with check (
    es_docente()
    and docente_tiene_asignacion(asignacion_id)
    and alumno_en_grupo_de_asignacion(asignacion_id, alumno_id)
  );
create policy "asistencias actualizacion admin" on asistencias
  for update using (es_super_admin_o_direccion()) with check (es_super_admin_o_direccion());
create policy "asistencias actualizacion docente propia asignacion" on asistencias
  for update using (es_docente() and docente_tiene_asignacion(asignacion_id))
  with check (
    es_docente()
    and docente_tiene_asignacion(asignacion_id)
    and alumno_en_grupo_de_asignacion(asignacion_id, alumno_id)
  );
create policy "asistencias borrado admin" on asistencias
  for delete using (es_super_admin_o_direccion());
```

---

### Task 1: Schema de validación

**Files:**
- Create: `src/lib/asistencia/schema.ts`
- Test: `src/lib/asistencia/schema.test.ts`

**Interfaces:**
- Produces: `export const asistenciaSchema`, `export type AsistenciaInput` — usado por el Task 2.

- [ ] **Step 1: Escribir el test que debe fallar**

Crear `src/lib/asistencia/schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { asistenciaSchema } from "./schema";

describe("asistenciaSchema", () => {
  it("acepta los 4 estatus válidos", () => {
    for (const estatus of ["presente", "ausente", "retardo", "justificado"]) {
      expect(asistenciaSchema.safeParse({ estatus }).success).toBe(true);
    }
  });

  it("rechaza un estatus no reconocido", () => {
    expect(asistenciaSchema.safeParse({ estatus: "tarde" }).success).toBe(false);
  });

  it("rechaza un estatus vacío", () => {
    expect(asistenciaSchema.safeParse({ estatus: "" }).success).toBe(false);
  });

  it("rechaza un estatus faltante", () => {
    expect(asistenciaSchema.safeParse({}).success).toBe(false);
  });
});
```

- [ ] **Step 2: Correr el test y confirmar que falla**

Run: `npx vitest run src/lib/asistencia/schema.test.ts`
Expected: FAIL — `Cannot find module './schema'`.

- [ ] **Step 3: Crear `src/lib/asistencia/schema.ts`**

```ts
import { z } from "zod";

export const asistenciaSchema = z.object({
  estatus: z.enum(["presente", "ausente", "retardo", "justificado"]),
});

export type AsistenciaInput = z.infer<typeof asistenciaSchema>;
```

- [ ] **Step 4: Correr el test y confirmar que pasa**

Run: `npx vitest run src/lib/asistencia/schema.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/asistencia/schema.ts src/lib/asistencia/schema.test.ts
git commit -m "feat: agregar validación de estatus de asistencia"
```

---

### Task 2: Pantalla de captura por asignación

**Files:**
- Create: `src/app/(dashboard)/asistencia/[asignacionId]/actions.ts`
- Create: `src/components/asistencia/TablaAsistencia.tsx`
- Create: `src/app/(dashboard)/asistencia/[asignacionId]/page.tsx`

**Interfaces:**
- Consumes: `requerirAccesoAsignacion`/`requerirAccesoAsignacionPagina` (ya existen), `obtenerAlumnosDeAsignacion` de `@/lib/calificaciones/roster` (ya existe, se reutiliza tal cual), `asistenciaSchema` (Task 1), `obtenerPerfilActual` de `@/lib/perfiles/actual` (ya existe).
- Produces: la ruta `/asistencia/[asignacionId]`.

- [ ] **Step 1: Crear `src/app/(dashboard)/asistencia/[asignacionId]/actions.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requerirAccesoAsignacion } from "@/lib/asignaciones/requerirAccesoAsignacion";
import { obtenerAlumnosDeAsignacion } from "@/lib/calificaciones/roster";
import { asistenciaSchema } from "@/lib/asistencia/schema";
import { obtenerPerfilActual } from "@/lib/perfiles/actual";

export async function guardarAsistencia(asignacionId: string, formData: FormData) {
  await requerirAccesoAsignacion(asignacionId);

  const fecha = formData.get("fecha");
  if (typeof fecha !== "string" || fecha.trim().length === 0) {
    throw new Error("Falta la fecha.");
  }

  const perfil = await obtenerPerfilActual();
  const alumnos = await obtenerAlumnosDeAsignacion(asignacionId);
  const supabase = await createClient();

  const filas = alumnos.map((alumno) => {
    const { estatus } = asistenciaSchema.parse({
      estatus: formData.get(`estatus-${alumno.id}`) ?? undefined,
    });

    return {
      asignacion_id: asignacionId,
      alumno_id: alumno.id,
      fecha,
      estatus,
      registrado_por: perfil?.id ?? null,
    };
  });

  if (filas.length > 0) {
    const { error } = await supabase
      .from("asistencias")
      .upsert(filas, { onConflict: "asignacion_id,alumno_id,fecha" });

    if (error) {
      throw new Error(`No se pudo guardar la asistencia: ${error.message}`);
    }
  }

  revalidatePath(`/asistencia/${asignacionId}`);
  redirect(`/asistencia/${asignacionId}?fecha=${fecha}&guardado=1`);
}
```

- [ ] **Step 2: Crear `src/components/asistencia/TablaAsistencia.tsx`**

```tsx
export interface FilaAsistencia {
  alumnoId: string;
  nombre: string;
  estatus: "presente" | "ausente" | "retardo" | "justificado";
}

const ETIQUETAS: Record<FilaAsistencia["estatus"], string> = {
  presente: "Presente",
  ausente: "Ausente",
  retardo: "Retardo",
  justificado: "Justificado",
};

export function TablaAsistencia({
  filas,
  accionGuardar,
  fecha,
  soloLectura = false,
}: {
  filas: FilaAsistencia[];
  accionGuardar: (formData: FormData) => void | Promise<void>;
  fecha: string;
  soloLectura?: boolean;
}) {
  const Wrapper = soloLectura ? "div" : "form";
  const wrapperProps = soloLectura ? {} : { action: accionGuardar };

  return (
    <Wrapper {...wrapperProps} className="mt-6 overflow-x-auto">
      {!soloLectura && <input type="hidden" name="fecha" value={fecha} />}
      <table className="min-w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-left text-xs font-medium text-zinc-500">
            <th className="p-2">Alumno</th>
            <th className="p-2">Estatus</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((fila) => (
            <tr key={fila.alumnoId} className="border-b border-zinc-100">
              <td className="p-2 font-medium text-zinc-900">{fila.nombre}</td>
              <td className="p-2">
                {soloLectura ? (
                  <span className="text-zinc-600">{ETIQUETAS[fila.estatus]}</span>
                ) : (
                  <select
                    name={`estatus-${fila.alumnoId}`}
                    defaultValue={fila.estatus}
                    className="rounded-md border border-zinc-300 px-2 py-1 text-sm"
                  >
                    <option value="presente">Presente</option>
                    <option value="ausente">Ausente</option>
                    <option value="retardo">Retardo</option>
                    <option value="justificado">Justificado</option>
                  </select>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!soloLectura && (
        <button
          type="submit"
          className="mt-4 rounded-md bg-primario px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          Guardar asistencia
        </button>
      )}
    </Wrapper>
  );
}
```

- [ ] **Step 3: Crear `src/app/(dashboard)/asistencia/[asignacionId]/page.tsx`**

```tsx
import { createClient } from "@/lib/supabase/server";
import { requerirAccesoAsignacionPagina } from "@/lib/asignaciones/requerirAccesoAsignacionPagina";
import { obtenerAlumnosDeAsignacion } from "@/lib/calificaciones/roster";
import { TablaAsistencia, type FilaAsistencia } from "@/components/asistencia/TablaAsistencia";
import { guardarAsistencia } from "./actions";

export const dynamic = "force-dynamic";

interface ContextoAsignacion {
  materiaNombre: string;
  gradoNombre: string;
  grupoNombre: string;
}

async function obtenerContexto(materiaId: string, grupoId: string): Promise<ContextoAsignacion> {
  const supabase = await createClient();

  const { data: materia } = await supabase
    .from("materias")
    .select("nombre, grado_id")
    .eq("id", materiaId)
    .single();

  const { data: grado } = materia
    ? await supabase.from("grados").select("nombre").eq("id", materia.grado_id).single()
    : { data: null };

  const { data: grupo } = await supabase.from("grupos").select("nombre").eq("id", grupoId).single();

  return {
    materiaNombre: materia?.nombre ?? "?",
    gradoNombre: grado?.nombre ?? "?",
    grupoNombre: grupo?.nombre ?? "?",
  };
}

function fechaDeHoy(): string {
  return new Date().toISOString().slice(0, 10);
}

interface FilasAsistencia {
  filas: FilaAsistencia[];
  hayGuardadas: boolean;
}

async function obtenerFilasAsistencia(asignacionId: string, fecha: string): Promise<FilasAsistencia> {
  const alumnos = await obtenerAlumnosDeAsignacion(asignacionId);
  const supabase = await createClient();

  const { data: asistencias, error } = await supabase
    .from("asistencias")
    .select("alumno_id, estatus")
    .eq("asignacion_id", asignacionId)
    .eq("fecha", fecha);

  if (error) {
    throw new Error(`No se pudo cargar la asistencia: ${error.message}`);
  }

  const porAlumno = new Map((asistencias ?? []).map((fila) => [fila.alumno_id, fila.estatus]));

  const filas = alumnos
    .map((alumno) => {
      const apellidos = [alumno.apellido_paterno, alumno.apellido_materno]
        .filter((valor): valor is string => Boolean(valor))
        .join(" ");

      return {
        alumnoId: alumno.id,
        nombre: apellidos ? `${apellidos}, ${alumno.nombres}` : alumno.nombres,
        estatus: (porAlumno.get(alumno.id) ?? "presente") as FilaAsistencia["estatus"],
      };
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

  return { filas, hayGuardadas: (asistencias ?? []).length > 0 };
}

export default async function AsistenciaAsignacionPage({
  params,
  searchParams,
}: {
  params: Promise<{ asignacionId: string }>;
  searchParams: Promise<{ fecha?: string; editar?: string; guardado?: string }>;
}) {
  const { asignacionId } = await params;
  const { fecha: fechaParam, editar, guardado } = await searchParams;
  const asignacion = await requerirAccesoAsignacionPagina(asignacionId);
  const contexto = await obtenerContexto(asignacion.materia_id, asignacion.grupo_id);

  const fecha = fechaParam && fechaParam.trim().length > 0 ? fechaParam : fechaDeHoy();

  const { filas, hayGuardadas } = await obtenerFilasAsistencia(asignacionId, fecha);
  const soloLectura = hayGuardadas && editar !== "1";

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900">
        {contexto.materiaNombre} — {contexto.gradoNombre}, Grupo {contexto.grupoNombre}
      </h1>

      {guardado === "1" && (
        <p className="mt-4 rounded-md bg-green-50 px-4 py-2 text-sm font-medium text-green-800">
          ✓ Se ha guardado la asistencia.
        </p>
      )}

      <form method="get" className="mt-4 flex items-center gap-2">
        <label className="text-sm font-medium text-zinc-700" htmlFor="fecha">
          Fecha
        </label>
        <input
          type="date"
          id="fecha"
          name="fecha"
          defaultValue={fecha}
          className="rounded-md border border-zinc-300 px-2 py-1 text-sm"
        />
        <button
          type="submit"
          className="rounded-md border border-zinc-300 px-3 py-1 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
        >
          Ver
        </button>
      </form>

      {filas.length === 0 ? (
        <p className="mt-6 text-zinc-600">Este grupo todavía no tiene alumnos.</p>
      ) : (
        <>
          {soloLectura && (
            <a
              href={`/asistencia/${asignacionId}?fecha=${fecha}&editar=1`}
              className="mt-6 inline-block text-sm font-medium text-primario hover:underline"
            >
              Editar asistencia
            </a>
          )}
          <TablaAsistencia
            filas={filas}
            accionGuardar={guardarAsistencia.bind(null, asignacionId)}
            fecha={fecha}
            soloLectura={soloLectura}
          />
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Verificar el build**

Run: `npm run build`
Expected: build limpio.

- [ ] **Step 5: Correr la suite completa**

Run: `npm test`
Expected: todos los tests pasan.

- [ ] **Step 6: Verificación manual**

Con `npm run dev` corriendo y sesión de `super_admin`/`direccion`: entrar
a `/asistencia/[asignacionId]` de una asignación real (con alumnos),
confirmar que todos aparecen precargados en "Presente", cambiar el
estatus de 1-2 alumnos, guardar, confirmar el mensaje y que la tabla
queda en solo lectura. Cambiar la fecha (selector) a otro día y
confirmar que ese día aparece sin capturar (todos en "Presente" de
nuevo, editable) — el bloqueo de un día no afecta a otro. Volver al día
ya guardado y confirmar que sigue bloqueado con los valores correctos.

- [ ] **Step 7: Commit**

```bash
git add src/app/\(dashboard\)/asistencia/\[asignacionId\] src/components/asistencia/TablaAsistencia.tsx
git commit -m "feat: agregar captura de asistencia por asignación"
```

---

### Task 3: Lista de asistencias (landing)

**Files:**
- Modify: `src/app/(dashboard)/asistencia/page.tsx`

**Interfaces:**
- Produces: la ruta `/asistencia` (reemplaza el placeholder). Enlaza a
  `/asistencia/[asignacionId]` (Task 2, ya existe) y a
  `/asistencia/reporte` (Task 4 — dead link corto entre tasks, mismo
  patrón ya aceptado en piezas anteriores).

- [ ] **Step 1: Reemplazar `src/app/(dashboard)/asistencia/page.tsx`**

```tsx
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requerirRolPagina } from "@/lib/perfiles/requerirRolPagina";
import { obtenerCicloActivoId } from "@/lib/ciclos/activo";
import type { PerfilActual } from "@/lib/perfiles/actual";

export const dynamic = "force-dynamic";

interface AsignacionListado {
  id: string;
  materiaNombre: string;
  gradoNombre: string;
  grupoNombre: string;
  docenteNombre: string;
}

async function obtenerAsignacionesVisibles(
  perfil: PerfilActual,
  cicloId: string
): Promise<AsignacionListado[]> {
  const supabase = await createClient();

  let consulta = supabase
    .from("asignaciones")
    .select("id, materia_id, grupo_id, docente_perfil_id")
    .eq("ciclo_escolar_id", cicloId);

  if (perfil.rol === "docente") {
    consulta = consulta.eq("docente_perfil_id", perfil.id);
  }

  const { data, error } = await consulta;

  if (error) {
    throw new Error(`No se pudieron cargar las asignaciones: ${error.message}`);
  }

  return Promise.all(
    (data ?? []).map(async (asignacion) => {
      const { data: materia } = await supabase
        .from("materias")
        .select("nombre, grado_id")
        .eq("id", asignacion.materia_id)
        .single();

      const { data: grado } = materia
        ? await supabase.from("grados").select("nombre").eq("id", materia.grado_id).single()
        : { data: null };

      const { data: grupo } = await supabase
        .from("grupos")
        .select("nombre")
        .eq("id", asignacion.grupo_id)
        .single();

      const { data: docente } = await supabase
        .from("perfiles")
        .select("nombre_completo")
        .eq("id", asignacion.docente_perfil_id)
        .single();

      return {
        id: asignacion.id,
        materiaNombre: materia?.nombre ?? "?",
        gradoNombre: grado?.nombre ?? "?",
        grupoNombre: grupo?.nombre ?? "?",
        docenteNombre: docente?.nombre_completo ?? "?",
      };
    })
  );
}

export default async function AsistenciaPage() {
  const perfil = await requerirRolPagina(["super_admin", "direccion", "docente"]);

  const cicloId = await obtenerCicloActivoId();
  if (!cicloId) {
    throw new Error("No hay un ciclo escolar activo.");
  }

  const asignaciones = await obtenerAsignacionesVisibles(perfil, cicloId);
  const esDocente = perfil.rol === "docente";

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-zinc-900">
          {esDocente ? "Mis materias" : "Listas / Asistencia"}
        </h1>
        {!esDocente && (
          <Link
            href="/asistencia/reporte"
            className="text-sm font-medium text-primario hover:underline"
          >
            Reporte por grupo
          </Link>
        )}
      </div>

      {asignaciones.length === 0 ? (
        <p className="mt-6 text-zinc-600">
          {esDocente
            ? "Todavía no tienes materias asignadas."
            : "Todavía no hay asignaciones registradas."}
        </p>
      ) : (
        <div className="mt-6 space-y-2">
          {asignaciones.map((asignacion) => (
            <Link
              key={asignacion.id}
              href={`/asistencia/${asignacion.id}`}
              className="block rounded-md border border-zinc-200 p-3 hover:bg-zinc-50"
            >
              <div className="font-medium text-zinc-900">{asignacion.materiaNombre}</div>
              <div className="text-sm text-zinc-600">
                {asignacion.gradoNombre} — Grupo {asignacion.grupoNombre} — {asignacion.docenteNombre}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verificar el build**

Run: `npm run build`
Expected: build limpio.

- [ ] **Step 3: Correr la suite completa**

Run: `npm test`
Expected: todos los tests pasan.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(dashboard\)/asistencia/page.tsx
git commit -m "feat: agregar lista de asistencias"
```

---

### Task 4: Reporte por grupo (Coordinación)

**Files:**
- Create: `src/app/(dashboard)/asistencia/reporte/page.tsx`
- Create: `src/app/(dashboard)/asistencia/reporte/nivel/[nivelId]/page.tsx`
- Create: `src/app/(dashboard)/asistencia/reporte/grado/[gradoId]/page.tsx`
- Create: `src/app/(dashboard)/asistencia/reporte/grupo/[grupoId]/page.tsx`

**Interfaces:**
- Consumes: `TarjetaNavegacion` de `@/components/materias/TarjetaNavegacion` (ya existe, se reutiliza), `obtenerCicloActivoId` (ya existe).
- Produces: las rutas `/asistencia/reporte`, `/asistencia/reporte/nivel/[nivelId]`, `/asistencia/reporte/grado/[gradoId]`, `/asistencia/reporte/grupo/[grupoId]`. Todas de solo lectura, solo `super_admin`/`direccion`.

- [ ] **Step 1: Crear `src/app/(dashboard)/asistencia/reporte/page.tsx`**

```tsx
import { createClient } from "@/lib/supabase/server";
import { requerirRolPagina } from "@/lib/perfiles/requerirRolPagina";
import { TarjetaNavegacion } from "@/components/materias/TarjetaNavegacion";

export const dynamic = "force-dynamic";

const COLORES_NIVEL = ["#E3312D", "#c02926", "#8a3a38", "#5a2a29"];

interface NivelConConteo {
  id: string;
  nombre: string;
  cantidadGrados: number;
}

async function obtenerNiveles(): Promise<NivelConConteo[]> {
  const supabase = await createClient();

  const { data: niveles, error } = await supabase
    .from("niveles")
    .select("id, nombre")
    .order("orden");

  if (error) {
    throw new Error(`No se pudieron cargar los niveles: ${error.message}`);
  }

  return Promise.all(
    (niveles ?? []).map(async (nivel) => {
      const { count } = await supabase
        .from("grados")
        .select("id", { count: "exact", head: true })
        .eq("nivel_id", nivel.id);

      return { id: nivel.id, nombre: nivel.nombre, cantidadGrados: count ?? 0 };
    })
  );
}

export default async function ReporteAsistenciaPage() {
  await requerirRolPagina(["super_admin", "direccion"]);

  const niveles = await obtenerNiveles();

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900">Reporte de asistencia</h1>
      <p className="mt-1 text-sm text-zinc-600">Elige un nivel para ver sus grados.</p>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {niveles.map((nivel, indice) => (
          <TarjetaNavegacion
            key={nivel.id}
            nombre={nivel.nombre}
            subtitulo={`${nivel.cantidadGrados} grado${nivel.cantidadGrados === 1 ? "" : "s"}`}
            href={`/asistencia/reporte/nivel/${nivel.id}`}
            color={COLORES_NIVEL[indice % COLORES_NIVEL.length]}
          />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Crear `src/app/(dashboard)/asistencia/reporte/nivel/[nivelId]/page.tsx`**

```tsx
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requerirRolPagina } from "@/lib/perfiles/requerirRolPagina";
import { TarjetaNavegacion } from "@/components/materias/TarjetaNavegacion";

export const dynamic = "force-dynamic";

const COLORES_GRADO = ["#E3312D", "#c02926", "#8a3a38", "#5a2a29"];

interface GradoSimple {
  id: string;
  nombre: string;
}

export default async function ReporteNivelPage({
  params,
}: {
  params: Promise<{ nivelId: string }>;
}) {
  await requerirRolPagina(["super_admin", "direccion"]);

  const { nivelId } = await params;
  const supabase = await createClient();

  const { data: nivel, error: errorNivel } = await supabase
    .from("niveles")
    .select("nombre")
    .eq("id", nivelId)
    .single();

  if (errorNivel || !nivel) {
    notFound();
  }

  const { data: grados, error: errorGrados } = await supabase
    .from("grados")
    .select("id, nombre")
    .eq("nivel_id", nivelId)
    .order("orden");

  if (errorGrados) {
    throw new Error(`No se pudieron cargar los grados: ${errorGrados.message}`);
  }

  const gradosSimples: GradoSimple[] = grados ?? [];

  if (gradosSimples.length === 1) {
    redirect(`/asistencia/reporte/grado/${gradosSimples[0].id}`);
  }

  return (
    <div>
      <p className="text-sm text-zinc-600">
        <Link href="/asistencia/reporte" className="hover:underline">
          ← Niveles
        </Link>{" "}
        / <span className="font-medium text-zinc-900">{nivel.nombre}</span>
      </p>
      <h1 className="mt-1 text-2xl font-semibold text-zinc-900">{nivel.nombre}</h1>

      {gradosSimples.length === 0 && (
        <p className="mt-6 text-zinc-600">Este nivel todavía no tiene grados.</p>
      )}

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        {gradosSimples.map((grado, indice) => (
          <TarjetaNavegacion
            key={grado.id}
            nombre={grado.nombre}
            subtitulo="Ver grupos"
            href={`/asistencia/reporte/grado/${grado.id}`}
            color={COLORES_GRADO[indice % COLORES_GRADO.length]}
          />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Crear `src/app/(dashboard)/asistencia/reporte/grado/[gradoId]/page.tsx`**

```tsx
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requerirRolPagina } from "@/lib/perfiles/requerirRolPagina";
import { TarjetaNavegacion } from "@/components/materias/TarjetaNavegacion";

export const dynamic = "force-dynamic";

const COLORES_GRUPO = ["#E3312D", "#c02926", "#8a3a38", "#5a2a29"];

interface GrupoSimple {
  id: string;
  nombre: string;
}

export default async function ReporteGradoPage({
  params,
}: {
  params: Promise<{ gradoId: string }>;
}) {
  await requerirRolPagina(["super_admin", "direccion"]);

  const { gradoId } = await params;
  const supabase = await createClient();

  const { data: grado, error: errorGrado } = await supabase
    .from("grados")
    .select("nombre, nivel_id")
    .eq("id", gradoId)
    .single();

  if (errorGrado || !grado) {
    notFound();
  }

  const { data: nivel } = await supabase
    .from("niveles")
    .select("nombre")
    .eq("id", grado.nivel_id)
    .single();

  const { data: grupos, error: errorGrupos } = await supabase
    .from("grupos")
    .select("id, nombre")
    .eq("grado_id", gradoId)
    .order("nombre");

  if (errorGrupos) {
    throw new Error(`No se pudieron cargar los grupos: ${errorGrupos.message}`);
  }

  const gruposSimples: GrupoSimple[] = grupos ?? [];

  if (gruposSimples.length === 1) {
    redirect(`/asistencia/reporte/grupo/${gruposSimples[0].id}`);
  }

  return (
    <div>
      <p className="text-sm text-zinc-600">
        <Link href="/asistencia/reporte" className="hover:underline">
          ← Niveles
        </Link>{" "}
        /{" "}
        {nivel && (
          <>
            <Link
              href={`/asistencia/reporte/nivel/${grado.nivel_id}`}
              className="hover:underline"
            >
              {nivel.nombre}
            </Link>{" "}
            /{" "}
          </>
        )}
        <span className="font-medium text-zinc-900">{grado.nombre}</span>
      </p>
      <h1 className="mt-1 text-2xl font-semibold text-zinc-900">{grado.nombre}</h1>

      {gruposSimples.length === 0 && (
        <p className="mt-6 text-zinc-600">Este grado todavía no tiene grupos.</p>
      )}

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        {gruposSimples.map((grupo, indice) => (
          <TarjetaNavegacion
            key={grupo.id}
            nombre={`Grupo ${grupo.nombre}`}
            subtitulo="Ver asistencia"
            href={`/asistencia/reporte/grupo/${grupo.id}`}
            color={COLORES_GRUPO[indice % COLORES_GRUPO.length]}
          />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Crear `src/app/(dashboard)/asistencia/reporte/grupo/[grupoId]/page.tsx`**

```tsx
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requerirRolPagina } from "@/lib/perfiles/requerirRolPagina";
import { obtenerCicloActivoId } from "@/lib/ciclos/activo";

export const dynamic = "force-dynamic";

interface AlumnoSimple {
  id: string;
  nombre: string;
}

interface MateriaColumna {
  asignacionId: string;
  materiaNombre: string;
}

function fechaDeHoy(): string {
  return new Date().toISOString().slice(0, 10);
}

async function obtenerAlumnosDelGrupo(grupoId: string): Promise<AlumnoSimple[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("inscripciones")
    .select("alumnos(id, nombres, apellido_paterno, apellido_materno)")
    .eq("grupo_id", grupoId);

  if (error) {
    throw new Error(`No se pudo cargar la lista de alumnos: ${error.message}`);
  }

  return (data ?? [])
    .flatMap((fila) => (fila.alumnos ? [fila.alumnos] : []))
    .map((alumno) => {
      const apellidos = [alumno.apellido_paterno, alumno.apellido_materno]
        .filter((valor): valor is string => Boolean(valor))
        .join(" ");

      return {
        id: alumno.id,
        nombre: apellidos ? `${apellidos}, ${alumno.nombres}` : alumno.nombres,
      };
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

async function obtenerMateriasDelGrupo(
  grupoId: string,
  cicloId: string
): Promise<MateriaColumna[]> {
  const supabase = await createClient();

  const { data: asignaciones, error } = await supabase
    .from("asignaciones")
    .select("id, materia_id")
    .eq("grupo_id", grupoId)
    .eq("ciclo_escolar_id", cicloId);

  if (error) {
    throw new Error(`No se pudieron cargar las materias: ${error.message}`);
  }

  return Promise.all(
    (asignaciones ?? []).map(async (asignacion) => {
      const { data: materia } = await supabase
        .from("materias")
        .select("nombre")
        .eq("id", asignacion.materia_id)
        .single();

      return { asignacionId: asignacion.id, materiaNombre: materia?.nombre ?? "?" };
    })
  );
}

async function obtenerEstatusPorCelda(
  asignacionIds: string[],
  fecha: string
): Promise<Map<string, string>> {
  if (asignacionIds.length === 0) {
    return new Map();
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("asistencias")
    .select("asignacion_id, alumno_id, estatus")
    .in("asignacion_id", asignacionIds)
    .eq("fecha", fecha);

  if (error) {
    throw new Error(`No se pudo cargar la asistencia: ${error.message}`);
  }

  return new Map((data ?? []).map((fila) => [`${fila.asignacion_id}:${fila.alumno_id}`, fila.estatus]));
}

const ETIQUETAS: Record<string, string> = {
  presente: "Presente",
  ausente: "Ausente",
  retardo: "Retardo",
  justificado: "Justificado",
};

export default async function ReporteGrupoPage({
  params,
  searchParams,
}: {
  params: Promise<{ grupoId: string }>;
  searchParams: Promise<{ fecha?: string }>;
}) {
  await requerirRolPagina(["super_admin", "direccion"]);

  const { grupoId } = await params;
  const { fecha: fechaParam } = await searchParams;
  const fecha = fechaParam && fechaParam.trim().length > 0 ? fechaParam : fechaDeHoy();

  const supabase = await createClient();
  const { data: grupo, error: errorGrupo } = await supabase
    .from("grupos")
    .select("nombre")
    .eq("id", grupoId)
    .single();

  if (errorGrupo || !grupo) {
    notFound();
  }

  const cicloId = await obtenerCicloActivoId();
  if (!cicloId) {
    throw new Error("No hay un ciclo escolar activo.");
  }

  const [alumnos, materias] = await Promise.all([
    obtenerAlumnosDelGrupo(grupoId),
    obtenerMateriasDelGrupo(grupoId, cicloId),
  ]);

  const celdas = await obtenerEstatusPorCelda(
    materias.map((m) => m.asignacionId),
    fecha
  );

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900">
        Asistencia — Grupo {grupo.nombre}
      </h1>

      <form method="get" className="mt-4 flex items-center gap-2">
        <label className="text-sm font-medium text-zinc-700" htmlFor="fecha">
          Fecha
        </label>
        <input
          type="date"
          id="fecha"
          name="fecha"
          defaultValue={fecha}
          className="rounded-md border border-zinc-300 px-2 py-1 text-sm"
        />
        <button
          type="submit"
          className="rounded-md border border-zinc-300 px-3 py-1 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
        >
          Ver
        </button>
      </form>

      {alumnos.length === 0 ? (
        <p className="mt-6 text-zinc-600">Este grupo todavía no tiene alumnos.</p>
      ) : materias.length === 0 ? (
        <p className="mt-6 text-zinc-600">Este grupo todavía no tiene materias asignadas.</p>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs font-medium text-zinc-500">
                <th className="p-2">Alumno</th>
                {materias.map((materia) => (
                  <th key={materia.asignacionId} className="p-2">
                    {materia.materiaNombre}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {alumnos.map((alumno) => (
                <tr key={alumno.id} className="border-b border-zinc-100">
                  <td className="p-2 font-medium text-zinc-900">{alumno.nombre}</td>
                  {materias.map((materia) => {
                    const estatus = celdas.get(`${materia.asignacionId}:${alumno.id}`);
                    return (
                      <td key={materia.asignacionId} className="p-2 text-zinc-600">
                        {estatus ? ETIQUETAS[estatus] : "—"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Verificar el build**

Run: `npm run build`
Expected: build limpio.

- [ ] **Step 6: Correr la suite completa**

Run: `npm test`
Expected: todos los tests pasan.

- [ ] **Step 7: Verificación manual**

Con `npm run dev` corriendo y sesión de `super_admin`/`direccion`: entrar
a `/asistencia/reporte`, navegar hasta un grupo con materias asignadas y
alumnos inscritos, confirmar que la matriz muestra "—" en todo (nada
capturado). Capturar asistencia real para una de esas materias (Task 2)
y confirmar que la celda correspondiente en el reporte cambia a
mostrar el estatus correcto, sin afectar las demás columnas.

- [ ] **Step 8: Commit**

```bash
git add src/app/\(dashboard\)/asistencia/reporte
git commit -m "feat: agregar reporte de asistencia por grupo"
```

---

### Task 5: Documentación

**Files:**
- Modify: `database/schema.sql`
- Modify: `CONTEXTO_CLAUDE_CODE.md`

- [ ] **Step 1: Actualizar `database/schema.sql`**

Agregar, después del bloque más reciente al final del archivo, el SQL
completo de "Prerequisites" de este plan (soltar políticas, redefinir
columnas, recrear políticas) tal cual se aplicó.

- [ ] **Step 2: Actualizar `CONTEXTO_CLAUDE_CODE.md`**

Agregar una entrada en "Estado actual" describiendo: la migración de
`asistencias` de `grupo_id` a `asignacion_id` (mismo patrón que
`calificaciones`, con la validación de roster incluida desde el
principio, a diferencia de Calificaciones que la agregó después); la
captura por maestro con bloqueo-tras-guardar scoped por fecha; el
reporte de solo lectura para Coordinación que resume las capturas por
grupo y fecha, sin captura propia. Notar que con esto los 3 módulos del
MVP (Alumnos, Calificaciones, Asistencia) tienen funcionalidad real —
falta solo Pagos. Actualizar "Alcance del MVP" y "Próximos pasos
pendientes" para reflejar que Asistencia ya no está pendiente.

- [ ] **Step 3: Verificar build y suite completa**

Run: `npm run build && npm test`
Expected: build limpio, todos los tests pasan.

- [ ] **Step 4: Commit**

```bash
git add database/schema.sql CONTEXTO_CLAUDE_CODE.md
git commit -m "docs: documentar Listas/Asistencia"
```
