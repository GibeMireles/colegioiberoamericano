# Diseño: Pagos / Colegiaturas

## Contexto

Último de los 3 módulos originales del MVP (Alumnos, Pagos, Listas/
Asistencia — ver "Alcance del MVP" en `CONTEXTO_CLAUDE_CODE.md`). Hoy
`/pagos` es un placeholder con el rol ya protegido
(`super_admin`/`direccion`/`caja`). Reemplaza el control de colegiaturas
que la escuela lleva en Excel.

Punto de partida: borrador del usuario en
`docs/borradores/2026-09-29-pagos-borrador-schema.sql` (sección Pagos),
escrito sobre el esquema multi-escuela viejo. Esta pieza conserva sus
ideas (beca por inscripción, cargo con monto original + monto con beca,
pago N:M con cargos vía `pago_aplicaciones`, adeudo y vencido
calculados) y las adapta al modelo de instancia dedicada (sin
`escuela_id`).

Las tablas `conceptos_pago`, `cargos` y `pagos` ya existen en Supabase
con RLS (`... admin caja`, `for all`) pero están **vacías** (0 filas,
nunca usadas), así que se redefinen sin migración de datos.

**Decisiones confirmadas con el usuario:**
- Las colegiaturas se **generan en bloque** por ciclo (o por grupo) para
  todos los alumnos inscritos, con su beca ya aplicada. Los cargos
  sueltos (inscripción, recargo, uniforme…) se agregan a mano por alumno.
- Al registrar un pago se genera un **recibo imprimible / PDF** desde la
  app. Enviarlo por correo al tutor es lo ideal, pero queda para después
  (depende del SMTP pendiente); el recibo se diseña como componente
  reutilizable para que ese paso sea pequeño.
- Se aceptan **pagos parciales** (abonos a un cargo).
- **Sin recargos automáticos**: si aplica, Caja agrega un cargo
  "Recargo" a mano.
- El precio de colegiatura varía **por nivel** (Villa, Primaria,
  Secundaria, Preparatoria).
- Cada familia elige, por alumno y por ciclo, pagar en **10 o 12
  mensualidades**. Cada plan tiene su propio precio por nivel, fijado por
  el colegio (sin relación aritmética entre ambos).
- Plan 10: septiembre a junio. Plan 12: agosto a julio. Vencimiento el
  **día 10** de cada mes. Configurable por ciclo, no fijo en código.
- La beca es un % por alumno y por ciclo y **solo aplica a
  colegiaturas**.
- Además del estado de cuenta por alumno: **reporte de adeudos** y
  **corte de caja**.
- **Caja tiene control total del módulo** (igual que Dirección y Super
  admin), incluidos precios, becas, generación, anulación y cancelación.
- Enfoque técnico: las escrituras de dinero viven en **funciones de
  Postgres atómicas**; las lecturas agregadas en **vistas**.

## Alcance de esta pieza

- Redefinir `conceptos_pago`, `cargos`, `pagos`; agregar
  `pago_aplicaciones`, `planes_pago`, `precios_colegiatura`; agregar
  `plan_pago_id` y `beca_porcentaje` a `inscripciones`.
- Funciones `generar_colegiaturas`, `registrar_pago`, `anular_pago`,
  `cancelar_cargo`.
- Vistas de saldo por cargo, adeudo por alumno y corte de caja.
- RLS de todas las tablas nuevas/redefinidas.
- Pantallas: buscar alumno, estado de cuenta (con registrar pago, agregar
  cargo, cancelar/anular, editar plan y beca), recibo, adeudos, corte de
  caja, configuración (planes, precios, conceptos, generar colegiaturas).
- Sembrar los 2 planes del ciclo 2026-2027 y los conceptos base
  (Colegiatura, Inscripción, Recargo). Los precios los captura Caja o
  Dirección desde la pantalla de configuración.

## Explícitamente fuera de alcance

- Envío del recibo por correo al tutor (espera SMTP).
- Recargos automáticos por pago tardío y descuento por pronto pago.
- Saldo a favor / pagos adelantados sin cargo que cubrir.
- Facturación (CFDI).
- Arrastrar adeudos de un ciclo al siguiente (parte de la futura pieza
  "Gestión de ciclos escolares").
