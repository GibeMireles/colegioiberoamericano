# Instancia dedicada por escuela + layout base — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corregir el repo para reflejar el modelo real de arquitectura (una instancia dedicada por escuela, no multi-tenant compartido) y construir el layout base (navegación lateral + tema de marca) del que colgarán los 3 módulos del MVP.

**Architecture:** `database/schema.sql` deja de tener `escuela_id`/`escuelas` y gana una tabla `configuracion` de una sola fila. El frontend lee esa configuración (mock por ahora, vía `src/lib/config.ts`, con interfaz ya async para no cambiar cuando se conecte a Supabase real) y aplica el tema como CSS custom properties desde el root layout (server-side, sin parpadeo). Un route group `(dashboard)` monta el shell (`AppShell` = `Topbar` + `Sidebar` + contenido) sobre el que viven las 3 páginas placeholder de los módulos.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, Vitest (nuevo, solo para lógica pura).

**Spec:** `docs/superpowers/specs/2026-08-28-single-tenant-base-layout-design.md`

## Global Constraints

- Modelo de datos: una instancia dedicada por escuela. Nunca reintroducir `escuela_id` ni una tabla `escuelas` con múltiples filas — la config de marca vive en `configuracion`, tabla de una sola fila.
- Sin dark mode en el layout (solo el tema de marca).
- Sin selector de escuela ni mock de rol en la navegación — los 3 módulos son visibles para cualquier rol por ahora.
- `getConfiguracion()` debe ser `async` desde el día uno (aunque el mock resuelva de inmediato), para que reemplazarla por una consulta real a Supabase no cambie la interfaz que consume el layout.
- Testing: Vitest solo para lógica pura en `src/lib/*.ts`. Componentes y páginas se validan con `npm run build` + `npm run lint` + verificación visual en el navegador — no se instala React Testing Library/jsdom en este plan (consistente con la sección "Testing / validación" de la spec).
- Alias de imports: `@/*` → `./src/*` (ya configurado en `tsconfig.json`).

---

### Task 1: Corregir `database/schema.sql`

**Files:**
- Modify: `database/schema.sql`

**Interfaces:**
- Consumes: nada.
- Produces: nada (no hay código de app que dependa de esto todavía; es la referencia de esquema para cuando exista Supabase real).

- [ ] **Step 1: Reescribir el archivo completo**

Reemplaza todo el contenido de `database/schema.sql` por:

