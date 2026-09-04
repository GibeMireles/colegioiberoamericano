# Login con contraseña Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar login con correo + contraseña como vía más rápida de entrar (además del enlace mágico existente, que no cambia), usando el soporte nativo de contraseña de Supabase Auth.

**Architecture:** Sin tabla ni columna nueva — Supabase Auth ya gestiona una contraseña hasheada por usuario, hoy sin usar porque nunca se llamó a `signInWithPassword`/`updateUser({ password })` desde esta app. `/login` pasa a mostrar correo+contraseña como formulario principal, con un enlace que revela el formulario de solo-correo de siempre (mismo patrón de query-param que `?editar=1` en Calificaciones/Asistencia, sin componente cliente). Pantalla nueva `/mi-cuenta`, accesible a cualquier rol logueado, donde cada quien crea/cambia su propia contraseña.

**Tech Stack:** Next.js 16 App Router, Supabase Auth, Zod, Vitest — mismo stack del resto del proyecto, sin dependencias nuevas.

**Spec:** `docs/superpowers/specs/2026-09-04-login-contrasena-design.md`

## Global Constraints

- Sin migración de base de datos — se usa el campo de contraseña que Supabase Auth ya gestiona internamente en `auth.users`.
- El enlace mágico (`enviarEnlaceAcceso` en `src/app/login/actions.ts`) no cambia en absoluto — sigue siendo la vía de invitación y la vía de recuperación implícita.
- `/mi-cuenta` es accesible a los 4 roles sin restricción adicional — se reutilizan `requerirRolPagina`/`requerirRol` pasando el array completo `ROLES` de `src/lib/roles.ts` (vía spread `[...ROLES]`, porque `ROLES` es una tupla `readonly` y esas funciones piden `Rol[]` mutable).
- Login con contraseña incorrecta o correo sin contraseña creada: mensaje genérico ("Correo o contraseña incorrectos"), nunca distinguir el motivo — no se debe poder usar el formulario para adivinar qué correos existen.
- Nadie (ni super_admin) puede ver o establecer la contraseña de otro usuario — `actualizarContrasena` solo usa la sesión ya activa del usuario que la llama (`supabase.auth.updateUser`), nunca la service role key.
- Contraseña: mínimo 8 caracteres, y "confirmar contraseña" debe coincidir — validado con Zod antes de llamar a Supabase.
- Sin flujo separado de "olvidé mi contraseña" — el enlace mágico ya cumple esa función.
- Todo el texto de UI en español, mismo tono que el resto del proyecto.

---

### Task 1: Schema de contraseña

**Files:**
- Create: `src/lib/cuenta/schema.ts`
- Test: `src/lib/cuenta/schema.test.ts`

**Interfaces:**
- Produces: `actualizarContrasenaSchema` (objeto Zod con `contrasena: string`, `confirmar: string`) y el tipo `ActualizarContrasenaInput`, ambos consumidos por Task 3 (`src/app/(dashboard)/mi-cuenta/actions.ts`).

- [ ] **Step 1: Escribir el test que falla**

Crea `src/lib/cuenta/schema.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { actualizarContrasenaSchema } from "./schema";

describe("actualizarContrasenaSchema", () => {
  it("accepts a valid password with matching confirmation", () => {
    const result = actualizarContrasenaSchema.safeParse({
      contrasena: "unaClaveSegura",
      confirmar: "unaClaveSegura",
    });

    expect(result.success).toBe(true);
  });

  it("rejects a password shorter than 8 characters", () => {
    const result = actualizarContrasenaSchema.safeParse({
      contrasena: "corta1",
      confirmar: "corta1",
    });

    expect(result.success).toBe(false);
  });

  it("rejects when confirmar does not match contrasena", () => {
    const result = actualizarContrasenaSchema.safeParse({
      contrasena: "unaClaveSegura",
      confirmar: "otraClaveSegura",
    });

    expect(result.success).toBe(false);
  });

  it("rejects a missing contrasena", () => {
    const result = actualizarContrasenaSchema.safeParse({
      confirmar: "unaClaveSegura",
    });

    expect(result.success).toBe(false);
  });

  it("rejects a missing confirmar", () => {
    const result = actualizarContrasenaSchema.safeParse({
      contrasena: "unaClaveSegura",
    });

    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run src/lib/cuenta/schema.test.ts`
Expected: FAIL — `Cannot find module './schema'` (o equivalente, el archivo no existe todavía).

- [ ] **Step 3: Escribir la implementación mínima**

Crea `src/lib/cuenta/schema.ts`:

