# Materias + asignación docente-materia-grupo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Materias por grado, asignación de maestro-materia-grupo-ciclo (un maestro por combinación), y lista de alumnos por materia que por defecto es el grupo completo y se puede sobreescribir a mano — segunda de 3 sub-piezas para soportar la captura de calificaciones.

**Architecture:** Tres tablas nuevas (`materias`, `asignaciones`, `materia_alumnos`) y una pantalla de administración bajo `/materias` con la misma navegación por tarjetas Nivel → Grado que ya existe en Alumnos, pero de solo lectura (no vuelve a editar niveles/grados). Visible y editable solo para `super_admin` y `direccion`. Se endurece el tipo de `rol` de `string` suelto a una unión de los 4 valores reales.

**Tech Stack:** Next.js 16 App Router, Supabase, Zod, Vitest — mismo stack que el resto del proyecto, sin dependencias nuevas.

**Spec:** `docs/superpowers/specs/2026-09-01-materias-asignacion-design.md`

## Global Constraints

- Cada materia pertenece a exactamente un grado (`materias.grado_id not null`) — "Matemáticas 1" y "Matemáticas 2" son materias distintas, nunca la misma materia repetida por grado.
- Máximo un maestro por materia+grupo+ciclo — índice único en `asignaciones(materia_id, grupo_id, ciclo_escolar_id)`.
- Lista de alumnos de una materia: si hay filas en `materia_alumnos` para esa materia+ciclo, esa es la lista completa (reemplaza, no se suma al grupo); si no hay ninguna, la lista es el grupo completo inscrito en el grupo de su asignación.
- Pantallas de Materias visibles y editables **solo** para `super_admin` y `direccion` — nunca `docente`. Cada Server Action de escritura vuelve a verificar el rol de forma independiente (no confía en que la UI ocultó el botón), usando el helper `requerirRol` de esta misma pieza.
- `PerfilActual.rol` pasa de `string` a la unión `"super_admin" | "direccion" | "caja" | "docente"` (tipo `Rol` en `src/lib/roles.ts`). Todo el código que lee `rol` se actualiza a este tipo.
- No se agrega ninguna política RLS nueva en esta pieza (mismo criterio que el resto del proyecto hoy).
- El patrón de embed sancionado (`.select("alumnos(...)")` + `.flatMap()`, ver `src/app/(dashboard)/alumnos/grupo/[grupoId]/page.tsx`) se extiende también a `materia_alumnos → alumnos` — misma relación de llave foránea a-uno, mismo motivo (evitar dos queries planas cuando el embed es seguro).
- **Limitación aceptada:** si Dirección desmarca a *todos* los alumnos de la lista propia de una materia (guardando una lista vacía), el sistema no puede distinguir "lista propia intencionalmente vacía" de "sin lista propia" — ambas se ven igual (cero filas en `materia_alumnos`), así que la materia vuelve a mostrar el grupo completo. No se resuelve en esta pieza (caso de uso extremadamente raro: una materia con cero alumnos).

---

## Prerequisites (las ejecuta el orquestador antes del Task 1, no un subagente)

Aplicar esta migración a la base real vía `apply_migration`:

```sql
create table materias (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
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
-- Si no hay filas para una materia+ciclo, la lista es el grupo completo.
create table materia_alumnos (
  id uuid primary key default gen_random_uuid(),
  materia_id uuid not null references materias(id),
  alumno_id uuid not null references alumnos(id),
  ciclo_escolar_id uuid not null references ciclos_escolares(id)
);
create unique index idx_materia_alumnos_unica on materia_alumnos(materia_id, alumno_id, ciclo_escolar_id);
```

No se siembra ninguna materia real — el propósito de esta pieza es que
Dirección las dé de alta desde la UI, no que vengan precargadas.

---

### Task 1: Tipo de rol estrecho + helper de control de acceso

**Files:**
- Create: `src/lib/roles.ts`
- Create: `src/lib/roles.test.ts`
- Create: `src/lib/perfiles/requerirRol.ts`
- Modify: `src/lib/perfiles/actual.ts`
- Modify: `src/lib/nav.ts`
- Modify: `src/components/layout/Sidebar.tsx`

**Interfaces:**
- Produces: `export const ROLES` y `export type Rol` desde `@/lib/roles` — usado por el resto de esta pieza (y por las 2 piezas anteriores, que ya declaraban `rol` como `string`).
- Produces: `export async function requerirRol(rolesPermitidos: Rol[]): Promise<PerfilActual>` desde `@/lib/perfiles/requerirRol` — usado por todas las Server Actions nuevas de esta pieza (Tasks 4, 5, 6).

- [ ] **Step 1: Escribir el test que debe fallar**

Crear `src/lib/roles.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ROLES } from "./roles";

describe("ROLES", () => {
  it("contiene exactamente los 4 roles reales", () => {
    expect(ROLES).toEqual(["super_admin", "direccion", "caja", "docente"]);
  });
});
```

- [ ] **Step 2: Correr el test y confirmar que falla**

Run: `npx vitest run src/lib/roles.test.ts`
Expected: FAIL — `Cannot find module './roles'`.

- [ ] **Step 3: Crear `src/lib/roles.ts`**

```ts
export const ROLES = ["super_admin", "direccion", "caja", "docente"] as const;

export type Rol = (typeof ROLES)[number];
```

- [ ] **Step 4: Correr el test y confirmar que pasa**

Run: `npx vitest run src/lib/roles.test.ts`
Expected: PASS.

- [ ] **Step 5: Crear `src/lib/perfiles/requerirRol.ts`**

```ts
import { obtenerPerfilActual, type PerfilActual } from "@/lib/perfiles/actual";
import type { Rol } from "@/lib/roles";

export async function requerirRol(rolesPermitidos: Rol[]): Promise<PerfilActual> {
  const perfil = await obtenerPerfilActual();

  if (!perfil || !rolesPermitidos.includes(perfil.rol)) {
    throw new Error("No tienes permiso para esta acción.");
  }

  return perfil;
}
```

- [ ] **Step 6: Actualizar `src/lib/perfiles/actual.ts`**

Cambiar el import y el tipo de `rol`:

```ts
import { createClient } from "@/lib/supabase/server";
import type { Rol } from "@/lib/roles";

export interface PerfilActual {
  id: string;
  usuario_auth_id: string;
  nombre_completo: string;
  rol: Rol;
}

export async function obtenerPerfilActual(): Promise<PerfilActual | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data, error } = await supabase
    .from("perfiles")
    .select("id, usuario_auth_id, nombre_completo, rol")
    .eq("usuario_auth_id", user.id)
    .maybeSingle();

  if (error) {
    console.error(`No se pudo cargar el perfil actual: ${error.message}`);
    return null;
  }

  return data;
}
```

