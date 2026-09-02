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
- **Calificaciones, pieza 3: Captura de calificaciones** — última de las 3
  sub-piezas, ver `docs/superpowers/specs/2026-09-02-captura-calificaciones-design.md`
  y `docs/superpowers/plans/2026-09-02-captura-calificaciones.md`. Pantalla
  calcada del Excel real que usa la escuela cada semestre: `/calificaciones`
  lista las asignaciones del docente en sesión (o todas, si es
  `super_admin`/`direccion`); `/calificaciones/[asignacionId]` es la
  captura propiamente dicha — Parcial 1 (ADAS + Examen), Parcial 2 (ADAS +
  Examen) y Producto (Proyecto + Examen), cada uno como subtotal de dos
  campos, más el Total como suma de los 3 subtotales (`calcularSubtotal` /
  `calcularTotal` en `src/lib/calificaciones/calculos.ts`, con tests
  unitarios). Cada asignación tiene su propia ponderación
  (`parcial1_max`, `parcial2_max`, `producto_max` en `asignaciones`) que el
  maestro dueño define la primera vez que abre su pantalla de captura
  (`guardarPonderacion`) — hasta entonces la captura de calificaciones
  queda bloqueada. La validación es solo a nivel de subtotal contra su
  máximo (ej. Parcial 1 no puede superar `parcial1_max`), nunca por
  campo individual (ADAS y Examen se reparten los puntos como decida el
  maestro). Acceso restringido al docente dueño de la asignación o a
  `super_admin`/`direccion` (`requerirAccesoAsignacion`,
  `src/lib/asignaciones/requerirAccesoAsignacion.ts`), y la lista de
  alumnos a capturar se re-deriva siempre en el servidor a partir de
  `asignacionId` (nunca se confía en los `alumnoId` que vengan en el
  `FormData`), así que no hay forma de inyectar una calificación para un
  alumno fuera del roster real. `eliminarAsignacion` (en
  `materias/actions.ts`) ahora bloquea el borrado si la asignación ya
  tiene filas en `calificaciones` — evita perder capturas por accidente
  al reorganizar materias.
  Esta pieza resuelve un pendiente de diseño real que había quedado
  parqueado explícitamente en la pieza 2 (Materias + asignación): la
  vieja `obtenerAlumnosDeMateria` mezclaba el roster de TODOS los grupos
  de una materia cuando esa materia tenía más de un grupo asignado (una
  materia no está atada a un solo grupo, `asignaciones` la vincula
  materia+grupo+ciclo N a N). La nueva `obtenerAlumnosDeAsignacion`
  (`src/lib/calificaciones/roster.ts`) recibe un `asignacionId` concreto
  en vez de un `materiaId` suelto, así que queda acotada a un solo grupo
  desde el inicio; y cuando existe lista propia (override), devuelve la
  **intersección** entre esa lista y el roster de ese grupo específico —
  no la lista propia cruda, que podía abarcar alumnos de otros grupos de
  la misma materia. Verificado con trazas SQL directas contra el
  proyecto real para ambos casos (con y sin override, materia con 1 y
  con 2+ grupos).
  **Limitación importante de esta verificación:** a diferencia de las
  piezas anteriores, esta NO se pudo probar a mano en el navegador. Este
  entorno sandboxed no tiene salida de red hacia Supabase desde un
  `fetch` normal ejecutado por `npm run dev` (solo la herramienta MCP de
  Supabase tiene salida funcional), así que `/login` responde 500
  ("fetch failed") en cuanto se intenta cargar la app en un navegador
  aquí. Las 8 tareas de esta pieza se verificaron en cambio con: (a)
  tests unitarios para los dos módulos que sí son testeables sin DB
  (`calculos.ts`, `schema.ts`), (b) trazas SQL directas contra la base
  de datos real de Supabase para cada función de I/O y cada Server
  Action — resolución de roster, el bloqueo de ponderación sin definir,
  la semántica de upsert-on-conflict, el guard de borrado bloqueado por
  calificaciones — con evidencia concreta de antes/después en cada
  revisión de tarea, y (c) trazado a nivel de código de la validación de
  la ruta de escritura (rechazo subtotal-vs-máximo, re-derivación del
  roster que anula cualquier intento de manipular `alumnoId`), tanto por
  quien implementó cada tarea como por su revisor independiente. Nada del
  DOM real (cómo se ve el formulario, el texto de error en pantalla, el
  comportamiento de `required` de HTML5) se observó visualmente en
  ningún momento. Queda como pendiente explícito: alguien tiene que
  entrar de verdad y clickear esta pantalla completa antes de confiar en
  ella para capturar calificaciones de clases reales — la lógica de
  datos y de validación está verificada a fondo, pero no lo visual.
  Con esta pieza, **las 3 sub-piezas de Calificaciones quedan completas**
  (Autenticación + rol Docente, Materias + asignación, Captura de
  calificaciones).

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

