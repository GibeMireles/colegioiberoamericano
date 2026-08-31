# Alumnos — Piloto 1° de Preparatoria Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a working alta/edición/listado/baja-lógica CRUD for alumnos, scoped to a single hardcoded group ("1° Preparatoria, Grupo A"), backed by the real Supabase project.

**Architecture:** Next.js Server Components read from Supabase directly for display; all writes go through Server Actions (`"use server"`) using a shared Zod schema for validation. The alumno↔grupo relationship lives in `inscripciones`, never as a direct column on `alumnos`, so the pattern extends to more groups later without a data migration.

**Tech Stack:** Next.js 16 (App Router) / React 19 / TypeScript, `@supabase/supabase-js` (new dependency), `zod` (new dependency), Tailwind CSS v4, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-31-alumnos-piloto-1ro-prepa-design.md`

## Global Constraints

- Writes only via Next.js Server Actions — no Supabase writes from client components.
- Only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` — never the service role key or DB password.
- "Eliminar" never deletes a row — it toggles `alumnos.activo` (logical delete, reversible).
- No selector for escuela/grado/grupo/ciclo in the UI — the group and cycle are fixed via the private env vars `GRUPO_PILOTO_ID` / `CICLO_PILOTO_ID`.
- No CSV/Excel import.
- No login, roles, or RLS work in this plan (RLS is intentionally still disabled project-wide — tracked separately in `CONTEXTO_CLAUDE_CODE.md`).
- UI copy in Spanish, matching the existing style (`text-zinc-900`/`text-zinc-600`, brand Tailwind tokens `bg-primario` / `bg-primario-activo` already wired in `src/app/globals.css`).
- The only unit-tested logic in this module is `src/lib/alumnos/schema.ts` (pure validation rules) — no RTL/jsdom for forms or pages, consistent with the rest of the project.

## Already done (this session, outside this plan)

The real Supabase project (`elhgncefzpttarpaxbzm`, URL `https://elhgncefzpttarpaxbzm.supabase.co`) has `database/schema.sql` applied, and one row each seeded in `ciclos_escolares`, `grados`, and `grupos` for the pilot:

```
CICLO_PILOTO_ID=0c2de2db-7277-4046-9959-1584f75b6d1d   -- ciclos_escolares, nombre '2026-2027'
GRUPO_PILOTO_ID=d7c205c3-1540-4dc1-b379-5f5e17e911b3    -- grupos, nombre '1°A'
```

(`grados` row `'1° Preparatoria'` id `7ea3cb01-dfea-4f97-99de-21253aeeead5` — not needed as an env var, only referenced by `grupos.grado_id`.)

Task 1 below turns these into the private env vars the spec requires.

---

### Task 1: Dependencies, environment config, Supabase client factory