```typescript
import { z } from "zod";

export const actualizarContrasenaSchema = z
  .object({
    contrasena: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
    confirmar: z.string(),
  })
  .refine((datos) => datos.contrasena === datos.confirmar, {
    message: "Las contraseñas no coinciden",
    path: ["confirmar"],
  });

export type ActualizarContrasenaInput = z.infer<typeof actualizarContrasenaSchema>;
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run src/lib/cuenta/schema.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/cuenta/schema.ts src/lib/cuenta/schema.test.ts
git commit -m "feat: agregar schema de validación de contraseña"
```

---

### Task 2: Login con contraseña

**Files:**
- Modify: `src/app/login/actions.ts`
- Modify: `src/app/login/page.tsx`

**Interfaces:**
- Consumes: nada de Task 1 — el login usa checks de presencia simples (mismo patrón que `enviarEnlaceAcceso` ya hace para `correo`), no Zod.
- Produces: `iniciarSesionConContrasena` (Server Action), usada solo desde `page.tsx` en este mismo task.

- [ ] **Step 1: Agregar la Server Action de login con contraseña**

Modifica `src/app/login/actions.ts` — deja `enviarEnlaceAcceso` exactamente como está, agrega al final:

```typescript
export async function iniciarSesionConContrasena(formData: FormData) {
  const correo = formData.get("correo");
  const contrasena = formData.get("contrasena");
  const next = formData.get("next");

  if (
    typeof correo !== "string" ||
    correo.trim().length === 0 ||
    typeof contrasena !== "string" ||
    contrasena.length === 0
  ) {
    redirect("/login?error=credenciales_invalidas");
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email: correo.trim(),
    password: contrasena,
  });

  if (error) {
    redirect("/login?error=credenciales_invalidas");
  }

  const destino = typeof next === "string" && next.trim().length > 0 ? next : "/";
  redirect(destino);
}
```

El archivo completo queda así (imports ya existentes, sin cambios en `enviarEnlaceAcceso`):

```typescript
"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { obtenerSiteUrl } from "@/lib/site-url";

export async function enviarEnlaceAcceso(formData: FormData) {
  const correo = formData.get("correo");
  const next = formData.get("next");

  if (typeof correo !== "string" || correo.trim().length === 0) {
    redirect("/login?error=correo_invalido");
  }

  const supabase = await createClient();

  const siteUrl = obtenerSiteUrl();
  const nextParam =
    typeof next === "string" && next.trim().length > 0
      ? `?next=${encodeURIComponent(next)}`
      : "";

  const { error } = await supabase.auth.signInWithOtp({
    email: correo.trim(),
    options: {
      shouldCreateUser: false,
      emailRedirectTo: `${siteUrl}/auth/callback${nextParam}`,
    },
  });

  if (error) {
    redirect("/login?error=envio_fallido");
  }

  redirect("/login?enviado=1");
}

export async function iniciarSesionConContrasena(formData: FormData) {
  const correo = formData.get("correo");
  const contrasena = formData.get("contrasena");
  const next = formData.get("next");

  if (
    typeof correo !== "string" ||
    correo.trim().length === 0 ||
    typeof contrasena !== "string" ||
    contrasena.length === 0
  ) {
    redirect("/login?error=credenciales_invalidas");
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email: correo.trim(),
    password: contrasena,
  });

  if (error) {
    redirect("/login?error=credenciales_invalidas");
  }

  const destino = typeof next === "string" && next.trim().length > 0 ? next : "/";
  redirect(destino);
}
```

- [ ] **Step 2: Reescribir la pantalla de login**

Reemplaza el contenido completo de `src/app/login/page.tsx`:

