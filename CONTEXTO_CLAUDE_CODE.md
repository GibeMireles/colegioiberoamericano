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
- Esquema de base de datos: `database/schema.sql` corrido en el
  proyecto real de Supabase (`elhgncefzpttarpaxbzm`). Sembrada una fila
  en `ciclos_escolares` ('2026-2027'), `grados` ('1° Preparatoria') y
  `grupos` ('1°A') para el piloto — ver IDs en el plan de
  implementación del módulo Alumnos.
- Identidad visual: colores institucionales de Ibero extraídos del
  logo real (`assets/logo ibero.jpg`) — rojo `#E3312D` y amarillo/dorado
  `#FEDC01`. Viven en una fila real de la tabla `configuracion` en
  Supabase (ya sembrada), no hardcodeados en el frontend — para que una
  réplica en otra escuela solo cambie esa fila, sin tocar código.
  `src/lib/config.ts` ya consulta esa tabla real (`getConfiguracion()`
  dejó de ser un mock). El logo se sirve desde `public/logo-ibero.jpg`
  por ahora; en producción vendrá de `logo_url` en Supabase Storage.
- Repo de Next.js scaffoldeado (App Router, TypeScript, Tailwind).
  Layout base (navegación + tema de marca) terminado — ver
  `docs/superpowers/plans/2026-08-28-single-tenant-base-layout.md`. Los
  3 módulos del MVP son placeholders (`/alumnos`, `/pagos`,
  `/asistencia`).