```sql
-- Esquema inicial MVP — plataforma de gestión escolar
-- Cada escuela corre su propia instancia (proyecto de Supabase propio).
-- No hay aislamiento multi-tenant por escuela_id: una escuela nueva se
-- atiende replicando este proyecto completo, no agregando una fila.
-- Row Level Security (RLS) se define en un archivo aparte una vez
-- que los roles de usuario estén definidos en Supabase Auth.

create extension if not exists "pgcrypto";

-- ==========================================================
-- Configuración de marca de esta instancia (fila única)
-- ==========================================================
create table configuracion (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  nombre_corto text,
  color_primario text,      -- ej. '#D85A30'
  color_secundario text,    -- ej. '#EF9F27'
  logo_url text,
  actualizado_en timestamptz not null default now()
);

-- ==========================================================
-- Ciclos escolares, grados y grupos
-- ==========================================================
create table ciclos_escolares (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,          -- ej. '2026-2027'
  fecha_inicio date,
  fecha_fin date,
  activo boolean not null default true
);

create table grados (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,          -- ej. '1° preparatoria'
  orden int
);

create table grupos (
  id uuid primary key default gen_random_uuid(),
  grado_id uuid not null references grados(id),
  ciclo_escolar_id uuid not null references ciclos_escolares(id),
  nombre text not null            -- ej. '1°A'
);

-- ==========================================================
-- Alumnos e inscripciones
-- ==========================================================
create table alumnos (
  id uuid primary key default gen_random_uuid(),
  nombre_completo text not null,
  fecha_nacimiento date,
  matricula text,
  tutor_nombre text,
  tutor_telefono text,
  tutor_email text,
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);

create table inscripciones (
  id uuid primary key default gen_random_uuid(),
  alumno_id uuid not null references alumnos(id),
  grupo_id uuid not null references grupos(id),
  ciclo_escolar_id uuid not null references ciclos_escolares(id),
  fecha_inscripcion date not null default current_date
);

-- ==========================================================
-- Pagos
-- ==========================================================
create table conceptos_pago (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,          -- ej. 'Colegiatura', 'Inscripción'
  monto_default numeric(10,2)
);

create table cargos (
  id uuid primary key default gen_random_uuid(),
  alumno_id uuid not null references alumnos(id),
  concepto_pago_id uuid not null references conceptos_pago(id),
  ciclo_escolar_id uuid not null references ciclos_escolares(id),
  monto numeric(10,2) not null,
  fecha_vencimiento date,
  estatus text not null default 'pendiente'  -- pendiente | pagado | vencido
);

create table pagos (
  id uuid primary key default gen_random_uuid(),
  cargo_id uuid not null references cargos(id),
  monto_pagado numeric(10,2) not null,
  fecha_pago timestamptz not null default now(),
  metodo_pago text,               -- efectivo | transferencia | tarjeta
  registrado_por uuid             -- referencia a usuarios/perfiles
);

-- ==========================================================
-- Asistencia
-- ==========================================================
create table asistencias (
  id uuid primary key default gen_random_uuid(),
  alumno_id uuid not null references alumnos(id),
  grupo_id uuid not null references grupos(id),
  fecha date not null,
  estatus text not null,          -- presente | falta | retardo | justificado
  registrado_por uuid,
  unique (alumno_id, fecha)
);

-- ==========================================================
-- Usuarios y perfiles (roles dentro de esta instancia)
-- ==========================================================
create table perfiles (
  id uuid primary key default gen_random_uuid(),
  usuario_auth_id uuid not null,  -- referencia a auth.users de Supabase
  nombre_completo text not null,
  rol text not null,              -- super_admin | direccion | caja
  creado_en timestamptz not null default now()
);

-- Índices básicos para las consultas más comunes
create index idx_inscripciones_alumno on inscripciones(alumno_id);
create index idx_cargos_alumno on cargos(alumno_id);
create index idx_asistencias_grupo_fecha on asistencias(grupo_id, fecha);
```

- [ ] **Step 2: Verificar que no quedan referencias viejas**

Run: `grep -n -E "escuela_id|create table escuelas" database/schema.sql`
Expected: sin coincidencias (comando termina sin imprimir nada, exit code 1).

- [ ] **Step 3: Commit**

```bash
git add database/schema.sql
git commit -m "schema: replace escuela_id/escuelas with single-row configuracion table"
```

---

### Task 2: Corregir documentación (`README.md`, `docs/arquitectura.md`, `CONTEXTO_CLAUDE_CODE.md`)

**Files:**
- Modify: `README.md`
- Modify: `docs/arquitectura.md`
- Modify: `CONTEXTO_CLAUDE_CODE.md`

**Interfaces:**
- Consumes: nada.
- Produces: nada (documentación).

- [ ] **Step 1: Reescribir `README.md`**

Reemplaza todo el contenido de `README.md` por:

```markdown
# Colegio Iberoamericano — Plataforma de gestión escolar

Plataforma para centralizar la gestión administrativa del Colegio
Iberoamericano (nivel preparatoria), diseñada desde el inicio para
poder replicarse a otras escuelas.

## Problema

Actualmente la gestión administrativa (alumnos, grados, pagos, listas)
se lleva en múltiples archivos de Excel dispersos. Esto genera
duplicidad de información, riesgo de errores y falta de visibilidad
centralizada.

## Visión

Una plataforma web centralizada donde el personal administrativo
gestione alumnos, grados, listas y pagos desde un solo lugar, con
información organizada por perfiles de usuario.

## Alcance del MVP

Tres módulos base:

1. **Alumnos y grados** — ficha del alumno, grado, grupo, ciclo escolar.
2. **Pagos / colegiaturas** — conceptos, cargos, pagos, saldos.
3. **Listas / asistencia** — grupos, pase de lista, reportes de faltas.

## Perfiles de usuario (MVP)

- **Super admin** — administra la configuración y usuarios de esta instancia.
- **Administrativo / Dirección** — gestión general y reportes.
- **Caja / Finanzas** — pagos y cobranza.
- *(Docente queda para una v2)*

## Diseño pensado a futuro

Cada escuela corre su propia instancia dedicada (su propio proyecto de
Supabase y su propio deploy) — ver
[`docs/arquitectura.md`](docs/arquitectura.md). No hay una base de
datos compartida entre escuelas: agregar una institución nueva es
replicar este proyecto, no una migración de esquema. Cada escuela
tiene su propia configuración de marca (colores, logo) en su propia
instancia.

## Ruta del proyecto

MVP funcional en Iberoamericano → ajustes con uso real → replicar la
instancia para otras escuelas → empaquetar el proceso de replicación
para ofrecerlo externamente.

## Estructura del repo

```
docs/          Documentación de producto y arquitectura
database/      Esquema de base de datos (Supabase / Postgres)
```

## Stack

- **Backend / base de datos**: Supabase (Postgres, autenticación, RLS
  por rol dentro de la instancia)
- **Frontend**: Next.js / React

## Estado actual

🚧 En desarrollo — layout base y scaffolding de Next.js en progreso.
```