- Cualquier cosa para el rol `docente` (sin acceso a Pagos).

## Modelo de datos

Montos siempre `numeric(10,2)`. Nada se borra físicamente: los pagos se
**anulan** y los cargos se **cancelan**, con quién/cuándo/por qué.

### Configuración de colegiaturas

```sql
create table planes_pago (
  id uuid primary key default gen_random_uuid(),
  ciclo_escolar_id uuid not null references ciclos_escolares(id),
  mensualidades smallint not null check (mensualidades in (10, 12)),
  primer_mes date not null,          -- primer día del primer mes (ej. 2026-09-01)
  dia_vencimiento smallint not null default 10 check (dia_vencimiento between 1 and 28),
  unique (ciclo_escolar_id, mensualidades)
);

create table precios_colegiatura (
  id uuid primary key default gen_random_uuid(),
  plan_pago_id uuid not null references planes_pago(id),
  nivel_id uuid not null references niveles(id),
  monto_mensual numeric(10,2) not null check (monto_mensual >= 0),
  unique (plan_pago_id, nivel_id)
);
```

Semilla 2026-2027: plan 10 con `primer_mes = 2026-09-01`, plan 12 con
`primer_mes = 2026-08-01`, ambos con `dia_vencimiento = 10`.

`dia_vencimiento` se limita a 1–28 para que exista en todos los meses.

### Por alumno y ciclo

```sql
alter table inscripciones
  add column plan_pago_id uuid references planes_pago(id),   -- null = sin plan elegido
  add column beca_porcentaje numeric(5,2) not null default 0
    check (beca_porcentaje between 0 and 100);
```

El plan debe pertenecer al mismo ciclo que la inscripción; se valida en
la Server Action que lo asigna (y `generar_colegiaturas` ignora planes de
otro ciclo).

### Catálogo

```sql
create table conceptos_pago (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  monto_default numeric(10,2),
  aplica_beca boolean not null default false,
  es_colegiatura boolean not null default false,
  activo boolean not null default true
);
```

Semilla: `Colegiatura` (`aplica_beca = true`, `es_colegiatura = true`),
`Inscripción`, `Recargo`. Exactamente un concepto con
`es_colegiatura = true` (índice único parcial) — es el que usa
`generar_colegiaturas`.

### Cargos

```sql
create table cargos (
  id uuid primary key default gen_random_uuid(),
  alumno_id uuid not null references alumnos(id),
  concepto_pago_id uuid not null references conceptos_pago(id),
  ciclo_escolar_id uuid not null references ciclos_escolares(id),
  periodo date,                       -- primer día del mes; solo colegiaturas
  descripcion text not null,          -- ej. 'Colegiatura septiembre 2026'
  monto_original numeric(10,2) not null check (monto_original >= 0),
  beca_porcentaje numeric(5,2) not null default 0,   -- congelado al crear
  monto numeric(10,2) not null check (monto >= 0),   -- con beca aplicada
  fecha_vencimiento date,
  creado_por uuid references perfiles(id),
  creado_en timestamptz not null default now(),
  cancelado_en timestamptz,
  cancelado_por uuid references perfiles(id),
  motivo_cancelacion text
);

create unique index idx_cargos_colegiatura_unica
  on cargos (alumno_id, concepto_pago_id, ciclo_escolar_id, periodo)
  where periodo is not null;
```

- `monto = round(monto_original * (1 - beca_porcentaje / 100), 2)`.
- La beca se **congela** en el cargo: cambiar la beca o el plan de una
  inscripción no altera cargos ya generados. Para corregir, se cancelan
  los cargos pendientes y se regenera.
- Sin columna `estatus`: se calcula en `v_cargos_saldo`.

### Pagos

