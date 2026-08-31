# Alumnos — Navegación y Gestión por Nivel/Grado/Grupo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the alumnos module's single hardcoded grupo (env vars) with real navigation — Nivel → Grado → Grupo cards — and let staff create/rename/delete (when empty) niveles, grados, and grupos directly from those cards, no SQL needed going forward.

**Architecture:** `niveles` becomes a real table (was going to be a hardcoded constant, promoted to a table once the user asked for full CRUD on it). Three new card-grid Server Component pages (nivel/grado/grupo), each with a "skip when there's exactly one child" redirect, feeding into the existing alumno roster/alta/edición pages — now parameterized by the real `grupoId` from the URL instead of `GRUPO_PILOTO_ID`. Structure CRUD (crear/renombrar/eliminar) is 9 small Server Actions in one file, called from two new shared client components (`TarjetaEditable`, `TarjetaAgregar`) that toggle inline forms — no separate admin screen.

**Tech Stack:** Same as the rest of the project — Next.js 16 (App Router) / React 19 / TypeScript, `@supabase/supabase-js`, `zod`, Tailwind CSS v4, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-31-alumnos-nivel-grado-grupo-design.md`

## Global Constraints

- **Never use a nested Supabase `.select()` embed** (e.g. `.select("grados(nombre)")`). Without generated `Database` types, postgrest-js can't infer FK cardinality and types every embed as an array even for to-one relationships, which fails to typecheck against a single-object usage — this bit the previous plan's listing page and needed a fix round. Always resolve a related row with a **second, flat, separate query** instead (see `src/lib/grupos/piloto.ts`'s now-retired pattern for the shape to follow: `.from("x").select("...").eq("id", y).single()`, then a second call for the related table).
- No icon library exists in this project (checked `package.json` — none). Use plain text buttons ("Renombrar", "Eliminar", "+ Agregar {tipo}"), not icons.
- **Eliminar is always blocked when the entity has children** (a nivel with grados, a grado with grupos, a grupo with inscripciones) — enforced in the UI (disabled control) **and independently re-checked in the Server Action** (never trust the UI-side disable alone).
- Writes only via Server Actions (`"use server"`), using `createClient()` from `@/lib/supabase/server` — never the service role key.
- UI copy in Spanish. Reuse existing Tailwind conventions: `bg-primario` for primary buttons, `text-zinc-900`/`text-zinc-600` for headings/secondary text, `rounded-2xl` for the nivel/grado/grupo cards (matches the brainstorming session's approved "Estilo A" — solid-color rounded cards).
- No login/roles/RLS work — out of scope, untouched by this plan.
- No admin screen separate from the card navigation — every create/rename/delete happens inline on the Nivel/Grado/Grupo card screens.

## Prerequisito (antes de la Tarea 1) — controller runs this, not a dispatched task

This is a live schema change on the real Supabase project (`elhgncefzpttarpaxbzm`), which already has real data (2 alumnos, 1 grado, 1 grupo). It is additive and non-destructive (new table, nullable-then-backfilled column, no data deleted), but it's still a live-DB change — **confirm with the user before running it**, don't run it automatically when execution starts.

```sql
create table niveles (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  orden int
);

alter table grados add column nivel_id uuid references niveles(id);

create unique index idx_grados_nombre_por_nivel on grados(nivel_id, nombre);
create unique index idx_grupos_nombre_por_grado on grupos(grado_id, ciclo_escolar_id, nombre);
```

Then seed the 4 initial niveles and backfill the existing grado:

```sql
insert into niveles (nombre, orden) values
  ('Villa', 1), ('Primaria', 2), ('Secundaria', 3), ('Preparatoria', 4);

update grados set nivel_id = (select id from niveles where nombre = 'Preparatoria')
  where nombre = '1° Preparatoria';

alter table grados alter column nivel_id set not null;
```

(The last `alter ... set not null` only succeeds because the single existing grado row was just backfilled — safe today, would fail if run before the backfill or if another grado existed without a nivel_id.)

After this runs, `GRUPO_PILOTO_ID` and `CICLO_PILOTO_ID` are still valid env vars pointing at real rows until Task 4 retires their usage in code — no rush to remove them from `.env.local` before then.

---

### Task 1: Estructura Zod schema (TDD)

**Files:**
- Create: `src/lib/estructura/schema.ts`
- Test: `src/lib/estructura/schema.test.ts`

**Interfaces:**
- Produces: `nombreEstructuraSchema: ZodObject` and `type NombreEstructuraInput` from `src/lib/estructura/schema.ts`, imported by Task 2 (`estructura-actions.ts`).

- [ ] **Step 1: Write the failing tests**

`src/lib/estructura/schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { nombreEstructuraSchema } from "./schema";

