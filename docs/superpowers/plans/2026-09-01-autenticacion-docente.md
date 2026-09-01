# Autenticación + rol Docente Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Login real con enlace mágico (sin registro público), alta de maestros por el Super admin desde un botón "Invitar maestro", y el rol `docente` en `perfiles` con RLS mínimo — primera de 3 sub-piezas para soportar la captura de calificaciones.

**Architecture:** `src/lib/supabase/server.ts` pasa a ser consciente de sesión (vía `@supabase/ssr` y cookies de Next.js); un middleware nuevo protege únicamente `/usuarios`; un cliente aparte con la `service role key` (`src/lib/supabase/admin.ts`) se usa solo dentro de la acción de invitar, que crea el usuario en `auth.users` y su fila en `perfiles` en el mismo paso. Todo lo demás (Alumnos, Pagos, Asistencia) queda exactamente igual.

**Tech Stack:** Next.js 16 App Router, Supabase Auth (`@supabase/ssr` nuevo, `@supabase/supabase-js` existente), Zod, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-01-autenticacion-docente-design.md`

## Global Constraints

- La `service role key` vive solo en `SUPABASE_SERVICE_ROLE_KEY` (nunca `NEXT_PUBLIC_*`) y solo la importa `src/lib/supabase/admin.ts`; ese cliente solo se usa dentro de la acción `invitarDocente`.
- El middleware protege **únicamente** `/usuarios` (matcher `["/usuarios/:path*"]`). Ninguna otra ruta existente se toca.
- RLS se activa **únicamente** en `perfiles`. Ninguna otra tabla cambia en esta pieza.
- Login sin contraseña (enlace mágico) — no se agrega ningún campo ni flujo de contraseña.
- Registro público deshabilitado — solo entra quien fue invitado.
- `createClient()` de `src/lib/supabase/server.ts` pasa a ser `async` (requerido por la API de cookies de Next 16). Todo call site existente debe actualizarse a `await createClient()` — lista exhaustiva en el Task 1.

---

## Prerequisites (las ejecuta el orquestador antes del Task 1, no un subagente)

1. `npm install @supabase/ssr`
2. Aplicar esta migración a la base real vía `apply_migration`:
   ```sql
   alter table perfiles
     add constraint perfiles_rol_check
     check (rol in ('super_admin', 'direccion', 'caja', 'docente'));

   alter table perfiles enable row level security;

   create policy "cada usuario lee su propio perfil"
     on perfiles for select
     using (usuario_auth_id = auth.uid());

   create policy "super_admin lee todos los perfiles"
     on perfiles for select
     using (
       exists (
         select 1 from perfiles p
         where p.usuario_auth_id = auth.uid() and p.rol = 'super_admin'
       )
     );
   ```
3. Pedir al usuario, por chat (no se hace de forma autónoma):
   - Pegar `SUPABASE_SERVICE_ROLE_KEY` en `.env.local` (el valor se obtiene del dashboard de Supabase → Project Settings → API — nunca se solicita ni se maneja por otro medio).
   - Agregar `NEXT_PUBLIC_SITE_URL=http://localhost:3000` a `.env.local` (se ajusta cuando haya URL de producción).
   - En el dashboard de Supabase, Authentication → Sign In / Providers: deshabilitar "Allow new users to sign up".
   - En el dashboard de Supabase, Authentication → URL Configuration: agregar `http://localhost:3000/auth/callback` a las Redirect URLs permitidas.

---

### Task 1: Cliente de Supabase consciente de sesión

**Files:**
- Modify: `src/lib/supabase/server.ts`
- Modify: `src/lib/ciclos/activo.ts`
- Modify: `src/lib/config.ts`
- Modify: `src/app/(dashboard)/alumnos/page.tsx`
- Modify: `src/app/(dashboard)/alumnos/actions.ts`
- Modify: `src/app/(dashboard)/alumnos/estructura-actions.ts`
- Modify: `src/app/(dashboard)/alumnos/nivel/[nivelId]/page.tsx`
- Modify: `src/app/(dashboard)/alumnos/grado/[gradoId]/page.tsx`
- Modify: `src/app/(dashboard)/alumnos/grupo/[grupoId]/page.tsx`
- Modify: `src/app/(dashboard)/alumnos/grupo/[grupoId]/[id]/editar/page.tsx`
- Modify: `src/app/(dashboard)/alumnos/grupo/[grupoId]/nuevo/page.tsx`

