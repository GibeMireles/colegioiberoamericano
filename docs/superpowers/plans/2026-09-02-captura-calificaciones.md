# Captura de calificaciones Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pantalla de captura de calificaciones para el maestro (y supervisión de `super_admin`/`direccion`), calcada del Excel real de la escuela — Parcial 1 (ADAS+Examen), Parcial 2 (ADAS+Examen), Producto (Proyecto+Examen), con ponderación configurable por asignación y validación contra esos máximos. Tercera y última sub-pieza de Calificaciones.

**Architecture:** Una tabla nueva `calificaciones` (una fila por alumno por asignación) más 3 columnas de ponderación en `asignaciones`. Dos pantallas nuevas bajo `/calificaciones`: una lista filtrada por rol, y la captura en sí por asignación. Un helper de acceso nuevo (`requerirAccesoAsignacion`) que verifica dueño-de-la-asignación-o-supervisión, distinto de `requerirRol` porque depende de una fila específica, no de una lista fija de roles. Se resuelve aquí el pendiente que quedó abierto en la pieza de Materias sobre listas de alumnos ambiguas cuando una materia tiene más de un grupo asignado.

**Tech Stack:** Next.js 16 App Router, Supabase, Zod, Vitest — mismo stack que el resto del proyecto, sin dependencias nuevas.

**Spec:** `docs/superpowers/specs/2026-09-02-captura-calificaciones-design.md`

## Global Constraints

- La estructura de captura (Parcial 1: ADAS+Examen, Parcial 2: ADAS+Examen, Producto: Proyecto+Examen, Total) es la misma para toda materia — no varía por tipo.
- Los 6 campos de `calificaciones` son nullable — el maestro captura lo que tenga listo, sin exigir todo de golpe. Un campo vacío cuenta como 0 para el subtotal.
- Los subtotales (Calif 1, Calif 2, Subtotal producto) y el Total nunca se guardan — se calculan siempre a partir de los 6 campos capturados.
- La ponderación (`parcial1_max`, `parcial2_max`, `producto_max`) vive en `asignaciones`, no en `materias` — es por asignación (grupo+maestro), no compartida entre grupos de la misma materia. La define el maestro dueño la primera vez que abre su captura; queda editable después, sin candado.
- Validación de máximo: solo a nivel de subtotal del parcial/producto (ADAS+Examen juntos), nunca por campo individual.
- No se agrega ninguna columna de "semestre" — cada semestre tiene su propia lista de materias, el semestre queda implícito en qué materia existe.
- Acceso a una captura: el `docente` dueño de esa asignación específica (`asignacion.docente_perfil_id === perfil.id`), o cualquier `super_admin`/`direccion`. `caja` no tiene acceso. Cada Server Action de escritura vuelve a revisar el acceso de forma independiente, sin confiar en que la pantalla ya lo verificó.
- Captura de recuperación (RECU) fuera de alcance de esta pieza.
- No se agrega ninguna política RLS nueva en esta pieza (mismo criterio que el resto del proyecto hoy).
- El patrón de embed sancionado (`.select("alumnos(...)")` + `.flatMap()`) se reutiliza tal cual para `inscripciones -> alumnos` y `materia_alumnos -> alumnos`, igual que en la pieza de Materias.

---

## Prerequisites (las ejecuta el orquestador antes del Task 1, no un subagente)

Aplicar esta migración a la base real vía `apply_migration`:

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

No se siembra ninguna calificación real — el propósito de esta pieza es que el maestro las capture desde la UI.

---

### Task 1: Funciones puras de cálculo

**Files:**
- Create: `src/lib/calificaciones/calculos.ts`
- Test: `src/lib/calificaciones/calculos.test.ts`

**Interfaces:**
- Produces: `export interface CalificacionValores { parcial1_adas, parcial1_examen, parcial2_adas, parcial2_examen, producto_proyecto, producto_examen: number | null }`, `export function calcularSubtotal(a: number | null, b: number | null): number`, `export function calcularTotal(valores: CalificacionValores): number` — usados por el Task 6 (Server Action de guardado y componente de tabla) para validar máximos y mostrar totales.

- [ ] **Step 1: Escribir el test que debe fallar**

Crear `src/lib/calificaciones/calculos.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { calcularSubtotal, calcularTotal } from "./calculos";

describe("calcularSubtotal", () => {
  it("suma dos valores capturados", () => {
    expect(calcularSubtotal(21, 5)).toBe(26);
  });

  it("trata un valor nulo como 0", () => {
    expect(calcularSubtotal(21, null)).toBe(21);
  });

  it("regresa 0 cuando ambos son nulos", () => {
    expect(calcularSubtotal(null, null)).toBe(0);
  });
});

describe("calcularTotal", () => {
  it("suma los 3 subtotales (ejemplo real del Excel: 21+26+36=83)", () => {
    const total = calcularTotal({
      parcial1_adas: 21,
      parcial1_examen: null,
      parcial2_adas: 26,
      parcial2_examen: null,
      producto_proyecto: 36,
      producto_examen: null,
    });
    expect(total).toBe(83);
  });

  it("regresa 0 cuando no hay ninguna captura", () => {
    const total = calcularTotal({
      parcial1_adas: null,
      parcial1_examen: null,
      parcial2_adas: null,
      parcial2_examen: null,
      producto_proyecto: null,
      producto_examen: null,
    });
    expect(total).toBe(0);
  });
});
```