- Proyecto de Supabase real: creado por el usuario ("Plataforma
  Educativa", cuenta separada de sus otros clientes; `project_ref =
  elhgncefzpttarpaxbzm`) y conectado al repo de GitHub. El servidor
  MCP quedó registrado en `.mcp.json` (scope de proyecto), pero ese
  archivo solo se lee si Claude Code arranca con esta carpeta como
  working directory — como las sesiones normalmente arrancan en
  `C:\Users\gilberto.mireles`, el servidor nunca cargaba, sin importar
  cuántas veces se reiniciara la sesión.
  Solución aplicada: se registró un servidor MCP equivalente a nivel
  de **usuario** (`claude mcp add --transport http supabase-ibero
  "https://mcp.supabase.com/mcp?project_ref=elhgncefzpttarpaxbzm&features=docs%2Caccount%2Cdatabase%2Cdebugging%2Cdevelopment%2Cfunctions%2Cbranching"
  --scope user`), para que esté disponible sin depender del directorio
  de trabajo. Ya se autenticó (`claude mcp login supabase-ibero` →
  `✔ Connected`) contra la cuenta separada correcta. **Resuelto:** tras
  un reinicio de sesión las herramientas `mcp__supabase-ibero__*`
  cargan correctamente y apuntan al proyecto correcto.
- Módulo Alumnos y grados: spec y plan de implementación escritos —
  ver `docs/superpowers/specs/2026-08-31-alumnos-piloto-1ro-prepa-design.md`
  y `docs/superpowers/plans/2026-08-31-alumnos-piloto-1ro-prepa.md`.
  **Implementado y verificado end-to-end** (alta, edición, listado,
  baja/reactivación lógica, todo probado a mano en el navegador contra
  el proyecto real de Supabase — alumno creado, inscrito en el grupo
  piloto, editado y dado de baja/reactivado correctamente; validación
  de correo del tutor probada tanto en cliente como en servidor).
  El trabajo ya está **mergeado a `main` y pusheado** (el worktree
  `worktree-alumnos-piloto-1ro-prepa` se eliminó). La revisión final de
  todo el branch (whole-branch code review) sí se corrió, y encontró
  problemas reales: un bug que impedía limpiar campos opcionales al
  editar, falta de filtro por ciclo escolar en el listado, cacheo
  estático en build de datos de alumnos, y ausencia de error boundary.
  Todos se corrigieron en el commit de seguimiento correspondiente.
- **Navegación y gestión por Nivel/Grado/Grupo** — ver
  `docs/superpowers/specs/2026-08-31-alumnos-nivel-grado-grupo-design.md`
  y `docs/superpowers/plans/2026-08-31-alumnos-nivel-grado-grupo.md`.
  El módulo de Alumnos dejó de estar fijo a un solo grupo (piloto): ahora
  `/alumnos` muestra tarjetas de nivel (Villa, Primaria, Secundaria,
  Preparatoria) → grado → grupo → listado, con salto automático cuando
  un nivel/grado tiene un solo hijo. Niveles pasó de ser una lista fija
  en código a una tabla real (`niveles`), y el personal puede crear,
  renombrar y eliminar (solo si está vacío) niveles/grados/grupos
  directo desde las tarjetas — sin pantalla de administración aparte,
  sin depender de SQL. Sembrados los 13 grados/grupos reales del
  colegio (Villa 1-3, 1°-6° Primaria, 1°-3° Secundaria, cada uno con
  Grupo A) más el "1° Preparatoria" del piloto.
  **Implementado y verificado end-to-end**, incluido un bug real
  encontrado en producción durante la verificación manual (una vez que
  un nivel/grado tiene exactamente 1 hijo, la pantalla de esa tarjeta
  se volvía inalcanzable — no se podía renombrar/eliminar "1°
  Preparatoria" ni su único grupo) y ya corregido: los enlaces "volver"
  agregan `?ver=todos`, que evita el salto automático solo al navegar
  hacia atrás, no al entrar por primera vez.
- Los nombres de alumno se separan en `nombres` / `apellido_paterno` /
  `apellido_materno` (apellido materno opcional) — formato oficial tipo
  SEP, se ordenan y muestran como "Apellido paterno Apellido materno,
  Nombres". Registro y edición piden los 3 campos por separado.
- **Autenticación + rol Docente** — primera de 3 sub-piezas para poder
  capturar calificaciones (las otras dos: Materias/asignación, y la
  captura en sí, calcada del Excel real que la escuela usa cada
  semestre — ver
  `docs/superpowers/specs/2026-09-01-autenticacion-docente-design.md`
  y `docs/superpowers/plans/2026-09-01-autenticacion-docente.md`).
  Login real con enlace mágico (sin contraseña, sin registro público);
  alta de maestros exclusivamente por el Super admin desde `/usuarios`
  (botón "Invitar maestro" → `supabase.auth.admin.inviteUserByEmail` +
  fila en `perfiles` con `rol = 'docente'`, todo en una sola Server
  Action que es la única parte del código que usa la `service role
  key`). RLS activado **solo** en `perfiles` (las demás tablas siguen
  como estaban — sigue pendiente, ver abajo). Alumnos/Pagos/Asistencia
  siguen sin login, sin cambios — el middleware solo protege
  `/usuarios` (y protegerá las rutas de Calificaciones cuando se
  construyan). **Implementado y verificado end-to-end** con el primer
  login real.
  Bug real encontrado en el primer login (y corregido antes de dar por
  buena la pieza): la política RLS "super_admin lee todos los
  perfiles" consultaba `perfiles` dentro de su propio `using()`, lo
  que en Postgres/Supabase causa "infinite recursion detected in
  policy for relation perfiles" — una política sobre una tabla no
  puede auto-referenciar esa misma tabla sin pasar por una función
  `security definer` (que sí evita volver a disparar RLS). Se corrigió
  con `public.es_super_admin()`; si en el futuro se agregan más
  políticas de "rol X puede ver todo", usar el mismo patrón.
- **Calificaciones, pieza 2: Materias + asignación docente-materia-grupo**
  — ver `docs/superpowers/specs/2026-09-01-materias-asignacion-design.md`
  y `docs/superpowers/plans/2026-09-01-materias-asignacion.md`. Agrega
  3 tablas nuevas (`materias`, `asignaciones`, `materia_alumnos`): cada
  materia pertenece a un grado específico (no se repite entre grados),
  exactamente un maestro por materia+grupo+ciclo, y la lista de alumnos
  de una materia por defecto es el grupo completo inscrito, con
  posibilidad de que Dirección la sobreescriba a mano (caso de uso:
  inglés con niveles, donde cada nivel es una materia distinta con su
  propio subconjunto de alumnos del mismo grupo). Pantalla de
  administración bajo `/materias`, visible solo a `super_admin` y
  `direccion`, con la misma navegación por tarjetas Nivel → Grado que ya
  existe en Alumnos pero de solo lectura. También endurece
  `PerfilActual.rol` de `string` suelto a la unión de los 4 valores
  reales (`src/lib/roles.ts`), quedó pendiente de la pieza de Auth. Sin
  RLS nuevo en las 3 tablas nuevas (mismo criterio que el resto del
  proyecto hoy — ver pendiente #2 abajo).
  **Implementado y verificado end-to-end** contra el proyecto real de
  Supabase, incluida verificación en vivo de que `obtenerAlumnosDeMateria`
  (la función que la pieza 3, Calificaciones, va a importar directo) aplica
  correctamente la regla "el override reemplaza, no se suma a, la lista del
  grupo" en ambos sentidos: sin override devuelve el grupo completo, con
  override devuelve exactamente esa lista (los alumnos excluidos no
  aparecen).
  Bug real encontrado durante la verificación en vivo en el navegador (y
  corregido antes de dar por buena la pieza): `page.tsx` pasaba una
  closure normal (`(id) => eliminarAsignacion(id, gradoId)`) a
  `AsignacionesMateria`, un componente `"use client"` — Next.js prohíbe
  pasar funciones que no sean Server Actions genuinas a través de esa
  frontera cliente/servidor. El build no lo detectó (la ruta es
  `force-dynamic`; la violación solo se dispara al renderizar de verdad),
  solo lo detectó la verificación manual en el navegador. Se corrigió
  pasando la referencia de la Server Action `eliminarAsignacion` sin
  envolver y haciendo `.bind()` de `id` + `gradoId` del lado del cliente —
  el mismo patrón que ya se usaba correctamente para `accionCrear`.

## Alcance del MVP — 3 módulos

1. Alumnos y grados
2. Pagos / colegiaturas
3. Listas / asistencia

## Perfiles de usuario del MVP

- Super admin (administra la configuración y usuarios de esta instancia)
- Administrativo / Dirección
- Caja / Finanzas
- Docente (login propio, ver arriba — por ahora solo puede entrar; sin
  pantallas propias todavía, esas llegan con Materias/Calificaciones)

## Enfoque de trabajo

Vamos avanzando de forma iterativa: validar estructura → mostrar
avance → ajustar → agregar la siguiente pieza. No sobre-construir de
golpe. Priorizar que el MVP funcione bien en Iberoamericano antes de
replicar a otras escuelas.

## Próximos pasos pendientes

1. **Calificaciones, pieza 3: captura de calificaciones** — última de
   las 3 sub-piezas (ver "Estado actual" arriba), calcada del Excel real
   que la escuela usa cada semestre. Puede apoyarse directo en
   `obtenerAlumnosDeMateria` (`src/lib/materias/roster.ts`), ya
   implementada y verificada en vivo, para resolver la lista de alumnos
   a capturar por materia+ciclo sin reimplementar la lógica de
   override.
2. Configurar RLS por rol en el resto de las tablas (`perfiles.rol`) —
   hoy solo `perfiles` tiene RLS; las demás tablas (incluidas las 3
   nuevas de Materias: `materias`, `asignaciones`, `materia_alumnos`)
   siguen sin RLS (última confirmación por `get_advisors` fue antes de
   agregar esas 3), expuestas por completo a la anon
   key — esperado mientras Alumnos/Pagos/Asistencia no piden login
   (decisión explícita de la pieza de Auth), pero es lo primero que hay
   que cerrar antes de exponer esto fuera de la red del colegio.
   Habilitar RLS obliga además a revisar `obtenerAlumnosDelGrupo` en
   `src/app/(dashboard)/alumnos/grupo/[grupoId]/page.tsx`, porque su
   `.flatMap((inscripcion) => inscripcion.alumnos)` asume que la fila
   embebida `alumnos` nunca es `null` — si RLS llega a ocultar una
   fila, esto truena al renderizar en vez de degradarse con
   gracia. Al escribir cualquier política nueva de "rol X ve todo",
   usar el patrón `security definer` de `public.es_super_admin()` (ver
   arriba) — una política no puede consultar su propia tabla
   directamente sin causar recursión infinita.
3. Extender el patrón de Alumnos a Pagos/colegiaturas y Listas/asistencia
   cuando el módulo de Alumnos quede validado con más uso real. El
   punto de patrón que estaba pendiente de decidir ya quedó resuelto:
   las Server Actions de escritura reciben el id del padre relevante
   como parámetro explícito (`crearAlumno(grupoId, ...)`,
   `crearGrupo(gradoId, ...)`, etc.) — Pagos/Asistencia deberían seguir
   el mismo patrón (ej. Server Actions de pagos recibiendo
   `alumnoId`/`cargoId` explícito, no leyendo de variables de entorno
   ni asumiendo un contexto implícito).

## Cómo retomar esta sesión

Usa el comando `/ibero` en cualquier sesión de Claude Code — lee este
archivo, los últimos commits, y el estado de specs/planes pendientes
automáticamente, sin necesidad de pegar enlaces o contexto a mano.