**Interfaces:**
- Produces: `export async function createClient(): Promise<SupabaseClient>` from `@/lib/supabase/server` (antes era síncrona). Todo el resto de la app importa esto y debe usar `await`.

- [ ] **Step 1: Reescribir `src/lib/supabase/server.ts`**

```ts
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export async function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Faltan las variables de entorno NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY"
    );
  }

  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Ocurre al llamarse desde un Server Component (no puede escribir
          // cookies); el middleware se encarga de refrescar la sesión.
        }
      },
    },
  });
}
```

- [ ] **Step 2: Actualizar cada call site existente**

En cada uno de estos 10 archivos, reemplazar **todas** las apariciones exactas de
`const supabase = createClient();` por `const supabase = await createClient();`
(la función que las contiene ya es `async` en todos los casos — no hace falta
tocar nada más):

- `src/lib/ciclos/activo.ts` — 1 aparición
- `src/lib/config.ts` — 1 aparición
- `src/app/(dashboard)/alumnos/page.tsx` — 1 aparición
- `src/app/(dashboard)/alumnos/actions.ts` — 3 apariciones
- `src/app/(dashboard)/alumnos/estructura-actions.ts` — 9 apariciones
- `src/app/(dashboard)/alumnos/nivel/[nivelId]/page.tsx` — 1 aparición
- `src/app/(dashboard)/alumnos/grado/[gradoId]/page.tsx` — 1 aparición
- `src/app/(dashboard)/alumnos/grupo/[grupoId]/page.tsx` — 2 apariciones
- `src/app/(dashboard)/alumnos/grupo/[grupoId]/[id]/editar/page.tsx` — 1 aparición
- `src/app/(dashboard)/alumnos/grupo/[grupoId]/nuevo/page.tsx` — 1 aparición

- [ ] **Step 3: Verificar que no quedó ningún call site sin actualizar**

Run: `npm run build`

Si algún `createClient()` no fue actualizado, TypeScript falla ahí mismo
(una `Promise<SupabaseClient>` sin `await` no tiene métodos como `.from`).
Expected: build limpio, sin errores de tipos.

- [ ] **Step 4: Correr la suite existente**

Run: `npm test`
Expected: todos los tests siguen pasando (ninguno de ellos importa
`createClient` directamente).

- [ ] **Step 5: Commit**

```bash
git add src/lib/supabase/server.ts src/lib/ciclos/activo.ts src/lib/config.ts src/app/\(dashboard\)/alumnos
git commit -m "feat: hacer createClient consciente de sesión con @supabase/ssr"
```

---

### Task 2: Cliente admin (service role) + middleware

**Files:**
- Create: `src/lib/supabase/admin.ts`
- Create: `src/middleware.ts`

**Interfaces:**
- Produces: `export function createAdminClient(): SupabaseClient` from `@/lib/supabase/admin` — cliente con `service role key`, solo lo importa `invitarDocente` (Task 6).

- [ ] **Step 1: Crear `src/lib/supabase/admin.ts`**

```ts
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Cliente con privilegios de administrador — solo lo debe importar la
// acción de invitar maestros (src/app/(dashboard)/usuarios/actions.ts).
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Faltan las variables de entorno NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY"
    );
  }

  return createSupabaseClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
```

- [ ] **Step 2: Crear `src/middleware.ts`**

```ts
import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

const RUTAS_PROTEGIDAS = ["/usuarios"];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const esRutaProtegida = RUTAS_PROTEGIDAS.some((ruta) =>
    request.nextUrl.pathname.startsWith(ruta)
  );

  if (esRutaProtegida && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/usuarios/:path*"],
};
```

- [ ] **Step 3: Verificar el build**

Run: `npm run build`
Expected: build limpio (ambos archivos son nuevos y aislados; nada más los
importa todavía).

- [ ] **Step 4: Verificación manual — la ruta protegida redirige sin sesión**

Con el servidor de desarrollo corriendo (`npm run dev`), hacer:

```bash
curl -i http://localhost:3000/usuarios
```

