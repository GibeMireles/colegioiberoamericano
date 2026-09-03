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
- **RLS completo + login en Alumnos/Pagos/Asistencia** — ver
  `docs/superpowers/specs/2026-09-02-rls-completo-design.md` y
  `docs/superpowers/plans/2026-09-02-rls-completo.md`. Cierra el pendiente
  #1 que quedó abierto desde la pieza de Autenticación: hoy RLS está
  activo en las **15 tablas** que faltaban (`configuracion`,
  `ciclos_escolares`, `niveles`, `grados`, `grupos`, `materias`,
  `alumnos`, `inscripciones`, `asignaciones`, `materia_alumnos`,
  `calificaciones`, `conceptos_pago`, `cargos`, `pagos`, `asistencias`) —
  `perfiles` ya lo tenía. 8 funciones helper nuevas (`es_direccion`,
  `es_super_admin_o_direccion`, `es_docente`, `es_caja`, `mi_perfil_id`,
  `docente_tiene_grupo`, `docente_tiene_materia`,
  `docente_tiene_asignacion`) extienden el mismo patrón `security
  definer` + `stable` de `es_super_admin()` (evita la recursión infinita
  de una política que consulta su propia tabla) a cada chequeo de rol y
  de alcance que hacía falta. Matriz de acceso resultante: **Alumnos**
  `super_admin`/`direccion`/`caja` ven todo, `docente` solo lee los
  alumnos de sus propios grupos asignados (vía `asignaciones` → ciclo
  activo, nunca la escuela completa); **Pagos**
  `super_admin`/`direccion`/`caja`, sin acceso para `docente`;
  **Asistencia** `super_admin`/`direccion`/`docente` (scoped a sus
  grupos), sin acceso para `caja`. Alumnos/Pagos/Asistencia ahora exigen
  login igual que Materias/Calificaciones: las 12 Server Actions de
  Alumnos (`actions.ts`, `estructura-actions.ts`) ganaron
  `requerirRol(["super_admin", "direccion"])`, las 6 páginas de Alumnos
  ganaron `requerirRolPagina` (4 de lectura con `docente` incluido, las 2
  de alta/edición sin `docente` — un docente de solo lectura no debe
  poder abrir un formulario de escritura), y el listado por grupo oculta
  "Agregar alumno" y toda la columna "Acciones" cuando el rol es
  `docente`. Vale la pena remarcarlo: el módulo Alumnos no tenía **ningún**
  chequeo de rol hasta esta pieza — se construyó antes de que existiera
  login en el proyecto, así que cualquiera con la URL podía dar de alta,
  editar o dar de baja alumnos. Pagos y Asistencia (todavía
  placeholders) ganaron el mismo `requerirRolPagina`, y `middleware.ts`
  ahora protege `/alumnos`, `/pagos`, `/asistencia` además de
  `/usuarios`, `/materias`, `/calificaciones`. De regalo, un bug real
  preexistente encontrado y corregido: la política de `perfiles` era
  `super_admin`-only, así que un usuario `direccion` que abría Materias
  para asignar un maestro recibía la lista de docentes **vacía**
  (`obtenerDocentes()` consulta `perfiles`, y RLS ocultaba en silencio
  esas filas para cualquiera que no fuera `super_admin`) — ahora es
  `es_super_admin_o_direccion()`. También se corrigieron 5 sitios (en
  `src/lib/materias/roster.ts`, `src/lib/calificaciones/roster.ts`, y el
  reemplazo de `alumnos/grupo/[grupoId]/page.tsx`) que asumían que un
  embed de Supabase (`inscripcion.alumnos`) siempre viene no-nulo — con
  RLS activo, un embed puede legítimamente venir oculto para quien no
  tiene acceso a esa fila, así que ahora se filtra. El texto literal del
  plan proponía `x ? [x] : []`; en la práctica eso no compiló porque
  Supabase infiere estos embeds como tipo arreglo en este proyecto, no
  `object | null` — el fix real usa `x ?? []`, revisado y confirmado
  equivalente por el revisor de cada tarea. `get_advisors` confirma que
  el advisory `rls_disabled` ya no aparece para ninguna tabla, y de paso
  reveló un WARN preexistente (no introducido por esta pieza, y no
  corregido): las 9 funciones `security definer` (las 8 nuevas más
  `es_super_admin()`) son invocables vía RPC de PostgREST por roles
  anónimo/autenticado — evaluado como bajo riesgo (son checks booleanos
  de "¿el que llama es X?"; un anónimo sin sesión solo recibe `false`,
  sin fuga de datos), mismo carácter que ya tenía `es_super_admin()`
  antes de esta pieza — queda señalado para que una persona lo decida,
  no se auto-corrigió.
  **Corrección posterior (review final):** el review detectó que las
  políticas de escritura de `docente` en `calificaciones` y
  `asistencias` validaban que fuera dueño de la asignación/grupo, pero
  nunca que `alumno_id` perteneciera al roster de esa asignación/grupo
  — un docente podía, vía llamada directa a la API, escribir una
  calificación/asistencia para un alumno fuera de su clase. Se corrigió
  agregando esa validación de roster a las 4 políticas de escritura
  (insert/update de ambas tablas), sumando 2 funciones `security
  definer` más (`alumno_en_grupo_de_asignacion`, `alumno_en_grupo`) —
  el total de funciones `security definer` en el proyecto sube a **11**.
  **Limitación de verificación, más seria aquí que en piezas
  anteriores:** ninguna política de RLS se pudo probar con una sesión
  real autenticada en este entorno — el login con enlace mágico requiere
  clickear un correo, y la herramienta MCP de Supabase corre con
  privilegios de servicio, así que siempre ve todo sin importar RLS
  (tampoco sirve para verificar el acceso por rol). La verificación de
  cada tarea fue a nivel de código: leer el SQL real de cada política,
  las funciones helper, y dónde quedó el chequeo de rol en el código de
  la app, razonando la corrección — nunca una prueba ejecutada contra
  una sesión real de `docente`/`caja`/`direccion`. Esto es más grave que
  el equivalente pendiente de Captura de calificaciones (que era de
  UX/mensajes de error): aquí lo que no se probó de verdad es un control
  de seguridad — quién puede ver y escribir qué datos. Queda como
  pendiente explícito y prioritario, ver "Próximos pasos pendientes".