**Hito: con Captura de calificaciones terminada, las 3 sub-piezas de
Calificaciones (Autenticación + rol Docente, Materias + asignación,
Captura de calificaciones) quedan completas.** Ya no queda ninguna
sub-pieza de Calificaciones pendiente de diseñar ni implementar.

0. **Verificar Captura de calificaciones a mano en el navegador** antes de
   que la escuela dependa de esta pantalla para clases reales. Toda la
   lógica de datos y de validación se probó a fondo con trazas SQL y
   revisión de código (ver "Estado actual" arriba), pero nada del render
   real (formulario, mensajes de error en pantalla, `required` de HTML5)
   se observó visualmente — este sandbox no tiene salida de red hacia
   Supabase desde `npm run dev`, así que `/login` no carga aquí. Hacerlo
   con un docente real y con super_admin/dirección antes de dar la pieza
   por completamente cerrada.
1. Configurar RLS por rol en el resto de las tablas (`perfiles.rol`) —
   hoy solo `perfiles` tiene RLS; las demás tablas (incluidas las de
   Materias: `materias`, `asignaciones`, `materia_alumnos`, y la nueva
   `calificaciones`) siguen sin RLS (última confirmación por
   `get_advisors` fue antes de agregar `calificaciones`), expuestas por
   completo a la anon key — esperado mientras Alumnos/Pagos/Asistencia no
   piden login (decisión explícita de la pieza de Auth), pero es lo
   primero que hay que cerrar antes de exponer esto fuera de la red del
   colegio. Habilitar RLS obliga además a revisar `obtenerAlumnosDelGrupo`
   en `src/app/(dashboard)/alumnos/grupo/[grupoId]/page.tsx`, porque su
   `.flatMap((inscripcion) => inscripcion.alumnos)` asume que la fila
   embebida `alumnos` nunca es `null` — si RLS llega a ocultar una
   fila, esto truena al renderizar en vez de degradarse con
   gracia. Las piezas de Materias y Calificaciones repiten el mismo
   patrón en varias funciones (`src/lib/materias/roster.ts` y
   `src/lib/calificaciones/roster.ts`), así que también hay que
   revisarlas al habilitar RLS. Al escribir cualquier política nueva de
   "rol X ve todo", usar el patrón `security definer` de
   `public.es_super_admin()` (ver arriba) — una política no puede
   consultar su propia tabla directamente sin causar recursión infinita.
2. Extender el patrón de Alumnos/Calificaciones a Pagos/colegiaturas y
   Listas/asistencia cuando el módulo de Alumnos quede validado con más
   uso real. El punto de patrón que estaba pendiente de decidir ya quedó
   resuelto: las Server Actions de escritura reciben el id del padre
   relevante como parámetro explícito (`crearAlumno(grupoId, ...)`,
   `crearGrupo(gradoId, ...)`, etc.) — Pagos/Asistencia deberían seguir
   el mismo patrón (ej. Server Actions de pagos recibiendo
   `alumnoId`/`cargoId` explícito, no leyendo de variables de entorno
   ni asumiendo un contexto implícito).

## Cómo retomar esta sesión

Usa el comando `/ibero` en cualquier sesión de Claude Code — lee este
archivo, los últimos commits, y el estado de specs/planes pendientes
automáticamente, sin necesidad de pegar enlaces o contexto a mano.