- [ ] **Step 7: Actualizar `src/lib/nav.ts`**

```ts
import type { Rol } from "@/lib/roles";

export interface NavItem {
  label: string;
  href: string;
  rolesPermitidos?: Rol[];
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Alumnos y grados", href: "/alumnos" },
  { label: "Pagos", href: "/pagos" },
  { label: "Listas / Asistencia", href: "/asistencia" },
  { label: "Materias", href: "/materias", rolesPermitidos: ["super_admin", "direccion"] },
  { label: "Usuarios", href: "/usuarios", rolesPermitidos: ["super_admin"] },
];

export function isNavItemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function navItemsVisibles(rol: Rol | null): NavItem[] {
  return NAV_ITEMS.filter(
    (item) =>
      !item.rolesPermitidos || (rol !== null && item.rolesPermitidos.includes(rol))
  );
}
```

- [ ] **Step 8: Actualizar `src/components/layout/Sidebar.tsx`**

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isNavItemActive, navItemsVisibles } from "@/lib/nav";
import type { Rol } from "@/lib/roles";

export function Sidebar({ rol }: { rol: Rol | null }) {
  const pathname = usePathname();
  const items = navItemsVisibles(rol);

  return (
    <nav
      className="flex w-56 shrink-0 flex-col gap-1 border-r border-black/10 bg-white p-4"
      aria-label="Navegación principal"
    >
      {items.map((item) => {
        const active = isNavItemActive(pathname, item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              active
                ? "bg-primario-activo text-white"
                : "text-zinc-700 hover:bg-zinc-100"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 9: Actualizar `src/lib/nav.test.ts`**

Reemplazar el contenido completo:

```ts
import { describe, expect, it } from "vitest";
import { isNavItemActive, NAV_ITEMS, navItemsVisibles } from "./nav";

describe("NAV_ITEMS", () => {
  it("has the 5 modules in order, con Materias y Usuarios restringidos", () => {
    expect(NAV_ITEMS.map((item) => item.href)).toEqual([
      "/alumnos",
      "/pagos",
      "/asistencia",
      "/materias",
      "/usuarios",
    ]);
    expect(NAV_ITEMS.find((item) => item.href === "/materias")?.rolesPermitidos).toEqual([
      "super_admin",
      "direccion",
    ]);
    expect(NAV_ITEMS.find((item) => item.href === "/usuarios")?.rolesPermitidos).toEqual([
      "super_admin",
    ]);
  });
});

describe("isNavItemActive", () => {
  it("matches an exact path", () => {
    expect(isNavItemActive("/alumnos", "/alumnos")).toBe(true);
  });

  it("matches a nested path under the item", () => {
    expect(isNavItemActive("/alumnos/123", "/alumnos")).toBe(true);
  });

  it("does not match a different top-level path", () => {
    expect(isNavItemActive("/pagos", "/alumnos")).toBe(false);
  });

  it("does not match a path that merely shares a text prefix", () => {
    expect(isNavItemActive("/alumnosx", "/alumnos")).toBe(false);
  });
});

describe("navItemsVisibles", () => {
  it("includes items with no rolesPermitidos regardless of rol", () => {
    const hrefs = navItemsVisibles(null).map((item) => item.href);
    expect(hrefs).toEqual(["/alumnos", "/pagos", "/asistencia"]);
  });

  it("excludes materias and usuarios for docente", () => {
    const hrefs = navItemsVisibles("docente").map((item) => item.href);
    expect(hrefs).not.toContain("/materias");
    expect(hrefs).not.toContain("/usuarios");
  });

  it("includes materias but not usuarios for direccion", () => {
    const hrefs = navItemsVisibles("direccion").map((item) => item.href);
    expect(hrefs).toContain("/materias");
    expect(hrefs).not.toContain("/usuarios");
  });

  it("includes materias and usuarios for super_admin", () => {
    const hrefs = navItemsVisibles("super_admin").map((item) => item.href);
    expect(hrefs).toContain("/materias");
    expect(hrefs).toContain("/usuarios");
  });
});
```

- [ ] **Step 10: Verificar build y suite completa**

Run: `npm run build && npm test`
Expected: build limpio, todos los tests pasan.

- [ ] **Step 11: Commit**

```bash
git add src/lib/roles.ts src/lib/roles.test.ts src/lib/perfiles/requerirRol.ts src/lib/perfiles/actual.ts src/lib/nav.ts src/lib/nav.test.ts src/components/layout/Sidebar.tsx
git commit -m "feat: endurecer tipo de rol y agregar helper requerirRol"
```

---

### Task 2: Schema de validación para asignaciones

**Files:**
- Create: `src/lib/asignaciones/schema.ts`
- Test: `src/lib/asignaciones/schema.test.ts`

**Interfaces:**
- Produces: `export const asignacionSchema` y `export type AsignacionInput` — usado por el Task 5.

- [ ] **Step 1: Escribir el test que debe fallar**

Crear `src/lib/asignaciones/schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { asignacionSchema } from "./schema";

describe("asignacionSchema", () => {
  it("accepts a valid grupo_id and docente_perfil_id", () => {
    const result = asignacionSchema.safeParse({
      grupo_id: "11111111-1111-1111-1111-111111111111",
      docente_perfil_id: "22222222-2222-2222-2222-222222222222",
    });

    expect(result.success).toBe(true);
  });

  it("rejects a missing grupo_id", () => {
    const result = asignacionSchema.safeParse({
      docente_perfil_id: "22222222-2222-2222-2222-222222222222",
    });

    expect(result.success).toBe(false);
  });

  it("rejects an empty grupo_id", () => {
    const result = asignacionSchema.safeParse({
      grupo_id: "",
      docente_perfil_id: "22222222-2222-2222-2222-222222222222",
    });

    expect(result.success).toBe(false);
  });

  it("rejects a missing docente_perfil_id", () => {
    const result = asignacionSchema.safeParse({
      grupo_id: "11111111-1111-1111-1111-111111111111",
    });

    expect(result.success).toBe(false);
  });

  it("rejects an empty docente_perfil_id", () => {
    const result = asignacionSchema.safeParse({
      grupo_id: "11111111-1111-1111-1111-111111111111",
      docente_perfil_id: "",
    });

    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Correr el test y confirmar que falla**

Run: `npx vitest run src/lib/asignaciones/schema.test.ts`
Expected: FAIL — `Cannot find module './schema'`.

- [ ] **Step 3: Crear `src/lib/asignaciones/schema.ts`**

```ts
import { z } from "zod";

export const asignacionSchema = z.object({
  grupo_id: z.string().trim().min(1, "Selecciona un grupo"),
  docente_perfil_id: z.string().trim().min(1, "Selecciona un maestro"),
});

export type AsignacionInput = z.infer<typeof asignacionSchema>;
```

- [ ] **Step 4: Correr el test y confirmar que pasa**

Run: `npx vitest run src/lib/asignaciones/schema.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/asignaciones/schema.ts src/lib/asignaciones/schema.test.ts
git commit -m "feat: agregar asignacionSchema"
```

---

### Task 3: Navegación de solo lectura Nivel → Grado + entrada en el nav

**Files:**
- Create: `src/components/materias/TarjetaNavegacion.tsx`
- Create: `src/app/(dashboard)/materias/page.tsx`
- Create: `src/app/(dashboard)/materias/nivel/[nivelId]/page.tsx`

**Interfaces:**
- Consumes: `createClient()` de `@/lib/supabase/server`.
- Produces: las rutas `/materias` y `/materias/nivel/[nivelId]`. `/materias/nivel/[nivelId]` redirige a `/materias/grado/[gradoId]` (creada en el Task 4) cuando el nivel tiene exactamente 1 grado.

- [ ] **Step 1: Crear `src/components/materias/TarjetaNavegacion.tsx`**

```tsx
import Link from "next/link";

export function TarjetaNavegacion({
  nombre,
  subtitulo,
  href,
  color,
}: {
  nombre: string;
  subtitulo: string;
  href: string;
  color: string;
}) {
  return (
    <Link
      href={href}
      className="block rounded-2xl p-5 text-white"
      style={{ backgroundColor: color }}
    >
      <div className="text-base font-bold">{nombre}</div>
      <div className="text-sm opacity-90">{subtitulo}</div>
    </Link>
  );
}
```

- [ ] **Step 2: Crear `src/app/(dashboard)/materias/page.tsx`**

```tsx
import { createClient } from "@/lib/supabase/server";
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

export default async function MateriasPage() {
  const niveles = await obtenerNiveles();

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900">Materias</h1>
      <p className="mt-1 text-sm text-zinc-600">Elige un nivel para ver sus grados.</p>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {niveles.map((nivel, indice) => (
          <TarjetaNavegacion
            key={nivel.id}
            nombre={nivel.nombre}
            subtitulo={`${nivel.cantidadGrados} grado${nivel.cantidadGrados === 1 ? "" : "s"}`}
            href={`/materias/nivel/${nivel.id}`}
            color={COLORES_NIVEL[indice % COLORES_NIVEL.length]}
          />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Crear `src/app/(dashboard)/materias/nivel/[nivelId]/page.tsx`**

```tsx
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TarjetaNavegacion } from "@/components/materias/TarjetaNavegacion";

export const dynamic = "force-dynamic";

const COLORES_GRADO = ["#E3312D", "#c02926", "#8a3a38", "#5a2a29"];

interface GradoSimple {
  id: string;
  nombre: string;
}

export default async function MateriasNivelPage({
  params,
}: {
  params: Promise<{ nivelId: string }>;
}) {
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

  // A diferencia de Alumnos, aquí no hay nada que gestionar en esta
  // pantalla (es solo navegación), así que no hace falta el escape
  // ?ver=todos: no hay controles que puedan quedar inalcanzables.
  if (gradosSimples.length === 1) {
    redirect(`/materias/grado/${gradosSimples[0].id}`);
  }

  return (
    <div>
      <p className="text-sm text-zinc-600">
        <Link href="/materias" className="hover:underline">
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
            subtitulo="Ver materias"
            href={`/materias/grado/${grado.id}`}
            color={COLORES_GRADO[indice % COLORES_GRADO.length]}
          />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verificar el build**

Run: `npm run build`
Expected: build limpio. (El link a `/materias/grado/[gradoId]` todavía no resuelve a una página real — se crea en el Task 4 — pero eso no rompe el build de Next, solo daría 404 en vivo hasta entonces.)

- [ ] **Step 5: Commit**

```bash
git add src/components/materias/TarjetaNavegacion.tsx src/app/\(dashboard\)/materias/page.tsx src/app/\(dashboard\)/materias/nivel
git commit -m "feat: agregar navegación de solo lectura Nivel/Grado para Materias"
```

---

### Task 4: CRUD de materias en la página del grado

**Files:**
- Create: `src/app/(dashboard)/materias/actions.ts`
- Create: `src/components/materias/FilaMateria.tsx`
- Create: `src/app/(dashboard)/materias/grado/[gradoId]/page.tsx`

**Interfaces:**
- Consumes: `requerirRol` (Task 1), `nombreEstructuraSchema` de `@/lib/estructura/schema` (ya existe).
- Produces: la ruta `/materias/grado/[gradoId]`, con alta/renombrado/eliminación de materias. Las asignaciones se agregan en el Task 5 sobre esta misma página.

- [ ] **Step 1: Crear `src/app/(dashboard)/materias/actions.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { nombreEstructuraSchema } from "@/lib/estructura/schema";
import { requerirRol } from "@/lib/perfiles/requerirRol";

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

export async function crearMateria(gradoId: string, formData: FormData) {
  await requerirRol(["super_admin", "direccion"]);
  const { nombre } = nombreEstructuraSchema.parse({
    nombre: formData.get("nombre") ?? undefined,
  });
  const supabase = await createClient();

  const { error } = await supabase
    .from("materias")
    .insert({ nombre, grado_id: gradoId });

  manejarError(
    error,
    "Ya existe una materia con ese nombre en este grado.",
    "No se pudo crear la materia"
  );

  revalidatePath(`/materias/grado/${gradoId}`);
}

export async function renombrarMateria(id: string, gradoId: string, formData: FormData) {
  await requerirRol(["super_admin", "direccion"]);
  const { nombre } = nombreEstructuraSchema.parse({
    nombre: formData.get("nombre") ?? undefined,
  });
  const supabase = await createClient();

  const { error } = await supabase.from("materias").update({ nombre }).eq("id", id);

  manejarError(
    error,
    "Ya existe una materia con ese nombre en este grado.",
    "No se pudo renombrar la materia"
  );

  revalidatePath(`/materias/grado/${gradoId}`);
}

export async function eliminarMateria(id: string, gradoId: string) {
  await requerirRol(["super_admin", "direccion"]);
  const supabase = await createClient();

  const { count, error: errorConteo } = await supabase
    .from("asignaciones")
    .select("id", { count: "exact", head: true })
    .eq("materia_id", id);

  if (errorConteo) {
    throw new Error(`No se pudo verificar la materia: ${errorConteo.message}`);
  }
  if (count && count > 0) {
    throw new Error("No se puede eliminar: esta materia tiene un maestro asignado.");
  }

  const { error } = await supabase.from("materias").delete().eq("id", id);
  if (error) {
    throw new Error(`No se pudo eliminar la materia: ${error.message}`);
  }

  revalidatePath(`/materias/grado/${gradoId}`);
}
```

- [ ] **Step 2: Crear `src/components/materias/FilaMateria.tsx`**

```tsx
"use client";

import { useState } from "react";

export interface FilaMateriaProps {
  nombre: string;
  cantidadAsignaciones: number;
  accionRenombrar: (formData: FormData) => void | Promise<void>;
  accionEliminar: () => void | Promise<void>;
  children?: React.ReactNode;
}

export function FilaMateria({
  nombre,
  cantidadAsignaciones,
  accionRenombrar,
  accionEliminar,
  children,
}: FilaMateriaProps) {
  const [editando, setEditando] = useState(false);

  return (
    <div className="rounded-md border border-zinc-200 p-3">
      {editando ? (
        <form
          action={async (formData) => {
            await accionRenombrar(formData);
            setEditando(false);
          }}
          className="flex items-center gap-2"
        >
          <input
            name="nombre"
            defaultValue={nombre}
            required
            autoFocus
            className="flex-1 rounded-md border border-zinc-300 px-2 py-1 text-sm"
          />
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
        </form>
      ) : (
        <div className="flex items-center justify-between">
          <span className="font-medium text-zinc-900">{nombre}</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setEditando(true)}
              className="rounded-md border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
            >
              Renombrar
            </button>
            {cantidadAsignaciones > 0 ? (
              <span
                title="No se puede eliminar: tiene un maestro asignado."
                className="cursor-not-allowed rounded-md border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-400"
              >
                Eliminar
              </span>
            ) : (
              <form
                action={accionEliminar}
                onSubmit={(evento) => {
                  if (!confirm(`¿Eliminar "${nombre}"? Esta acción no se puede deshacer.`)) {
                    evento.preventDefault();
                  }
                }}
              >
                <button
                  type="submit"
                  className="rounded-md border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
                >
                  Eliminar
                </button>
              </form>
            )}
          </div>
        </div>
      )}
      {children}
    </div>
  );
}
```

`children` queda listo para que el Task 5 le agregue debajo la sección de
asignaciones de esa materia, sin tener que tocar este componente.

- [ ] **Step 3: Crear `src/app/(dashboard)/materias/grado/[gradoId]/page.tsx`**

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TarjetaAgregar } from "@/components/alumnos/TarjetaAgregar";
import { FilaMateria } from "@/components/materias/FilaMateria";
import { crearMateria, renombrarMateria, eliminarMateria } from "../../actions";

export const dynamic = "force-dynamic";

interface ContextoGrado {
  nivelId: string;
  nivelNombre: string;
  gradoNombre: string;
}

interface MateriaListado {
  id: string;
  nombre: string;
  cantidadAsignaciones: number;
}

async function obtenerContexto(gradoId: string): Promise<ContextoGrado | null> {
  const supabase = await createClient();

  const { data: grado, error: errorGrado } = await supabase
    .from("grados")
    .select("nombre, nivel_id")
    .eq("id", gradoId)
    .single();

  if (errorGrado || !grado) {
    return null;
  }

  const { data: nivel, error: errorNivel } = await supabase
    .from("niveles")
    .select("nombre")
    .eq("id", grado.nivel_id)
    .single();

  if (errorNivel || !nivel) {
    return null;
  }

  return {
    nivelId: grado.nivel_id,
    nivelNombre: nivel.nombre,
    gradoNombre: grado.nombre,
  };
}

async function obtenerMaterias(gradoId: string): Promise<MateriaListado[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("materias")
    .select("id, nombre")
    .eq("grado_id", gradoId)
    .order("orden");

  if (error) {
    throw new Error(`No se pudieron cargar las materias: ${error.message}`);
  }

  return Promise.all(
    (data ?? []).map(async (materia) => {
      const { count } = await supabase
        .from("asignaciones")
        .select("id", { count: "exact", head: true })
        .eq("materia_id", materia.id);

      return { id: materia.id, nombre: materia.nombre, cantidadAsignaciones: count ?? 0 };
    })
  );
}

export default async function MateriasGradoPage({
  params,
}: {
  params: Promise<{ gradoId: string }>;
}) {
  const { gradoId } = await params;
  const contexto = await obtenerContexto(gradoId);

  if (!contexto) {
    notFound();
  }

  const materias = await obtenerMaterias(gradoId);

  return (
    <div>
      <p className="text-sm text-zinc-600">
        <Link href="/materias" className="hover:underline">
          ← Niveles
        </Link>{" "}
        /{" "}
        <Link href={`/materias/nivel/${contexto.nivelId}`} className="hover:underline">
          {contexto.nivelNombre}
        </Link>{" "}
        / <span className="font-medium text-zinc-900">{contexto.gradoNombre}</span>
      </p>
      <h1 className="mt-1 text-2xl font-semibold text-zinc-900">
        Materias — {contexto.gradoNombre}
      </h1>

      {materias.length === 0 && (
        <p className="mt-6 text-zinc-600">Este grado todavía no tiene materias.</p>
      )}

      <div className="mt-6 space-y-3">
        {materias.map((materia) => (
          <FilaMateria
            key={materia.id}
            nombre={materia.nombre}
            cantidadAsignaciones={materia.cantidadAsignaciones}
            accionRenombrar={renombrarMateria.bind(null, materia.id, gradoId)}
            accionEliminar={eliminarMateria.bind(null, materia.id, gradoId)}
          />
        ))}
      </div>

      <div className="mt-6 max-w-xs">
        <TarjetaAgregar etiqueta="materia" accionCrear={crearMateria.bind(null, gradoId)} />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verificar el build**

Run: `npm run build`
Expected: build limpio.

- [ ] **Step 5: Verificación manual**

Con `npm run dev` corriendo y sesión de `super_admin` o `direccion`
iniciada: entrar a `/materias`, navegar hasta un grado, crear una
materia de prueba, renombrarla, confirmar que "Eliminar" funciona
cuando no tiene asignaciones. Confirmar que un usuario sin sesión (o
con rol `docente`) no puede llegar a completar ninguna de estas
acciones (la Server Action las rechaza).

- [ ] **Step 6: Commit**

```bash
git add src/app/\(dashboard\)/materias/actions.ts src/components/materias/FilaMateria.tsx src/app/\(dashboard\)/materias/grado
git commit -m "feat: agregar CRUD de materias"
```

---

### Task 5: Asignación de maestro-grupo por materia

**Files:**
- Create: `src/lib/perfiles/docentes.ts`
- Create: `src/components/materias/AsignacionesMateria.tsx`
- Modify: `src/app/(dashboard)/materias/actions.ts`
- Modify: `src/app/(dashboard)/materias/grado/[gradoId]/page.tsx`

**Interfaces:**
- Consumes: `asignacionSchema` (Task 2), `requerirRol` (Task 1), `obtenerCicloActivoId` de `@/lib/ciclos/activo` (ya existe), `FilaMateria`'s `children` slot (Task 4).
- Produces: `export interface DocenteListado { id: string; nombre_completo: string }` y `export async function obtenerDocentes(): Promise<DocenteListado[]>` desde `@/lib/perfiles/docentes`.

- [ ] **Step 1: Crear `src/lib/perfiles/docentes.ts`**

```ts
import { createClient } from "@/lib/supabase/server";

export interface DocenteListado {
  id: string;
  nombre_completo: string;
}

export async function obtenerDocentes(): Promise<DocenteListado[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("perfiles")
    .select("id, nombre_completo")
    .eq("rol", "docente")
    .order("nombre_completo");

  if (error) {
    throw new Error(`No se pudieron cargar los maestros: ${error.message}`);
  }

  return data ?? [];
}
```

- [ ] **Step 2: Crear `src/components/materias/AsignacionesMateria.tsx`**

```tsx
"use client";

import { useState } from "react";

export interface AsignacionListada {
  id: string;
  grupoNombre: string;
  docenteNombre: string;
}

export interface OpcionSelect {
  id: string;
  etiqueta: string;
}

export function AsignacionesMateria({
  asignaciones,
  grupos,
  docentes,
  accionCrear,
  accionEliminar,
}: {
  asignaciones: AsignacionListada[];
  grupos: OpcionSelect[];
  docentes: OpcionSelect[];
  accionCrear: (formData: FormData) => void | Promise<void>;
  accionEliminar: (id: string) => void | Promise<void>;
}) {
  const [asignando, setAsignando] = useState(false);

  return (
    <div className="mt-2 space-y-2 border-t border-zinc-100 pt-2 text-sm">
      {asignaciones.length === 0 && (
        <p className="text-zinc-500">Sin maestro asignado.</p>
      )}
      {asignaciones.map((asignacion) => (
        <div key={asignacion.id} className="flex items-center justify-between">
          <span className="text-zinc-700">
            Grupo {asignacion.grupoNombre} — {asignacion.docenteNombre}
          </span>
          <form action={accionEliminar.bind(null, asignacion.id)}>
            <button type="submit" className="text-xs font-medium text-zinc-500 hover:underline">
              Quitar
            </button>
          </form>
        </div>
      ))}

      {asignando ? (
        <form
          action={async (formData) => {
            await accionCrear(formData);
            setAsignando(false);
          }}
          className="flex flex-wrap items-center gap-2"
        >
          <select
            name="grupo_id"
            required
            defaultValue=""
            className="rounded-md border border-zinc-300 px-2 py-1 text-xs"
          >
            <option value="" disabled>
              Grupo…
            </option>
            {grupos.map((grupo) => (
              <option key={grupo.id} value={grupo.id}>
                {grupo.etiqueta}
              </option>
            ))}
          </select>
          <select
            name="docente_perfil_id"
            required
            defaultValue=""
            className="rounded-md border border-zinc-300 px-2 py-1 text-xs"
          >
            <option value="" disabled>
              Maestro…
            </option>
            {docentes.map((docente) => (
              <option key={docente.id} value={docente.id}>
                {docente.etiqueta}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-md bg-primario px-2 py-1 text-xs font-medium text-white"
          >
            Guardar
          </button>
          <button
            type="button"
            onClick={() => setAsignando(false)}
            className="rounded-md border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-700"
          >
            Cancelar
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAsignando(true)}
          className="text-xs font-medium text-primario hover:underline"
        >
          + Asignar a un grupo
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Agregar a `src/app/(dashboard)/materias/actions.ts`**

Agregar estos imports al inicio del archivo (junto a los que ya existen):

```ts
import { asignacionSchema } from "@/lib/asignaciones/schema";
import { obtenerCicloActivoId } from "@/lib/ciclos/activo";
```

Y agregar estas dos funciones al final del archivo:

```ts
export async function guardarAsignacion(
  materiaId: string,
  gradoId: string,
  formData: FormData
) {
  await requerirRol(["super_admin", "direccion"]);
  const { grupo_id, docente_perfil_id } = asignacionSchema.parse({
    grupo_id: formData.get("grupo_id") ?? undefined,
    docente_perfil_id: formData.get("docente_perfil_id") ?? undefined,
  });
  const supabase = await createClient();

  const cicloId = await obtenerCicloActivoId();
  if (!cicloId) {
    throw new Error("No se pudo asignar: no hay un ciclo escolar activo.");
  }

  const { error } = await supabase.from("asignaciones").insert({
    materia_id: materiaId,
    grupo_id,
    docente_perfil_id,
    ciclo_escolar_id: cicloId,
  });

  manejarError(
    error,
    "Ya hay un maestro asignado a esta materia en este grupo y ciclo.",
    "No se pudo asignar el maestro"
  );

  revalidatePath(`/materias/grado/${gradoId}`);
}

export async function eliminarAsignacion(id: string, gradoId: string) {
  await requerirRol(["super_admin", "direccion"]);
  const supabase = await createClient();

  const { error } = await supabase.from("asignaciones").delete().eq("id", id);
  if (error) {
    throw new Error(`No se pudo quitar la asignación: ${error.message}`);
  }

  revalidatePath(`/materias/grado/${gradoId}`);
}
```

- [ ] **Step 4: Reemplazar el contenido de `src/app/(dashboard)/materias/grado/[gradoId]/page.tsx`**

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TarjetaAgregar } from "@/components/alumnos/TarjetaAgregar";
import { FilaMateria } from "@/components/materias/FilaMateria";
import {
  AsignacionesMateria,
  type AsignacionListada,
  type OpcionSelect,
} from "@/components/materias/AsignacionesMateria";
import { obtenerDocentes } from "@/lib/perfiles/docentes";
import {
  crearMateria,
  renombrarMateria,
  eliminarMateria,
  guardarAsignacion,
  eliminarAsignacion,
} from "../../actions";

export const dynamic = "force-dynamic";

interface ContextoGrado {
  nivelId: string;
  nivelNombre: string;
  gradoNombre: string;
}

interface MateriaListado {
  id: string;
  nombre: string;
  asignaciones: AsignacionListada[];
}

async function obtenerContexto(gradoId: string): Promise<ContextoGrado | null> {
  const supabase = await createClient();

  const { data: grado, error: errorGrado } = await supabase
    .from("grados")
    .select("nombre, nivel_id")
    .eq("id", gradoId)
    .single();

  if (errorGrado || !grado) {
    return null;
  }

  const { data: nivel, error: errorNivel } = await supabase
    .from("niveles")
    .select("nombre")
    .eq("id", grado.nivel_id)
    .single();

  if (errorNivel || !nivel) {
    return null;
  }

  return {
    nivelId: grado.nivel_id,
    nivelNombre: nivel.nombre,
    gradoNombre: grado.nombre,
  };
}

async function obtenerAsignacionesDeMateria(materiaId: string): Promise<AsignacionListada[]> {
  const supabase = await createClient();

  const { data: asignaciones, error } = await supabase
    .from("asignaciones")
    .select("id, grupo_id, docente_perfil_id")
    .eq("materia_id", materiaId);

  if (error) {
    throw new Error(`No se pudieron cargar las asignaciones: ${error.message}`);
  }

  return Promise.all(
    (asignaciones ?? []).map(async (asignacion) => {
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
        grupoNombre: grupo?.nombre ?? "?",
        docenteNombre: docente?.nombre_completo ?? "?",
      };
    })
  );
}

async function obtenerMaterias(gradoId: string): Promise<MateriaListado[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("materias")
    .select("id, nombre")
    .eq("grado_id", gradoId)
    .order("orden");

  if (error) {
    throw new Error(`No se pudieron cargar las materias: ${error.message}`);
  }

  return Promise.all(
    (data ?? []).map(async (materia) => ({
      id: materia.id,
      nombre: materia.nombre,
      asignaciones: await obtenerAsignacionesDeMateria(materia.id),
    }))
  );
}

async function obtenerGruposDelGrado(gradoId: string): Promise<OpcionSelect[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("grupos")
    .select("id, nombre")
    .eq("grado_id", gradoId)
    .order("nombre");

  if (error) {
    throw new Error(`No se pudieron cargar los grupos: ${error.message}`);
  }

  return (data ?? []).map((grupo) => ({ id: grupo.id, etiqueta: `Grupo ${grupo.nombre}` }));
}

export default async function MateriasGradoPage({
  params,
}: {
  params: Promise<{ gradoId: string }>;
}) {
  const { gradoId } = await params;
  const contexto = await obtenerContexto(gradoId);

  if (!contexto) {
    notFound();
  }

  const [materias, grupos, docentesListado] = await Promise.all([
    obtenerMaterias(gradoId),
    obtenerGruposDelGrado(gradoId),
    obtenerDocentes(),
  ]);

  const docentes: OpcionSelect[] = docentesListado.map((docente) => ({
    id: docente.id,
    etiqueta: docente.nombre_completo,
  }));

  return (
    <div>
      <p className="text-sm text-zinc-600">
        <Link href="/materias" className="hover:underline">
          ← Niveles
        </Link>{" "}
        /{" "}
        <Link href={`/materias/nivel/${contexto.nivelId}`} className="hover:underline">
          {contexto.nivelNombre}
        </Link>{" "}
        / <span className="font-medium text-zinc-900">{contexto.gradoNombre}</span>
      </p>
      <h1 className="mt-1 text-2xl font-semibold text-zinc-900">
        Materias — {contexto.gradoNombre}
      </h1>

      {materias.length === 0 && (
        <p className="mt-6 text-zinc-600">Este grado todavía no tiene materias.</p>
      )}

      <div className="mt-6 space-y-3">
        {materias.map((materia) => (
          <FilaMateria
            key={materia.id}
            nombre={materia.nombre}
            cantidadAsignaciones={materia.asignaciones.length}
            accionRenombrar={renombrarMateria.bind(null, materia.id, gradoId)}
            accionEliminar={eliminarMateria.bind(null, materia.id, gradoId)}
          >
            <AsignacionesMateria
              asignaciones={materia.asignaciones}
              grupos={grupos}
              docentes={docentes}
              accionCrear={guardarAsignacion.bind(null, materia.id, gradoId)}
              accionEliminar={(id) => eliminarAsignacion(id, gradoId)}
            />
            <Link
              href={`/materias/${materia.id}/lista`}
              className="mt-2 inline-block text-xs font-medium text-primario hover:underline"
            >
              Lista propia
            </Link>
          </FilaMateria>
        ))}
      </div>

      <div className="mt-6 max-w-xs">
        <TarjetaAgregar etiqueta="materia" accionCrear={crearMateria.bind(null, gradoId)} />
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Verificar el build**

Run: `npm run build`
Expected: build limpio. (El link "Lista propia" apunta a
`/materias/[materiaId]/lista`, creada en el Task 7 — mismo caso que el
Task 3, no rompe el build.)

- [ ] **Step 6: Correr la suite completa**

Run: `npm test`
Expected: todos los tests pasan (esta página no tiene tests unitarios
propios — es I/O, mismo criterio que el resto de las páginas de
Alumnos).

- [ ] **Step 7: Verificación manual**

Con `npm run dev` corriendo y sesión de `super_admin`/`direccion`:
crear un maestro de prueba (o usar uno ya invitado), asignarlo a una
materia + grupo, confirmar que aparece en la lista con "Grupo X —
Nombre". Confirmar que un segundo intento de asignar el mismo
maestro/otro maestro a la misma materia+grupo+ciclo da el mensaje de
error esperado (ya hay un maestro asignado). Quitar la asignación y
confirmar que desaparece.

- [ ] **Step 8: Commit**

```bash
git add src/lib/perfiles/docentes.ts src/components/materias/AsignacionesMateria.tsx src/app/\(dashboard\)/materias/actions.ts src/app/\(dashboard\)/materias/grado/\[gradoId\]/page.tsx
git commit -m "feat: agregar asignación de maestro-grupo por materia"
```

---

### Task 6: Lista completa del grupo de una materia (sin override)

**Files:**
- Create: `src/lib/materias/roster.ts`

**Interfaces:**
- Produces: `export interface AlumnoDeMateria { id, nombres, apellido_paterno, apellido_materno }` y `export async function obtenerAlumnosDelGrupoDeMateria(materiaId: string, cicloId: string): Promise<AlumnoDeMateria[]>` — la lista "cruda" del grupo, sin tomar en cuenta ninguna lista propia. La consume el Task 7 (para construir los checkboxes) y el Task 8 (como su respaldo cuando no hay lista propia) — se separa en su propio task precisamente para que ninguno de los dos la reimplemente por su cuenta.

- [ ] **Step 1: Crear `src/lib/materias/roster.ts`**

```ts
import { createClient } from "@/lib/supabase/server";

export interface AlumnoDeMateria {
  id: string;
  nombres: string;
  apellido_paterno: string | null;
  apellido_materno: string | null;
}

export async function obtenerAlumnosDelGrupoDeMateria(
  materiaId: string,
  cicloId: string
): Promise<AlumnoDeMateria[]> {
  const supabase = await createClient();

  const { data: asignaciones, error: errorAsignaciones } = await supabase
    .from("asignaciones")
    .select("grupo_id")
    .eq("materia_id", materiaId)
    .eq("ciclo_escolar_id", cicloId);

  if (errorAsignaciones) {
    throw new Error(`No se pudieron cargar las asignaciones: ${errorAsignaciones.message}`);
  }

  const grupoIds = (asignaciones ?? []).map((asignacion) => asignacion.grupo_id);

  if (grupoIds.length === 0) {
    return [];
  }

  // Embed sancionado (ver Global Constraints del plan): inscripciones -> alumnos.
  const { data: inscripciones, error: errorInscripciones } = await supabase
    .from("inscripciones")
    .select("alumnos(id, nombres, apellido_paterno, apellido_materno)")
    .in("grupo_id", grupoIds)
    .eq("ciclo_escolar_id", cicloId);

  if (errorInscripciones) {
    throw new Error(`No se pudo cargar la lista de alumnos: ${errorInscripciones.message}`);
  }

  return (inscripciones ?? []).flatMap((inscripcion) => inscripcion.alumnos);
}
```

- [ ] **Step 2: Verificar el build**

Run: `npm run build`
Expected: build limpio (archivo nuevo y aislado, nada lo importa
todavía).

- [ ] **Step 3: Commit**

```bash
git add src/lib/materias/roster.ts
git commit -m "feat: agregar obtenerAlumnosDelGrupoDeMateria"
```

---

### Task 7: Lista propia de alumnos por materia

**Files:**
- Create: `src/app/(dashboard)/materias/[materiaId]/lista/actions.ts`
- Create: `src/app/(dashboard)/materias/[materiaId]/lista/page.tsx`

**Interfaces:**
- Consumes: `requerirRol` (Task 1), `obtenerCicloActivoId` (ya existe), `obtenerAlumnosDelGrupoDeMateria` (Task 6).
- Produces: la ruta `/materias/[materiaId]/lista`.

- [ ] **Step 1: Crear `src/app/(dashboard)/materias/[materiaId]/lista/actions.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { obtenerCicloActivoId } from "@/lib/ciclos/activo";
import { requerirRol } from "@/lib/perfiles/requerirRol";

export async function guardarListaMateria(materiaId: string, formData: FormData) {
  await requerirRol(["super_admin", "direccion"]);

  const cicloId = await obtenerCicloActivoId();
  if (!cicloId) {
    throw new Error("No se pudo guardar la lista: no hay un ciclo escolar activo.");
  }

  const alumnoIds = formData.getAll("alumno_id").map((valor) => String(valor));
  const supabase = await createClient();

  const { error: errorBorrado } = await supabase
    .from("materia_alumnos")
    .delete()
    .eq("materia_id", materiaId)
    .eq("ciclo_escolar_id", cicloId);

  if (errorBorrado) {
    throw new Error(`No se pudo guardar la lista: ${errorBorrado.message}`);
  }

  if (alumnoIds.length > 0) {
    const { error: errorInsercion } = await supabase.from("materia_alumnos").insert(
      alumnoIds.map((alumnoId) => ({
        materia_id: materiaId,
        alumno_id: alumnoId,
        ciclo_escolar_id: cicloId,
      }))
    );

    if (errorInsercion) {
      throw new Error(`No se pudo guardar la lista: ${errorInsercion.message}`);
    }
  }

  const { data: materia } = await supabase
    .from("materias")
    .select("grado_id")
    .eq("id", materiaId)
    .single();

  revalidatePath(`/materias/grado/${materia?.grado_id ?? ""}`);
  revalidatePath(`/materias/${materiaId}/lista`);
}
```

- [ ] **Step 2: Crear `src/app/(dashboard)/materias/[materiaId]/lista/page.tsx`**

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { obtenerCicloActivoId } from "@/lib/ciclos/activo";
import { obtenerAlumnosDelGrupoDeMateria } from "@/lib/materias/roster";
import { guardarListaMateria } from "./actions";

export const dynamic = "force-dynamic";

interface ContextoMateria {
  gradoId: string;
  materiaNombre: string;
}

interface AlumnoOpcion {
  id: string;
  nombre: string;
  marcado: boolean;
}

async function obtenerContexto(materiaId: string): Promise<ContextoMateria | null> {
  const supabase = await createClient();

  const { data: materia, error } = await supabase
    .from("materias")
    .select("nombre, grado_id")
    .eq("id", materiaId)
    .single();

  if (error || !materia) {
    return null;
  }

  return { gradoId: materia.grado_id, materiaNombre: materia.nombre };
}

async function obtenerAlumnosParaLista(
  materiaId: string,
  cicloId: string
): Promise<AlumnoOpcion[]> {
  const supabase = await createClient();

  const alumnosDelGrupo = await obtenerAlumnosDelGrupoDeMateria(materiaId, cicloId);

  if (alumnosDelGrupo.length === 0) {
    return [];
  }

  const { data: yaEnLista, error: errorLista } = await supabase
    .from("materia_alumnos")
    .select("alumno_id")
    .eq("materia_id", materiaId)
    .eq("ciclo_escolar_id", cicloId);

  if (errorLista) {
    throw new Error(`No se pudo cargar la lista propia: ${errorLista.message}`);
  }

  const idsEnLista = new Set((yaEnLista ?? []).map((fila) => fila.alumno_id));
  const hayListaPropia = idsEnLista.size > 0;

  return alumnosDelGrupo
    .map((alumno) => {
      const apellidos = [alumno.apellido_paterno, alumno.apellido_materno]
        .filter((valor): valor is string => Boolean(valor))
        .join(" ");

      return {
        id: alumno.id,
        nombre: apellidos ? `${apellidos}, ${alumno.nombres}` : alumno.nombres,
        marcado: hayListaPropia ? idsEnLista.has(alumno.id) : true,
      };
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

export default async function ListaMateriaPage({
  params,
}: {
  params: Promise<{ materiaId: string }>;
}) {
  const { materiaId } = await params;
  const contexto = await obtenerContexto(materiaId);

  if (!contexto) {
    notFound();
  }

  const cicloId = await obtenerCicloActivoId();

  if (!cicloId) {
    throw new Error("No hay un ciclo escolar activo.");
  }

  const alumnos = await obtenerAlumnosParaLista(materiaId, cicloId);

  return (
    <div>
      <p className="text-sm text-zinc-600">
        <Link href={`/materias/grado/${contexto.gradoId}`} className="hover:underline">
          ← {contexto.materiaNombre}
        </Link>
      </p>
      <h1 className="mt-1 text-2xl font-semibold text-zinc-900">
        Lista propia — {contexto.materiaNombre}
      </h1>
      <p className="mt-1 text-sm text-zinc-600">
        Por defecto la materia toma a todo el grupo. Desmarca a quien no
        deba estar en esta materia.
      </p>

      {alumnos.length === 0 ? (
        <p className="mt-6 text-zinc-600">
          Esta materia todavía no tiene un grupo asignado.
        </p>
      ) : (
        <form action={guardarListaMateria.bind(null, materiaId)} className="mt-6">
          <div className="space-y-2">
            {alumnos.map((alumno) => (
              <label key={alumno.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="alumno_id" value={alumno.id} defaultChecked={alumno.marcado} />
                {alumno.nombre}
              </label>
            ))}
          </div>
          <button
            type="submit"
            className="mt-4 rounded-md bg-primario px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            Guardar lista
          </button>
        </form>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verificar el build**

Run: `npm run build`
Expected: build limpio.

- [ ] **Step 4: Verificación manual**

Con `npm run dev` corriendo: entrar a "Lista propia" de una materia con
asignación, confirmar que aparece todo el grupo pre-marcado (no hay
lista propia todavía). Desmarcar a 1-2 alumnos y guardar. Volver a
entrar y confirmar que ahora solo aparecen marcados los que se
dejaron. Confirmar en la pantalla del grado que la materia sigue
funcionando con normalidad (renombrar/eliminar/asignar no se ven
afectados por tener lista propia).

- [ ] **Step 5: Commit**

```bash
git add src/app/\(dashboard\)/materias/\[materiaId\]
git commit -m "feat: agregar lista propia de alumnos por materia"
```

---

### Task 8: Lista efectiva de una materia (con override)

**Files:**
- Modify: `src/lib/materias/roster.ts`

**Interfaces:**
- Consumes: `obtenerAlumnosDelGrupoDeMateria` y `AlumnoDeMateria` (Task 6).
- Produces: `export async function obtenerAlumnosDeMateria(materiaId: string, cicloId: string): Promise<AlumnoDeMateria[]>` — la pieza 3 (captura de calificaciones) importará esto directamente; en esta pieza no la consume ninguna pantalla, solo se construye y se verifica.

- [ ] **Step 1: Agregar a `src/lib/materias/roster.ts`**

Agregar esta función al final del archivo (después de
`obtenerAlumnosDelGrupoDeMateria`, reutilizándola en vez de repetir la
consulta al grupo):

```ts
export async function obtenerAlumnosDeMateria(
  materiaId: string,
  cicloId: string
): Promise<AlumnoDeMateria[]> {
  const supabase = await createClient();

  // Embed sancionado (ver Global Constraints del plan): materia_alumnos -> alumnos.
  const { data: listaPropia, error: errorLista } = await supabase
    .from("materia_alumnos")
    .select("alumnos(id, nombres, apellido_paterno, apellido_materno)")
    .eq("materia_id", materiaId)
    .eq("ciclo_escolar_id", cicloId);

  if (errorLista) {
    throw new Error(`No se pudo cargar la lista de la materia: ${errorLista.message}`);
  }

  if (listaPropia && listaPropia.length > 0) {
    return listaPropia.flatMap((fila) => fila.alumnos);
  }

  return obtenerAlumnosDelGrupoDeMateria(materiaId, cicloId);
}
```

- [ ] **Step 2: Verificar el build**

Run: `npm run build`
Expected: build limpio.

- [ ] **Step 3: Verificación manual de la regla completa**

Esta es la verificación central de toda la pieza — confírmala con
cuidado, y borra los datos de prueba al terminar:

1. Crear una materia de prueba ("Prueba QA") en un grado con al menos
   un grupo con alumnos inscritos, asignarla a ese grupo con cualquier
   maestro.
2. Desde una consola de Node/script temporal o revisando directamente
   en Supabase, confirmar que `obtenerAlumnosDeMateria` (o la consulta
   equivalente en SQL) regresa exactamente los alumnos inscritos en ese
   grupo — la ruta "sin lista propia".
3. En "Lista propia" de esa materia, desmarcar al menos un alumno y
   guardar.
4. Confirmar que ahora la lista efectiva es exactamente los alumnos que
   quedaron marcados — la ruta "con lista propia" — y que el alumno
   desmarcado ya no aparece.
5. Borrar la materia de prueba y su asignación (Eliminar en la UI,
   quitando primero la asignación) para no dejar datos falsos en la
   base real.

- [ ] **Step 4: Commit**

```bash
git add src/lib/materias/roster.ts
git commit -m "feat: agregar obtenerAlumnosDeMateria"
```

---

### Task 9: Documentación

**Files:**
- Modify: `database/schema.sql`
- Modify: `CONTEXTO_CLAUDE_CODE.md`

- [ ] **Step 1: Actualizar `database/schema.sql`**

Agregar, después del bloque de "Autenticación + rol Docente" al final
del archivo:

```sql
-- ==========================================================
-- Materias + asignación docente-materia-grupo
-- ==========================================================
create table materias (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
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
-- Si no hay filas para una materia+ciclo, la lista es el grupo completo.
create table materia_alumnos (
  id uuid primary key default gen_random_uuid(),
  materia_id uuid not null references materias(id),
  alumno_id uuid not null references alumnos(id),
  ciclo_escolar_id uuid not null references ciclos_escolares(id)
);
create unique index idx_materia_alumnos_unica on materia_alumnos(materia_id, alumno_id, ciclo_escolar_id);
```

- [ ] **Step 2: Actualizar `CONTEXTO_CLAUDE_CODE.md`**

Agregar una entrada describiendo la funcionalidad nueva (materias por
grado, asignación docente-materia-grupo-ciclo con un maestro por
combinación, lista de alumnos por materia con override manual, tipo de
`rol` endurecido) y actualizar "Próximos pasos pendientes" para
reflejar que la siguiente pieza es la captura de calificaciones (la
pieza 3, que ya puede apoyarse en `obtenerAlumnosDeMateria`).

- [ ] **Step 3: Verificar build y suite completa**

Run: `npm run build && npm test`
Expected: build limpio, todos los tests pasan.

- [ ] **Step 4: Commit**

```bash
git add database/schema.sql CONTEXTO_CLAUDE_CODE.md
git commit -m "docs: documentar materias + asignación docente-materia-grupo"
```