describe("nombreEstructuraSchema", () => {
  it("accepts a valid nombre", () => {
    const result = nombreEstructuraSchema.safeParse({ nombre: "Primaria" });
    expect(result.success).toBe(true);
  });

  it("trims surrounding whitespace", () => {
    const result = nombreEstructuraSchema.safeParse({ nombre: "  Primaria  " });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.nombre).toBe("Primaria");
    }
  });

  it("rejects a missing nombre", () => {
    const result = nombreEstructuraSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects an empty nombre", () => {
    const result = nombreEstructuraSchema.safeParse({ nombre: "   " });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/estructura/schema.test.ts`
Expected: FAIL — `Cannot find module './schema'`.

- [ ] **Step 3: Write the schema**

`src/lib/estructura/schema.ts`:

```ts
import { z } from "zod";

export const nombreEstructuraSchema = z.object({
  nombre: z.string().trim().min(1, "El nombre es requerido"),
});

export type NombreEstructuraInput = z.infer<typeof nombreEstructuraSchema>;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/estructura/schema.test.ts`
Expected: PASS, all 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/estructura/schema.ts src/lib/estructura/schema.test.ts
git commit -m "feat: add estructura (nivel/grado/grupo) name validation schema"
```

---

### Task 2: Server Actions — crear/renombrar/eliminar niveles, grados, grupos

**Files:**
- Create: `src/app/(dashboard)/alumnos/estructura-actions.ts`

**Interfaces:**
- Consumes: `nombreEstructuraSchema` from `@/lib/estructura/schema` (Task 1); `createClient()` from `@/lib/supabase/server`.
- Produces (all `"use server"`, all imported by Tasks 5–7):
  - `crearNivel(formData: FormData): Promise<void>`
  - `renombrarNivel(id: string, formData: FormData): Promise<void>`
  - `eliminarNivel(id: string): Promise<void>`
  - `crearGrado(nivelId: string, formData: FormData): Promise<void>`
  - `renombrarGrado(id: string, nivelId: string, formData: FormData): Promise<void>`
  - `eliminarGrado(id: string, nivelId: string): Promise<void>`
  - `crearGrupo(gradoId: string, formData: FormData): Promise<void>`
  - `renombrarGrupo(id: string, gradoId: string, formData: FormData): Promise<void>`
  - `eliminarGrupo(id: string, gradoId: string): Promise<void>`

- [ ] **Step 1: Write the actions**

`src/app/(dashboard)/alumnos/estructura-actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { nombreEstructuraSchema } from "@/lib/estructura/schema";

function parseNombre(formData: FormData) {
  return nombreEstructuraSchema.parse({
    nombre: formData.get("nombre") ?? undefined,
  });
}

function manejarError(
  error: { code?: string; message: string } | null,
  mensajeDuplicado: string,
  mensajeGenerico: string
) {
  if (!error) return;
  if (error.code === "23505") {
    throw new Error(mensajeDuplicado);
  }
  throw new Error(`${mensajeGenerico}: ${error.message}`);
}

// ---------- Niveles ----------

export async function crearNivel(formData: FormData) {
  const { nombre } = parseNombre(formData);
  const supabase = createClient();

  const { data: maxOrden } = await supabase
    .from("niveles")
    .select("orden")
    .order("orden", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase
    .from("niveles")
    .insert({ nombre, orden: (maxOrden?.orden ?? 0) + 1 });

  manejarError(error, "Ya existe un nivel con ese nombre.", "No se pudo crear el nivel");

  revalidatePath("/alumnos");
}

export async function renombrarNivel(id: string, formData: FormData) {
  const { nombre } = parseNombre(formData);
  const supabase = createClient();

  const { error } = await supabase.from("niveles").update({ nombre }).eq("id", id);

  manejarError(error, "Ya existe un nivel con ese nombre.", "No se pudo renombrar el nivel");

  revalidatePath("/alumnos");
}

export async function eliminarNivel(id: string) {
  const supabase = createClient();

  const { count, error: errorConteo } = await supabase
    .from("grados")
    .select("id", { count: "exact", head: true })
    .eq("nivel_id", id);

  if (errorConteo) {
    throw new Error(`No se pudo verificar el nivel: ${errorConteo.message}`);
  }
  if (count && count > 0) {
    throw new Error("No se puede eliminar: este nivel tiene grados dentro.");
  }

  const { error } = await supabase.from("niveles").delete().eq("id", id);
  if (error) {
    throw new Error(`No se pudo eliminar el nivel: ${error.message}`);
  }

  revalidatePath("/alumnos");
}

// ---------- Grados ----------

export async function crearGrado(nivelId: string, formData: FormData) {
  const { nombre } = parseNombre(formData);
  const supabase = createClient();

  const { data: maxOrden } = await supabase
    .from("grados")
    .select("orden")
    .eq("nivel_id", nivelId)
    .order("orden", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase
    .from("grados")
    .insert({ nombre, nivel_id: nivelId, orden: (maxOrden?.orden ?? 0) + 1 });

  manejarError(error, "Ya existe un grado con ese nombre en este nivel.", "No se pudo crear el grado");

  revalidatePath(`/alumnos/nivel/${nivelId}`);
}

export async function renombrarGrado(id: string, nivelId: string, formData: FormData) {
  const { nombre } = parseNombre(formData);
  const supabase = createClient();

  const { error } = await supabase.from("grados").update({ nombre }).eq("id", id);

  manejarError(error, "Ya existe un grado con ese nombre en este nivel.", "No se pudo renombrar el grado");

  revalidatePath(`/alumnos/nivel/${nivelId}`);
}

export async function eliminarGrado(id: string, nivelId: string) {
  const supabase = createClient();

  const { count, error: errorConteo } = await supabase
    .from("grupos")
    .select("id", { count: "exact", head: true })
    .eq("grado_id", id);

  if (errorConteo) {
    throw new Error(`No se pudo verificar el grado: ${errorConteo.message}`);
  }
  if (count && count > 0) {
    throw new Error("No se puede eliminar: este grado tiene grupos dentro.");
  }

  const { error } = await supabase.from("grados").delete().eq("id", id);
  if (error) {
    throw new Error(`No se pudo eliminar el grado: ${error.message}`);
  }

  revalidatePath(`/alumnos/nivel/${nivelId}`);
}

// ---------- Grupos ----------

export async function crearGrupo(gradoId: string, formData: FormData) {
  const { nombre } = parseNombre(formData);
  const supabase = createClient();

  const { data: ciclo, error: errorCiclo } = await supabase
    .from("ciclos_escolares")
    .select("id")
    .eq("activo", true)
    .single();

  if (errorCiclo || !ciclo) {
    throw new Error("No se pudo crear el grupo: no hay un ciclo escolar activo.");
  }

  const { error } = await supabase
    .from("grupos")
    .insert({ nombre, grado_id: gradoId, ciclo_escolar_id: ciclo.id });

  manejarError(error, "Ya existe un grupo con ese nombre en este grado.", "No se pudo crear el grupo");

  revalidatePath(`/alumnos/grado/${gradoId}`);
}

export async function renombrarGrupo(id: string, gradoId: string, formData: FormData) {
  const { nombre } = parseNombre(formData);
  const supabase = createClient();

  const { error } = await supabase.from("grupos").update({ nombre }).eq("id", id);

  manejarError(error, "Ya existe un grupo con ese nombre en este grado.", "No se pudo renombrar el grupo");

  revalidatePath(`/alumnos/grado/${gradoId}`);
}

export async function eliminarGrupo(id: string, gradoId: string) {
  const supabase = createClient();

  const { count, error: errorConteo } = await supabase
    .from("inscripciones")
    .select("id", { count: "exact", head: true })
    .eq("grupo_id", id);

  if (errorConteo) {
    throw new Error(`No se pudo verificar el grupo: ${errorConteo.message}`);
  }
  if (count && count > 0) {
    throw new Error("No se puede eliminar: este grupo tiene alumnos inscritos.");
  }

  const { error } = await supabase.from("grupos").delete().eq("id", id);
  if (error) {
    throw new Error(`No se pudo eliminar el grupo: ${error.message}`);
  }

  revalidatePath(`/alumnos/grado/${gradoId}`);
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run build`
Expected: exits 0. (Nothing calls these actions yet — this only confirms types. The `grados.nivel_id`/`niveles` table references won't be checked against a real schema since this project doesn't use generated Supabase types — that's expected and unrelated to this task.)

- [ ] **Step 3: Commit**

```bash
git add src/app/\(dashboard\)/alumnos/estructura-actions.ts
git commit -m "feat: add crear/renombrar/eliminar server actions for niveles, grados, grupos"
```

---

### Task 3: Shared card components (`TarjetaEditable`, `TarjetaAgregar`)

**Files:**
- Create: `src/components/alumnos/TarjetaEditable.tsx`
- Create: `src/components/alumnos/TarjetaAgregar.tsx`

**Interfaces:**
- Produces: `TarjetaEditable` component with props `{ nombre: string; subtitulo: string; href: string; color: string; cantidadHijos: number; etiquetaHijos: string; accionRenombrar: (formData: FormData) => void; accionEliminar: () => void }`, and `TarjetaAgregar` component with props `{ etiqueta: string; accionCrear: (formData: FormData) => void }`. Both exported from their files, consumed by Tasks 5, 6, 7.

- [ ] **Step 1: Write `TarjetaEditable.tsx`**

```tsx
"use client";

import Link from "next/link";
import { useState } from "react";

export interface TarjetaEditableProps {
  nombre: string;
  subtitulo: string;
  href: string;
  color: string;
  cantidadHijos: number;
  etiquetaHijos: string;
  accionRenombrar: (formData: FormData) => void;
  accionEliminar: () => void;
}

export function TarjetaEditable({
  nombre,
  subtitulo,
  href,
  color,
  cantidadHijos,
  etiquetaHijos,
  accionRenombrar,
  accionEliminar,
}: TarjetaEditableProps) {
  const [editando, setEditando] = useState(false);

  if (editando) {
    return (
      <form
        action={async (formData) => {
          await accionRenombrar(formData);
          setEditando(false);
        }}
        className="rounded-2xl border-2 border-zinc-300 bg-white p-4"
      >
        <input
          name="nombre"
          defaultValue={nombre}
          required
          autoFocus
          className="w-full rounded-md border border-zinc-300 px-2 py-1 text-sm"
        />
        <div className="mt-2 flex gap-2">
          <button
            type="submit"
            className="rounded-md bg-primario px-3 py-1 text-xs font-medium text-white"
          >
            Guardar
          </button>
          <button
            type="button"
            onClick={() => setEditando(false)}
            className="rounded-md border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-700"
          >
            Cancelar
          </button>
        </div>
      </form>
    );
  }

  return (
    <div
      className="rounded-2xl p-5 text-white"
      style={{ backgroundColor: color }}
    >
      <Link href={href} className="block">
        <div className="text-base font-bold">{nombre}</div>
        <div className="text-sm opacity-90">{subtitulo}</div>
      </Link>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => setEditando(true)}
          className="rounded-md bg-white/20 px-2 py-1 text-xs font-medium hover:bg-white/30"
        >
          Renombrar
        </button>
        {cantidadHijos > 0 ? (
          <span
            title={`No se puede eliminar: tiene ${cantidadHijos} ${etiquetaHijos}.`}
            className="cursor-not-allowed rounded-md bg-white/10 px-2 py-1 text-xs font-medium opacity-50"
          >
            Eliminar
          </span>
        ) : (
          <form action={accionEliminar}>
            <button
              type="submit"
              className="rounded-md bg-white/20 px-2 py-1 text-xs font-medium hover:bg-white/30"
            >
              Eliminar
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write `TarjetaAgregar.tsx`**

```tsx
"use client";

import { useState } from "react";

export interface TarjetaAgregarProps {
  etiqueta: string;
  accionCrear: (formData: FormData) => void;
}

export function TarjetaAgregar({ etiqueta, accionCrear }: TarjetaAgregarProps) {
  const [creando, setCreando] = useState(false);

  if (creando) {
    return (
      <form
        action={async (formData) => {
          await accionCrear(formData);
          setCreando(false);
        }}
        className="rounded-2xl border-2 border-zinc-300 bg-white p-4"
      >
        <input
          name="nombre"
          placeholder="Nombre"
          required
          autoFocus
          className="w-full rounded-md border border-zinc-300 px-2 py-1 text-sm"
        />
        <div className="mt-2 flex gap-2">
          <button
            type="submit"
            className="rounded-md bg-primario px-3 py-1 text-xs font-medium text-white"
          >
            Crear
          </button>
          <button
            type="button"
            onClick={() => setCreando(false)}
            className="rounded-md border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-700"
          >
            Cancelar
          </button>
        </div>
      </form>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setCreando(true)}
      className="flex min-h-[110px] items-center justify-center rounded-2xl border-2 border-dashed border-zinc-300 text-sm font-medium text-zinc-500 hover:border-primario hover:text-primario"
    >
      + Agregar {etiqueta}
    </button>
  );
}
```

- [ ] **Step 3: Verify it compiles**

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add src/components/alumnos/TarjetaEditable.tsx src/components/alumnos/TarjetaAgregar.tsx
git commit -m "feat: add TarjetaEditable and TarjetaAgregar shared components"
```

---

### Task 4: Grupo-scoped alumno Server Actions + retire the piloto helper

**Files:**
- Modify: `src/app/(dashboard)/alumnos/actions.ts`
- Delete: `src/lib/grupos/piloto.ts`
- Delete: `src/app/(dashboard)/alumnos/page.tsx` (temporary — Task 5 recreates it with nivel-cards content; deleting now instead of leaving it broken keeps the build green through every task, since it currently imports the piloto helper this task removes)
- Delete: `src/app/(dashboard)/alumnos/nuevo/page.tsx` (temporary — Task 9 recreates it at `grupo/[grupoId]/nuevo`; it calls `crearAlumno` with the old signature this task changes)
- Delete: `src/app/(dashboard)/alumnos/[id]/editar/page.tsx` (temporary — Task 10 recreates it at `grupo/[grupoId]/[id]/editar`; it calls `actualizarAlumno` with the old signature this task changes)
- Modify: `.env.example` (remove `GRUPO_PILOTO_ID`/`CICLO_PILOTO_ID`)

**Note on sequencing:** this task deletes 3 route files before their replacements exist (Tasks 5, 9, 10 recreate them at new paths). Between this task and Task 5, `/alumnos` briefly 404s; `/alumnos/nuevo` and `/alumnos/[id]/editar` (old paths) 404 until Tasks 9/10 land at their new paths. This is expected and fine — the plan executes in an isolated worktree, nothing is deployed mid-sequence — and it's what keeps `npm run build` genuinely green after every single task instead of red for several tasks in a row.

**Interfaces:**
- Produces (breaking signature changes from the current file — every caller updates in Tasks 8–10):
  - `crearAlumno(grupoId: string, formData: FormData): Promise<void>`
  - `actualizarAlumno(id: string, grupoId: string, formData: FormData): Promise<void>`
  - `alternarActivoAlumno(id: string, grupoId: string, activo: boolean): Promise<void>`

- [ ] **Step 1: Replace `actions.ts`**

`src/app/(dashboard)/alumnos/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { alumnoSchema } from "@/lib/alumnos/schema";

function parseAlumnoFormData(formData: FormData) {
  return alumnoSchema.parse({
    nombre_completo: formData.get("nombre_completo") ?? undefined,
    fecha_nacimiento: formData.get("fecha_nacimiento") ?? undefined,
    matricula: formData.get("matricula") ?? undefined,
    tutor_nombre: formData.get("tutor_nombre") ?? undefined,
    tutor_telefono: formData.get("tutor_telefono") ?? undefined,
    tutor_email: formData.get("tutor_email") ?? undefined,
  });
}

export async function crearAlumno(grupoId: string, formData: FormData) {
  const datos = parseAlumnoFormData(formData);
  const supabase = createClient();

  const { data: ciclo, error: errorCiclo } = await supabase
    .from("ciclos_escolares")
    .select("id")
    .eq("activo", true)
    .single();

  if (errorCiclo || !ciclo) {
    throw new Error("No se pudo inscribir al alumno: no hay un ciclo escolar activo.");
  }

  const { data: alumno, error: errorAlumno } = await supabase
    .from("alumnos")
    .insert(datos)
    .select("id")
    .single();

  if (errorAlumno || !alumno) {
    throw new Error(`No se pudo crear el alumno: ${errorAlumno?.message}`);
  }

  const { error: errorInscripcion } = await supabase.from("inscripciones").insert({
    alumno_id: alumno.id,
    grupo_id: grupoId,
    ciclo_escolar_id: ciclo.id,
  });

  if (errorInscripcion) {
    throw new Error(`No se pudo inscribir al alumno: ${errorInscripcion.message}`);
  }

  revalidatePath(`/alumnos/grupo/${grupoId}`);
  redirect(`/alumnos/grupo/${grupoId}`);
}

export async function actualizarAlumno(
  id: string,
  grupoId: string,
  formData: FormData
) {
  const datos = parseAlumnoFormData(formData);
  const supabase = createClient();

  const { error } = await supabase.from("alumnos").update(datos).eq("id", id);

  if (error) {
    throw new Error(`No se pudo actualizar el alumno: ${error.message}`);
  }

  revalidatePath(`/alumnos/grupo/${grupoId}`);
  redirect(`/alumnos/grupo/${grupoId}`);
}

export async function alternarActivoAlumno(
  id: string,
  grupoId: string,
  activo: boolean
) {
  const supabase = createClient();

  const { error } = await supabase
    .from("alumnos")
    .update({ activo: !activo })
    .eq("id", id);

  if (error) {
    throw new Error(`No se pudo cambiar el estatus del alumno: ${error.message}`);
  }

  revalidatePath(`/alumnos/grupo/${grupoId}`);
}
```

- [ ] **Step 2: Delete the piloto helper**

```bash
rm src/lib/grupos/piloto.ts
```

- [ ] **Step 3: Update `.env.example`**

Remove the `GRUPO_PILOTO_ID=` and `CICLO_PILOTO_ID=` lines, leaving only:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

(Leave `.env.local` alone — it's gitignored and still has real values; nothing in the codebase reads `GRUPO_PILOTO_ID`/`CICLO_PILOTO_ID` after this task, so the leftover lines there are harmless, but don't spend a step deleting them from a file you can't verify the contents of without exposing secrets in a report.)

- [ ] **Step 4: Verify it compiles**

Run: `npm run build`
Expected: exits 0. Since the 3 route files that depended on the old signatures/helper were deleted in Step 1 (not left broken), nothing in the tree references the old `crearAlumno`/`actualizarAlumno` signatures or `src/lib/grupos/piloto.ts` anymore. `/alumnos`, `/alumnos/nuevo`, and `/alumnos/[id]/editar` are temporarily gone from the route table — that's expected, not a build error.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(dashboard\)/alumnos/actions.ts .env.example
git rm src/lib/grupos/piloto.ts
git rm src/app/\(dashboard\)/alumnos/page.tsx
git rm -r src/app/\(dashboard\)/alumnos/nuevo
git rm -r "src/app/(dashboard)/alumnos/[id]"
git commit -m "feat: scope alumno server actions to a real grupoId instead of env vars"
```

---

### Task 5: Nivel cards page (`/alumnos`)

**Files:**
- Create: `src/app/(dashboard)/alumnos/page.tsx` (Task 4 deleted the old one — this is a fresh file, not an edit)

**Interfaces:**
- Consumes: `createClient()` from `@/lib/supabase/server`; `TarjetaEditable`, `TarjetaAgregar` from `@/components/alumnos/*` (Task 3); `crearNivel`, `renombrarNivel`, `eliminarNivel` from `./estructura-actions` (Task 2).

- [ ] **Step 1: Write the page**

`src/app/(dashboard)/alumnos/page.tsx`:

```tsx
import { createClient } from "@/lib/supabase/server";
import { TarjetaEditable } from "@/components/alumnos/TarjetaEditable";
import { TarjetaAgregar } from "@/components/alumnos/TarjetaAgregar";
import { crearNivel, renombrarNivel, eliminarNivel } from "./estructura-actions";

export const dynamic = "force-dynamic";

const COLORES_NIVEL = ["#E3312D", "#c02926", "#8a3a38", "#5a2a29"];

interface NivelConConteo {
  id: string;
  nombre: string;
  cantidadGrados: number;
}

async function obtenerNiveles(): Promise<NivelConConteo[]> {
  const supabase = createClient();

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

export default async function AlumnosPage() {
  const niveles = await obtenerNiveles();

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900">Alumnos y grados</h1>
      <p className="mt-1 text-sm text-zinc-600">Elige un nivel para ver sus grados.</p>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {niveles.map((nivel, indice) => (
          <TarjetaEditable
            key={nivel.id}
            nombre={nivel.nombre}
            subtitulo={`${nivel.cantidadGrados} grado${nivel.cantidadGrados === 1 ? "" : "s"}`}
            href={`/alumnos/nivel/${nivel.id}`}
            color={COLORES_NIVEL[indice % COLORES_NIVEL.length]}
            cantidadHijos={nivel.cantidadGrados}
            etiquetaHijos="grados"
            accionRenombrar={renombrarNivel.bind(null, nivel.id)}
            accionEliminar={eliminarNivel.bind(null, nivel.id)}
          />
        ))}
        <TarjetaAgregar etiqueta="nivel" accionCrear={crearNivel} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run build`
Expected: exits 0. `/alumnos` reappears in the route table (it 404'd since Task 4).

- [ ] **Step 3: Commit**

```bash
git add src/app/\(dashboard\)/alumnos/page.tsx
git commit -m "feat: add nivel cards page at /alumnos"
```

---

### Task 6: Grado cards page (`/alumnos/nivel/[nivelId]`)

**Files:**
- Create: `src/app/(dashboard)/alumnos/nivel/[nivelId]/page.tsx`

**Interfaces:**
- Consumes: `createClient()`; `TarjetaEditable`, `TarjetaAgregar` (Task 3); `crearGrado`, `renombrarGrado`, `eliminarGrado` from `../../estructura-actions` (Task 2).

- [ ] **Step 1: Write the page**

`src/app/(dashboard)/alumnos/nivel/[nivelId]/page.tsx`:

```tsx
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TarjetaEditable } from "@/components/alumnos/TarjetaEditable";
import { TarjetaAgregar } from "@/components/alumnos/TarjetaAgregar";
import { crearGrado, renombrarGrado, eliminarGrado } from "../../estructura-actions";

export const dynamic = "force-dynamic";

const COLORES_GRADO = ["#E3312D", "#c02926", "#8a3a38", "#5a2a29"];

interface GradoConConteo {
  id: string;
  nombre: string;
  cantidadGrupos: number;
}

export default async function GradoCardsPage({
  params,
}: {
  params: Promise<{ nivelId: string }>;
}) {
  const { nivelId } = await params;
  const supabase = createClient();

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

  const gradosConConteo: GradoConConteo[] = await Promise.all(
    (grados ?? []).map(async (grado) => {
      const { count } = await supabase
        .from("grupos")
        .select("id", { count: "exact", head: true })
        .eq("grado_id", grado.id);

      return { id: grado.id, nombre: grado.nombre, cantidadGrupos: count ?? 0 };
    })
  );

  if (gradosConConteo.length === 1) {
    redirect(`/alumnos/grado/${gradosConConteo[0].id}`);
  }

  return (
    <div>
      <p className="text-sm text-zinc-600">
        <Link href="/alumnos" className="hover:underline">
          ← Niveles
        </Link>{" "}
        / <span className="font-medium text-zinc-900">{nivel.nombre}</span>
      </p>
      <h1 className="mt-1 text-2xl font-semibold text-zinc-900">{nivel.nombre}</h1>

      {gradosConConteo.length === 0 && (
        <p className="mt-6 text-zinc-600">Este nivel todavía no tiene grados.</p>
      )}

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        {gradosConConteo.map((grado, indice) => (
          <TarjetaEditable
            key={grado.id}
            nombre={grado.nombre}
            subtitulo={`${grado.cantidadGrupos} grupo${grado.cantidadGrupos === 1 ? "" : "s"}`}
            href={`/alumnos/grado/${grado.id}`}
            color={COLORES_GRADO[indice % COLORES_GRADO.length]}
            cantidadHijos={grado.cantidadGrupos}
            etiquetaHijos="grupos"
            accionRenombrar={renombrarGrado.bind(null, grado.id, nivelId)}
            accionEliminar={eliminarGrado.bind(null, grado.id, nivelId)}
          />
        ))}
        <TarjetaAgregar
          etiqueta="grado"
          accionCrear={crearGrado.bind(null, nivelId)}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(dashboard\)/alumnos/nivel/
git commit -m "feat: add grado cards page under a nivel"
```

---

### Task 7: Grupo cards page (`/alumnos/grado/[gradoId]`)

**Files:**
- Create: `src/app/(dashboard)/alumnos/grado/[gradoId]/page.tsx`

**Interfaces:**
- Consumes: `createClient()`; `TarjetaEditable`, `TarjetaAgregar` (Task 3); `crearGrupo`, `renombrarGrupo`, `eliminarGrupo` from `../../estructura-actions` (Task 2).

- [ ] **Step 1: Write the page**

`src/app/(dashboard)/alumnos/grado/[gradoId]/page.tsx`:

```tsx
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TarjetaEditable } from "@/components/alumnos/TarjetaEditable";
import { TarjetaAgregar } from "@/components/alumnos/TarjetaAgregar";
import { crearGrupo, renombrarGrupo, eliminarGrupo } from "../../estructura-actions";

export const dynamic = "force-dynamic";

const COLORES_GRUPO = ["#E3312D", "#c02926", "#8a3a38", "#5a2a29"];

interface GrupoConConteo {
  id: string;
  nombre: string;
  cantidadAlumnos: number;
}

export default async function GrupoCardsPage({
  params,
}: {
  params: Promise<{ gradoId: string }>;
}) {
  const { gradoId } = await params;
  const supabase = createClient();

  // Nested embeds (e.g. .select("nivel:niveles(nombre)")) are avoided
  // project-wide — see Global Constraints. Two flat queries instead.
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

  const { data: ciclo } = await supabase
    .from("ciclos_escolares")
    .select("id")
    .eq("activo", true)
    .single();

  const { data: grupos, error: errorGrupos } = await supabase
    .from("grupos")
    .select("id, nombre")
    .eq("grado_id", gradoId);

  if (errorGrupos) {
    throw new Error(`No se pudieron cargar los grupos: ${errorGrupos.message}`);
  }

  const gruposConConteo: GrupoConConteo[] = await Promise.all(
    (grupos ?? []).map(async (grupo) => {
      const { count } = await supabase
        .from("inscripciones")
        .select("id", { count: "exact", head: true })
        .eq("grupo_id", grupo.id)
        .eq("ciclo_escolar_id", ciclo?.id ?? "");

      return { id: grupo.id, nombre: grupo.nombre, cantidadAlumnos: count ?? 0 };
    })
  );

  if (gruposConConteo.length === 1) {
    redirect(`/alumnos/grupo/${gruposConConteo[0].id}`);
  }

  return (
    <div>
      <p className="text-sm text-zinc-600">
        <Link href="/alumnos" className="hover:underline">
          ← Niveles
        </Link>{" "}
        /{" "}
        {nivel && (
          <>
            <Link href={`/alumnos/nivel/${grado.nivel_id}`} className="hover:underline">
              {nivel.nombre}
            </Link>{" "}
            /{" "}
          </>
        )}
        <span className="font-medium text-zinc-900">{grado.nombre}</span>
      </p>
      <h1 className="mt-1 text-2xl font-semibold text-zinc-900">{grado.nombre}</h1>

      {gruposConConteo.length === 0 && (
        <p className="mt-6 text-zinc-600">Este grado todavía no tiene grupos.</p>
      )}

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        {gruposConConteo.map((grupo, indice) => (
          <TarjetaEditable
            key={grupo.id}
            nombre={`Grupo ${grupo.nombre}`}
            subtitulo={`${grupo.cantidadAlumnos} alumno${grupo.cantidadAlumnos === 1 ? "" : "s"}`}
            href={`/alumnos/grupo/${grupo.id}`}
            color={COLORES_GRUPO[indice % COLORES_GRUPO.length]}
            cantidadHijos={grupo.cantidadAlumnos}
            etiquetaHijos="alumnos inscritos"
            accionRenombrar={renombrarGrupo.bind(null, grupo.id, gradoId)}
            accionEliminar={eliminarGrupo.bind(null, grupo.id, gradoId)}
          />
        ))}
        <TarjetaAgregar
          etiqueta="grupo"
          accionCrear={crearGrupo.bind(null, gradoId)}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(dashboard\)/alumnos/grado/
git commit -m "feat: add grupo cards page under a grado"
```

---

### Task 8: Listado page (`/alumnos/grupo/[grupoId]`)

**Files:**
- Create: `src/app/(dashboard)/alumnos/grupo/[grupoId]/page.tsx`

**Interfaces:**
- Consumes: `createClient()`; `alternarActivoAlumno` from `../../actions` (Task 4's new grupo-scoped signature: `(id, grupoId, activo)`).

- [ ] **Step 1: Write the page**

`src/app/(dashboard)/alumnos/grupo/[grupoId]/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { alternarActivoAlumno } from "../../actions";

export const dynamic = "force-dynamic";

interface AlumnoListado {
  id: string;
  nombre_completo: string;
  matricula: string | null;
  tutor_nombre: string | null;
  activo: boolean;
}

interface ContextoGrupo {
  gradoId: string;
  gradoNombre: string;
  grupoNombre: string;
}

async function obtenerContexto(grupoId: string): Promise<ContextoGrupo | null> {
  const supabase = createClient();

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
  const supabase = createClient();

  const { data, error } = await supabase
    .from("inscripciones")
    .select("alumnos(id, nombre_completo, matricula, tutor_nombre, activo)")
    .eq("grupo_id", grupoId);

  if (error) {
    throw new Error(`No se pudo cargar la lista de alumnos: ${error.message}`);
  }

  return (data ?? []).flatMap((inscripcion) => inscripcion.alumnos);
}

export default async function ListadoAlumnosPage({
  params,
}: {
  params: Promise<{ grupoId: string }>;
}) {
  const { grupoId } = await params;
  const contexto = await obtenerContexto(grupoId);

  if (!contexto) {
    notFound();
  }

  const alumnos = await obtenerAlumnosDelGrupo(grupoId);

  return (
    <div>
      <p className="text-sm text-zinc-600">
        <Link href={`/alumnos/grado/${contexto.gradoId}`} className="hover:underline">
          ← {contexto.gradoNombre}
        </Link>{" "}
        / <span className="font-medium text-zinc-900">Grupo {contexto.grupoNombre}</span>
      </p>
      <div className="mt-1 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-zinc-900">
          Alumnos — {contexto.gradoNombre}, Grupo {contexto.grupoNombre}
        </h1>
        <Link
          href={`/alumnos/grupo/${grupoId}/nuevo`}
          className="rounded-md bg-primario px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          Agregar alumno
        </Link>
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
              <th className="py-2 font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {alumnos.map((alumno) => (
              <tr key={alumno.id} className="border-b border-zinc-100">
                <td className="py-2 text-zinc-900">{alumno.nombre_completo}</td>
                <td className="py-2 text-zinc-600">{alumno.matricula ?? "—"}</td>
                <td className="py-2 text-zinc-600">{alumno.tutor_nombre ?? "—"}</td>
                <td className="py-2 text-zinc-600">
                  {alumno.activo ? "Activo" : "Inactivo"}
                </td>
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
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(dashboard\)/alumnos/grupo/
git commit -m "feat: add grupo-scoped alumnos listing page"
```

---

### Task 9: Alta page (`/alumnos/grupo/[grupoId]/nuevo`)

**Files:**
- Create: `src/app/(dashboard)/alumnos/grupo/[grupoId]/nuevo/page.tsx` (Task 4 already deleted the old `/alumnos/nuevo/page.tsx` — this is a fresh file at a new path, nothing to delete here)

**Interfaces:**
- Consumes: `AlumnoForm` from `@/components/alumnos/AlumnoForm`; `crearAlumno` from `../../../actions` (Task 4's new signature: `(grupoId, formData)`).

- [ ] **Step 1: Write the new page**

`src/app/(dashboard)/alumnos/grupo/[grupoId]/nuevo/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { AlumnoForm } from "@/components/alumnos/AlumnoForm";
import { createClient } from "@/lib/supabase/server";
import { crearAlumno } from "../../../actions";

export default async function NuevoAlumnoPage({
  params,
}: {
  params: Promise<{ grupoId: string }>;
}) {
  const { grupoId } = await params;
  const supabase = createClient();

  const { data: grupo, error } = await supabase
    .from("grupos")
    .select("nombre")
    .eq("id", grupoId)
    .single();

  if (error || !grupo) {
    notFound();
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900">Agregar alumno</h1>
      <p className="mt-1 text-sm text-zinc-600">Se inscribirá en Grupo {grupo.nombre}</p>
      <div className="mt-6">
        <AlumnoForm action={crearAlumno.bind(null, grupoId)} textoBoton="Guardar alumno" />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run build`
Expected: exits 0. `/alumnos/grupo/[grupoId]/nuevo` appears in the route table (dynamic).

- [ ] **Step 3: Commit**

```bash
git add src/app/\(dashboard\)/alumnos/grupo/
git commit -m "feat: add alta de alumno page under /alumnos/grupo/[grupoId]/nuevo"
```

---

### Task 10: Edición page (`/alumnos/grupo/[grupoId]/[id]/editar`)

**Files:**
- Create: `src/app/(dashboard)/alumnos/grupo/[grupoId]/[id]/editar/page.tsx` (Task 4 already deleted the old `/alumnos/[id]/editar/page.tsx` — this is a fresh file at a new path, nothing to delete here)

**Interfaces:**
- Consumes: `AlumnoForm`, `AlumnoFormValues` from `@/components/alumnos/AlumnoForm`; `actualizarAlumno` from `../../../../actions` (Task 4's new signature: `(id, grupoId, formData)`).

- [ ] **Step 1: Write the new page**

`src/app/(dashboard)/alumnos/grupo/[grupoId]/[id]/editar/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { AlumnoForm, type AlumnoFormValues } from "@/components/alumnos/AlumnoForm";
import { createClient } from "@/lib/supabase/server";
import { actualizarAlumno } from "../../../../actions";

export default async function EditarAlumnoPage({
  params,
}: {
  params: Promise<{ grupoId: string; id: string }>;
}) {
  const { grupoId, id } = await params;
  const supabase = createClient();

  const { data: alumno, error } = await supabase
    .from("alumnos")
    .select(
      "nombre_completo, fecha_nacimiento, matricula, tutor_nombre, tutor_telefono, tutor_email"
    )
    .eq("id", id)
    .single();

  if (error || !alumno) {
    notFound();
  }

  const valoresIniciales: AlumnoFormValues = {
    nombre_completo: alumno.nombre_completo,
    fecha_nacimiento: alumno.fecha_nacimiento ?? "",
    matricula: alumno.matricula ?? "",
    tutor_nombre: alumno.tutor_nombre ?? "",
    tutor_telefono: alumno.tutor_telefono ?? "",
    tutor_email: alumno.tutor_email ?? "",
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900">Editar alumno</h1>
      <div className="mt-6">
        <AlumnoForm
          action={actualizarAlumno.bind(null, id, grupoId)}
          valoresIniciales={valoresIniciales}
          textoBoton="Guardar cambios"
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run build`
Expected: exits 0. `/alumnos/grupo/[grupoId]/[id]/editar` appears in the route table (dynamic). All alumnos routes now resolve — this is the last route piece of the plan.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(dashboard)/alumnos/grupo/"
git commit -m "feat: add edición de alumno page under /alumnos/grupo/[grupoId]/[id]/editar"
```

---

### Task 11: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full automated suite**

```bash
npm run lint
npm test
npm run build
```

Expected: all three exit 0. `npm test` should show 4 test files now (the 3 pre-existing plus `src/lib/estructura/schema.test.ts`).

- [ ] **Step 2: Manual end-to-end check against the real Supabase project**

Confirm the Prerequisito SQL (niveles table + seed) has actually been run before starting — if `npm run build` in Step 1 fails with a Postgres error about `niveles` not existing, stop and tell the controller, don't try to run the migration yourself.

Run `npm run dev`, open `/alumnos`, and confirm by hand:

1. 4 nivel cards show: Villa, Primaria, Secundaria, Preparatoria — each showing "0 grados" except Preparatoria showing "1 grado" (the pre-existing `1° Preparatoria`).
2. Click into Preparatoria → since it has exactly 1 grado, lands directly on that grado's grupo screen — which itself has exactly 1 grupo, so it should land directly on `/alumnos/grupo/[grupoId]` showing Ana Torres and Luis Hernández (the alumnos created in the previous plan) — **zero extra clicks**, same as before this plan existed.
3. Go back to `/alumnos`, click Villa → 0 grados, shows the empty-state message and a "+ Agregar grado" tile.
4. Use "+ Agregar grado" to create "Villa 1", "Villa 2", "Villa 3" (the real names from the user). Confirm all 3 appear as cards with "0 grupos" each, and the Villa nivel card back on `/alumnos` now says "3 grados".
5. Click into "Villa 1" → 0 grupos, empty state + "+ Agregar grupo". Create "Grupo A". Confirm it redirects — since it's now the only grupo — straight to that grupo's (empty) roster.
6. Repeat for 1°–6° Primaria (6 grados, "Grupo A" each) and 1°–3° Secundaria (3 grados, "Grupo A" each), using "+ Agregar grado" from the Primaria/Secundaria nivel screens and "+ Agregar grupo" from each grado screen.
7. On any grado/grupo screen, click "Renombrar" on a card, change the name, confirm it updates without navigating away and the new name shows.
8. Try eliminating a nivel that has grados (e.g. Primaria) — confirm the "Eliminar" control is disabled/shows the explanatory tooltip, not clickable.
9. Create a throwaway empty grado under any nivel, then delete it — confirm it disappears and the parent nivel's grado count decreases.
10. From a grupo roster, add a second grupo to that same grado (e.g. "Grupo B" alongside "Grupo A") via `/alumnos/grado/[gradoId]` — confirm the grado's screen now shows the grupo cards (no longer skips), and that navigating there again after deleting back down to 1 grupo makes it skip again.
11. From a roster page with alumnos, add a new alumno via "Agregar alumno" — confirm it inscribes into the correct grupo (spot-check with `mcp__supabase-ibero__execute_sql` that the new `inscripciones` row has the right `grupo_id`).

- [ ] **Step 3: Update project state doc**

Edit `CONTEXTO_CLAUDE_CODE.md`: mark this feature as implemented and verified, remove the "Extender el patrón de Alumnos a Pagos..." bullet's dependency on this decision (it's now resolved — note briefly how: mutating actions for structure are grupo/grado/nivel-scoped by their bound parent id, same pattern to replicate for Pagos/Asistencia).

- [ ] **Step 4: Commit**

```bash
git add CONTEXTO_CLAUDE_CODE.md
git commit -m "docs: mark nivel/grado/grupo navigation as implemented and verified"
```
