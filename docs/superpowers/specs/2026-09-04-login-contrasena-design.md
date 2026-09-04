# Diseño: Login con contraseña

## Contexto

Hoy el único mecanismo de acceso es el enlace mágico (`enviarEnlaceAcceso`
en `src/app/login/actions.ts`) — una decisión deliberada de la pieza
"Autenticación + rol Docente" ("sin contraseña, sin registro público").
Con la app ya en producción y usuarios reales entrando seguido (algunos
desde computadoras compartidas de la escuela), depender de revisar el
correo cada vez es lento. Esta pieza agrega login con contraseña como
una vía más rápida, sin quitar el enlace mágico.

## Alcance de esta pieza

- Login con correo + contraseña como forma principal de entrar, usando
  el soporte nativo de contraseña de Supabase Auth (el mismo sistema
  que ya usa el enlace mágico — no hay tabla ni lógica nueva de
  contraseñas, solo se conecta la UI a una capacidad que Supabase Auth
  ya tiene).
- Pantalla nueva `/mi-cuenta`, accesible a cualquier usuario con sesión
  activa (los 4 roles, sin restricción adicional), donde puede crear o
  cambiar su propia contraseña en cualquier momento.
- El enlace mágico se queda exactamente igual que hoy, en dos papeles:
  (a) la forma en que Super admin invita usuarios nuevos (sin cambios),
  y (b) el mecanismo de recuperación para quien no tiene contraseña
  todavía o la olvidó — entra con el enlace y desde `/mi-cuenta` crea
  o cambia su contraseña.

## Explícitamente fuera de alcance

- Un flujo separado de "olvidé mi contraseña" con correo de
  recuperación dedicado — el enlace mágico ya cumple esa función, no
  hace falta duplicarla.
- Reglas de complejidad de contraseña (mayúsculas, símbolos, etc.) —
  solo longitud mínima.
- Expiración periódica de contraseña o historial de contraseñas
  usadas.
- Que un admin pueda ver, establecer o resetear la contraseña de otro
  usuario — cada quien crea/cambia la suya únicamente desde su propia
  sesión ya autenticada. Un admin que necesite "resetear" el acceso de
  alguien sigue usando el enlace mágico (ya funciona así hoy).

## Modelo de datos

Ninguno nuevo. `auth.users` (tabla interna de Supabase Auth) ya tiene
una columna de contraseña hasheada que Supabase gestiona — hoy está
simplemente sin usar porque nunca se llamó a
`signInWithPassword`/`updateUser({ password })` desde esta app.

## Permisos

- `iniciarSesionConContrasena`: sin restricción de rol (es la pantalla
  de login misma, antes de tener sesión) — cualquier correo con una
  contraseña ya creada puede intentarlo.
- `actualizarContrasena`: requiere sesión activa (cualquiera de los 4
  roles) — se llama con el cliente de Supabase autenticado del
  usuario actual, nunca con la service role key, así que Supabase ya
  garantiza que solo se puede cambiar la contraseña de la sesión que
  hace la llamada, nunca la de otro usuario.
- `/mi-cuenta` como página: se agrega a `RUTAS_PROTEGIDAS` en
  `src/middleware.ts` (requiere sesión, sin chequeo de rol adicional).

## Pantallas

- `/login`: el formulario principal pasa a pedir **Correo** +
  **Contraseña**, botón "Iniciar sesión". Abajo, un enlace de texto
  "¿No tienes contraseña o la olvidaste? Entra con un enlace por
  correo" cambia a la vista de solo-correo de hoy — controlado por
  query param (`?modo=enlace`), mismo patrón que `?ver=todos` en
  Alumnos o `?editar=1` en Calificaciones/Asistencia, sin componente
  de cliente nuevo. El formulario de enlace mágico existente
  (`enviarEnlaceAcceso`) no cambia.
- `/mi-cuenta` (nueva, dentro del layout de dashboard): título "Mi
  cuenta", formulario con **Nueva contraseña** y **Confirmar
  contraseña**, botón "Guardar contraseña". Mensaje de éxito tras
  guardar ("✓ Contraseña actualizada.").
- `Topbar` (`src/components/layout/Topbar.tsx`): se agrega un enlace
  "Mi cuenta" junto al nombre del usuario y "Cerrar sesión".

## Manejo de errores

- Login con contraseña incorrecta o correo sin contraseña creada
  todavía: mensaje genérico ("Correo o contraseña incorrectos") sin
  distinguir el motivo — evita que alguien use el formulario de login
  para adivinar qué correos están dados de alta en el sistema (mismo
  criterio de no filtrar información que ya se sigue en el resto del
  proyecto, ej. `invitarUsuario` no revela si un correo ya existe más
  allá de un mensaje genérico).
- Confirmar contraseña que no coincide con la nueva: validado en Zod,
  mensaje de error junto al campo.
- Contraseña menor a 8 caracteres: validado en Zod.
- `actualizarContrasena` llamado sin sesión activa: no debería ser
  alcanzable en la práctica porque `/mi-cuenta` ya está protegida por
  el middleware, pero la Server Action revisa la sesión de todas
  formas antes de llamar a `updateUser` (defensa en profundidad, mismo
  criterio que el resto de las Server Actions del proyecto que
  re-verifican permisos en vez de confiar solo en el gate de la
  página).

## Testing

- Zod schema de contraseña (mínimo 8 caracteres, confirmación
  coincide) con test unitario, mismo patrón que el resto de los
  schemas del proyecto.
- El resto (las 2 Server Actions, las 2 pantallas) es I/O contra
  Supabase Auth, verificado en vivo contra el proyecto real — ya hay
  producción con login real funcionando, así que esta pieza sí se
  puede probar de punta a punta con una sesión real por primera vez
  desde que existe login (a diferencia de piezas anteriores que solo
  se pudieron verificar por SQL/código).