- **Listas / Asistencia** — ver
  `docs/superpowers/specs/2026-09-03-asistencia-design.md` y
  `docs/superpowers/plans/2026-09-03-asistencia.md`. Tercer módulo del
  MVP con funcionalidad real (junto a Alumnos y Calificaciones). Migra
  `asistencias` de scope por `grupo_id` a scope por `asignacion_id`
  (mismo patrón que `calificaciones`), reutilizando
  `docente_tiene_asignacion()` y `alumno_en_grupo_de_asignacion()` — con
  la validación de roster incluida **desde el inicio** en las políticas
  de escritura de docente, a diferencia de Calificaciones, que la agregó
  después en su revisión final. Durante la verificación de la migración
  se encontró un constraint `UNIQUE (alumno_id, fecha)` que preexistía
  en el esquema original (de antes de que existiera el scope por
  asignación) y que la migración no eliminaba — habría impedido que un
  alumno tuviera asistencia registrada en más de una materia el mismo
  día, justo lo contrario del propósito de esta pieza. Se corrigió
  soltando ese constraint directamente contra el proyecto real,
  confirmado y documentado en `database/schema.sql`.
  Pantallas: `/asistencia/[asignacionId]` es la captura por maestro —
  elige fecha (hoy por defecto), un estatus por alumno del roster de esa
  asignación ("Presente" precargado por defecto), guarda. Al guardar se
  bloquea la edición y se muestra "✓ Se ha guardado la asistencia.", con
  botón "Editar asistencia" para reabrirla — mismo patrón `?editar=1`/
  `?guardado=1` que Calificaciones, pero aquí el bloqueo es **independiente
  por cada fecha** (cambiar de fecha no hereda el estado de bloqueo de
  otra fecha), a diferencia de Calificaciones que solo tiene un bloqueo
  global. `/asistencia` lista "Mis materias" para el docente, o todas las
  asignaciones más un enlace "Reporte por grupo" para
  `super_admin`/`direccion` (mismo patrón de supervisión que
  Calificaciones). `/asistencia/reporte` (Nivel → Grado → Grupo, calcado
  de la navegación de Materias) termina en una matriz de solo lectura
  alumno × materia con el estatus capturado por cada maestro para una
  fecha elegida — resume lo que Coordinación Académica necesita ver sin
  tener una captura propia separada, para que nunca haya dos versiones
  de la verdad.
  Con esta pieza, **2 de los 3 módulos originalmente planteados para el
  MVP (Alumnos, Asistencia) tienen funcionalidad real, más Calificaciones
  (construida como sistema adicional, fuera de los 3 originales)** — de
  lo originalmente planteado solo falta Pagos/colegiaturas, que sigue
  sin construirse.
  **Verificación:** test unitario del schema Zod (`estatus`), trazas SQL
  en vivo contra el proyecto real de Supabase para el roster y las
  consultas del reporte, y trazado de código de las rutas de escritura
  (re-derivación de roster, validación RLS de roster) tanto por quien
  implementó cada tarea como por su revisor independiente. Igual que
  Calificaciones y la pieza de RLS completo antes que ella, **no** se
  probó con una sesión real de navegador (`docente` ni `super_admin`)
  contra esta pantalla específica — queda cubierto por el mismo
  pendiente de verificación en vivo por rol que ya estaba abierto (ver
  punto 0 de "Próximos pasos pendientes": las políticas de `docente` de
  Asistencia quedan incluidas en esa misma verificación pendiente, no es
  un pendiente nuevo separado).
  **Corrección en la revisión final del branch completo:** el reporte
  por grupo (`obtenerAlumnosDelGrupo` en
  `asistencia/reporte/grupo/[grupoId]/page.tsx`) filtraba el roster de
  alumnos solo por `grupo_id`, sin acotar por ciclo escolar activo —
  a diferencia de `obtenerMateriasDelGrupo` en el mismo archivo, que sí
  filtra por ambos. En cuanto exista un segundo ciclo escolar, esto
  habría mostrado alumnos de ciclos anteriores como filas extra (todas
  en "—") y, si un alumno se reinscribe al mismo grupo en dos ciclos,
  una `key` de React duplicada. Corregido agregando el mismo filtro por
  `ciclo_escolar_id` que ya usa la función vecina.
  **Pendientes menores identificados en esa misma revisión, no
  bloqueantes, para una futura pasada de limpieza:** (a) el reporte
  ignora `materia_alumnos` (lista propia) — para una materia con lista
  propia (ej. niveles de inglés), un alumno del grupo que no está en esa
  lista siempre muestra "—", igual que un alumno que sí está en la lista
  pero cuyo maestro no ha pasado lista todavía; Coordinación no puede
  distinguir ambos casos hoy; (b) `fechaDeHoy()` está duplicada en dos
  archivos (`[asignacionId]/page.tsx` y `reporte/grupo/[grupoId]/page.tsx`)
  y usa UTC (`new Date().toISOString()`), no la zona horaria de la
  escuela — en un servidor UTC, después de las 18:00 hora de Ciudad de
  México el selector de fecha por defecto muestra "mañana"; (c) el
  parámetro `?fecha=` no se valida contra un formato `YYYY-MM-DD` antes
  de usarse en la consulta, así que un valor mal formado deja ver un
  error crudo de Postgres; (d) los 4 valores de `estatus` están
  repetidos en 4 lugares (`schema.ts`, `TablaAsistencia.tsx` dos veces,
  el reporte) sin una fuente única — agregar un quinto estatus algún día
  requeriría editar los 4 sin que TypeScript avise de un olvido; (e) la
  página hoja del reporte (`reporte/grupo/[grupoId]`) no tiene breadcrumb
  de regreso, a diferencia de sus páginas padre y de la página
  equivalente en Materias.