```sql
create sequence pagos_folio_seq;

create table pagos (
  id uuid primary key default gen_random_uuid(),
  folio bigint not null unique default nextval('pagos_folio_seq'),
  alumno_id uuid not null references alumnos(id),
  monto_total numeric(10,2) not null check (monto_total > 0),
  fecha_pago timestamptz not null default now(),
  metodo_pago text not null check (metodo_pago in ('efectivo', 'transferencia', 'tarjeta')),
  referencia text,
  registrado_por uuid not null references perfiles(id),
  anulado_en timestamptz,
  anulado_por uuid references perfiles(id),
  motivo_anulacion text
);

create table pago_aplicaciones (
  id uuid primary key default gen_random_uuid(),
  pago_id uuid not null references pagos(id),
  cargo_id uuid not null references cargos(id),
  monto_aplicado numeric(10,2) not null check (monto_aplicado > 0),
  unique (pago_id, cargo_id)
);
```

- Invariante: `pagos.monto_total = sum(pago_aplicaciones.monto_aplicado)`
  de ese pago. La garantiza `registrar_pago` (única vía de inserción).
- Sin saldo a favor: un pago nunca excede lo que liquida.
- El folio sale de una secuencia: puede tener huecos si una transacción
  se revierte, pero nunca se repite. Se acepta (un pago anulado conserva
  su folio; un hueco por rollback no representa dinero).

### Vistas

Todas con `security_invoker = true`, para que respeten el RLS de quien
consulta.

- **`v_cargos_saldo`**: cada cargo + `pagado` (suma de aplicaciones de
  pagos no anulados) + `saldo = monto - pagado` + `estatus`:
  - `cancelado` si `cancelado_en` no es null;
  - `pagado` si `saldo = 0`;
  - `vencido` si `saldo > 0` y `fecha_vencimiento < fecha de hoy en
    America/Mexico_City`;
  - `parcial` si `0 < pagado < monto`;
  - `pendiente` en otro caso.
- **`v_adeudos_alumno`**: por alumno y ciclo, `adeudo_total` (saldo de
  cargos no cancelados), `adeudo_vencido`, `vencimiento_mas_antiguo`
  pendiente.
- **Corte de caja**: consulta sobre `pagos` por rango de fechas (en hora
  de Ciudad de México), con totales por `metodo_pago` y por
  `registrado_por`, excluyendo anulados del total.

### Índices

Índices en todas las FKs nuevas de estas tablas (`cargos.alumno_id`,
`cargos.concepto_pago_id`, `cargos.ciclo_escolar_id`,
`pagos.alumno_id`, `pago_aplicaciones.pago_id`,
`pago_aplicaciones.cargo_id`, `precios_colegiatura.nivel_id`,
`inscripciones.plan_pago_id`) — evita reintroducir el advisory
`unindexed_foreign_keys` en este módulo. Más `pagos (fecha_pago)` para el
corte.

## Funciones (Postgres, `security invoker`)

Todas corren en una sola transacción: cualquier error revierte todo. Al
ser `security invoker`, el RLS de quien llama aplica a cada lectura y
escritura dentro de la función — no agregan superficie como las 11
funciones `security definer` existentes. Los errores se lanzan con
`raise exception ... using hint = '<código>'` (ver "Manejo de errores").

### `generar_colegiaturas(p_ciclo_id uuid, p_grupo_id uuid default null)`

Para cada inscripción del ciclo (y del grupo, si se pasa) de un alumno
activo:
- sin `plan_pago_id` → se omite, motivo "sin plan";
- sin precio para su nivel y plan → se omite, motivo "sin precio";
- si no, crea un cargo por cada mes del plan (`primer_mes` + 0..n-1
  meses), con `monto_original` = precio, `beca_porcentaje` de la
  inscripción, `monto` calculado, `fecha_vencimiento` = día
  `dia_vencimiento` de ese mes, `descripcion` "Colegiatura <mes> <año>".
  Usa `on conflict do nothing` sobre `idx_cargos_colegiatura_unica`, así
  que es **idempotente**.

Devuelve `jsonb`: `{ creados: int, omitidos: [{alumno_id, nombre, motivo}] }`.

### `registrar_pago(p_alumno_id uuid, p_metodo text, p_referencia text, p_aplicaciones jsonb)`