- [ ] **Step 2: Reescribir `docs/arquitectura.md`**

Reemplaza todo el contenido de `docs/arquitectura.md` por:

```markdown
# Arquitectura

## Principio central: una instancia por escuela

Cada escuela corre su propia instancia dedicada: su propio proyecto de
Supabase (base de datos, Auth, Storage) y su propio deploy de
Next.js. No existe una base de datos ni un deploy compartido entre
escuelas — el aislamiento de datos es total porque, estructuralmente,
no hay ningún dato de otra escuela en la misma base.

Agregar una escuela nueva significa **replicar el proyecto completo**,
no agregar una fila a una tabla. El proceso de replicación:

1. Crear un nuevo proyecto de Supabase para la escuela.
2. Correr `database/schema.sql` en ese proyecto.
3. Insertar la fila única de `configuracion` con el nombre, colores y
   logo de esa escuela.
4. Desplegar una nueva instancia de la app (Vercel u otro) apuntando a
   ese proyecto de Supabase.

Este proceso es manual por ahora — automatizarlo (plantilla/CLI de
replicación) es trabajo futuro, a resolver cuando el número de
escuelas lo justifique.

## Configuración de marca de la instancia

Cada instancia tiene su propia identidad visual (colores, logo,
nombre corto) sin tocar el código de la aplicación. Esto vive en la
tabla `configuracion` (una sola fila por instancia), no como valores
fijos en el frontend.

Campos de `configuracion`:

- `nombre`
- `nombre_corto`
- `color_primario`, `color_secundario`
- `logo_url`

El frontend lee esta configuración al arrancar y aplica los colores
institucionales (por ejemplo, rojo y amarillo para Ibero) como
variables de tema.

## Entidades principales (alto nivel)

- `configuracion` — una sola fila con la identidad de marca de esta instancia.
- `ciclos_escolares` — periodo (ej. 2026-2027).
- `grados` — ej. "1° preparatoria".
- `grupos` — ej. "1°A", pertenece a un grado y a un ciclo escolar.
- `alumnos` — ficha del alumno.
- `inscripciones` — relación alumno–grupo–ciclo escolar.
- `conceptos_pago` — catálogo de conceptos (colegiatura, inscripción, etc.).
- `cargos` — monto que se le debe a un alumno por un concepto.
- `pagos` — registro de pagos aplicados a uno o varios cargos.
- `asistencias` — registro de asistencia por alumno, grupo y fecha.
- `usuarios` / `perfiles` — usuarios del sistema y su rol (admin,
  dirección, caja) dentro de esta instancia.

El detalle de columnas y relaciones vive en
[`database/schema.sql`](../database/schema.sql).

## Perfiles y permisos (alto nivel)

| Perfil | Puede |
|---|---|
| Super admin | Administrar la configuración y usuarios de esta instancia |
| Administrativo / Dirección | Gestionar alumnos, grados, grupos; ver reportes |
| Caja / Finanzas | Gestionar conceptos, cargos y pagos |

Los permisos finos se implementan vía RLS + rol del usuario, no en el
frontend.

## Frontend

- Next.js / React.
- El tema visual (colores institucionales) se carga dinámicamente
  desde `configuracion` — ver "Configuración de marca" arriba.

## Estado de este documento

Vivo — se actualiza conforme se validan decisiones con uso real en el
Colegio Iberoamericano.
```

