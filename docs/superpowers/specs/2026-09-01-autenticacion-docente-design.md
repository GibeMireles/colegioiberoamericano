# Diseño: Autenticación + rol Docente

## Contexto

El colegio necesita capturar calificaciones (parciales, ADAS/Examen,
producto, RECU — ver el Excel real que hoy se manda cada semestre a
cada maestro) directo en la plataforma. Eso solo tiene sentido si cada
maestro entra con su propia cuenta y ve únicamente sus materias — y
hoy el sistema no tiene ningún tipo de autenticación: todo está abierto
a quien tenga la URL.

Esto es más grande que "agregar Calificaciones", así que se dividió en
3 piezas que se construyen en orden:

1. **Autenticación + rol Docente** (este documento).
2. Materias y asignación (qué materia imparte cada maestro, a qué
   grupo, en qué ciclo).
3. Captura de calificaciones (el módulo del Excel: parciales,
   ADAS/Examen, producto, RECU, fechas de entrega).

## Alcance de esta pieza

- Login real vía Supabase Auth, sin registro público.
- Alta de maestros por el Super admin desde la propia app (botón
  "Invitar maestro").
- El rol `docente` en `perfiles`, con RLS mínimo activado solo en esa
  tabla.
- Protección de rutas (middleware) — **solo** para lo nuevo (`/usuarios`
  hoy; `/calificaciones` y afines cuando se construyan en la pieza 3).

## Explícitamente fuera de alcance

- Materias, asignación docente-grupo, calificaciones — piezas 2 y 3,
  specs aparte.
- Cerrar con RLS los módulos que ya existen (Alumnos, Pagos,
  Asistencia) — siguen exactamente como están hoy, sin login, sin RLS.
  Sigue pendiente como se documentó desde antes en
  `CONTEXTO_CLAUDE_CODE.md`; no se amplía en esta pieza para no crecer
  el trabajo más de lo necesario.
- Auto-registro de maestros — descartado explícitamente por el usuario.
- Recuperación de contraseña — no aplica, no hay contraseñas (login
  sin contraseña, ver abajo).

## Mecanismo de login

Supabase Auth con **enlace mágico** (passwordless, por correo) —
`supabase.auth.signInWithOtp({ email })`. El formulario de `/login` se
atiende con un Server Action (mismo patrón que el resto de la app —
no hace falta un cliente de Supabase en el navegador para esta
pieza). Sin formulario de contraseña, sin flujo de "olvidé mi
contraseña" que mantener. El registro público está deshabilitado a
nivel de proyecto de Supabase
(Auth → Settings → deshabilitar "Allow new users to sign up") — solo
puede entrar quien ya tiene una fila en `auth.users`, y esas filas solo
las crea el flujo de invitación de abajo.

## Alta de maestros

Pantalla nueva `/usuarios` (dentro del dashboard, visible solo a
`super_admin`): lista los perfiles existentes y tiene un formulario
"Invitar maestro" (correo + nombre completo).

El Server Action que atiende ese formulario:

1. Verifica que quien llama es realmente `super_admin` — resuelve su
   sesión con el cliente normal (anon key) y consulta su propio
   `perfiles.rol`. Rechaza si no lo es. Esto es la misma disciplina de
   "la UI oculta el botón, el Server Action la vuelve a verificar" que
   ya se usa en Alumnos.
2. Solo entonces usa un cliente **aparte**, construido con la
   `service role key` de Supabase, para llamar
   `supabase.auth.admin.inviteUserByEmail(correo)`. Esa llamada crea
   la fila en `auth.users` de inmediato y regresa su `id` — no hace
   falta esperar a que el maestro acepte la invitación.
3. Con ese `id`, inserta la fila en `perfiles`
   (`usuario_auth_id`, `nombre_completo`, `rol = 'docente'`).