- [ ] **Step 2: Correr el test y confirmar que falla**

Run: `npx vitest run src/lib/calificaciones/calculos.test.ts`
Expected: FAIL — `Cannot find module './calculos'`.

- [ ] **Step 3: Crear `src/lib/calificaciones/calculos.ts`**

```ts
export interface CalificacionValores {
  parcial1_adas: number | null;
  parcial1_examen: number | null;
  parcial2_adas: number | null;
  parcial2_examen: number | null;
  producto_proyecto: number | null;
  producto_examen: number | null;
}

export function calcularSubtotal(a: number | null, b: number | null): number {
  return (a ?? 0) + (b ?? 0);
}

export function calcularTotal(valores: CalificacionValores): number {
  const calif1 = calcularSubtotal(valores.parcial1_adas, valores.parcial1_examen);
  const calif2 = calcularSubtotal(valores.parcial2_adas, valores.parcial2_examen);
  const subtotalProducto = calcularSubtotal(valores.producto_proyecto, valores.producto_examen);
  return calif1 + calif2 + subtotalProducto;
}
```

- [ ] **Step 4: Correr el test y confirmar que pasa**

Run: `npx vitest run src/lib/calificaciones/calculos.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/calificaciones/calculos.ts src/lib/calificaciones/calculos.test.ts
git commit -m "feat: agregar cálculo de subtotales y total de calificación"
```

---

### Task 2: Schemas de validación

**Files:**
- Create: `src/lib/calificaciones/schema.ts`
- Test: `src/lib/calificaciones/schema.test.ts`

**Interfaces:**
- Produces: `export const calificacionSchema`, `export type CalificacionInput`, `export const ponderacionSchema`, `export type PonderacionInput` — usados por el Task 6.

- [ ] **Step 1: Escribir el test que debe fallar**

Crear `src/lib/calificaciones/schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { calificacionSchema, ponderacionSchema } from "./schema";

describe("calificacionSchema", () => {
  it("acepta los 6 campos vacíos (nada capturado todavía)", () => {
    const result = calificacionSchema.safeParse({
      parcial1_adas: "",
      parcial1_examen: "",
      parcial2_adas: "",
      parcial2_examen: "",
      producto_proyecto: "",
      producto_examen: "",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.parcial1_adas).toBeUndefined();
    }
  });

  it("acepta valores numéricos válidos", () => {
    const result = calificacionSchema.safeParse({
      parcial1_adas: "21",
      parcial1_examen: "5",
      parcial2_adas: "26",
      parcial2_examen: "",
      producto_proyecto: "36",
      producto_examen: "",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.parcial1_adas).toBe(21);
    }
  });

  it("rechaza un valor negativo", () => {
    const result = calificacionSchema.safeParse({
      parcial1_adas: "-5",
      parcial1_examen: "",
      parcial2_adas: "",
      parcial2_examen: "",
      producto_proyecto: "",
      producto_examen: "",
    });
    expect(result.success).toBe(false);
  });

  it("rechaza un valor no numérico", () => {
    const result = calificacionSchema.safeParse({
      parcial1_adas: "abc",
      parcial1_examen: "",
      parcial2_adas: "",
      parcial2_examen: "",
      producto_proyecto: "",
      producto_examen: "",
    });
    expect(result.success).toBe(false);
  });
});

describe("ponderacionSchema", () => {
  it("acepta 3 valores positivos", () => {
    const result = ponderacionSchema.safeParse({
      parcial1_max: "30",
      parcial2_max: "30",
      producto_max: "40",
    });
    expect(result.success).toBe(true);
  });

  it("rechaza un valor en cero", () => {
    const result = ponderacionSchema.safeParse({
      parcial1_max: "0",
      parcial2_max: "30",
      producto_max: "40",
    });
    expect(result.success).toBe(false);
  });

  it("rechaza un campo faltante", () => {
    const result = ponderacionSchema.safeParse({
      parcial1_max: "30",
      producto_max: "40",
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Correr el test y confirmar que falla**

Run: `npx vitest run src/lib/calificaciones/schema.test.ts`
Expected: FAIL — `Cannot find module './schema'`.

- [ ] **Step 3: Crear `src/lib/calificaciones/schema.ts`**

```ts
import { z } from "zod";

const campoNumericoOpcional = z.preprocess((valor) => {
  if (valor === "" || valor === null || valor === undefined) {
    return undefined;
  }
  return Number(valor);
}, z.number().min(0, "No puede ser negativo").optional());

export const calificacionSchema = z.object({
  parcial1_adas: campoNumericoOpcional,
  parcial1_examen: campoNumericoOpcional,
  parcial2_adas: campoNumericoOpcional,
  parcial2_examen: campoNumericoOpcional,
  producto_proyecto: campoNumericoOpcional,
  producto_examen: campoNumericoOpcional,
});

export type CalificacionInput = z.infer<typeof calificacionSchema>;

export const ponderacionSchema = z.object({
  parcial1_max: z.coerce.number().positive("Debe ser mayor a 0"),
  parcial2_max: z.coerce.number().positive("Debe ser mayor a 0"),
  producto_max: z.coerce.number().positive("Debe ser mayor a 0"),
});