- [ ] **Step 3: Reescribir `CONTEXTO_CLAUDE_CODE.md`**

Reemplaza todo el contenido de `CONTEXTO_CLAUDE_CODE.md` por:

```markdown
# Contexto del proyecto — para Claude Code

Repo: https://github.com/GibeMireles/colegioiberoamericano

## Qué es esto

Plataforma de gestión escolar para el Colegio Iberoamericano
(preparatoria), pensada desde el inicio para poder replicarse a otras
escuelas del mismo dueño (2 más actualmente) y eventualmente a
terceros. Reemplaza un sistema actual basado en múltiples archivos de
Excel.

Lee primero `README.md` y `docs/arquitectura.md` en el repo — ahí está
el planteamiento completo y el modelo de instancia dedicada por
escuela. No los repito aquí para evitar que queden desincronizados.

## Stack

- **Backend / DB**: Supabase (Postgres + Auth + RLS)
- **Frontend**: Next.js / React
- El esquema inicial ya existe en `database/schema.sql`. Cada escuela
  corre su propia instancia (su propio proyecto Supabase): no hay
  `escuela_id` compartido, la identidad de marca vive en una tabla
  `configuracion` de una sola fila por instancia.

## Estado actual

- Planteamiento del producto: cerrado.
- Modelo de datos: instancia dedicada por escuela (no multi-tenant
  compartido) — ver `docs/arquitectura.md`.
- Esquema de base de datos: primera versión escrita, sin correr aún
  en un proyecto real de Supabase.
- Identidad visual: colores institucionales de Ibero son rojo
  (`#D85A30` aprox.) y amarillo/dorado (`#EF9F27` aprox.), tomados de
  su sitio/logo actual. Viven como configuración (`color_primario` /
  `color_secundario` en la tabla `configuracion`), no hardcodeados en
  el frontend — para que una réplica en otra escuela solo cambie esa
  fila, sin tocar código.
- Repo de Next.js scaffoldeado (App Router, TypeScript, Tailwind).
  Layout base (navegación + tema de marca) en construcción — ver
  `docs/superpowers/plans/2026-08-28-single-tenant-base-layout.md`.
- Proyecto de Supabase real: aún no creado.

## Alcance del MVP — 3 módulos

1. Alumnos y grados
2. Pagos / colegiaturas
3. Listas / asistencia

## Perfiles de usuario del MVP

- Super admin (administra la configuración y usuarios de esta instancia)
- Administrativo / Dirección
- Caja / Finanzas

(Docente queda para una v2, no construir aún.)

## Enfoque de trabajo

Vamos avanzando de forma iterativa: validar estructura → mostrar
avance → ajustar → agregar la siguiente pieza. No sobre-construir de
golpe. Priorizar que el MVP funcione bien en Iberoamericano antes de
replicar a otras escuelas.

## Próximos pasos pendientes

1. Terminar el layout base (ver plan referenciado arriba).
2. Crear el proyecto de Supabase real y correr `database/schema.sql`.
3. Reemplazar el mock de `src/lib/config.ts` por una consulta real a
   la tabla `configuracion`.
4. Configurar RLS básico por rol (`perfiles.rol`) — ya no por
   `escuela_id`, porque no aplica en una instancia dedicada.
```

- [ ] **Step 4: Verificar que no quedan referencias viejas**

Run: `grep -rn -E "escuela_id|extenderse a otras escuelas|modelo de datos multi-escuela" README.md docs/arquitectura.md CONTEXTO_CLAUDE_CODE.md`
Expected: sin coincidencias.

- [ ] **Step 5: Commit**

```bash
git add README.md docs/arquitectura.md CONTEXTO_CLAUDE_CODE.md
git commit -m "docs: describe single-instance-per-school model instead of shared multi-tenant"
```

---

### Task 3: Vitest + `src/lib/config.ts`

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json`
- Create: `src/lib/config.ts`
- Test: `src/lib/config.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `interface ConfiguracionEscuela { nombre: string; nombreCorto: string; colorPrimario: string; colorSecundario: string; logoUrl: string | null }` y `async function getConfiguracion(): Promise<ConfiguracionEscuela>`, ambos exportados desde `src/lib/config.ts`. Usados por Task 5 (`src/app/layout.tsx`) y Task 6 (`src/components/layout/Topbar.tsx`).

- [ ] **Step 1: Instalar Vitest**

Run: `npm install -D vitest`
Expected: se agrega `vitest` a `devDependencies` en `package.json`.

- [ ] **Step 2: Agregar script de test**

En `package.json`, dentro de `"scripts"`, agrega:

```json
"test": "vitest run"
```

(Queda junto a `dev`, `build`, `start`, `lint`.)

- [ ] **Step 3: Crear `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
  },
});
```

- [ ] **Step 4: Escribir el test que debe fallar**

Crea `src/lib/config.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getConfiguracion } from "./config";