- **Selector de rol al invitar usuarios.** `/usuarios` solo tenía un
  botón "Invitar maestro" que daba de alta a cualquiera como `docente`,
  sin importar quién fuera — no servía para invitar a Dirección o
  Coordinación Académica con su rol real. `invitarDocente` se generalizó
  a `invitarUsuario` (`src/app/(dashboard)/usuarios/actions.ts`),
  `invitarMaestroSchema` a `invitarUsuarioSchema` (agrega `rol:
  z.enum(ROLES)`), y el formulario (`InvitarUsuarioForm.tsx`, antes
  `InvitarMaestroForm.tsx`) ganó un `<select>` con las 4 opciones,
  precargado en "Docente" por ser el caso más común. `ETIQUETAS_ROL` se
  movió de `page.tsx` a `src/lib/roles.ts` para reutilizarla en el
  selector. Sin cambios en el gate de acceso (solo `super_admin` invita,
  sin importar a qué rol).
- **Primer despliegue a producción.** El sitio corre en Vercel
  (`https://colegioiberoamericano.vercel.app`), conectado directo al
  repo de GitHub — cada push a `main` despliega solo. La base de datos
  sigue siendo el mismo proyecto de Supabase de siempre
  (`elhgncefzpttarpaxbzm`), sin cambios. GitHub Pages se descartó
  explícitamente: solo sirve archivos estáticos y esta app depende de
  servidor en cada request (Server Actions, middleware de roles, login
  con enlace mágico vía `/auth/callback`) — Next.js sí tiene un modo de
  exportación estática, pero apagaría justo esas tres cosas.
  Dos hallazgos reales durante el primer deploy:
  - **Vercel bloqueaba guardar `NEXT_PUBLIC_SITE_URL`** con una
    advertencia de que las variables `NEXT_PUBLIC_` se exponen al
    navegador. Como esta variable solo se lee del lado del servidor
    (`obtenerSiteUrl()`, usada únicamente desde Server Actions), no
    tenía por qué llevar ese prefijo — se renombró a `SITE_URL` en el
    código, `.env.example` y `.env.local` (ver el hallazgo de esta
    variable más arriba, ya actualizado con el nombre nuevo).
  - **"Vercel Authentication" (Deployment Protection) estaba activado
    por default**, lo que exige sesión de Vercel para ver el sitio —
    habría bloqueado a cualquiera del colegio sin cuenta ahí. Se
    desactivó en Project Settings → Deployment Protection. En el plan
    gratuito no se puede dejar solo para previews (esa excepción es de
    pago), así que quedaron públicos tanto producción como previews —
    aceptable para este proyecto, nadie más visita los previews.
  También se agregó `https://colegioiberoamericano.vercel.app/auth/callback`
  a Redirect URLs en Supabase (Authentication → URL Configuration), sin
  quitar `http://localhost:3000` como Site URL — ambos entornos siguen
  funcionando. **Primer login real en producción, verificado**
  (`super_admin`, correo real, enlace mágico recibido y funcional).
  El límite de envíos del mailer integrado de Supabase (ver hallazgo de
  arriba) sigue sin resolverse — se confirmó en vivo durante esta prueba
  (varios clics seguidos en "Enviar enlace" chocaron con un límite de
  frecuencia de ~30-60 segundos entre solicitudes) — sigue pendiente
  configurar SMTP real antes de invitar a varias personas el mismo día.
  El límite volvió a chocar minutos después al invitar a un segundo
  correo real desde `/usuarios` en producción (`429: email rate limit
  exceeded`, visto en los logs de Supabase) — y expuso un hallazgo
  nuevo: cuando `invitarUsuario` truena por ese error, la Server Action
  lo propaga como excepción y Next.js lo redacta en producción a un
  mensaje genérico ("Algo salió mal / React error #441"), igual que el
  pendiente ya conocido de Captura de calificaciones, ahora confirmado
  también en el flujo de invitación.
  **Decisión sobre SMTP:** se evaluó Resend (recomendado originalmente)
  pero requiere verificar un dominio propio para poder enviarle a
  cualquier destinatario (sin dominio, solo deja probar contigo mismo);
  como alternativa sin dominio se propuso Gmail SMTP con una cuenta
  personal (hasta 500 correos/día, contraseña de aplicación de Google,
  sin costo) — el usuario prefirió **esperar a tener un correo oficial
  del colegio** en vez de usar una cuenta de Gmail personal como
  remitente, y lo pedirá al día siguiente. **Queda en standby**: cuando
  haya un correo del colegio, el procedimiento es el mismo que con Gmail
  personal (SMTP de Google/Workspace, contraseña de aplicación,
  configurado en Supabase → Authentication → SMTP Settings), solo
  cambia la cuenta remitente.

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