export type PonderacionInput = z.infer<typeof ponderacionSchema>;
```

- [ ] **Step 4: Correr el test y confirmar que pasa**

Run: `npx vitest run src/lib/calificaciones/schema.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/calificaciones/schema.ts src/lib/calificaciones/schema.test.ts
git commit -m "feat: agregar validación de calificaciones y ponderación"
```

---

### Task 3: Control de acceso por asignación

**Files:**
- Create: `src/lib/asignaciones/requerirAccesoAsignacion.ts`
- Create: `src/lib/asignaciones/requerirAccesoAsignacionPagina.ts`

**Interfaces:**
- Consumes: `obtenerPerfilActual` de `@/lib/perfiles/actual`, `createClient` de `@/lib/supabase/server`.
- Produces: `export interface AsignacionAcceso { id, materia_id, grupo_id, docente_perfil_id, ciclo_escolar_id, parcial1_max, parcial2_max, producto_max }`, `export async function requerirAccesoAsignacion(asignacionId: string): Promise<AsignacionAcceso>` (lanza `Error` si no hay acceso — para Server Actions) y `export async function requerirAccesoAsignacionPagina(asignacionId: string): Promise<AsignacionAcceso>` (llama `notFound()` — para páginas) — ambos usados por el Task 6.

Sin test unitario: es I/O (consulta la base), mismo criterio que `requerirRol`/`requerirRolPagina`, que tampoco lo tienen. Se verifica manualmente en el Task 6, cuando ya hay una pantalla real que lo ejercita.

- [ ] **Step 1: Crear `src/lib/asignaciones/requerirAccesoAsignacion.ts`**

```ts
import { createClient } from "@/lib/supabase/server";
import { obtenerPerfilActual } from "@/lib/perfiles/actual";

export interface AsignacionAcceso {
  id: string;
  materia_id: string;
  grupo_id: string;
  docente_perfil_id: string;
  ciclo_escolar_id: string;
  parcial1_max: number | null;
  parcial2_max: number | null;
  producto_max: number | null;
}

export async function requerirAccesoAsignacion(asignacionId: string): Promise<AsignacionAcceso> {
  const perfil = await obtenerPerfilActual();

  if (!perfil) {
    throw new Error("No tienes permiso para esta acción.");
  }

  const supabase = await createClient();

  const { data: asignacion, error } = await supabase
    .from("asignaciones")
    .select(
      "id, materia_id, grupo_id, docente_perfil_id, ciclo_escolar_id, parcial1_max, parcial2_max, producto_max"
    )
    .eq("id", asignacionId)
    .single();

  if (error || !asignacion) {
    throw new Error("No se encontró la asignación.");
  }

  const tieneAcceso =
    perfil.rol === "super_admin" ||
    perfil.rol === "direccion" ||
    (perfil.rol === "docente" && asignacion.docente_perfil_id === perfil.id);

  if (!tieneAcceso) {
    throw new Error("No tienes permiso para esta acción.");
  }

  return asignacion;
}
```

- [ ] **Step 2: Crear `src/lib/asignaciones/requerirAccesoAsignacionPagina.ts`**

```ts
import { notFound } from "next/navigation";
import { requerirAccesoAsignacion, type AsignacionAcceso } from "./requerirAccesoAsignacion";

export async function requerirAccesoAsignacionPagina(asignacionId: string): Promise<AsignacionAcceso> {
  try {
    return await requerirAccesoAsignacion(asignacionId);
  } catch {
    notFound();
  }
}
```

- [ ] **Step 3: Verificar el build**

Run: `npm run build`
Expected: build limpio (archivos nuevos y aislados, nada los importa todavía).

- [ ] **Step 4: Commit**

```bash
git add src/lib/asignaciones/requerirAccesoAsignacion.ts src/lib/asignaciones/requerirAccesoAsignacionPagina.ts
git commit -m "feat: agregar control de acceso por asignación"
```

---

### Task 4: Pantalla de lista de calificaciones

**Files:**
- Create: `src/app/(dashboard)/calificaciones/page.tsx`
- Modify: `src/lib/nav.ts`
- Modify: `src/lib/nav.test.ts`
- Modify: `src/middleware.ts`

**Interfaces:**
- Consumes: `requerirRolPagina` de `@/lib/perfiles/requerirRolPagina`, `obtenerCicloActivoId` de `@/lib/ciclos/activo`, `createClient` de `@/lib/supabase/server`.
- Produces: la ruta `/calificaciones` (enlaza a `/calificaciones/[asignacionId]`, creada en el Task 6 — dead link corto entre tasks, mismo patrón ya aceptado en la pieza de Materias).

- [ ] **Step 1: Actualizar `src/lib/nav.ts`**

Reemplazar `NAV_ITEMS`:

```ts
export const NAV_ITEMS: NavItem[] = [
  { label: "Alumnos y grados", href: "/alumnos" },
  { label: "Pagos", href: "/pagos" },
  { label: "Listas / Asistencia", href: "/asistencia" },
  { label: "Materias", href: "/materias", rolesPermitidos: ["super_admin", "direccion"] },
  {
    label: "Calificaciones",
    href: "/calificaciones",
    rolesPermitidos: ["super_admin", "direccion", "docente"],
  },
  { label: "Usuarios", href: "/usuarios", rolesPermitidos: ["super_admin"] },
];
```

- [ ] **Step 2: Actualizar `src/lib/nav.test.ts`**

Reemplazar el contenido completo:

```ts
import { describe, expect, it } from "vitest";
import { isNavItemActive, NAV_ITEMS, navItemsVisibles } from "./nav";