describe("getConfiguracion", () => {
  it("returns the brand configuration with hex colors", async () => {
    const config = await getConfiguracion();

    expect(config.nombre).toBe("Colegio Iberoamericano");
    expect(config.nombreCorto).toBe("Ibero");
    expect(config.colorPrimario).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(config.colorSecundario).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });
});
```

- [ ] **Step 5: Correr el test y verificar que falla**

Run: `npm run test -- src/lib/config.test.ts`
Expected: FAIL — no se puede resolver el módulo `./config` (aún no existe).

- [ ] **Step 6: Implementar `src/lib/config.ts`**

```ts
export interface ConfiguracionEscuela {
  nombre: string;
  nombreCorto: string;
  colorPrimario: string;
  colorSecundario: string;
  logoUrl: string | null;
}

export async function getConfiguracion(): Promise<ConfiguracionEscuela> {
  return {
    nombre: "Colegio Iberoamericano",
    nombreCorto: "Ibero",
    colorPrimario: "#D85A30",
    colorSecundario: "#EF9F27",
    logoUrl: null,
  };
}
```

- [ ] **Step 7: Correr el test y verificar que pasa**

Run: `npm run test -- src/lib/config.test.ts`
Expected: PASS (1 test).

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json vitest.config.ts src/lib/config.ts src/lib/config.test.ts
git commit -m "test: add vitest and mock brand configuration source"
```

---

### Task 4: `src/lib/nav.ts`

**Files:**
- Create: `src/lib/nav.ts`
- Test: `src/lib/nav.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `interface NavItem { label: string; href: string }`, `const NAV_ITEMS: NavItem[]`, `function isNavItemActive(pathname: string, href: string): boolean`, todos exportados desde `src/lib/nav.ts`. Usados por Task 6 (`src/components/layout/Sidebar.tsx`).

- [ ] **Step 1: Escribir el test que debe fallar**

Crea `src/lib/nav.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isNavItemActive, NAV_ITEMS } from "./nav";