**Verificación en vivo hecha hoy (sesión posterior a la implementación):**
se probó Captura de calificaciones de verdad, con un login real de
`super_admin` en `http://localhost:3000` (no solo por SQL/código como
antes). Dos huecos reales de configuración local encontrados y
corregidos en `.env.local` (nunca estuvieron en el repo, son
gitignored — cualquiera que clone el proyecto necesita agregarlos a
mano):
- `SITE_URL` (ej. `http://localhost:3000`; deliberadamente sin el
  prefijo `NEXT_PUBLIC_` — solo se lee del lado del servidor en
  `obtenerSiteUrl()`, así que Vercel la deja guardar como variable
  privada sin advertencia) — sin esto, `obtenerSiteUrl()` truena al
  construir el enlace mágico de login.
- `SUPABASE_SERVICE_ROLE_KEY` — sin esto, `createAdminClient()` truena
  al invitar un maestro (`/usuarios`).

También se encontró que el correo integrado de Supabase (el que usa el
proyecto hoy, sin SMTP propio) tiene un límite muy bajo de envíos
(parece ~2 por hora) — bloqueó tanto reenviar el enlace de login como
invitar a un segundo maestro en la misma sesión de pruebas. Antes de
que el colegio dependa de esto para invitar maestros o resetear accesos
seguido, hay que configurar un proveedor SMTP real (ej. Resend, capa
gratuita) en el panel de Supabase — el correo integrado nunca es apto
para producción.

