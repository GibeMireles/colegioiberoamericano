# Diseño: modelo de instancia por escuela + layout base

## Contexto

El repo se scaffoldeó inicialmente con un modelo multi-tenant compartido
(`escuela_id` en cada tabla, tabla `escuelas` con una fila por
institución, aislamiento vía RLS). Al brainstormear el layout base se
confirmó con el dueño del producto que el modelo real es otro:

> "Solo la plataforma debe ser por escuela, o sea que cada escuela
> tendrá su propia plataforma. Si llegara a haber otra escuela sería
> hacer una réplica."

Este documento reemplaza esa decisión de arquitectura y diseña, sobre
el nuevo modelo, el layout base (navegación lateral + tema de marca)
del que van a colgar los 3 módulos del MVP.

## Decisión de arquitectura: instancia dedicada por escuela

Cada escuela tiene su propio deploy completo y aislado:

- Su propio proyecto de Supabase (base de datos, Auth, Storage).
- Su propio deploy de Next.js.
- Opcionalmente su propio repo (o un branch/fork del repo plantilla —
  se decide en el momento de la primera réplica; no es necesario
  resolverlo ahora).

Nada se comparte entre escuelas a nivel de infraestructura ni de
datos. Agregar una escuela nueva = replicar el proyecto completo, no
agregar una fila a una tabla compartida.

**Por qué este modelo y no multi-tenant compartido:**

- Aislamiento total de datos entre escuelas sin depender de que RLS
  esté perfectamente configurado — el error más caro de un sistema
  multi-tenant (fuga de datos entre organizaciones) queda
  estructuralmente imposible.
- Cada escuela puede tener su propio ciclo de vida (upgrades,
  incidentes, límites de uso de Supabase) sin afectar a las demás.
- El "empaquetado para comercializar a otras escuelas" mencionado como
  visión a futuro se vuelve: un proceso de replicación/onboarding
  (checklist + posible plantilla/CLI más adelante), no una migración
  de esquema.
- Costo: sin RLS por tenant que mantener, sin columnas `escuela_id`
  repetidas en cada tabla, esquema y queries más simples.

**Consecuencia aceptada:** cambios de esquema o de código deben
propagarse manualmente (o vía herramienta de replicación futura) a
cada instancia desplegada. Esto es aceptable para el tamaño actual (2
escuelas adicionales conocidas) y se puede resolver con tooling cuando
el número de escuelas lo justifique — no antes (YAGNI).

## Cambios a `database/schema.sql`

- Eliminar la tabla `escuelas` y toda columna `escuela_id` de las
  demás tablas (`ciclos_escolares`, `grados`, `grupos`, `alumnos`,
  `inscripciones`, `conceptos_pago`, `cargos`, `pagos`, `asistencias`,
  `perfiles`).
- Agregar tabla `configuracion`, pensada para una sola fila, con la
  identidad de marca de la instancia:

```sql
create table configuracion (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  nombre_corto text,
  color_primario text,      -- ej. '#D85A30'
  color_secundario text,    -- ej. '#EF9F27'
  logo_url text,
  actualizado_en timestamptz not null default now()
);
```

  (Se aplica una restricción a nivel de aplicación/seed de que solo
  existe una fila; no hace falta un `CHECK` complejo para el MVP.)

- Los índices que referenciaban `escuela_id` se eliminan junto con la
  columna.

## Cambios a documentación

- `README.md`: quitar la sección "Diseño pensado a futuro" en su
  redacción actual (habla de "modelo de datos multi-escuela") y
  reemplazarla por una que describa el modelo de instancia dedicada +
  replicación.
- `docs/arquitectura.md`: reemplazar la sección "Principio central:
  multi-escuela desde el día uno" por "Principio central: una
  instancia por escuela", con el checklist de replicación (nuevo
  proyecto Supabase → correr `schema.sql` → poblar `configuracion` →
  nuevo deploy). Actualizar "Entidades principales" (quitar
  `escuelas`, agregar `configuracion`) y "Configuración de marca por
  escuela" (ahora es configuración de marca de la instancia).
- `CONTEXTO_CLAUDE_CODE.md`: actualizar el resumen de estado y los
  "primeros pasos sugeridos" para reflejar el nuevo modelo.

## Layout base

### Alcance

Shell de la aplicación (navegación + tema de marca) del que cuelgan
los 3 módulos del MVP. No incluye autenticación real, control de
acceso por rol, ni conexión real a Supabase — eso es trabajo
posterior, explícitamente fuera de alcance aquí.

### Fuente de configuración de marca (temporal)

`src/lib/config.ts` exporta una función `getConfiguracion()` que
retorna un objeto mock (`nombre`, `nombre_corto`, `color_primario`,
`color_secundario`, `logo_url`) con los valores de Colegio
Iberoamericano. Cuando exista el proyecto Supabase real, esta función
se reemplaza por una consulta a la tabla `configuracion` — es la única
pieza que cambia; nada en el layout necesita saber de dónde viene el
dato.

### Aplicación del tema

`src/app/layout.tsx` (server component) llama a `getConfiguracion()`
en el servidor e inyecta `--color-primario` / `--color-secundario`
como CSS custom properties en el elemento `<html>` (vía `style`
inline). No hay parpadeo porque se resuelve antes del primer render;
no hace falta contexto de cliente ni `localStorage` para esto, porque
no varía por usuario ni por sesión — es una constante del deploy.

`globals.css` define tokens (`--color-primario`, `--color-secundario`
con defaults) y los expone a Tailwind vía `@theme inline` para poder
usarlos como `bg-primario`, `text-primario`, etc.

### Navegación

`src/app/(dashboard)/layout.tsx` monta `AppShell`:

- `Sidebar` — lista fija de 3 enlaces (Alumnos y Grados, Pagos, Listas
  / Asistencia), resalta el activo con `usePathname`. Visible igual
  para cualquier rol por ahora (no hay diferenciación por rol todavía
  — se decidió explícitamente no simularla hasta que exista
  Supabase Auth real).
- Topbar simple con nombre/logo de la escuela (desde `getConfiguracion()`).

El route group `(dashboard)` deja `src/app/layout.tsx` libre para que,
más adelante, un route group `(auth)` con login no herede el sidebar.

### Páginas placeholder

`src/app/(dashboard)/alumnos/page.tsx`,
`src/app/(dashboard)/pagos/page.tsx`,
`src/app/(dashboard)/asistencia/page.tsx` — cada una con un título y
texto "Próximamente", suficiente para validar que el ruteo y el
resaltado de nav funcionan.

### Explícitamente fuera de alcance

- Selector de escuela (no aplica: instancia única por deploy).
- Mock o gating de rol en la navegación.
- Dark mode.
- Conexión real a Supabase (login, fetch de `configuracion` real).
- Herramienta/CLI de replicación a otras escuelas (se documenta el
  proceso manual; automatizarlo es trabajo futuro).

### Testing / validación

- `npm run build` sin errores de tipos/lint.
- Verificación visual en navegador: tema con colores de Ibero
  aplicado, los 3 enlaces de nav navegan y resaltan correctamente el
  activo.