describe("NAV_ITEMS", () => {
  it("has the 6 modules in order, con Materias, Calificaciones y Usuarios restringidos", () => {
    expect(NAV_ITEMS.map((item) => item.href)).toEqual([
      "/alumnos",
      "/pagos",
      "/asistencia",
      "/materias",
      "/calificaciones",
      "/usuarios",
    ]);
    expect(NAV_ITEMS.find((item) => item.href === "/materias")?.rolesPermitidos).toEqual([
      "super_admin",
      "direccion",
    ]);
    expect(NAV_ITEMS.find((item) => item.href === "/calificaciones")?.rolesPermitidos).toEqual([
      "super_admin",
      "direccion",
      "docente",
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

  it("excludes materias y usuarios for docente, but includes calificaciones", () => {
    const hrefs = navItemsVisibles("docente").map((item) => item.href);
    expect(hrefs).not.toContain("/materias");
    expect(hrefs).not.toContain("/usuarios");
    expect(hrefs).toContain("/calificaciones");
  });

  it("includes materias y calificaciones but not usuarios for direccion", () => {
    const hrefs = navItemsVisibles("direccion").map((item) => item.href);
    expect(hrefs).toContain("/materias");
    expect(hrefs).toContain("/calificaciones");
    expect(hrefs).not.toContain("/usuarios");
  });

  it("includes materias, calificaciones y usuarios for super_admin", () => {
    const hrefs = navItemsVisibles("super_admin").map((item) => item.href);
    expect(hrefs).toContain("/materias");
    expect(hrefs).toContain("/calificaciones");
    expect(hrefs).toContain("/usuarios");
  });
});
```

- [ ] **Step 3: Actualizar `src/middleware.ts`**

Cambiar la línea:

```ts
const RUTAS_PROTEGIDAS = ["/usuarios", "/materias", "/calificaciones"];
```

- [ ] **Step 4: Crear `src/app/(dashboard)/calificaciones/page.tsx`**

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

export default async function CalificacionesPage() {
  const perfil = await requerirRolPagina(["super_admin", "direccion", "docente"]);

  const cicloId = await obtenerCicloActivoId();
  if (!cicloId) {
    throw new Error("No hay un ciclo escolar activo.");
  }

  const asignaciones = await obtenerAsignacionesVisibles(perfil, cicloId);
  const esDocente = perfil.rol === "docente";

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900">
        {esDocente ? "Mis materias" : "Calificaciones"}
      </h1>

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
              href={`/calificaciones/${asignacion.id}`}
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

- [ ] **Step 5: Verificar el build y la suite completa**

Run: `npm run build && npm test`
Expected: build limpio, todos los tests pasan.

- [ ] **Step 6: Commit**

```bash
git add src/lib/nav.ts src/lib/nav.test.ts src/middleware.ts src/app/\(dashboard\)/calificaciones/page.tsx
git commit -m "feat: agregar pantalla de lista de calificaciones"
```

---

### Task 5: Lista de alumnos por asignación

**Files:**
- Create: `src/lib/calificaciones/roster.ts`

**Interfaces:**
- Consumes: `AlumnoDeMateria` (tipo) de `@/lib/materias/roster`.
- Produces: `export async function obtenerAlumnosDeAsignacion(asignacionId: string): Promise<AlumnoDeMateria[]>` — usado por el Task 6.

Sin test unitario: es I/O, mismo criterio que `obtenerAlumnosDeMateria`. Se verifica en vivo contra Supabase.

- [ ] **Step 1: Crear `src/lib/calificaciones/roster.ts`**

```ts
import { createClient } from "@/lib/supabase/server";
import type { AlumnoDeMateria } from "@/lib/materias/roster";

export async function obtenerAlumnosDeAsignacion(asignacionId: string): Promise<AlumnoDeMateria[]> {
  const supabase = await createClient();

  const { data: asignacion, error: errorAsignacion } = await supabase
    .from("asignaciones")
    .select("materia_id, grupo_id, ciclo_escolar_id")
    .eq("id", asignacionId)
    .single();

  if (errorAsignacion || !asignacion) {
    throw new Error("No se encontró la asignación.");
  }

  // Embed sancionado (ver Global Constraints del plan): inscripciones -> alumnos.
  const { data: inscripciones, error: errorInscripciones } = await supabase
    .from("inscripciones")
    .select("alumnos(id, nombres, apellido_paterno, apellido_materno)")
    .eq("grupo_id", asignacion.grupo_id)
    .eq("ciclo_escolar_id", asignacion.ciclo_escolar_id);

  if (errorInscripciones) {
    throw new Error(`No se pudo cargar la lista de alumnos: ${errorInscripciones.message}`);
  }

  const alumnosDelGrupo = (inscripciones ?? []).flatMap((inscripcion) => inscripcion.alumnos);

  // Embed sancionado (ver Global Constraints del plan): materia_alumnos -> alumnos.
  const { data: listaPropia, error: errorLista } = await supabase
    .from("materia_alumnos")
    .select("alumnos(id, nombres, apellido_paterno, apellido_materno)")
    .eq("materia_id", asignacion.materia_id)
    .eq("ciclo_escolar_id", asignacion.ciclo_escolar_id);

  if (errorLista) {
    throw new Error(`No se pudo cargar la lista de la materia: ${errorLista.message}`);
  }

  if (!listaPropia || listaPropia.length === 0) {
    return alumnosDelGrupo;
  }

  const idsListaPropia = new Set(
    listaPropia.flatMap((fila) => fila.alumnos).map((alumno) => alumno.id)
  );

  return alumnosDelGrupo.filter((alumno) => idsListaPropia.has(alumno.id));
}
```

Nota: la intersección (lista propia ∩ alumnos de este grupo) es justo lo que resuelve el
pendiente de la pieza de Materias — si la materia tiene lista propia compartida entre
2+ grupos, cada asignación solo ve a sus propios alumnos.

- [ ] **Step 2: Verificar el build**

Run: `npm run build`
Expected: build limpio (archivo nuevo y aislado, nada lo importa todavía).

- [ ] **Step 3: Commit**

```bash
git add src/lib/calificaciones/roster.ts
git commit -m "feat: agregar obtenerAlumnosDeAsignacion"
```

---

### Task 6: Pantalla y Server Actions de captura

**Files:**
- Create: `src/app/(dashboard)/calificaciones/[asignacionId]/actions.ts`
- Create: `src/components/calificaciones/TablaCaptura.tsx`
- Create: `src/app/(dashboard)/calificaciones/[asignacionId]/page.tsx`

**Interfaces:**
- Consumes: `requerirAccesoAsignacion`/`requerirAccesoAsignacionPagina` (Task 3), `obtenerAlumnosDeAsignacion` (Task 5), `calcularSubtotal`/`calcularTotal` (Task 1), `calificacionSchema`/`ponderacionSchema` (Task 2).
- Produces: la ruta `/calificaciones/[asignacionId]`, con formulario de ponderación (si no está definida) y tabla de captura (si sí).

- [ ] **Step 1: Crear `src/app/(dashboard)/calificaciones/[asignacionId]/actions.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requerirAccesoAsignacion } from "@/lib/asignaciones/requerirAccesoAsignacion";
import { obtenerAlumnosDeAsignacion } from "@/lib/calificaciones/roster";
import { calificacionSchema, ponderacionSchema } from "@/lib/calificaciones/schema";
import { calcularSubtotal } from "@/lib/calificaciones/calculos";

export async function guardarPonderacion(asignacionId: string, formData: FormData) {
  await requerirAccesoAsignacion(asignacionId);

  const { parcial1_max, parcial2_max, producto_max } = ponderacionSchema.parse({
    parcial1_max: formData.get("parcial1_max") ?? undefined,
    parcial2_max: formData.get("parcial2_max") ?? undefined,
    producto_max: formData.get("producto_max") ?? undefined,
  });

  const supabase = await createClient();

  const { error } = await supabase
    .from("asignaciones")
    .update({ parcial1_max, parcial2_max, producto_max })
    .eq("id", asignacionId);

  if (error) {
    throw new Error(`No se pudo guardar la ponderación: ${error.message}`);
  }

  revalidatePath(`/calificaciones/${asignacionId}`);
}

export async function guardarCalificaciones(asignacionId: string, formData: FormData) {
  const asignacion = await requerirAccesoAsignacion(asignacionId);

  if (
    asignacion.parcial1_max === null ||
    asignacion.parcial2_max === null ||
    asignacion.producto_max === null
  ) {
    throw new Error("Define la ponderación antes de capturar calificaciones.");
  }

  const alumnos = await obtenerAlumnosDeAsignacion(asignacionId);
  const supabase = await createClient();

  const filas = alumnos.map((alumno) => {
    const bruto = calificacionSchema.parse({
      parcial1_adas: formData.get(`parcial1_adas-${alumno.id}`) ?? undefined,
      parcial1_examen: formData.get(`parcial1_examen-${alumno.id}`) ?? undefined,
      parcial2_adas: formData.get(`parcial2_adas-${alumno.id}`) ?? undefined,
      parcial2_examen: formData.get(`parcial2_examen-${alumno.id}`) ?? undefined,
      producto_proyecto: formData.get(`producto_proyecto-${alumno.id}`) ?? undefined,
      producto_examen: formData.get(`producto_examen-${alumno.id}`) ?? undefined,
    });

    const nombreCompleto = [alumno.apellido_paterno, alumno.apellido_materno, alumno.nombres]
      .filter(Boolean)
      .join(" ");

    const calif1 = calcularSubtotal(bruto.parcial1_adas ?? null, bruto.parcial1_examen ?? null);
    if (calif1 > asignacion.parcial1_max!) {
      throw new Error(`${nombreCompleto}: el Parcial 1 no puede superar ${asignacion.parcial1_max} puntos.`);
    }

    const calif2 = calcularSubtotal(bruto.parcial2_adas ?? null, bruto.parcial2_examen ?? null);
    if (calif2 > asignacion.parcial2_max!) {
      throw new Error(`${nombreCompleto}: el Parcial 2 no puede superar ${asignacion.parcial2_max} puntos.`);
    }

    const subtotalProducto = calcularSubtotal(
      bruto.producto_proyecto ?? null,
      bruto.producto_examen ?? null
    );
    if (subtotalProducto > asignacion.producto_max!) {
      throw new Error(`${nombreCompleto}: el Producto no puede superar ${asignacion.producto_max} puntos.`);
    }

    return {
      asignacion_id: asignacionId,
      alumno_id: alumno.id,
      parcial1_adas: bruto.parcial1_adas ?? null,
      parcial1_examen: bruto.parcial1_examen ?? null,
      parcial2_adas: bruto.parcial2_adas ?? null,
      parcial2_examen: bruto.parcial2_examen ?? null,
      producto_proyecto: bruto.producto_proyecto ?? null,
      producto_examen: bruto.producto_examen ?? null,
    };
  });

  if (filas.length > 0) {
    const { error } = await supabase
      .from("calificaciones")
      .upsert(filas, { onConflict: "asignacion_id,alumno_id" });

    if (error) {
      throw new Error(`No se pudieron guardar las calificaciones: ${error.message}`);
    }
  }

  revalidatePath(`/calificaciones/${asignacionId}`);
}
```

- [ ] **Step 2: Crear `src/components/calificaciones/TablaCaptura.tsx`**

```tsx
import { calcularSubtotal, calcularTotal } from "@/lib/calificaciones/calculos";

export interface FilaCaptura {
  alumnoId: string;
  nombre: string;
  parcial1_adas: number | null;
  parcial1_examen: number | null;
  parcial2_adas: number | null;
  parcial2_examen: number | null;
  producto_proyecto: number | null;
  producto_examen: number | null;
}

const CAMPO_CLASE = "w-20 rounded-md border border-zinc-300 px-1 py-0.5 text-sm";

export function TablaCaptura({
  filas,
  accionGuardar,
}: {
  filas: FilaCaptura[];
  accionGuardar: (formData: FormData) => void | Promise<void>;
}) {
  return (
    <form action={accionGuardar} className="mt-6 overflow-x-auto">
      <table className="min-w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-left text-xs font-medium text-zinc-500">
            <th className="p-2">Alumno</th>
            <th className="p-2">ADAS 1</th>
            <th className="p-2">Examen 1</th>
            <th className="p-2">Calif 1</th>
            <th className="p-2">ADAS 2</th>
            <th className="p-2">Examen 2</th>
            <th className="p-2">Calif 2</th>
            <th className="p-2">Proyecto</th>
            <th className="p-2">Examen prod.</th>
            <th className="p-2">Subtotal</th>
            <th className="p-2">Total</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((fila) => {
            const calif1 = calcularSubtotal(fila.parcial1_adas, fila.parcial1_examen);
            const calif2 = calcularSubtotal(fila.parcial2_adas, fila.parcial2_examen);
            const subtotalProducto = calcularSubtotal(fila.producto_proyecto, fila.producto_examen);
            const total = calcularTotal(fila);

            return (
              <tr key={fila.alumnoId} className="border-b border-zinc-100">
                <td className="p-2 font-medium text-zinc-900">{fila.nombre}</td>
                <td className="p-2">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    name={`parcial1_adas-${fila.alumnoId}`}
                    defaultValue={fila.parcial1_adas ?? ""}
                    className={CAMPO_CLASE}
                  />
                </td>
                <td className="p-2">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    name={`parcial1_examen-${fila.alumnoId}`}
                    defaultValue={fila.parcial1_examen ?? ""}
                    className={CAMPO_CLASE}
                  />
                </td>
                <td className="p-2 text-zinc-600">{calif1}</td>
                <td className="p-2">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    name={`parcial2_adas-${fila.alumnoId}`}
                    defaultValue={fila.parcial2_adas ?? ""}
                    className={CAMPO_CLASE}
                  />
                </td>
                <td className="p-2">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    name={`parcial2_examen-${fila.alumnoId}`}
                    defaultValue={fila.parcial2_examen ?? ""}
                    className={CAMPO_CLASE}
                  />
                </td>
                <td className="p-2 text-zinc-600">{calif2}</td>
                <td className="p-2">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    name={`producto_proyecto-${fila.alumnoId}`}
                    defaultValue={fila.producto_proyecto ?? ""}
                    className={CAMPO_CLASE}
                  />
                </td>
                <td className="p-2">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    name={`producto_examen-${fila.alumnoId}`}
                    defaultValue={fila.producto_examen ?? ""}
                    className={CAMPO_CLASE}
                  />
                </td>
                <td className="p-2 text-zinc-600">{subtotalProducto}</td>
                <td className="p-2 font-semibold text-zinc-900">{total}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <button
        type="submit"
        className="mt-4 rounded-md bg-primario px-4 py-2 text-sm font-medium text-white hover:opacity-90"
      >
        Guardar calificaciones
      </button>
    </form>
  );
}
```

Nota: los totales mostrados se recalculan a partir de los valores ya guardados (`defaultValue`),
no en vivo mientras el maestro escribe — el maestro guarda y ve los totales actualizados tras
el `revalidatePath`. Mismo criterio de simplicidad (sin JS de cliente) que el resto de
formularios del proyecto.

- [ ] **Step 3: Crear `src/app/(dashboard)/calificaciones/[asignacionId]/page.tsx`**

```tsx
import { createClient } from "@/lib/supabase/server";
import { requerirAccesoAsignacionPagina } from "@/lib/asignaciones/requerirAccesoAsignacionPagina";
import { obtenerAlumnosDeAsignacion } from "@/lib/calificaciones/roster";
import { TablaCaptura, type FilaCaptura } from "@/components/calificaciones/TablaCaptura";
import { guardarPonderacion, guardarCalificaciones } from "./actions";

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

async function obtenerFilasCaptura(asignacionId: string): Promise<FilaCaptura[]> {
  const alumnos = await obtenerAlumnosDeAsignacion(asignacionId);
  const supabase = await createClient();

  const { data: calificaciones, error } = await supabase
    .from("calificaciones")
    .select(
      "alumno_id, parcial1_adas, parcial1_examen, parcial2_adas, parcial2_examen, producto_proyecto, producto_examen"
    )
    .eq("asignacion_id", asignacionId);

  if (error) {
    throw new Error(`No se pudieron cargar las calificaciones: ${error.message}`);
  }

  const porAlumno = new Map((calificaciones ?? []).map((fila) => [fila.alumno_id, fila]));

  return alumnos
    .map((alumno) => {
      const apellidos = [alumno.apellido_paterno, alumno.apellido_materno]
        .filter((valor): valor is string => Boolean(valor))
        .join(" ");
      const existente = porAlumno.get(alumno.id);

      return {
        alumnoId: alumno.id,
        nombre: apellidos ? `${apellidos}, ${alumno.nombres}` : alumno.nombres,
        parcial1_adas: existente?.parcial1_adas ?? null,
        parcial1_examen: existente?.parcial1_examen ?? null,
        parcial2_adas: existente?.parcial2_adas ?? null,
        parcial2_examen: existente?.parcial2_examen ?? null,
        producto_proyecto: existente?.producto_proyecto ?? null,
        producto_examen: existente?.producto_examen ?? null,
      };
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

export default async function CalificacionesAsignacionPage({
  params,
}: {
  params: Promise<{ asignacionId: string }>;
}) {
  const { asignacionId } = await params;
  const asignacion = await requerirAccesoAsignacionPagina(asignacionId);
  const contexto = await obtenerContexto(asignacion.materia_id, asignacion.grupo_id);

  const ponderacionDefinida =
    asignacion.parcial1_max !== null &&
    asignacion.parcial2_max !== null &&
    asignacion.producto_max !== null;

  const filas = ponderacionDefinida ? await obtenerFilasCaptura(asignacionId) : [];

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900">
        {contexto.materiaNombre} — {contexto.gradoNombre}, Grupo {contexto.grupoNombre}
      </h1>

      {!ponderacionDefinida ? (
        <div className="mt-6 max-w-sm">
          <p className="text-sm text-zinc-600">
            Define cuántos puntos vale cada parcial y el producto antes de capturar
            calificaciones.
          </p>
          <form action={guardarPonderacion.bind(null, asignacionId)} className="mt-4 space-y-3">
            <div>
              <label className="block text-sm font-medium text-zinc-700">
                Puntos del Parcial 1
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                name="parcial1_max"
                required
                className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700">
                Puntos del Parcial 2
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                name="parcial2_max"
                required
                className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700">
                Puntos del Producto
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                name="producto_max"
                required
                className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1 text-sm"
              />
            </div>
            <button
              type="submit"
              className="rounded-md bg-primario px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              Guardar ponderación
            </button>
          </form>
        </div>
      ) : filas.length === 0 ? (
        <p className="mt-6 text-zinc-600">Este grupo todavía no tiene alumnos.</p>
      ) : (
        <TablaCaptura
          filas={filas}
          accionGuardar={guardarCalificaciones.bind(null, asignacionId)}
        />
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
Expected: todos los tests pasan (esta pantalla no tiene tests unitarios propios — es I/O,
mismo criterio que el resto de páginas de Materias).

- [ ] **Step 6: Verificación manual**

Con `npm run dev` corriendo:

1. Sesión de `super_admin`/`direccion`: entrar a `/calificaciones`, confirmar que aparecen
   todas las asignaciones existentes. Entrar a una, definir la ponderación (ej. 30/30/40),
   confirmar que aparece la tabla con los alumnos del grupo de esa asignación.
2. Capturar valores para 1-2 alumnos (ej. ADAS parcial 1 = 21) y guardar. Confirmar que la
   tabla recargada muestra los valores guardados y los totales calculados correctamente
   (Calif 1, Calif 2, Subtotal, Total).
3. Intentar capturar un valor que haga que un subtotal de parcial supere el máximo
   configurado (ej. ADAS=25 + Examen=10 con máximo 30) y confirmar que el guardado se
   rechaza con el mensaje esperado, identificando al alumno y el parcial.
4. Sesión de un `docente` real (o simulando con un perfil de prueba): confirmar que en
   `/calificaciones` solo aparecen sus propias asignaciones ("Mis materias"), y que no
   puede llegar a la captura de una asignación ajena escribiendo la URL directamente
   (debe dar 404).
5. Si existe alguna materia con más de una asignación (2+ grupos) y una lista propia
   compartida: confirmar que cada asignación solo muestra a los alumnos de su propio
   grupo en la tabla de captura.

- [ ] **Step 7: Commit**

```bash
git add src/app/\(dashboard\)/calificaciones/\[asignacionId\] src/components/calificaciones/TablaCaptura.tsx
git commit -m "feat: agregar captura de calificaciones"
```

---

### Task 7: Bloquear eliminar una asignación con calificaciones capturadas

**Files:**
- Modify: `src/app/(dashboard)/materias/actions.ts`

**Interfaces:**
- No agrega interfaces nuevas — extiende `eliminarAsignacion` (ya existente, de la pieza de
  Materias) con una verificación adicional.

- [ ] **Step 1: Reemplazar `eliminarAsignacion` en `src/app/(dashboard)/materias/actions.ts`**

Localizar la función `eliminarAsignacion` actual y reemplazarla completa por:

```ts
export async function eliminarAsignacion(id: string, gradoId: string) {
  await requerirRol(["super_admin", "direccion"]);
  const supabase = await createClient();

  const { data: asignacion, error: errorAsignacion } = await supabase
    .from("asignaciones")
    .select("materia_id, ciclo_escolar_id")
    .eq("id", id)
    .single();

  if (errorAsignacion) {
    throw new Error(`No se pudo quitar la asignación: ${errorAsignacion.message}`);
  }

  const { count: countCalificaciones, error: errorCalificaciones } = await supabase
    .from("calificaciones")
    .select("id", { count: "exact", head: true })
    .eq("asignacion_id", id);

  if (errorCalificaciones) {
    throw new Error(`No se pudo quitar la asignación: ${errorCalificaciones.message}`);
  }
  if (countCalificaciones && countCalificaciones > 0) {
    throw new Error("No se puede eliminar: esta asignación tiene calificaciones capturadas.");
  }

  const { error } = await supabase.from("asignaciones").delete().eq("id", id);
  if (error) {
    throw new Error(`No se pudo quitar la asignación: ${error.message}`);
  }

  const { count, error: errorConteo } = await supabase
    .from("asignaciones")
    .select("id", { count: "exact", head: true })
    .eq("materia_id", asignacion.materia_id)
    .eq("ciclo_escolar_id", asignacion.ciclo_escolar_id);

  if (errorConteo) {
    throw new Error(`No se pudo quitar la asignación: ${errorConteo.message}`);
  }

  if (!count) {
    const { error: errorLista } = await supabase
      .from("materia_alumnos")
      .delete()
      .eq("materia_id", asignacion.materia_id)
      .eq("ciclo_escolar_id", asignacion.ciclo_escolar_id);

    if (errorLista) {
      throw new Error(`No se pudo quitar la asignación: ${errorLista.message}`);
    }
  }

  revalidatePath(`/materias/grado/${gradoId}`);
}
```

(Único cambio respecto a la versión actual: el bloque nuevo que verifica
`calificaciones` justo después de leer la asignación, antes de borrarla.)

- [ ] **Step 2: Verificar el build**

Run: `npm run build`
Expected: build limpio.

- [ ] **Step 3: Correr la suite completa**

Run: `npm test`
Expected: todos los tests pasan.

- [ ] **Step 4: Verificación manual**

Con `npm run dev` corriendo y sesión de `super_admin`/`direccion`: capturar al menos una
calificación para una asignación de prueba (vía `/calificaciones/[asignacionId]`), luego
intentar eliminar esa asignación desde `/materias/grado/[gradoId]` y confirmar que se
rechaza con el mensaje esperado. Borrar la calificación de prueba manualmente (o desde la
UI si aplica) y confirmar que ahora sí se puede eliminar la asignación.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(dashboard\)/materias/actions.ts
git commit -m "fix: bloquear eliminar asignación con calificaciones capturadas"
```

---

### Task 8: Documentación

**Files:**
- Modify: `database/schema.sql`
- Modify: `CONTEXTO_CLAUDE_CODE.md`

- [ ] **Step 1: Actualizar `database/schema.sql`**

Agregar, después del bloque de "Materias + asignación docente-materia-grupo" al final
del archivo:

```sql
-- ==========================================================
-- Captura de calificaciones
-- ==========================================================
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

- [ ] **Step 2: Actualizar `CONTEXTO_CLAUDE_CODE.md`**

Agregar una entrada en "Estado actual" describiendo la funcionalidad nueva (captura de
calificaciones calcada del Excel real — Parcial 1/2 con ADAS+Examen, Producto con
Proyecto+Examen, ponderación por asignación definida por el maestro, validación de
subtotal contra el máximo, acceso de maestro-dueño o super_admin/direccion, resolución
del pendiente de roster ambiguo con `obtenerAlumnosDeAsignacion`) y notar que, con esta
pieza, las 3 sub-piezas de Calificaciones (Autenticación + rol Docente, Materias +
asignación, Captura) quedan completas. Actualizar "Próximos pasos pendientes" para
reflejarlo — ya no queda ninguna sub-pieza de Calificaciones pendiente; el siguiente
trabajo natural es extender el patrón a Pagos/colegiaturas o Listas/asistencia (ya
apuntado como pendiente #3 antes de esta pieza), o cerrar RLS en el resto de las tablas
(pendiente #2).

- [ ] **Step 3: Verificar build y suite completa**

Run: `npm run build && npm test`
Expected: build limpio, todos los tests pasan.

- [ ] **Step 4: Commit**

```bash
git add database/schema.sql CONTEXTO_CLAUDE_CODE.md
git commit -m "docs: documentar captura de calificaciones"
```