La `service role key` vive únicamente en una variable de entorno del
servidor (`SUPABASE_SERVICE_ROLE_KEY`, **nunca** `NEXT_PUBLIC_*`) y
solo la lee este Server Action — en ningún otro lugar del código se
usa. Es la primera vez que este proyecto la necesita; hasta ahora todo
corría con la anon key.

## Modelo de datos

`perfiles` ya existe (`id`, `usuario_auth_id`, `nombre_completo`,
`rol`, `creado_en`) pero sin restricción sobre qué valores acepta
`rol`, y sin RLS. Este documento:

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

No se agrega política de `insert`/`update`/`delete` sobre `perfiles`:
la única escritura hoy es el alta de maestros, que corre con la
`service role key` y por lo tanto ignora RLS por diseño — no hace
falta una política adicional para eso.

Ninguna otra tabla del proyecto cambia ni activa RLS en esta pieza.

## Rutas y protección

- `src/middleware.ts` (nuevo): refresca la sesión en cada request y
  redirige a `/login` si no hay sesión, **solo** para las rutas
  protegidas (`/usuarios` por ahora — el `matcher` se amplía cuando se
  construyan las rutas de Calificaciones en la pieza 3). Todo lo demás
  (`/alumnos`, `/pagos`, `/asistencia`, `/`) sigue exactamente igual
  que hoy, sin pasar por el middleware.
- `/login` (nueva, fuera del grupo `(dashboard)` — sin sidebar/topbar):
  campo de correo, botón "Enviar enlace de acceso", pantalla de
  confirmación "revisa tu correo".
- `/auth/callback` (Route Handler nuevo): intercambia el código del
  enlace mágico por una sesión real — patrón estándar de Supabase +
  Next.js App Router.
- Botón "Cerrar sesión" en `Topbar` — solo visible si hay sesión activa
  (el Topbar hoy es puramente informativo/no async-consciente de
  sesión; pasa a consultarla).

## Acceso a datos

`src/lib/supabase/server.ts` (ya existe) cambia de usar
`@supabase/supabase-js` a `@supabase/ssr`'s `createServerClient` —
mismo shape de API (`.from()`, `.auth`, etc.), pero ahora lee/escribe
la sesión desde las cookies de Next.js. Es un cambio compatible: todo
el código existente que ya llama `createClient()` sigue funcionando
igual, ahora además consciente de sesión. Se agrega
`@supabase/ssr` como dependencia nueva.

`src/lib/supabase/admin.ts` (nuevo): un factory aparte,
`createAdminClient()`, que arma un cliente con la `service role key`.
Nombre y ubicación deliberadamente distintos de `server.ts` para que
sea obvio en cualquier revisión de código cuál es el cliente
privilegiado y que solo lo importe el Server Action de invitar.

## Manejo de errores

- Correo inválido en el formulario de login o de invitar → validación
  Zod, mismo patrón que Alumnos (cliente + servidor).
- Invitar a un correo que ya tiene cuenta → Supabase regresa un error
  claro; se muestra en español ("Ese correo ya tiene una cuenta").
- Quien no sea `super_admin` intenta llamar el Server Action de
  invitar directamente (sin pasar por la UI) → rechazado explícitamente
  en el paso 1 de arriba, antes de tocar el cliente privilegiado.
- Sesión expirada o inexistente en una ruta protegida → redirect a
  `/login` vía middleware, no un error visible.

## Testing

Sin lógica pura nueva que amerite Vitest más allá de un schema de
correo/nombre para el formulario de invitar (mismo patrón que
`src/lib/alumnos/schema.ts`).

**Verificación real:** invitar a un maestro de prueba (correo real
accesible), confirmar que llega el enlace, que al entrar aterriza en
el dashboard, que **no** puede ver `/usuarios` (intentar la URL
directo), cerrar sesión, confirmar que `/usuarios` redirige a
`/login`. Confirmar que un usuario sin sesión sigue pudiendo entrar
sin problema a `/alumnos`, `/pagos`, `/asistencia` (nada se rompió ahí).