```tsx
import { enviarEnlaceAcceso, iniciarSesionConContrasena } from "./actions";

const MENSAJES_ERROR: Record<string, string> = {
  correo_invalido: "Escribe un correo válido.",
  envio_fallido: "No se pudo enviar el enlace. Intenta de nuevo.",
  enlace_invalido: "Tu enlace ya no es válido o expiró. Pide uno nuevo.",
  credenciales_invalidas: "Correo o contraseña incorrectos.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ enviado?: string; error?: string; next?: string; modo?: string }>;
}) {
  const { enviado, error, next, modo } = await searchParams;
  const modoEnlace = modo === "enlace";
  const sufijoNext = next ? `next=${encodeURIComponent(next)}` : "";

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50">
      <div className="w-full max-w-sm rounded-lg border border-zinc-200 bg-white p-8">
        <h1 className="text-xl font-semibold text-zinc-900">Iniciar sesión</h1>

        {modoEnlace ? (
          enviado ? (
            <p className="mt-4 text-sm text-zinc-600">
              Revisa tu correo: te enviamos un enlace para entrar.
            </p>
          ) : (
            <>
              <form action={enviarEnlaceAcceso} className="mt-4 space-y-4">
                {next && <input type="hidden" name="next" value={next} />}
                <div>
                  <label
                    htmlFor="correo"
                    className="block text-sm font-medium text-zinc-700"
                  >
                    Correo
                  </label>
                  <input
                    id="correo"
                    name="correo"
                    type="email"
                    required
                    className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2"
                  />
                </div>
                {error && (
                  <p className="text-sm text-red-600">
                    {MENSAJES_ERROR[error] ?? "Ocurrió un error. Intenta de nuevo."}
                  </p>
                )}
                <button
                  type="submit"
                  className="w-full rounded-md bg-primario px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                >
                  Enviar enlace de acceso
                </button>
              </form>
              <a
                href={`/login${sufijoNext ? `?${sufijoNext}` : ""}`}
                className="mt-4 block text-sm font-medium text-primario hover:underline"
              >
                Entrar con correo y contraseña
              </a>
            </>
          )
        ) : (
          <>
            <form action={iniciarSesionConContrasena} className="mt-4 space-y-4">
              {next && <input type="hidden" name="next" value={next} />}
              <div>
                <label
                  htmlFor="correo"
                  className="block text-sm font-medium text-zinc-700"
                >
                  Correo
                </label>
                <input
                  id="correo"
                  name="correo"
                  type="email"
                  required
                  className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2"
                />
              </div>
              <div>
                <label
                  htmlFor="contrasena"
                  className="block text-sm font-medium text-zinc-700"
                >
                  Contraseña
                </label>
                <input
                  id="contrasena"
                  name="contrasena"
                  type="password"
                  required
                  className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2"
                />
              </div>
              {error && (
                <p className="text-sm text-red-600">
                  {MENSAJES_ERROR[error] ?? "Ocurrió un error. Intenta de nuevo."}
                </p>
              )}
              <button
                type="submit"
                className="w-full rounded-md bg-primario px-4 py-2 text-sm font-medium text-white hover:opacity-90"
              >
                Iniciar sesión
              </button>
            </form>
            <a
              href={`/login?modo=enlace${sufijoNext ? `&${sufijoNext}` : ""}`}
              className="mt-4 block text-sm font-medium text-primario hover:underline"
            >
              ¿No tienes contraseña o la olvidaste? Entra con un enlace por correo
            </a>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verificar build**

Run: `npm run build`
Expected: build limpio, sin errores de tipos.

- [ ] **Step 4: Commit**

```bash
git add src/app/login/actions.ts src/app/login/page.tsx
git commit -m "feat: agregar login con correo y contraseña"
```

---

### Task 3: Pantalla Mi cuenta

**Files:**
- Create: `src/app/(dashboard)/mi-cuenta/page.tsx`
- Create: `src/app/(dashboard)/mi-cuenta/actions.ts`
- Modify: `src/middleware.ts`
- Modify: `src/components/layout/Topbar.tsx`

**Interfaces:**
- Consumes: `actualizarContrasenaSchema`/`ActualizarContrasenaInput` de Task 1 (`src/lib/cuenta/schema.ts`); `requerirRolPagina`/`requerirRol` de `src/lib/perfiles/requerirRolPagina.ts`/`requerirRol.ts` (ya existen, sin cambios); `ROLES` de `src/lib/roles.ts` (ya existe, sin cambios).
- Produces: `actualizarContrasena` (Server Action), usada solo desde `page.tsx` en este mismo task.

- [ ] **Step 1: Crear la Server Action**

Crea `src/app/(dashboard)/mi-cuenta/actions.ts`:

```typescript
"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requerirRol } from "@/lib/perfiles/requerirRol";
import { ROLES } from "@/lib/roles";
import { actualizarContrasenaSchema } from "@/lib/cuenta/schema";