A partir de esa prueba en vivo, Captura de calificaciones ganó dos
mejoras pedidas por el usuario probándolo:
- Al guardar (parcial o completo), se muestra "✓ Se han guardado las
  calificaciones." y la tabla pasa a solo lectura (campos
  deshabilitados) — con un botón "Editar calificaciones" para volver a
  habilitarla. Implementado con un query param (`?editar=1`,
  `?guardado=1`), mismo patrón que `?ver=todos` en Alumnos — sin
  componente de cliente nuevo.
- La columna Total se pinta verde/rojo según si llega al 70% del total
  posible **de esa asignación específica** (`(parcial1_max + parcial2_max
  + producto_max) * 0.7`, no un 70 fijo — sigue siendo correcto aunque
  un maestro no use 30/30/40=100).

**Ideas para el futuro, documentadas para no perderlas (ninguna
diseñada ni con spec todavía):**
- **Boletas de calificaciones al tutor.** Una vez cerrado un corte
  (parcial o el ciclo), poder mandarle al tutor de cada alumno su
  boleta de calificaciones. Dirección decide cuándo se manda — implica
  tener una fecha límite para que las calificaciones ya estén
  capturadas antes de generar/enviar boletas. Sin diseñar: qué formato
  tiene la boleta, cómo se dispara el envío (¿botón manual de
  Dirección, o una fecha programada?), y por qué canal (¿correo?).
- **Gestión de ciclos escolares.** Hoy solo hay un ciclo escolar
  sembrado (`2026-2027`) y nada de UI para manejar el paso de un ciclo
  a otro. Falta diseñar cómo Coordinación Académica maneja el cierre de
  un ciclo y la apertura del siguiente sin que materias/asignaciones se
  acumulen entre ciclos: archivar el ciclo que termina, generar el
  ciclo nuevo, decidir qué pasa con cada alumno (continúa y sube de
  grado/grupo, no continúa/egresa, o es alumno nuevo que se inscribe
  por primera vez), y qué pasa con las materias/asignaciones de
  maestros de un ciclo a otro (¿se vuelven a dar de alta cada ciclo, o
  se copian del ciclo anterior como punto de partida?). Esto afecta a
  Alumnos, Materias y Calificaciones por igual — es una pieza
  transversal, no de un solo módulo.

0. **Verificar a mano, con las 4 cuentas reales, la parte de seguridad
   que sigue pendiente:**
   - **(Seguridad, prioridad alta) Verificación real de RLS por rol.**
     Ninguna política de RLS de la pieza "RLS completo + login en
     Alumnos/Pagos/Asistencia" (ver "Estado actual" arriba) se probó
     contra una sesión de `docente`/`caja`/`direccion` real — la prueba
     de hoy solo cubrió `super_admin`. Falta confirmar que un `docente`
     NO puede ver alumnos fuera de sus grupos ni entrar a Pagos, y que
     `caja` no puede entrar a Asistencia. Esto es un control de
     seguridad real, no un asunto de UX. Las políticas de `docente` de
     Listas/Asistencia (ver "Estado actual" arriba) quedan incluidas en
     esta misma verificación pendiente — no es un pendiente nuevo
     separado.
1. ~~Configurar RLS por rol en el resto de las tablas~~ — **resuelto** por
   la pieza "RLS completo + login en Alumnos/Pagos/Asistencia" (ver
   "Estado actual" arriba): las 15 tablas que faltaban ya tienen RLS
   activo, con `perfiles` que ya lo tenía desde antes. Sigue pendiente la
   verificación con sesiones reales de `docente`/`caja`/`direccion` — ver
   el punto 0 de arriba.
2. ~~Extender el patrón de Alumnos/Calificaciones a Listas/asistencia~~ —
   **resuelto** por la pieza "Listas / Asistencia" (ver "Estado actual"
   arriba). Pagos/colegiaturas sigue sin construirse — es lo único que
   falta de los 3 módulos originalmente planteados para el MVP. El
   patrón de Server Actions con el id del padre explícito
   (`crearAlumno(grupoId, ...)`, etc.) ya está validado con varios
   módulos — Pagos debería seguirlo igual.

## Cómo retomar esta sesión

Usa el comando `/ibero` en cualquier sesión de Claude Code — lee este
archivo, los últimos commits, y el estado de specs/planes pendientes
automáticamente, sin necesidad de pegar enlaces o contexto a mano.