describe("NAV_ITEMS", () => {
  it("has exactly the 3 MVP modules in order", () => {
    expect(NAV_ITEMS.map((item) => item.href)).toEqual([
      "/alumnos",
      "/pagos",
      "/asistencia",
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
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npm run test -- src/lib/nav.test.ts`
Expected: FAIL — no se puede resolver el módulo `./nav` (aún no existe).

- [ ] **Step 3: Implementar `src/lib/nav.ts`**

```ts
export interface NavItem {
  label: string;
  href: string;
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Alumnos y grados", href: "/alumnos" },
  { label: "Pagos", href: "/pagos" },
  { label: "Listas / Asistencia", href: "/asistencia" },
];

export function isNavItemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npm run test -- src/lib/nav.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/nav.ts src/lib/nav.test.ts
git commit -m "feat: add nav items and active-path matching for the sidebar"
```

---

### Task 5: Tema de marca — `globals.css` + `src/app/layout.tsx`

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/app/layout.tsx`

**Interfaces:**
- Consumes: `getConfiguracion` de `src/lib/config.ts` (Task 3).
- Produces: `<html>` renderizado con `--color-primario`/`--color-secundario` inyectadas inline; `<title>` de la página igual a `config.nombre`.

- [ ] **Step 1: Actualizar `src/app/globals.css`**

Reemplaza todo el contenido por:

```css
@import "tailwindcss";

:root {
  --background: #ffffff;
  --foreground: #171717;
  --color-primario: #d85a30;
  --color-secundario: #ef9f27;
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-primario: var(--color-primario);
  --color-secundario: var(--color-secundario);
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
}

body {
  background: var(--background);
  color: var(--foreground);
  font-family: Arial, Helvetica, sans-serif;
}
```

(Se quita el bloque `@media (prefers-color-scheme: dark)` — sin dark mode por diseño.)

- [ ] **Step 2: Actualizar `src/app/layout.tsx`**

Reemplaza todo el contenido por:

```tsx
import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { getConfiguracion } from "@/lib/config";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const config = await getConfiguracion();

  return {
    title: config.nombre,
    description: "Plataforma de gestión escolar",
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const config = await getConfiguracion();

  const themeStyle = {
    "--color-primario": config.colorPrimario,
    "--color-secundario": config.colorSecundario,
  } as CSSProperties;

  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      style={themeStyle}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
```

- [ ] **Step 3: Verificar build**

Run: `npm run build`
Expected: compila sin errores de tipos ni de lint (el default `src/app/page.tsx` sigue existiendo hasta Task 7, así que la ruta `/` sigue funcionando).

- [ ] **Step 4: Commit**

```bash
git add src/app/globals.css src/app/layout.tsx
git commit -m "feat: apply brand theme colors from configuracion in the root layout"
```

---

### Task 6: `AppShell` (Sidebar + Topbar) y route group `(dashboard)`

**Files:**
- Create: `src/components/layout/Sidebar.tsx`
- Create: `src/components/layout/Topbar.tsx`
- Create: `src/components/layout/AppShell.tsx`
- Create: `src/app/(dashboard)/layout.tsx`

**Interfaces:**
- Consumes: `NAV_ITEMS`, `isNavItemActive` de `src/lib/nav.ts` (Task 4); `getConfiguracion` de `src/lib/config.ts` (Task 3).
- Produces: `AppShell({ children }: { children: ReactNode })` exportado desde `src/components/layout/AppShell.tsx`, usado por `src/app/(dashboard)/layout.tsx`. Las páginas de Task 7 viven bajo `src/app/(dashboard)/`.

- [ ] **Step 1: Crear `src/components/layout/Sidebar.tsx`**

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, isNavItemActive } from "@/lib/nav";

export function Sidebar() {
  const pathname = usePathname();

  return (
    <nav
      className="flex w-56 shrink-0 flex-col gap-1 border-r border-black/10 bg-white p-4"
      aria-label="Navegación principal"
    >
      {NAV_ITEMS.map((item) => {
        const active = isNavItemActive(pathname, item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              active
                ? "bg-primario text-white"
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

- [ ] **Step 2: Crear `src/components/layout/Topbar.tsx`**

```tsx
import Image from "next/image";
import { getConfiguracion } from "@/lib/config";

export async function Topbar() {
  const config = await getConfiguracion();

  return (
    <header className="flex h-16 shrink-0 items-center gap-3 border-b border-black/10 bg-white px-6">
      {config.logoUrl ? (
        <Image
          src={config.logoUrl}
          alt={config.nombre}
          width={32}
          height={32}
        />
      ) : (
        <div
          className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold text-white"
          style={{ backgroundColor: config.colorPrimario }}
          aria-hidden="true"
        >
          {config.nombreCorto.charAt(0)}
        </div>
      )}
      <span className="text-lg font-semibold text-zinc-900">
        {config.nombre}
      </span>
    </header>
  );
}
```

- [ ] **Step 3: Crear `src/components/layout/AppShell.tsx`**

```tsx
import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <Topbar />
      <div className="flex flex-1">
        <Sidebar />
        <main className="flex-1 p-8">{children}</main>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Crear `src/app/(dashboard)/layout.tsx`**

```tsx
import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/AppShell";

export default function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <AppShell>{children}</AppShell>;
}
```

- [ ] **Step 5: Verificar build**

Run: `npm run build`
Expected: compila sin errores (el route group `(dashboard)` todavía no tiene páginas propias, eso es normal — no genera rutas nuevas hasta Task 7).

- [ ] **Step 6: Commit**

```bash
git add src/components/layout/Sidebar.tsx src/components/layout/Topbar.tsx src/components/layout/AppShell.tsx "src/app/(dashboard)/layout.tsx"
git commit -m "feat: add AppShell with sidebar navigation and topbar"
```

---

### Task 7: Páginas del dashboard, limpieza y verificación final

**Files:**
- Create: `src/app/(dashboard)/page.tsx`
- Create: `src/app/(dashboard)/alumnos/page.tsx`
- Create: `src/app/(dashboard)/pagos/page.tsx`
- Create: `src/app/(dashboard)/asistencia/page.tsx`
- Delete: `src/app/page.tsx`
- Delete: `public/file.svg`, `public/globe.svg`, `public/next.svg`, `public/vercel.svg`, `public/window.svg`

**Interfaces:**
- Consumes: `AppShell` vía `src/app/(dashboard)/layout.tsx` (Task 6, ya aplicado automáticamente por Next.js a todo lo que viva bajo `(dashboard)`).
- Produces: rutas `/`, `/alumnos`, `/pagos`, `/asistencia` navegables.

- [ ] **Step 1: Eliminar la página default y los SVGs de ejemplo sin usar**

```bash
git rm src/app/page.tsx public/file.svg public/globe.svg public/next.svg public/vercel.svg public/window.svg
```

- [ ] **Step 2: Crear `src/app/(dashboard)/page.tsx`**

Redirige `/` al primer módulo (no hay un concepto de "inicio" separado en el MVP):

```tsx
import { redirect } from "next/navigation";

export default function DashboardIndexPage() {
  redirect("/alumnos");
}
```

- [ ] **Step 3: Crear `src/app/(dashboard)/alumnos/page.tsx`**

```tsx
export default function AlumnosPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900">
        Alumnos y grados
      </h1>
      <p className="mt-2 text-zinc-600">Próximamente.</p>
    </div>
  );
}
```

- [ ] **Step 4: Crear `src/app/(dashboard)/pagos/page.tsx`**

```tsx
export default function PagosPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900">Pagos</h1>
      <p className="mt-2 text-zinc-600">Próximamente.</p>
    </div>
  );
}
```

- [ ] **Step 5: Crear `src/app/(dashboard)/asistencia/page.tsx`**

```tsx
export default function AsistenciaPage() {
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

- [ ] **Step 6: Verificar build, lint y tests**

Run: `npm run build`
Expected: compila sin errores; rutas generadas incluyen `/`, `/alumnos`, `/pagos`, `/asistencia`.

Run: `npm run lint`
Expected: sin errores.

Run: `npm run test`
Expected: PASS (los 6 tests de `config.test.ts` + `nav.test.ts`).

- [ ] **Step 7: Verificación visual**

Run: `npm run dev` (en background)

En el navegador, abre `http://localhost:3000`:
- Debe redirigir a `/alumnos` y mostrar el topbar con "Colegio Iberoamericano" y el sidebar con los 3 enlaces.
- El enlace activo ("Alumnos y grados") debe verse resaltado con el color primario (`#D85A30`, rojo Ibero).
- Haz clic en "Pagos" y "Listas / Asistencia": cada página carga su placeholder y el resaltado del sidebar cambia al enlace correcto.

Detén el servidor de desarrollo al terminar.

- [ ] **Step 8: Commit**

```bash
git add "src/app/(dashboard)" -A
git commit -m "feat: add dashboard placeholder pages and remove default Next.js starter page"
```

---

## Self-Review Notes

- **Spec coverage:** schema (Task 1), docs (Task 2), config mock async-ready (Task 3), tema sin parpadeo desde root layout (Task 5), sidebar con resaltado de ruta activa (Task 4 + 6), topbar con nombre/logo (Task 6), 3 páginas placeholder (Task 7), sin selector de escuela/rol/dark mode (respetado en todas las tareas) — todo cubierto.
- **Placeholder scan:** sin TBD/TODO; cada paso trae código completo, no hay "similar to Task N".
- **Type consistency:** `ConfiguracionEscuela` (Task 3) se usa con los mismos nombres de campo (`nombre`, `nombreCorto`, `colorPrimario`, `colorSecundario`, `logoUrl`) en Task 5 y Task 6. `NavItem`/`NAV_ITEMS`/`isNavItemActive` (Task 4) se usan sin cambios en Task 6.