`p_aplicaciones` = arreglo `[{cargo_id, monto}]`, al menos uno.
1. Bloquea los cargos involucrados (`select … for update`).
2. Valida por cada aplicación: el cargo existe, es de `p_alumno_id`, no
   está cancelado, `monto > 0` y `monto <= saldo actual` (calculado con
   pagos no anulados). Cargos repetidos en el arreglo → error.
3. Inserta el pago con `monto_total = suma`, `registrado_por =
   mi_perfil_id()`, y sus aplicaciones.
4. Devuelve `{ pago_id, folio }`.

El bloqueo evita que dos cajas cobren el mismo saldo a la vez.

### `anular_pago(p_pago_id uuid, p_motivo text)`

Motivo obligatorio. Error si ya está anulado. Marca `anulado_en = now()`,
`anulado_por`, `motivo_anulacion`. Las aplicaciones se conservan; las
vistas las excluyen, así que el saldo de esos cargos se restituye.

### `cancelar_cargo(p_cargo_id uuid, p_motivo text)`

Motivo obligatorio. Error si ya está cancelado o si tiene aplicaciones de
pagos no anulados ("Anula primero el pago folio N").

Los cargos sueltos (inscripción, recargo, etc.) no necesitan función: son
un solo insert desde la Server Action.

## Permisos

| Acción | `super_admin` | `direccion` | `caja` | `docente` |
|---|---|---|---|---|
| Ver estado de cuenta, adeudos, corte, recibos | ✓ | ✓ | ✓ | ✗ |
| Registrar pago, agregar cargo suelto | ✓ | ✓ | ✓ | ✗ |
| Planes, precios, conceptos, generar colegiaturas | ✓ | ✓ | ✓ | ✗ |
| Editar plan y beca de una inscripción | ✓ | ✓ | ✓ | ✗ |
| Anular pago, cancelar cargo | ✓ | ✓ | ✓ | ✗ |

- **RLS**: `planes_pago`, `precios_colegiatura`, `conceptos_pago`,
  `cargos`, `pagos`, `pago_aplicaciones` con una política `for all`
  para `es_super_admin_o_direccion() or es_caja()`, envolviendo las
  llamadas en `(select …)` para evitar el advisory `auth_rls_initplan`.
  Sin política `delete` en `cargos`, `pagos` ni `pago_aplicaciones`
  (nada se borra).
- **`inscripciones`**: `caja` hoy solo lee. Se agrega una política de
  `update` para `es_caja()`. Como una política RLS no puede restringir
  columnas, un trigger `before update` en `inscripciones` rechaza el
  cambio cuando quien llama es `caja` (y no `super_admin`/`direccion`) y
  modifica cualquier columna distinta de `plan_pago_id` o
  `beca_porcentaje`. Así la restricción vale también vía API directa, no
  solo desde la Server Action (que además valida con un schema Zod que
  solo acepta esos dos campos).
- **Server Actions**: todas con `requerirRol(["super_admin", "direccion", "caja"])`;
  páginas con `requerirRolPagina` igual. `middleware.ts` ya protege
  `/pagos`.

## Pantallas

Submenú en `/pagos`: **Alumnos · Adeudos · Corte de caja · Configuración**.

1. **`/pagos`** — buscador de alumno por nombre, con la navegación
   Nivel → Grado → Grupo como alternativa. Cada alumno muestra su saldo
   pendiente del ciclo activo.
2. **`/pagos/alumno/[alumnoId]`** — estado de cuenta del ciclo activo:
   - Encabezado: alumno, grupo, plan, beca, saldo total, vencido.
     Plan y beca editables aquí.
   - Tabla de cargos (concepto/mes, original, beca, monto, pagado, saldo,
     estatus con color: rojo vencido, amarillo parcial, verde pagado,
     gris tachado cancelado). Acción "Cancelar" por fila, con motivo.
   - **Registrar pago**: se marcan cargos con saldo; cada uno se
     precarga con su saldo y se puede reducir (abono). Total calculado.
     Método + referencia. Al guardar redirige al recibo.
   - **Agregar cargo**: concepto (no colegiatura), monto (sugerido del
     concepto), descripción, vencimiento opcional.
   - Historial de pagos: folio (enlace al recibo), fecha, total, método,
     quién; anulados tachados. Acción "Anular" con motivo.