export async function actualizarContrasena(formData: FormData) {
  await requerirRol([...ROLES]);

  const resultado = actualizarContrasenaSchema.safeParse({
    contrasena: formData.get("contrasena") ?? undefined,
    confirmar: formData.get("confirmar") ?? undefined,
  });

  if (!resultado.success) {
    redirect("/mi-cuenta?error=validacion");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({
    password: resultado.data.contrasena,
  });

  if (error) {
    redirect("/mi-cuenta?error=actualizacion_fallida");
  }

  redirect("/mi-cuenta?guardado=1");
}
```

- [ ] **Step 2: Crear la pantalla**

Crea `src/app/(dashboard)/mi-cuenta/page.tsx`:

```tsx
import { requerirRolPagina } from "@/lib/perfiles/requerirRolPagina";
import { ROLES } from "@/lib/roles";
import { actualizarContrasena } from "./actions";

export const dynamic = "force-dynamic";

const MENSAJES_ERROR: Record<string, string> = {
  validacion:
    "Revisa los campos: la contraseña debe tener al menos 8 caracteres y las dos deben coincidir.",
  actualizacion_fallida: "No se pudo actualizar la contraseña. Intenta de nuevo.",
};

export default async function MiCuentaPage({
  searchParams,
}: {
  searchParams: Promise<{ guardado?: string; error?: string }>;
}) {
  await requerirRolPagina([...ROLES]);
  const { guardado, error } = await searchParams;

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900">Mi cuenta</h1>

      {guardado === "1" && (
        <p className="mt-4 rounded-md bg-green-50 px-4 py-2 text-sm font-medium text-green-800">
          ✓ Contraseña actualizada.
        </p>
      )}

      <div className="mt-6 max-w-sm">
        <h2 className="text-lg font-semibold text-zinc-900">Crear o cambiar contraseña</h2>
        <p className="text-sm text-zinc-600">
          Úsala para entrar más rápido la próxima vez, sin depender de un enlace por correo.
        </p>
        <form action={actualizarContrasena} className="mt-4 space-y-4">
          <div>
            <label
              htmlFor="contrasena"
              className="block text-sm font-medium text-zinc-700"
            >
              Nueva contraseña
            </label>
            <input
              id="contrasena"
              name="contrasena"
              type="password"
              required
              minLength={8}
              className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2"
            />
          </div>
          <div>
            <label
              htmlFor="confirmar"
              className="block text-sm font-medium text-zinc-700"
            >
              Confirmar contraseña
            </label>
            <input
              id="confirmar"
              name="confirmar"
              type="password"
              required
              minLength={8}
              className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2"
            />
          </div>
          {error && (
            <p className="text-sm text-red-600">
              {MENSAJES_ERROR[error] ?? "Ocurrió un error. Intenta de nuevo."}
            </p>
          )}
          <button
            type="submit"
            className="rounded-md bg-primario px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            Guardar contraseña
          </button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Proteger la ruta en el middleware**

Modifica `src/middleware.ts` — agrega `"/mi-cuenta"` al arreglo `RUTAS_PROTEGIDAS`:

```typescript
const RUTAS_PROTEGIDAS = ["/usuarios", "/materias", "/calificaciones", "/alumnos", "/pagos", "/asistencia", "/mi-cuenta"];
```

(única línea que cambia en el archivo; el resto de `middleware.ts` queda igual)

- [ ] **Step 4: Agregar el enlace en el Topbar**

Modifica `src/components/layout/Topbar.tsx` — agrega el enlace "Mi cuenta" entre el nombre del usuario y "Cerrar sesión":

```tsx
import Image from "next/image";
import { getConfiguracion } from "@/lib/config";
import { cerrarSesion } from "@/lib/auth/actions";
import type { PerfilActual } from "@/lib/perfiles/actual";

export async function Topbar({ perfil }: { perfil: PerfilActual | null }) {
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

      {perfil && (
        <div className="ml-auto flex items-center gap-3">
          <span className="text-sm text-zinc-600">{perfil.nombre_completo}</span>
          <a href="/mi-cuenta" className="text-sm text-zinc-600 hover:underline">
            Mi cuenta
          </a>
          <form action={cerrarSesion}>
            <button type="submit" className="text-sm text-zinc-600 hover:underline">
              Cerrar sesión
            </button>
          </form>
        </div>
      )}
    </header>
  );
}
```

- [ ] **Step 5: Verificar build**

Run: `npm run build`
Expected: build limpio, incluye la ruta nueva `/mi-cuenta` en el listado de rutas.

- [ ] **Step 6: Commit**

```bash
git add src/app/\(dashboard\)/mi-cuenta src/middleware.ts src/components/layout/Topbar.tsx
git commit -m "feat: agregar pantalla Mi cuenta para crear/cambiar contraseña"
```

---

### Task 4: Documentación

**Files:**
- Modify: `CONTEXTO_CLAUDE_CODE.md`

- [ ] **Step 1: Agregar entrada en "Estado actual"**

Agrega una entrada describiendo: login con contraseña como vía nueva (además del enlace mágico, que no cambió); pantalla `/mi-cuenta` donde cualquier rol crea/cambia su propia contraseña; que se usa el soporte nativo de Supabase Auth sin tabla nueva; que el enlace mágico sigue siendo la vía de invitación y de recuperación implícita (sin flujo de "olvidé mi contraseña" separado); y que el error de login con contraseña es un mensaje genérico deliberado (no distingue correo inexistente de contraseña incorrecta).

- [ ] **Step 2: Verificar build y suite completa**

Run: `npm run build && npm test`
Expected: build limpio, todos los tests pasan (incluye los 5 nuevos de `schema.test.ts`).

- [ ] **Step 3: Commit**

```bash
git add CONTEXTO_CLAUDE_CODE.md
git commit -m "docs: documentar login con contraseña"
```