Expected: respuesta `307`/`308` con header `location: /login?next=%2Fusuarios`
(la página `/usuarios` todavía no existe — se crea en el Task 6 — pero el
middleware debe redirigir de todas formas antes de llegar a Next.js).

- [ ] **Step 5: Commit**

```bash
git add src/lib/supabase/admin.ts src/middleware.ts
git commit -m "feat: agregar cliente admin y middleware de protección de rutas"
```

---

### Task 3: Perfil del usuario actual

**Files:**
- Create: `src/lib/perfiles/actual.ts`

**Interfaces:**
- Consumes: `createClient()` de `@/lib/supabase/server` (Task 1).
- Produces: `export interface PerfilActual { id: string; usuario_auth_id: string; nombre_completo: string; rol: string }` y `export async function obtenerPerfilActual(): Promise<PerfilActual | null>` — usado por el Task 6 (guardia de `/usuarios` y verificación de `invitarDocente`) y el Task 7 (Topbar/Sidebar).

- [ ] **Step 1: Crear `src/lib/perfiles/actual.ts`**

```ts
import { createClient } from "@/lib/supabase/server";

export interface PerfilActual {
  id: string;
  usuario_auth_id: string;
  nombre_completo: string;
  rol: string;
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
    throw new Error(`No se pudo cargar el perfil actual: ${error.message}`);
  }

  return data;
}
```

Sin test unitario — es una consulta de I/O contra Supabase, igual que
`obtenerCicloActivoId` (`src/lib/ciclos/activo.ts`), que tampoco tiene uno.

- [ ] **Step 2: Verificar el build**

Run: `npm run build`
Expected: build limpio (archivo nuevo y aislado, nada más lo importa
todavía).

- [ ] **Step 3: Commit**

```bash
git add src/lib/perfiles/actual.ts
git commit -m "feat: agregar obtenerPerfilActual"
```

---

### Task 4: Schema de validación para invitar maestro

**Files:**
- Create: `src/lib/usuarios/schema.ts`
- Test: `src/lib/usuarios/schema.test.ts`

**Interfaces:**
- Produces: `export const invitarMaestroSchema: ZodObject<{ correo, nombre_completo }>` y `export type InvitarMaestroInput` — usado por el Task 6 (`InvitarMaestroForm.tsx` y `invitarDocente`).

- [ ] **Step 1: Escribir el test que debe fallar**

Crear `src/lib/usuarios/schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { invitarMaestroSchema } from "./schema";

describe("invitarMaestroSchema", () => {
  it("accepts a valid correo and nombre_completo", () => {
    const result = invitarMaestroSchema.safeParse({
      correo: "maestro@example.com",
      nombre_completo: "Juan Pérez",
    });

    expect(result.success).toBe(true);
  });

  it("rejects a missing correo", () => {
    const result = invitarMaestroSchema.safeParse({
      nombre_completo: "Juan Pérez",
    });

    expect(result.success).toBe(false);
  });

  it("rejects an invalid correo", () => {
    const result = invitarMaestroSchema.safeParse({
      correo: "no-es-un-correo",
      nombre_completo: "Juan Pérez",
    });

    expect(result.success).toBe(false);
  });

  it("rejects an empty nombre_completo", () => {
    const result = invitarMaestroSchema.safeParse({
      correo: "maestro@example.com",
      nombre_completo: "   ",
    });

    expect(result.success).toBe(false);
  });

  it("rejects a missing nombre_completo", () => {
    const result = invitarMaestroSchema.safeParse({
      correo: "maestro@example.com",
    });

    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Correr el test y confirmar que falla**

Run: `npx vitest run src/lib/usuarios/schema.test.ts`
Expected: FAIL — `Cannot find module './schema'`.

- [ ] **Step 3: Implementar `src/lib/usuarios/schema.ts`**

```ts
import { z } from "zod";

export const invitarMaestroSchema = z.object({
  correo: z
    .string()
    .trim()
    .min(1, "El correo es requerido")
    .email("El correo no es válido"),
  nombre_completo: z.string().trim().min(1, "El nombre es requerido"),
});