3. **`/pagos/recibo/[pagoId]`** — recibo: logo y colores de
   `configuracion`, folio, fecha, alumno y grupo, cargos liquidados
   (original, beca, aplicado), total, método, referencia, quién registró;
   marca "ANULADO" si aplica. Botón Imprimir / Guardar PDF vía
   `window.print()` con CSS `@media print` (oculta navegación). El cuerpo
   del recibo es un componente de servidor aislado (`Recibo`) que recibe
   el pago ya cargado, para reutilizarlo en el futuro correo al tutor.
4. **`/pagos/adeudos`** — filtros nivel/grado/grupo y "solo vencidos";
   tabla alumno · grupo · adeudo total · vencido · vencimiento más
   antiguo; total general. Fila enlaza al estado de cuenta.
5. **`/pagos/corte`** — `?desde=&hasta=` (hoy por defecto, en
   America/Mexico_City), validados como `YYYY-MM-DD`. Lista de pagos;
   totales por método y por quien registró; anulados tachados y fuera
   del total.
6. **`/pagos/configuracion`** — planes del ciclo activo (mensualidades,
   primer mes, día de vencimiento), tabla de precios nivel × plan,
   catálogo de conceptos (alta, edición, activar/desactivar), y botón
   **Generar colegiaturas** (todo el ciclo o un grupo) que muestra el
   resultado: creados y omitidos con su motivo.

Una utilidad compartida `fechaHoyMexico()` en `src/lib/fechas.ts` resuelve
"hoy" en America/Mexico_City (no UTC) para Pagos. Migrar Asistencia a
esa utilidad queda fuera de esta pieza.

## Manejo de errores

- Mismo patrón que el resto del proyecto (`?error=<código>`): cada
  función de Postgres lanza sus errores con un `hint` que es un código
  estable (ej. `monto_excede_saldo`, `cargo_con_pagos`, `ya_anulado`);
  la Server Action atrapa el error de `rpc`, **nunca lo relanza**, y
  redirige a la misma página con `?error=<código>`; la página traduce el
  código a un mensaje en español. Evita el genérico "Algo salió mal /
  React error #441" en producción. Códigos desconocidos → mensaje
  genérico propio ("No se pudo guardar, intenta de nuevo").
- Todos los botones de envío usan `BotonEnviar` (evita doble envío).
- Doble protección contra cobrar de más: bloqueo `for update` +
  validación de saldo dentro de la misma transacción.
- Parámetros de URL (`?desde`, `?hasta`, ids) se validan antes de
  consultar; valores inválidos muestran un mensaje, no un error crudo de
  Postgres.
- `error.tsx` en `/pagos` como en los demás módulos.

## Testing

- **Unitarios (Vitest, como en el resto del proyecto)**: schemas Zod
  (registrar pago, agregar cargo, plan/beca, precios, motivo), cálculo
  de monto con beca y totales del formulario de pago.
- **Trazas SQL en vivo** contra el proyecto real, para cada función:
  - generar dos veces → segunda corrida crea 0 cargos;
  - alumno sin plan y alumno sin precio → aparecen en `omitidos`;
  - beca 50% → `monto` correcto y redondeado;
  - pago parcial → estatus `parcial`; pago que liquida → `pagado`;
  - pago de varios cargos → un folio, varias aplicaciones;
  - pagar más que el saldo → error, sin filas insertadas;
  - anular → saldo restituido; cancelar cargo con pago vigente → error.
  Los datos de prueba se crean y se limpian en la misma traza.
- **Prueba real en navegador con una cuenta `caja`** (en producción o
  local): cobrar, imprimir recibo, ver corte y adeudos; y confirmar que
  `caja` **no** puede abrir Asistencia ni Calificaciones. Cubre parte del
  pendiente de verificación de RLS por rol.
- `get_advisors` (seguridad y performance) al terminar: sin tablas sin
  RLS, sin FKs sin índice en las tablas de Pagos.