**Files:**
- Modify: `package.json` (add `@supabase/supabase-js`, `zod`)
- Create: `.env.local` (gitignored — confirmed by `.gitignore`'s `.env*` rule)
- Create: `.env.example` (committed placeholder, for replicating to another school's instance)
- Create: `src/lib/supabase/server.ts`

**Interfaces:**
- Produces: `createClient(): SupabaseClient` from `src/lib/supabase/server.ts`, imported as `import { createClient } from "@/lib/supabase/server"` by Tasks 3, 6, 7.
- Produces: env vars `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `GRUPO_PILOTO_ID`, `CICLO_PILOTO_ID` available via `process.env` to Tasks 3, 6, 7.

- [ ] **Step 1: Install dependencies**

Run: `npm install @supabase/supabase-js zod`

- [ ] **Step 2: Get the anon (publishable) key**

Run the already-connected Supabase MCP tool `mcp__supabase-ibero__get_publishable_keys` (or, if unavailable in your session, Supabase Dashboard → this project → Settings → API → "anon public" key). You'll paste it into `.env.local` in the next step. This key is meant to be public (it's rate-limited and scoped by RLS/policies), but keep it out of files that get committed anyway — `.env.local` is gitignored.

- [ ] **Step 3: Create `.env.local`**

```
NEXT_PUBLIC_SUPABASE_URL=https://elhgncefzpttarpaxbzm.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<pega aquí la anon key del paso 2>
GRUPO_PILOTO_ID=d7c205c3-1540-4dc1-b379-5f5e17e911b3
CICLO_PILOTO_ID=0c2de2db-7277-4046-9959-1584f75b6d1d
```

- [ ] **Step 4: Create `.env.example`**

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
GRUPO_PILOTO_ID=
CICLO_PILOTO_ID=
```

- [ ] **Step 5: Write the Supabase client factory**

`src/lib/supabase/server.ts`:

```ts
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Faltan las variables de entorno NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY"
    );
  }

  return createSupabaseClient(url, anonKey);
}
```

- [ ] **Step 6: Verify the project still builds**

Run: `npm run build`
Expected: exits 0. (No page reads Supabase yet, so this only confirms the new dependency and file compile cleanly.)

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json .env.example src/lib/supabase/server.ts
git commit -m "feat: add Supabase client factory and env config for alumnos module"
```

(`.env.local` is gitignored and won't be staged — confirm with `git status` that it's absent from the diff.)

---

### Task 2: Alumno validation schema (Zod) — TDD

**Files:**
- Create: `src/lib/alumnos/schema.ts`
- Test: `src/lib/alumnos/schema.test.ts`

**Interfaces:**
- Produces: `alumnoSchema: ZodObject` and `type AlumnoInput` from `src/lib/alumnos/schema.ts`, imported by Task 3 (`actions.ts`) as `import { alumnoSchema } from "@/lib/alumnos/schema"`.
- `AlumnoInput` shape (all keys match `database/schema.sql` columns, snake_case): `{ nombre_completo: string; fecha_nacimiento?: string; matricula?: string; tutor_nombre?: string; tutor_telefono?: string; tutor_email?: string }`.

- [ ] **Step 1: Write the failing tests**

`src/lib/alumnos/schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { alumnoSchema } from "./schema";

describe("alumnoSchema", () => {
  it("accepts a fully filled valid alumno", () => {
    const result = alumnoSchema.safeParse({
      nombre_completo: "Ana Torres",
      fecha_nacimiento: "2010-05-14",
      matricula: "IB-0001",
      tutor_nombre: "Laura Torres",
      tutor_telefono: "5512345678",
      tutor_email: "laura.torres@example.com",
    });

    expect(result.success).toBe(true);
  });

  it("accepts an alumno with only the required field", () => {
    const result = alumnoSchema.safeParse({
      nombre_completo: "Ana Torres",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.fecha_nacimiento).toBeUndefined();
      expect(result.data.matricula).toBeUndefined();
      expect(result.data.tutor_nombre).toBeUndefined();
      expect(result.data.tutor_telefono).toBeUndefined();
      expect(result.data.tutor_email).toBeUndefined();
    }
  });

  it("rejects a missing nombre_completo", () => {
    const result = alumnoSchema.safeParse({});

    expect(result.success).toBe(false);
  });

  it("rejects an empty nombre_completo", () => {
    const result = alumnoSchema.safeParse({ nombre_completo: "   " });

    expect(result.success).toBe(false);
  });

  it("treats an empty optional field as undefined", () => {
    const result = alumnoSchema.safeParse({
      nombre_completo: "Ana Torres",
      matricula: "",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.matricula).toBeUndefined();
    }
  });

  it("rejects an invalid tutor_email", () => {
    const result = alumnoSchema.safeParse({
      nombre_completo: "Ana Torres",
      tutor_email: "no-es-un-correo",
    });

    expect(result.success).toBe(false);
  });

  it("accepts a valid tutor_email", () => {
    const result = alumnoSchema.safeParse({
      nombre_completo: "Ana Torres",
      tutor_email: "tutor@example.com",
    });

    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- schema.test.ts` (from `src/lib/alumnos/`, or `npx vitest run src/lib/alumnos/schema.test.ts`)
Expected: FAIL — `Cannot find module './schema'` (the file doesn't exist yet).

- [ ] **Step 3: Write the schema**

`src/lib/alumnos/schema.ts`:

```ts
import { z } from "zod";

const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value && value.length > 0 ? value : undefined));

export const alumnoSchema = z.object({
  nombre_completo: z.string().trim().min(1, "El nombre completo es requerido"),
  fecha_nacimiento: optionalText,
  matricula: optionalText,
  tutor_nombre: optionalText,
  tutor_telefono: optionalText,
  tutor_email: optionalText.refine(
    (value) => value === undefined || z.string().email().safeParse(value).success,
    { message: "El correo del tutor no es válido" }
  ),
});

export type AlumnoInput = z.infer<typeof alumnoSchema>;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/alumnos/schema.test.ts`
Expected: PASS, all 7 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/alumnos/schema.ts src/lib/alumnos/schema.test.ts
git commit -m "feat: add alumno validation schema"
```

---

### Task 3: Server Actions (crear, actualizar, alternar activo)

**Files:**
- Create: `src/app/(dashboard)/alumnos/actions.ts`

**Interfaces:**
- Consumes: `createClient()` from `@/lib/supabase/server` (Task 1); `alumnoSchema` from `@/lib/alumnos/schema` (Task 2); `process.env.GRUPO_PILOTO_ID`, `process.env.CICLO_PILOTO_ID` (Task 1).
- Produces: `crearAlumno(formData: FormData): Promise<void>`, `actualizarAlumno(id: string, formData: FormData): Promise<void>`, `alternarActivoAlumno(id: string, activo: boolean): Promise<void>` — all `"use server"` actions, imported by Tasks 4–7.

- [ ] **Step 1: Write the actions**

`src/app/(dashboard)/alumnos/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { alumnoSchema } from "@/lib/alumnos/schema";

const GRUPO_PILOTO_ID = process.env.GRUPO_PILOTO_ID!;
const CICLO_PILOTO_ID = process.env.CICLO_PILOTO_ID!;

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

export async function crearAlumno(formData: FormData) {
  const datos = parseAlumnoFormData(formData);
  const supabase = createClient();

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
    grupo_id: GRUPO_PILOTO_ID,
    ciclo_escolar_id: CICLO_PILOTO_ID,
  });

  if (errorInscripcion) {
    throw new Error(`No se pudo inscribir al alumno: ${errorInscripcion.message}`);
  }

  revalidatePath("/alumnos");
  redirect("/alumnos");
}

export async function actualizarAlumno(id: string, formData: FormData) {
  const datos = parseAlumnoFormData(formData);
  const supabase = createClient();

  const { error } = await supabase.from("alumnos").update(datos).eq("id", id);

  if (error) {
    throw new Error(`No se pudo actualizar el alumno: ${error.message}`);
  }

  revalidatePath("/alumnos");
  redirect("/alumnos");
}

export async function alternarActivoAlumno(id: string, activo: boolean) {
  const supabase = createClient();

  const { error } = await supabase
    .from("alumnos")
    .update({ activo: !activo })
    .eq("id", id);

  if (error) {
    throw new Error(`No se pudo cambiar el estatus del alumno: ${error.message}`);
  }

  revalidatePath("/alumnos");
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run build`
Expected: exits 0. (No page calls these actions yet, so this only confirms types.)

- [ ] **Step 3: Commit**

```bash
git add src/app/\(dashboard\)/alumnos/actions.ts
git commit -m "feat: add alumnos server actions"
```

---

### Task 4: Shared `AlumnoForm` component

**Files:**
- Create: `src/components/alumnos/AlumnoForm.tsx`

**Interfaces:**
- Consumes: `alumnoSchema` from `@/lib/alumnos/schema` (Task 2), used only for client-side pre-submit validation (the Server Action re-validates independently — this is feedback, not the source of truth).
- Produces: `AlumnoForm` component and `type AlumnoFormValues = { nombre_completo: string; fecha_nacimiento: string; matricula: string; tutor_nombre: string; tutor_telefono: string; tutor_email: string }`, both exported from `src/components/alumnos/AlumnoForm.tsx`. Props: `{ action: (formData: FormData) => void; valoresIniciales?: AlumnoFormValues; textoBoton: string }`. Consumed by Tasks 5 and 6.

- [ ] **Step 1: Write the component**

`src/components/alumnos/AlumnoForm.tsx` — a client component so it can give inline feedback from `alumnoSchema` before the Server Action runs (the spec calls for the schema shared between "cliente, feedback inmediato" and "Server Action, fuente de verdad"):

```tsx
"use client";

import { useState, type FormEvent } from "react";
import { alumnoSchema } from "@/lib/alumnos/schema";

export interface AlumnoFormValues {
  nombre_completo: string;
  fecha_nacimiento: string;
  matricula: string;
  tutor_nombre: string;
  tutor_telefono: string;
  tutor_email: string;
}

const VALORES_VACIOS: AlumnoFormValues = {
  nombre_completo: "",
  fecha_nacimiento: "",
  matricula: "",
  tutor_nombre: "",
  tutor_telefono: "",
  tutor_email: "",
};

type Errores = Partial<Record<keyof AlumnoFormValues, string>>;

function campo(formData: FormData, nombre: string) {
  return formData.get(nombre) ?? undefined;
}

export function AlumnoForm({
  action,
  valoresIniciales = VALORES_VACIOS,
  textoBoton,
}: {
  action: (formData: FormData) => void;
  valoresIniciales?: AlumnoFormValues;
  textoBoton: string;
}) {
  const [errores, setErrores] = useState<Errores>({});

  function manejarEnvio(evento: FormEvent<HTMLFormElement>) {
    const formData = new FormData(evento.currentTarget);
    const resultado = alumnoSchema.safeParse({
      nombre_completo: campo(formData, "nombre_completo"),
      fecha_nacimiento: campo(formData, "fecha_nacimiento"),
      matricula: campo(formData, "matricula"),
      tutor_nombre: campo(formData, "tutor_nombre"),
      tutor_telefono: campo(formData, "tutor_telefono"),
      tutor_email: campo(formData, "tutor_email"),
    });

    if (!resultado.success) {
      evento.preventDefault();
      const nuevosErrores: Errores = {};
      for (const issue of resultado.error.issues) {
        const campoConError = issue.path[0] as keyof AlumnoFormValues;
        nuevosErrores[campoConError] = issue.message;
      }
      setErrores(nuevosErrores);
      return;
    }

    setErrores({});
  }

  return (
    <form action={action} onSubmit={manejarEnvio} noValidate className="max-w-lg space-y-4">
      <div>
        <label
          htmlFor="nombre_completo"
          className="block text-sm font-medium text-zinc-700"
        >
          Nombre completo
        </label>
        <input
          id="nombre_completo"
          name="nombre_completo"
          defaultValue={valoresIniciales.nombre_completo}
          className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2"
        />
        {errores.nombre_completo && (
          <p className="mt-1 text-sm text-red-600">{errores.nombre_completo}</p>
        )}
      </div>
      <div>
        <label
          htmlFor="fecha_nacimiento"
          className="block text-sm font-medium text-zinc-700"
        >
          Fecha de nacimiento
        </label>
        <input
          id="fecha_nacimiento"
          name="fecha_nacimiento"
          type="date"
          defaultValue={valoresIniciales.fecha_nacimiento}
          className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2"
        />
      </div>
      <div>
        <label htmlFor="matricula" className="block text-sm font-medium text-zinc-700">
          Matrícula
        </label>
        <input
          id="matricula"
          name="matricula"
          defaultValue={valoresIniciales.matricula}
          className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2"
        />
      </div>
      <div>
        <label
          htmlFor="tutor_nombre"
          className="block text-sm font-medium text-zinc-700"
        >
          Nombre del tutor
        </label>
        <input
          id="tutor_nombre"
          name="tutor_nombre"
          defaultValue={valoresIniciales.tutor_nombre}
          className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2"
        />
      </div>
      <div>
        <label
          htmlFor="tutor_telefono"
          className="block text-sm font-medium text-zinc-700"
        >
          Teléfono del tutor
        </label>
        <input
          id="tutor_telefono"
          name="tutor_telefono"
          defaultValue={valoresIniciales.tutor_telefono}
          className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2"
        />
      </div>
      <div>
        <label
          htmlFor="tutor_email"
          className="block text-sm font-medium text-zinc-700"
        >
          Correo del tutor
        </label>
        <input
          id="tutor_email"
          name="tutor_email"
          type="email"
          defaultValue={valoresIniciales.tutor_email}
          className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2"
        />
        {errores.tutor_email && (
          <p className="mt-1 text-sm text-red-600">{errores.tutor_email}</p>
        )}
      </div>
      <button
        type="submit"
        className="rounded-md bg-primario px-4 py-2 text-sm font-medium text-white hover:opacity-90"
      >
        {textoBoton}
      </button>
    </form>
  );
}
```

Note: `required` was dropped from the `nombre_completo` input and `noValidate` was added to the `<form>` — otherwise the browser's native validation UI would fire before `onSubmit` runs and `alumnoSchema`'s error message would never show. `manejarEnvio` calls `evento.preventDefault()` only when validation fails; on success it returns normally and the browser proceeds with the native form submission to the Server Action passed via `action`.

- [ ] **Step 2: Verify it compiles**

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/components/alumnos/AlumnoForm.tsx
git commit -m "feat: add shared AlumnoForm component"
```

---

### Task 5: Alta page (`/alumnos/nuevo`)

**Files:**
- Create: `src/app/(dashboard)/alumnos/nuevo/page.tsx`

**Interfaces:**
- Consumes: `AlumnoForm` from `@/components/alumnos/AlumnoForm` (Task 4); `crearAlumno` from `../actions` (Task 3).

- [ ] **Step 1: Write the page**

`src/app/(dashboard)/alumnos/nuevo/page.tsx`:

```tsx
import { AlumnoForm } from "@/components/alumnos/AlumnoForm";
import { crearAlumno } from "../actions";

export default function NuevoAlumnoPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900">Agregar alumno</h1>
      <div className="mt-6">
        <AlumnoForm action={crearAlumno} textoBoton="Guardar alumno" />
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
git add src/app/\(dashboard\)/alumnos/nuevo/page.tsx
git commit -m "feat: add alta de alumno page"
```

---

### Task 6: Edición page (`/alumnos/[id]/editar`)

**Files:**
- Create: `src/app/(dashboard)/alumnos/[id]/editar/page.tsx`

**Interfaces:**
- Consumes: `createClient()` from `@/lib/supabase/server` (Task 1); `AlumnoForm`, `AlumnoFormValues` from `@/components/alumnos/AlumnoForm` (Task 4); `actualizarAlumno` from `../../actions` (Task 3).

- [ ] **Step 1: Write the page**

`src/app/(dashboard)/alumnos/[id]/editar/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { AlumnoForm, type AlumnoFormValues } from "@/components/alumnos/AlumnoForm";
import { createClient } from "@/lib/supabase/server";
import { actualizarAlumno } from "../../actions";

export default async function EditarAlumnoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
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
          action={actualizarAlumno.bind(null, id)}
          valoresIniciales={valoresIniciales}
          textoBoton="Guardar cambios"
        />
      </div>
    </div>
  );
}
```

*(If your TypeScript build complains that `PageProps`/typed-route params don't match, use the explicit `params: Promise<{ id: string }>` shape above — it's the plain, non-typed-routes form and always works regardless of whether `typedRoutes` is enabled in `next.config.ts`.)*

- [ ] **Step 2: Verify it compiles**

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(dashboard\)/alumnos/\[id\]/editar/page.tsx
git commit -m "feat: add edición de alumno page"
```

---

### Task 7: Listado page (`/alumnos`) — replaces the placeholder

**Files:**
- Modify: `src/app/(dashboard)/alumnos/page.tsx`

**Interfaces:**
- Consumes: `createClient()` from `@/lib/supabase/server` (Task 1); `alternarActivoAlumno` from `./actions` (Task 3); `process.env.GRUPO_PILOTO_ID` (Task 1).

- [ ] **Step 1: Replace the placeholder page**

`src/app/(dashboard)/alumnos/page.tsx`:

```tsx
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { alternarActivoAlumno } from "./actions";

const GRUPO_PILOTO_ID = process.env.GRUPO_PILOTO_ID!;

interface AlumnoListado {
  id: string;
  nombre_completo: string;
  matricula: string | null;
  tutor_nombre: string | null;
  activo: boolean;
}

async function obtenerAlumnosDelGrupo(): Promise<AlumnoListado[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("inscripciones")
    .select("alumnos(id, nombre_completo, matricula, tutor_nombre, activo)")
    .eq("grupo_id", GRUPO_PILOTO_ID);

  if (error) {
    throw new Error(`No se pudo cargar la lista de alumnos: ${error.message}`);
  }

  return (data ?? [])
    .map((inscripcion) => inscripcion.alumnos)
    .filter((alumno): alumno is AlumnoListado => alumno !== null);
}

export default async function AlumnosPage() {
  const alumnos = await obtenerAlumnosDelGrupo();

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-zinc-900">
          Alumnos y grados
        </h1>
        <Link
          href="/alumnos/nuevo"
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
                    href={`/alumnos/${alumno.id}/editar`}
                    className="text-primario hover:underline"
                  >
                    Editar
                  </Link>
                  <form
                    action={alternarActivoAlumno.bind(null, alumno.id, alumno.activo)}
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
Expected: exits 0. This build will actually query the real (currently empty) `alumnos`/`inscripciones` tables, so a successful build here is also the first real signal the wiring works end-to-end.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(dashboard\)/alumnos/page.tsx
git commit -m "feat: replace alumnos placeholder with real listing"
```

---

### Task 8: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full automated suite**

```bash
npm run lint
npm test
npm run build
```

Expected: all three exit 0.

- [ ] **Step 2: Manual end-to-end check against the real Supabase project**

Run `npm run dev`, open `/alumnos`, and confirm by hand (this is the check the spec calls out explicitly as needing a real browser — it's not automatable in this session):

1. The page loads with "Todavía no hay alumnos registrados." (table is empty).
2. Click "Agregar alumno", fill only the required name, submit — redirected to `/alumnos`, the new alumno appears with matrícula/tutor showing "—" and estatus "Activo".
3. Click "Agregar alumno" again, this time fill every field including a valid `tutor_email` — confirm it saves and appears correctly.
4. Try submitting the alta form with an invalid `tutor_email` (e.g. `foo`) — confirm the form blocks submission and shows the inline "El correo del tutor no es válido" message instead of navigating away.
5. Click "Editar" on an alumno, change a field, save — confirm the change reflects in the listing.
6. Click "Dar de baja" — confirm estatus flips to "Inactivo" and the button now reads "Reactivar"; confirm the row is still visible (logical delete, not removed).
7. Click "Reactivar" — confirm it flips back to "Activo".
8. In the Supabase dashboard (or via `mcp__supabase-ibero__execute_sql`), confirm each created alumno has a matching row in `inscripciones` with `grupo_id = d7c205c3-1540-4dc1-b379-5f5e17e911b3` and `ciclo_escolar_id = 0c2de2db-7277-4046-9959-1584f75b6d1d`.

- [ ] **Step 3: Update project state doc**

Edit `CONTEXTO_CLAUDE_CODE.md`: mark the alumnos pilot as implemented and verified, and move "RLS básico por rol" up as the next actionable step.

- [ ] **Step 4: Commit**

```bash
git add CONTEXTO_CLAUDE_CODE.md
git commit -m "docs: mark alumnos pilot as implemented"
```