export type InvitarMaestroInput = z.infer<typeof invitarMaestroSchema>;
```

- [ ] **Step 4: Correr el test y confirmar que pasa**

Run: `npx vitest run src/lib/usuarios/schema.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/usuarios/schema.ts src/lib/usuarios/schema.test.ts
git commit -m "feat: agregar invitarMaestroSchema"
```

---

### Task 5: Flujo de login (enlace mágico)

**Files:**
- Create: `src/app/login/actions.ts`
- Create: `src/app/login/page.tsx`
- Create: `src/app/auth/callback/route.ts`

**Interfaces:**
- Consumes: `createClient()` de `@/lib/supabase/server` (Task 1).
- Produces: la ruta `/login` (fuera del grupo `(dashboard)`, sin sidebar/topbar) y `/auth/callback` (Route Handler).

- [ ] **Step 1: Crear `src/app/login/actions.ts`**

```ts
"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function enviarEnlaceAcceso(formData: FormData) {
  const correo = formData.get("correo");

  if (typeof correo !== "string" || correo.trim().length === 0) {
    redirect("/login?error=correo_invalido");
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithOtp({
    email: correo.trim(),
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
    },
  });

  if (error) {
    redirect("/login?error=envio_fallido");
  }

  redirect("/login?enviado=1");
}
```

- [ ] **Step 2: Crear `src/app/login/page.tsx`**

```tsx
import { enviarEnlaceAcceso } from "./actions";

const MENSAJES_ERROR: Record<string, string> = {
  correo_invalido: "Escribe un correo válido.",
  envio_fallido: "No se pudo enviar el enlace. Intenta de nuevo.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ enviado?: string; error?: string }>;
}) {
  const { enviado, error } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50">
      <div className="w-full max-w-sm rounded-lg border border-zinc-200 bg-white p-8">
        <h1 className="text-xl font-semibold text-zinc-900">Iniciar sesión</h1>

        {enviado ? (
          <p className="mt-4 text-sm text-zinc-600">
            Revisa tu correo: te enviamos un enlace para entrar.
          </p>
        ) : (
          <form action={enviarEnlaceAcceso} className="mt-4 space-y-4">
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
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Crear `src/app/auth/callback/route.ts`**

```ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=envio_fallido`);
}
```

- [ ] **Step 4: Verificar el build**

Run: `npm run build`
Expected: build limpio.

- [ ] **Step 5: Verificación manual — el formulario envía el enlace**

Con `npm run dev` corriendo, entrar a `http://localhost:3000/login`, escribir
un correo real y accesible, enviar. Confirmar que la página cambia a
"Revisa tu correo..." y que el correo efectivamente llega (no hace falta
hacer clic todavía — el callback se prueba junto con el Task 6/7, cuando ya
hay algo protegido a donde aterrizar).

- [ ] **Step 6: Commit**

```bash
git add src/app/login src/app/auth
git commit -m "feat: agregar login con enlace mágico"
```

---

### Task 6: Pantalla de Usuarios + invitar maestro

**Files:**
- Create: `src/components/usuarios/InvitarMaestroForm.tsx`
- Create: `src/app/(dashboard)/usuarios/actions.ts`
- Create: `src/app/(dashboard)/usuarios/page.tsx`

**Interfaces:**
- Consumes: `obtenerPerfilActual()` (Task 3), `invitarMaestroSchema` (Task 4), `createAdminClient()` (Task 2), `createClient()` (Task 1).
- Produces: la ruta `/usuarios`, visible y funcional solo para `super_admin`.

- [ ] **Step 1: Crear `src/components/usuarios/InvitarMaestroForm.tsx`**

```tsx
"use client";

import { useState, type FormEvent } from "react";
import { invitarMaestroSchema } from "@/lib/usuarios/schema";

type Errores = { correo?: string; nombre_completo?: string };

export function InvitarMaestroForm({
  action,
}: {
  action: (formData: FormData) => void;
}) {
  const [errores, setErrores] = useState<Errores>({});

  function manejarEnvio(evento: FormEvent<HTMLFormElement>) {
    const formData = new FormData(evento.currentTarget);
    const resultado = invitarMaestroSchema.safeParse({
      correo: formData.get("correo") ?? undefined,
      nombre_completo: formData.get("nombre_completo") ?? undefined,
    });

    if (!resultado.success) {
      evento.preventDefault();
      const nuevosErrores: Errores = {};
      for (const issue of resultado.error.issues) {
        const campo = issue.path[0] as keyof Errores;
        nuevosErrores[campo] = issue.message;
      }
      setErrores(nuevosErrores);
      return;
    }

    setErrores({});
  }

  return (
    <form
      action={action}
      onSubmit={manejarEnvio}
      noValidate
      className="flex flex-wrap items-end gap-3"
    >
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
          className="mt-1 block w-56 rounded-md border border-zinc-300 px-3 py-2"
        />
        {errores.nombre_completo && (
          <p className="mt-1 text-sm text-red-600">{errores.nombre_completo}</p>
        )}
      </div>
      <div>
        <label htmlFor="correo" className="block text-sm font-medium text-zinc-700">
          Correo
        </label>
        <input
          id="correo"
          name="correo"
          type="email"
          className="mt-1 block w-64 rounded-md border border-zinc-300 px-3 py-2"
        />
        {errores.correo && (
          <p className="mt-1 text-sm text-red-600">{errores.correo}</p>
        )}
      </div>
      <button
        type="submit"
        className="rounded-md bg-primario px-4 py-2 text-sm font-medium text-white hover:opacity-90"
      >
        Invitar maestro
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Crear `src/app/(dashboard)/usuarios/actions.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { obtenerPerfilActual } from "@/lib/perfiles/actual";
import { invitarMaestroSchema } from "@/lib/usuarios/schema";

export async function invitarDocente(formData: FormData) {
  const perfilActual = await obtenerPerfilActual();

  if (!perfilActual || perfilActual.rol !== "super_admin") {
    throw new Error("No tienes permiso para invitar maestros.");
  }

  const { correo, nombre_completo } = invitarMaestroSchema.parse({
    correo: formData.get("correo") ?? undefined,
    nombre_completo: formData.get("nombre_completo") ?? undefined,
  });

  const admin = createAdminClient();

  const { data, error: errorInvitacion } =
    await admin.auth.admin.inviteUserByEmail(correo);

  if (errorInvitacion || !data.user) {
    throw new Error(
      `No se pudo invitar al maestro: ${errorInvitacion?.message ?? "correo ya registrado"}`
    );
  }

  const { error: errorPerfil } = await admin.from("perfiles").insert({
    usuario_auth_id: data.user.id,
    nombre_completo,
    rol: "docente",
  });

  if (errorPerfil) {
    throw new Error(`No se pudo crear el perfil del maestro: ${errorPerfil.message}`);
  }

  revalidatePath("/usuarios");
}
```

Nota: el `insert` en `perfiles` usa el cliente `admin` (no el cliente normal)
a propósito — no existe política RLS de `insert` sobre `perfiles` (por
diseño, ver la spec), así que con el cliente normal la escritura sería
rechazada.

- [ ] **Step 3: Crear `src/app/(dashboard)/usuarios/page.tsx`**

```tsx
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { obtenerPerfilActual } from "@/lib/perfiles/actual";
import { InvitarMaestroForm } from "@/components/usuarios/InvitarMaestroForm";
import { invitarDocente } from "./actions";

export const dynamic = "force-dynamic";

const ETIQUETAS_ROL: Record<string, string> = {
  super_admin: "Super admin",
  direccion: "Dirección",
  caja: "Caja",
  docente: "Docente",
};

interface PerfilListado {
  id: string;
  nombre_completo: string;
  rol: string;
  creado_en: string;
}

async function obtenerPerfiles(): Promise<PerfilListado[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("perfiles")
    .select("id, nombre_completo, rol, creado_en")
    .order("creado_en", { ascending: false });

  if (error) {
    throw new Error(`No se pudo cargar la lista de usuarios: ${error.message}`);
  }

  return data ?? [];
}

export default async function UsuariosPage() {
  const perfilActual = await obtenerPerfilActual();

  if (!perfilActual || perfilActual.rol !== "super_admin") {
    notFound();
  }

  const perfiles = await obtenerPerfiles();

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900">Usuarios</h1>

      <div className="mt-6">
        <InvitarMaestroForm action={invitarDocente} />
      </div>

      <table className="mt-8 w-full text-left text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-zinc-500">
            <th className="py-2 font-medium">Nombre</th>
            <th className="py-2 font-medium">Rol</th>
          </tr>
        </thead>
        <tbody>
          {perfiles.map((perfil) => (
            <tr key={perfil.id} className="border-b border-zinc-100">
              <td className="py-2 text-zinc-900">{perfil.nombre_completo}</td>
              <td className="py-2 text-zinc-600">
                {ETIQUETAS_ROL[perfil.rol] ?? perfil.rol}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: Verificar el build**

Run: `npm run build`
Expected: build limpio.

- [ ] **Step 5: Commit**

```bash
git add src/components/usuarios src/app/\(dashboard\)/usuarios
git commit -m "feat: agregar pantalla de Usuarios e invitar maestro"
```

---

### Task 7: Navegación por rol + cerrar sesión

**Files:**
- Modify: `src/lib/nav.ts`
- Modify: `src/lib/nav.test.ts`
- Modify: `src/components/layout/Sidebar.tsx`
- Modify: `src/components/layout/AppShell.tsx`
- Modify: `src/components/layout/Topbar.tsx`
- Create: `src/lib/auth/actions.ts`

**Interfaces:**
- Consumes: `obtenerPerfilActual()` y `PerfilActual` (Task 3).
- Produces: `export function cerrarSesion(): Promise<void>` en `@/lib/auth/actions`, usado por `Topbar`.

- [ ] **Step 1: Actualizar el test de nav para que falle**

Reemplazar el contenido de `src/lib/nav.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isNavItemActive, NAV_ITEMS, navItemsVisibles } from "./nav";

describe("NAV_ITEMS", () => {
  it("has the 4 modules in order, Usuarios solo para super_admin", () => {
    expect(NAV_ITEMS.map((item) => item.href)).toEqual([
      "/alumnos",
      "/pagos",
      "/asistencia",
      "/usuarios",
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

  it("excludes a restricted item when rol does not match", () => {
    const hrefs = navItemsVisibles("docente").map((item) => item.href);
    expect(hrefs).not.toContain("/usuarios");
  });

  it("includes a restricted item when rol matches", () => {
    const hrefs = navItemsVisibles("super_admin").map((item) => item.href);
    expect(hrefs).toContain("/usuarios");
  });
});
```

- [ ] **Step 2: Correr el test y confirmar que falla**

Run: `npx vitest run src/lib/nav.test.ts`
Expected: FAIL — `navItemsVisibles` no existe todavía y `NAV_ITEMS` no
incluye `/usuarios`.

- [ ] **Step 3: Actualizar `src/lib/nav.ts`**

```ts
export interface NavItem {
  label: string;
  href: string;
  rolesPermitidos?: string[];
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Alumnos y grados", href: "/alumnos" },
  { label: "Pagos", href: "/pagos" },
  { label: "Listas / Asistencia", href: "/asistencia" },
  { label: "Usuarios", href: "/usuarios", rolesPermitidos: ["super_admin"] },
];

export function isNavItemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function navItemsVisibles(rol: string | null): NavItem[] {
  return NAV_ITEMS.filter(
    (item) =>
      !item.rolesPermitidos || (rol !== null && item.rolesPermitidos.includes(rol))
  );
}
```

- [ ] **Step 4: Correr el test y confirmar que pasa**

Run: `npx vitest run src/lib/nav.test.ts`
Expected: PASS.

- [ ] **Step 5: Actualizar `src/components/layout/Sidebar.tsx`**

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isNavItemActive, navItemsVisibles } from "@/lib/nav";

export function Sidebar({ rol }: { rol: string | null }) {
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

- [ ] **Step 6: Crear `src/lib/auth/actions.ts`**

```ts
"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function cerrarSesion() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
```

- [ ] **Step 7: Actualizar `src/components/layout/Topbar.tsx`**

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

- [ ] **Step 8: Actualizar `src/components/layout/AppShell.tsx`**

```tsx
import type { ReactNode } from "react";
import { obtenerPerfilActual } from "@/lib/perfiles/actual";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

export async function AppShell({ children }: { children: ReactNode }) {
  const perfil = await obtenerPerfilActual();

  return (
    <div className="flex min-h-screen flex-col">
      <Topbar perfil={perfil} />
      <div className="flex flex-1">
        <Sidebar rol={perfil?.rol ?? null} />
        <main className="flex-1 p-8">{children}</main>
      </div>
    </div>
  );
}
```

- [ ] **Step 9: Verificar build y suite completa**

Run: `npm run build && npm test`
Expected: build limpio, todos los tests pasan.

- [ ] **Step 10: Verificación manual — flujo completo**

Con `npm run dev`:
1. Sin sesión: entrar a `/alumnos` — debe funcionar exactamente igual que
   hoy, sin pedir login (confirma que el alcance no se filtró a rutas
   existentes).
2. Sin sesión: entrar a `/usuarios` — debe redirigir a `/login`.
3. En `/login`, enviar el enlace al correo del super_admin (el mismo con el
   que se hace el bootstrap del Task 8). Entrar al correo, hacer clic.
   Debe aterrizar en el dashboard, ahora con el nombre y "Cerrar sesión"
   visibles en el Topbar, y "Usuarios" visible en el Sidebar.
4. Entrar a `/usuarios`, invitar a un maestro de prueba con un correo real
   accesible. Confirmar que aparece en la tabla con rol "Docente" y que
   llega su correo de invitación.
5. Cerrar sesión. Confirmar que `/usuarios` vuelve a redirigir a `/login`
   y que `/alumnos` sigue abierto sin sesión.

- [ ] **Step 11: Commit**

```bash
git add src/lib/nav.ts src/lib/nav.test.ts src/lib/auth/actions.ts src/components/layout
git commit -m "feat: navegación por rol y cerrar sesión"
```

---

### Task 8: Bootstrap del primer super_admin + documentación

**Files:**
- Modify: `database/schema.sql`
- Modify: `CONTEXTO_CLAUDE_CODE.md`

Este task lo ejecuta el orquestador directamente (no un subagente): requiere
coordinarse en vivo con el usuario real (Gilberto) para que su cuenta exista
en `auth.users` antes de poder asignarle `rol = 'super_admin'` — ninguna
cuenta tiene ese rol todavía, así que sin este paso nadie podría usar
`/usuarios` para invitar al primer maestro.

- [ ] **Step 1: Bootstrap del super_admin**

Pedir a Gilberto que entre a `/login` y pida su propio enlace de acceso con
su correo real. Una vez que haya iniciado sesión por primera vez (su fila ya
existe en `auth.users`), correr vía `execute_sql`:

```sql
insert into perfiles (usuario_auth_id, nombre_completo, rol)
select id, 'Gilberto Mireles', 'super_admin'
from auth.users
where email = '<correo real que Gilberto usó>';
```

Confirmar con una consulta de `select` que la fila quedó con
`rol = 'super_admin'`.

- [ ] **Step 2: Actualizar `database/schema.sql`**

Cambiar el comentario de la columna `rol` en la tabla `perfiles`:

```sql
  rol text not null,              -- super_admin | direccion | caja | docente
```

Y agregar, después del bloque de índices al final del archivo:

```sql
-- Autenticación + rol Docente
alter table perfiles
  add constraint perfiles_rol_check
  check (rol in ('super_admin', 'direccion', 'caja', 'docente'));

alter table perfiles enable row level security;

create policy "cada usuario lee su propio perfil"
  on perfiles for select
  using (usuario_auth_id = auth.uid());

create policy "super_admin lee todos los perfiles"
  on perfiles for select
  using (
    exists (
      select 1 from perfiles p
      where p.usuario_auth_id = auth.uid() and p.rol = 'super_admin'
    )
  );
```

- [ ] **Step 3: Actualizar `CONTEXTO_CLAUDE_CODE.md`**

Agregar una entrada describiendo la funcionalidad nueva (login con enlace
mágico, rol Docente, invitar maestros desde `/usuarios`, RLS solo en
`perfiles`, Alumnos/Pagos/Asistencia siguen sin login) y actualizar
"Próximos pasos pendientes" para reflejar que las siguientes piezas son
Materias/asignación y Captura de calificaciones.

- [ ] **Step 4: Commit**

```bash
git add database/schema.sql CONTEXTO_CLAUDE_CODE.md
git commit -m "docs: documentar autenticación + rol Docente en el blueprint y el contexto"
```
