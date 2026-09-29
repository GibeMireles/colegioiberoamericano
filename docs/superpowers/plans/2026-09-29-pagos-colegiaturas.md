# Pagos / Colegiaturas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Módulo de Pagos que reemplaza el control de colegiaturas en Excel: generación en bloque de colegiaturas (plan 10/12, precio por nivel, beca por inscripción), cargos sueltos, pagos parciales y de varios cargos con recibo imprimible, reporte de adeudos y corte de caja.

**Architecture:** Las escrituras de dinero viven en 4 funciones de Postgres `security invoker` atómicas (`generar_colegiaturas`, `registrar_pago`, `anular_pago`, `cancelar_cargo`), llamadas vía `rpc` desde Server Actions que validan con Zod y rol. Saldos, estatus y adeudos se calculan en 2 vistas `security_invoker`. Las pantallas siguen el patrón del proyecto: Server Components `force-dynamic`, Server Actions con `redirect(?ok=|?error=<código>)`, `BotonEnviar` en todo envío.

**Tech Stack:** Next.js 16 App Router, Supabase (Postgres + RLS), Zod 4, Vitest, Tailwind 4 — sin dependencias nuevas.

**Spec:** `docs/superpowers/specs/2026-09-29-pagos-colegiaturas-design.md`

## Global Constraints

- Sin `escuela_id`: instancia dedicada por escuela.
- Montos siempre `numeric(10,2)` en la base; en TypeScript, sumas en centavos enteros (`sumarMontos`), nunca sumando flotantes directo.
- Nada se borra: pagos se **anulan**, cargos se **cancelan**, siempre con quién, cuándo y motivo. Sin políticas `delete` en `cargos`, `pagos`, `pago_aplicaciones`.
- Roles del módulo: `super_admin`, `direccion`, `caja` (constante `ROLES_PAGOS`), con control total. `docente` sin acceso.
- La beca solo aplica a colegiaturas (concepto con `aplica_beca = true`) y se **congela** en cada cargo al crearlo.
- Plan 10: primer mes 2026-09-01. Plan 12: primer mes 2026-08-01. Vencimiento día 10. Configurable por ciclo en `planes_pago`.
- "Hoy" y los rangos de fecha se calculan en `America/Mexico_City` (UTC-6 fijo, sin horario de verano desde 2022), nunca con `toISOString()` de la hora del servidor.
- Errores de negocio: las funciones SQL lanzan `raise exception ... using hint = '<código>'`; las Server Actions **nunca relanzan**: redirigen con `?error=<código>` y la página traduce con `mensajeDeError()`.
- Toda función nueva de Postgres lleva `set search_path = public`; las 4 invocables llevan `revoke execute ... from public, anon` y `grant execute ... to authenticated`.
- Cada migración aplicada a la base real se agrega también, textual, al final de `database/schema.sql` (mismo criterio que las piezas anteriores).
- Seguir `AGENTS.md`: esta versión de Next.js puede diferir de lo conocido; ante dudas de API, leer `node_modules/next/dist/docs/`.

## Review Focus

1. **Dos cobros al mismo saldo casi simultáneos** (doble clic, dos cajas): el segundo debe fallar con `monto_excede_saldo`, no dejar un cargo pagado de más. Lo cubre el bloqueo `for update` y la traza "pago que liquida, luego otro pago al mismo cargo" (Task 2).
2. **Alumno con beca 100 %**: sus colegiaturas quedan en $0 y deben mostrarse como `pagado`, no aparecer en "Registrar pago" ni en adeudos. Traza en Task 2 y filtro `saldo > 0` en Task 8.
3. **Pago registrado de noche en hora de México** (ej. 23:30): debe aparecer en el corte de **ese** día, no del siguiente. Tests de `inicioDelDiaEscuela`/`fechaHoyMexico` en Task 3.
4. **Caja editando por API otras columnas de una inscripción** (ej. cambiar de grupo a un alumno): el trigger debe rechazarlo con `solo_plan_beca`. Traza en Task 2.
5. **Cancelar una colegiatura equivocada y regenerar**: la regeneración debe crear el cargo corregido, no chocar con el cancelado. Traza en Task 2 (índice único parcial con `cancelado_en is null`).

---

## File Structure

**Base de datos**
- `database/schema.sql`: se le agregan al final las migraciones de Task 1 y Task 2.

**Librería (pura, testeable sin DB)**
- `src/lib/fechas.ts`: fecha de hoy en México, validación `YYYY-MM-DD`, suma de días, inicio del día con offset, formato de fecha y hora.
- `src/lib/pagos/catalogos.ts`: `ROLES_PAGOS`, métodos de pago, estatus de cargo con etiquetas y clases de color (fuente única).
- `src/lib/pagos/calculos.ts`: `sumarMontos`, `formatearMoneda`, `nombreCompletoAlumno`, `normalizarTexto`, `resumirCorte`.
- `src/lib/pagos/schema.ts`: schemas Zod y `esUuid`.
- `src/lib/pagos/errores.ts`: mensajes por código y `codigoDeError`/`mensajeDeError`.

**Librería (servidor)**
- `src/lib/pagos/consultas.ts`: lecturas compartidas por varias páginas (cargos con saldo, pagos del alumno, contexto del alumno, pago para recibo, estructura del ciclo, alumnos con adeudo).

**UI**
- `src/app/(dashboard)/pagos/layout.tsx` + `src/components/pagos/PagosNav.tsx`: submenú.
- `src/app/(dashboard)/pagos/page.tsx`: buscar alumno.
- `src/app/(dashboard)/pagos/configuracion/{page,actions}.ts(x)`.
- `src/app/(dashboard)/pagos/alumno/[alumnoId]/{page,actions}.ts(x)`: estado de cuenta.
- `src/app/(dashboard)/pagos/alumno/[alumnoId]/pago/{page,actions}.ts(x)` + `src/components/pagos/FormularioPago.tsx`.
- `src/app/(dashboard)/pagos/recibo/[pagoId]/{page,actions}.ts(x)` + `src/components/pagos/Recibo.tsx` + `src/components/pagos/BotonImprimir.tsx`.
- `src/app/(dashboard)/pagos/adeudos/page.tsx`.
- `src/app/(dashboard)/pagos/corte/page.tsx`.
- Modificados: `src/lib/nav.ts` (+ test), `src/components/layout/Sidebar.tsx`, `src/components/layout/Topbar.tsx` (ocultar al imprimir).

---

### Task 1: Migración de esquema (tablas, RLS, trigger, vistas, semillas)

La aplica quien orquesta, vía la herramienta MCP `mcp__supabase-ibero__apply_migration` (nombre `pagos_colegiaturas_esquema`), no un script local.

**Files:**
- Modify: `database/schema.sql` (agregar al final)

**Interfaces:**
- Produces: tablas `planes_pago`, `precios_colegiatura`, `conceptos_pago`, `cargos`, `pagos`, `pago_aplicaciones`; columnas `inscripciones.plan_pago_id`, `inscripciones.beca_porcentaje`; secuencia `pagos_folio_seq`; vistas `v_cargos_saldo` (columnas de `cargos` + `pagado`, `saldo`, `estatus`) y `v_adeudos_alumno` (`alumno_id`, `ciclo_escolar_id`, `adeudo_total`, `adeudo_vencido`, `vencimiento_mas_antiguo`); FK `pagos_registrado_por_fkey` (usada en embeds).

- [ ] **Step 1: Confirmar que las tablas a redefinir siguen vacías**

Run (vía `mcp__supabase-ibero__execute_sql`):
```sql
select (select count(*) from conceptos_pago) as conceptos,
       (select count(*) from cargos) as cargos,
       (select count(*) from pagos) as pagos;
```
Expected: `0, 0, 0`. Si alguna tiene filas, **detenerse** y reportarlo: el plan asume que se pueden soltar sin migrar datos.

- [ ] **Step 2: Aplicar la migración**

```sql
-- ==========================================================
-- Pagos / Colegiaturas: esquema (spec 2026-09-29-pagos-colegiaturas)
-- Las tablas conceptos_pago, cargos y pagos del esquema original
-- estaban vacías y se redefinen completas.
-- ==========================================================

drop table if exists pagos;
drop table if exists cargos;
drop table if exists conceptos_pago;

-- Configuración de colegiaturas por ciclo
create table planes_pago (
  id uuid primary key default gen_random_uuid(),
  ciclo_escolar_id uuid not null references ciclos_escolares(id),
  mensualidades smallint not null check (mensualidades in (10, 12)),
  primer_mes date not null check (extract(day from primer_mes) = 1),
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
create index idx_precios_colegiatura_nivel on precios_colegiatura(nivel_id);

-- Plan y beca por alumno y ciclo
alter table inscripciones
  add column plan_pago_id uuid references planes_pago(id),
  add column beca_porcentaje numeric(5,2) not null default 0
    check (beca_porcentaje between 0 and 100);
create index idx_inscripciones_plan_pago on inscripciones(plan_pago_id);

-- Catálogo de conceptos
create table conceptos_pago (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  monto_default numeric(10,2) check (monto_default >= 0),
  aplica_beca boolean not null default false,
  es_colegiatura boolean not null default false,
  activo boolean not null default true
);
create unique index idx_conceptos_una_colegiatura
  on conceptos_pago (es_colegiatura) where es_colegiatura;

-- Cargos (lo que se debe). Sin columna estatus: ver v_cargos_saldo.
create table cargos (
  id uuid primary key default gen_random_uuid(),
  alumno_id uuid not null references alumnos(id),
  concepto_pago_id uuid not null references conceptos_pago(id),
  ciclo_escolar_id uuid not null references ciclos_escolares(id),
  periodo date,
  descripcion text not null,
  monto_original numeric(10,2) not null check (monto_original >= 0),
  beca_porcentaje numeric(5,2) not null default 0 check (beca_porcentaje between 0 and 100),
  monto numeric(10,2) not null check (monto >= 0),
  fecha_vencimiento date,
  creado_por uuid references perfiles(id),
  creado_en timestamptz not null default now(),
  cancelado_en timestamptz,
  cancelado_por uuid references perfiles(id),
  motivo_cancelacion text
);
-- Excluye cancelados: cancelar una colegiatura y regenerar crea la corregida.
create unique index idx_cargos_colegiatura_unica
  on cargos (alumno_id, concepto_pago_id, ciclo_escolar_id, periodo)
  where periodo is not null and cancelado_en is null;
create index idx_cargos_alumno on cargos(alumno_id);
create index idx_cargos_concepto on cargos(concepto_pago_id);
create index idx_cargos_ciclo on cargos(ciclo_escolar_id);
create index idx_cargos_creado_por on cargos(creado_por);
create index idx_cargos_cancelado_por on cargos(cancelado_por);

-- Pagos (lo que entra)
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
alter sequence pagos_folio_seq owned by pagos.folio;
grant usage, select on sequence pagos_folio_seq to authenticated;
create index idx_pagos_alumno on pagos(alumno_id);
create index idx_pagos_fecha on pagos(fecha_pago);
create index idx_pagos_registrado_por on pagos(registrado_por);
create index idx_pagos_anulado_por on pagos(anulado_por);

create table pago_aplicaciones (
  id uuid primary key default gen_random_uuid(),
  pago_id uuid not null references pagos(id),
  cargo_id uuid not null references cargos(id),
  monto_aplicado numeric(10,2) not null check (monto_aplicado > 0),
  unique (pago_id, cargo_id)
);
create index idx_pago_aplicaciones_cargo on pago_aplicaciones(cargo_id);

-- ----------------------------------------------------------
-- RLS: super_admin, direccion y caja con control total del módulo
-- ----------------------------------------------------------
alter table planes_pago enable row level security;
alter table precios_colegiatura enable row level security;
alter table conceptos_pago enable row level security;
alter table cargos enable row level security;
alter table pagos enable row level security;
alter table pago_aplicaciones enable row level security;

create policy "planes_pago personal pagos" on planes_pago for all
  using ((select es_super_admin_o_direccion()) or (select es_caja()))
  with check ((select es_super_admin_o_direccion()) or (select es_caja()));
create policy "precios_colegiatura personal pagos" on precios_colegiatura for all
  using ((select es_super_admin_o_direccion()) or (select es_caja()))
  with check ((select es_super_admin_o_direccion()) or (select es_caja()));
create policy "conceptos_pago personal pagos" on conceptos_pago for all
  using ((select es_super_admin_o_direccion()) or (select es_caja()))
  with check ((select es_super_admin_o_direccion()) or (select es_caja()));

-- Sin delete: nada se borra.
create policy "cargos lectura personal pagos" on cargos for select
  using ((select es_super_admin_o_direccion()) or (select es_caja()));
create policy "cargos alta personal pagos" on cargos for insert
  with check ((select es_super_admin_o_direccion()) or (select es_caja()));
create policy "cargos actualizacion personal pagos" on cargos for update
  using ((select es_super_admin_o_direccion()) or (select es_caja()))
  with check ((select es_super_admin_o_direccion()) or (select es_caja()));

create policy "pagos lectura personal pagos" on pagos for select
  using ((select es_super_admin_o_direccion()) or (select es_caja()));
create policy "pagos alta personal pagos" on pagos for insert
  with check ((select es_super_admin_o_direccion()) or (select es_caja()));
create policy "pagos actualizacion personal pagos" on pagos for update
  using ((select es_super_admin_o_direccion()) or (select es_caja()))
  with check ((select es_super_admin_o_direccion()) or (select es_caja()));

create policy "pago_aplicaciones lectura personal pagos" on pago_aplicaciones for select
  using ((select es_super_admin_o_direccion()) or (select es_caja()));
create policy "pago_aplicaciones alta personal pagos" on pago_aplicaciones for insert
  with check ((select es_super_admin_o_direccion()) or (select es_caja()));

-- Caja puede actualizar inscripciones (solo plan y beca, lo impone el trigger)
create policy "inscripciones actualizacion caja" on inscripciones for update
  using ((select es_caja())) with check ((select es_caja()));

-- Caja lee perfiles: sin esto, "quién registró" sale vacío en recibo y corte
create policy "caja lee perfiles" on perfiles for select
  using ((select es_caja()));

-- ----------------------------------------------------------
-- Trigger: caja solo cambia plan/beca; el plan debe ser del mismo ciclo
-- ----------------------------------------------------------
create or replace function inscripciones_validar_plan_beca()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and es_caja() and not es_super_admin_o_direccion() and (
       new.id is distinct from old.id
    or new.alumno_id is distinct from old.alumno_id
    or new.grupo_id is distinct from old.grupo_id
    or new.ciclo_escolar_id is distinct from old.ciclo_escolar_id
    or new.fecha_inscripcion is distinct from old.fecha_inscripcion
  ) then
    raise exception 'Caja solo puede cambiar el plan de pagos y la beca.'
      using hint = 'solo_plan_beca';
  end if;

  if new.plan_pago_id is not null and not exists (
    select 1 from planes_pago
    where id = new.plan_pago_id and ciclo_escolar_id = new.ciclo_escolar_id
  ) then
    raise exception 'El plan elegido no pertenece al ciclo de esta inscripción.'
      using hint = 'plan_otro_ciclo';
  end if;

  return new;
end;
$$;

create trigger inscripciones_validar_plan_beca
  before insert or update on inscripciones
  for each row execute function inscripciones_validar_plan_beca();

-- ----------------------------------------------------------
-- Vistas (security_invoker: respetan el RLS de quien consulta)
-- ----------------------------------------------------------
create view v_cargos_saldo with (security_invoker = true) as
select
  c.*,
  coalesce(p.pagado, 0)::numeric(10,2) as pagado,
  (c.monto - coalesce(p.pagado, 0))::numeric(10,2) as saldo,
  case
    when c.cancelado_en is not null then 'cancelado'
    when c.monto - coalesce(p.pagado, 0) <= 0 then 'pagado'
    when c.fecha_vencimiento < (now() at time zone 'America/Mexico_City')::date then 'vencido'
    when coalesce(p.pagado, 0) > 0 then 'parcial'
    else 'pendiente'
  end as estatus
from cargos c
left join lateral (
  select sum(pa.monto_aplicado) as pagado
  from pago_aplicaciones pa
  join pagos pg on pg.id = pa.pago_id and pg.anulado_en is null
  where pa.cargo_id = c.id
) p on true;

create view v_adeudos_alumno with (security_invoker = true) as
select
  alumno_id,
  ciclo_escolar_id,
  sum(saldo)::numeric(10,2) as adeudo_total,
  coalesce(sum(saldo) filter (where estatus = 'vencido'), 0)::numeric(10,2) as adeudo_vencido,
  min(fecha_vencimiento) filter (where saldo > 0) as vencimiento_mas_antiguo
from v_cargos_saldo
where estatus <> 'cancelado'
group by alumno_id, ciclo_escolar_id;

revoke all on v_cargos_saldo, v_adeudos_alumno from anon;
grant select on v_cargos_saldo, v_adeudos_alumno to authenticated;

-- ----------------------------------------------------------
-- Semillas
-- ----------------------------------------------------------
insert into conceptos_pago (nombre, aplica_beca, es_colegiatura) values
  ('Colegiatura', true, true),
  ('Inscripción', false, false),
  ('Recargo', false, false);

insert into planes_pago (ciclo_escolar_id, mensualidades, primer_mes, dia_vencimiento)
select id, 10, date '2026-09-01', 10 from ciclos_escolares where nombre = '2026-2027'
union all
select id, 12, date '2026-08-01', 10 from ciclos_escolares where nombre = '2026-2027';
```

Expected: la migración aplica sin error.

- [ ] **Step 3: Verificar el resultado**

Run (vía `execute_sql`):
```sql
select
  (select count(*) from planes_pago) as planes,
  (select count(*) from conceptos_pago) as conceptos,
  (select count(*) from information_schema.columns
     where table_name = 'inscripciones' and column_name in ('plan_pago_id','beca_porcentaje')) as cols_inscripciones,
  (select bool_and(relrowsecurity) from pg_class
     where relname in ('planes_pago','precios_colegiatura','conceptos_pago','cargos','pagos','pago_aplicaciones')) as rls_ok,
  (select count(*) from pg_views where viewname in ('v_cargos_saldo','v_adeudos_alumno')) as vistas;
```
Expected: `planes = 2, conceptos = 3, cols_inscripciones = 2, rls_ok = true, vistas = 2`.

Y el nombre de la FK usada en embeds:
```sql
select conname from pg_constraint where conname = 'pagos_registrado_por_fkey';
```
Expected: 1 fila.

- [ ] **Step 4: Agregar la migración a `database/schema.sql`**

Pegar textual el SQL del Step 2 al final de `database/schema.sql`, precedido de este encabezado:

```sql

-- ==========================================================
-- Pagos / Colegiaturas — esquema. Aplicada como migración
-- `pagos_colegiaturas_esquema` (plan 2026-09-29-pagos-colegiaturas, Task 1).
-- Redefine conceptos_pago, cargos y pagos (definidas arriba en su versión
-- original, vacías al momento de esta migración).
-- ==========================================================
```

- [ ] **Step 5: Commit**

```bash
git add database/schema.sql
git commit -m "feat: esquema de Pagos (planes, precios, cargos, pagos, vistas, RLS)"
```

---

### Task 2: Funciones de Postgres y traza de verificación

La aplica quien orquesta, vía `apply_migration` (nombre `pagos_colegiaturas_funciones`), y verifica con `execute_sql`.

**Files:**
- Modify: `database/schema.sql` (agregar al final)

**Interfaces:**
- Consumes: todo lo producido en Task 1; helpers existentes `es_caja()`, `es_super_admin_o_direccion()`, `mi_perfil_id()`.
- Produces (llamadas vía `supabase.rpc`):
  - `generar_colegiaturas(p_ciclo_id uuid, p_grupo_id uuid default null) returns jsonb` → `{ "creados": int, "omitidos": [{ "alumno_id", "nombre", "motivo": "sin_plan" | "sin_precio" }] }`
  - `registrar_pago(p_alumno_id uuid, p_metodo text, p_referencia text, p_aplicaciones jsonb) returns jsonb` → `{ "pago_id": uuid, "folio": int }`; `p_aplicaciones` = `[{ "cargo_id": uuid, "monto": number }]`
  - `anular_pago(p_pago_id uuid, p_motivo text) returns void`
  - `cancelar_cargo(p_cargo_id uuid, p_motivo text) returns void`
  - Códigos de error (`hint`): `sin_permiso`, `sin_concepto_colegiatura`, `sin_aplicaciones`, `cargo_repetido`, `metodo_invalido`, `cargo_invalido`, `cargo_cancelado`, `monto_invalido`, `monto_excede_saldo`, `motivo_requerido`, `ya_anulado`, `pago_no_encontrado`, `ya_cancelado`, `cargo_no_encontrado`, `cargo_con_pagos`. Más los del trigger de Task 1: `solo_plan_beca`, `plan_otro_ciclo`.

- [ ] **Step 1: Aplicar la migración de funciones**

```sql
-- ==========================================================
-- Pagos / Colegiaturas: funciones (security invoker: el RLS de quien
-- llama aplica dentro de la función)
-- ==========================================================

create or replace function generar_colegiaturas(p_ciclo_id uuid, p_grupo_id uuid default null)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_concepto_id uuid;
  v_perfil uuid := mi_perfil_id();
  v_creados int := 0;
  v_filas int;
  v_omitidos jsonb := '[]'::jsonb;
  v_plan planes_pago%rowtype;
  v_precio numeric(10,2);
  v_mes date;
  v_k int;
  v_meses text[] := array['enero','febrero','marzo','abril','mayo','junio',
                          'julio','agosto','septiembre','octubre','noviembre','diciembre'];
  r record;
begin
  if not (es_super_admin_o_direccion() or es_caja()) then
    raise exception 'No tienes permiso para esta acción.' using hint = 'sin_permiso';
  end if;

  select id into v_concepto_id from conceptos_pago where es_colegiatura;
  if v_concepto_id is null then
    raise exception 'No hay un concepto de Colegiatura configurado.'
      using hint = 'sin_concepto_colegiatura';
  end if;

  for r in
    select ins.alumno_id, ins.plan_pago_id, ins.beca_porcentaje, gr.nivel_id,
           trim(concat_ws(' ', a.apellido_paterno, a.apellido_materno)) || ', ' || a.nombres as nombre
    from inscripciones ins
    join alumnos a on a.id = ins.alumno_id and a.activo
    join grupos g on g.id = ins.grupo_id
    join grados gr on gr.id = g.grado_id
    where ins.ciclo_escolar_id = p_ciclo_id
      and (p_grupo_id is null or ins.grupo_id = p_grupo_id)
  loop
    select * into v_plan from planes_pago
    where id = r.plan_pago_id and ciclo_escolar_id = p_ciclo_id;

    if not found then
      v_omitidos := v_omitidos || jsonb_build_object(
        'alumno_id', r.alumno_id, 'nombre', r.nombre, 'motivo', 'sin_plan');
      continue;
    end if;

    select monto_mensual into v_precio from precios_colegiatura
    where plan_pago_id = v_plan.id and nivel_id = r.nivel_id;

    if not found then
      v_omitidos := v_omitidos || jsonb_build_object(
        'alumno_id', r.alumno_id, 'nombre', r.nombre, 'motivo', 'sin_precio');
      continue;
    end if;

    for v_k in 0 .. v_plan.mensualidades - 1 loop
      v_mes := (v_plan.primer_mes + make_interval(months => v_k))::date;

      insert into cargos (
        alumno_id, concepto_pago_id, ciclo_escolar_id, periodo, descripcion,
        monto_original, beca_porcentaje, monto, fecha_vencimiento, creado_por
      ) values (
        r.alumno_id, v_concepto_id, p_ciclo_id, v_mes,
        'Colegiatura ' || v_meses[extract(month from v_mes)::int] || ' ' || extract(year from v_mes)::int,
        v_precio, r.beca_porcentaje,
        round(v_precio * (1 - r.beca_porcentaje / 100), 2),
        v_mes + (v_plan.dia_vencimiento - 1),
        v_perfil
      )
      on conflict (alumno_id, concepto_pago_id, ciclo_escolar_id, periodo)
        where periodo is not null and cancelado_en is null
      do nothing;

      get diagnostics v_filas = row_count;
      v_creados := v_creados + v_filas;
    end loop;
  end loop;

  return jsonb_build_object('creados', v_creados, 'omitidos', v_omitidos);
end;
$$;

create or replace function registrar_pago(
  p_alumno_id uuid, p_metodo text, p_referencia text, p_aplicaciones jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_perfil uuid := mi_perfil_id();
  v_app record;
  v_cargo cargos%rowtype;
  v_saldo numeric(10,2);
  v_total numeric(10,2) := 0;
  v_pago_id uuid;
  v_folio bigint;
begin
  if v_perfil is null or not (es_super_admin_o_direccion() or es_caja()) then
    raise exception 'No tienes permiso para esta acción.' using hint = 'sin_permiso';
  end if;

  if p_aplicaciones is null or jsonb_typeof(p_aplicaciones) <> 'array'
     or jsonb_array_length(p_aplicaciones) = 0 then
    raise exception 'Selecciona al menos un cargo.' using hint = 'sin_aplicaciones';
  end if;

  if (select count(distinct x->>'cargo_id') from jsonb_array_elements(p_aplicaciones) x)
     <> jsonb_array_length(p_aplicaciones) then
    raise exception 'Un cargo aparece dos veces.' using hint = 'cargo_repetido';
  end if;

  if p_metodo is null or p_metodo not in ('efectivo', 'transferencia', 'tarjeta') then
    raise exception 'Método de pago inválido.' using hint = 'metodo_invalido';
  end if;

  -- Bloquea los cargos (en orden fijo, evita deadlocks) para que dos
  -- cobros simultáneos no liquiden el mismo saldo.
  perform 1 from cargos
  where id in (select (x->>'cargo_id')::uuid from jsonb_array_elements(p_aplicaciones) x)
  order by id
  for update;

  for v_app in
    select (x->>'cargo_id')::uuid as cargo_id, (x->>'monto')::numeric(10,2) as monto
    from jsonb_array_elements(p_aplicaciones) x
  loop
    select * into v_cargo from cargos where id = v_app.cargo_id;

    if not found or v_cargo.alumno_id <> p_alumno_id then
      raise exception 'Uno de los cargos no pertenece a este alumno.' using hint = 'cargo_invalido';
    end if;
    if v_cargo.cancelado_en is not null then
      raise exception 'El cargo "%" está cancelado.', v_cargo.descripcion using hint = 'cargo_cancelado';
    end if;
    if v_app.monto is null or v_app.monto <= 0 then
      raise exception 'Los montos deben ser mayores a 0.' using hint = 'monto_invalido';
    end if;

    select v_cargo.monto - coalesce(sum(pa.monto_aplicado), 0) into v_saldo
    from pago_aplicaciones pa
    join pagos pg on pg.id = pa.pago_id and pg.anulado_en is null
    where pa.cargo_id = v_cargo.id;

    if v_app.monto > v_saldo then
      raise exception 'El monto para "%" excede su saldo de %.', v_cargo.descripcion, v_saldo
        using hint = 'monto_excede_saldo';
    end if;

    v_total := v_total + v_app.monto;
  end loop;

  insert into pagos (alumno_id, monto_total, metodo_pago, referencia, registrado_por)
  values (p_alumno_id, v_total, p_metodo, nullif(trim(p_referencia), ''), v_perfil)
  returning id, folio into v_pago_id, v_folio;

  insert into pago_aplicaciones (pago_id, cargo_id, monto_aplicado)
  select v_pago_id, (x->>'cargo_id')::uuid, (x->>'monto')::numeric(10,2)
  from jsonb_array_elements(p_aplicaciones) x;

  return jsonb_build_object('pago_id', v_pago_id, 'folio', v_folio);
end;
$$;

create or replace function anular_pago(p_pago_id uuid, p_motivo text)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not (es_super_admin_o_direccion() or es_caja()) then
    raise exception 'No tienes permiso para esta acción.' using hint = 'sin_permiso';
  end if;
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Escribe el motivo.' using hint = 'motivo_requerido';
  end if;

  update pagos
  set anulado_en = now(), anulado_por = mi_perfil_id(), motivo_anulacion = trim(p_motivo)
  where id = p_pago_id and anulado_en is null;

  if not found then
    if exists (select 1 from pagos where id = p_pago_id) then
      raise exception 'Este pago ya estaba anulado.' using hint = 'ya_anulado';
    end if;
    raise exception 'No se encontró el pago.' using hint = 'pago_no_encontrado';
  end if;
end;
$$;

create or replace function cancelar_cargo(p_cargo_id uuid, p_motivo text)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_cargo cargos%rowtype;
  v_folio bigint;
begin
  if not (es_super_admin_o_direccion() or es_caja()) then
    raise exception 'No tienes permiso para esta acción.' using hint = 'sin_permiso';
  end if;
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Escribe el motivo.' using hint = 'motivo_requerido';
  end if;

  select * into v_cargo from cargos where id = p_cargo_id for update;
  if not found then
    raise exception 'No se encontró el cargo.' using hint = 'cargo_no_encontrado';
  end if;
  if v_cargo.cancelado_en is not null then
    raise exception 'Este cargo ya estaba cancelado.' using hint = 'ya_cancelado';
  end if;

  select pg.folio into v_folio
  from pago_aplicaciones pa
  join pagos pg on pg.id = pa.pago_id and pg.anulado_en is null
  where pa.cargo_id = p_cargo_id
  order by pg.folio
  limit 1;

  if found then
    raise exception 'Anula primero el pago folio %.', v_folio using hint = 'cargo_con_pagos';
  end if;

  update cargos
  set cancelado_en = now(), cancelado_por = mi_perfil_id(), motivo_cancelacion = trim(p_motivo)
  where id = p_cargo_id;
end;
$$;

revoke execute on function generar_colegiaturas(uuid, uuid) from public, anon;
revoke execute on function registrar_pago(uuid, text, text, jsonb) from public, anon;
revoke execute on function anular_pago(uuid, text) from public, anon;
revoke execute on function cancelar_cargo(uuid, text) from public, anon;
grant execute on function generar_colegiaturas(uuid, uuid) to authenticated;
grant execute on function registrar_pago(uuid, text, text, jsonb) to authenticated;
grant execute on function anular_pago(uuid, text) to authenticated;
grant execute on function cancelar_cargo(uuid, text) to authenticated;
```

Expected: aplica sin error.

- [ ] **Step 2: Correr la traza completa (se revierte sola)**

La traza corre como `postgres` vía `execute_sql`, así que **no prueba RLS** (eso lo cubre la prueba en navegador de Task 11). Sí prueba toda la lógica de las funciones y el trigger. Simula la sesión fijando `request.jwt.claims` con el `usuario_auth_id` del `super_admin`, crea una estructura aislada (nivel "ZZ Traza Pagos"), y al final lanza `TRAZA_PAGOS_OK` para que **toda** la transacción se revierta: no queda ningún dato de prueba.

Run (vía `execute_sql`):
```sql
do $$
declare
  v_sub uuid; v_ciclo uuid; v_ciclo_otro uuid; v_plan10 uuid; v_plan12 uuid; v_plan_otro uuid;
  v_nivel uuid; v_grado uuid; v_grupo uuid; v_concepto_insc uuid;
  v_a1 uuid; v_a2 uuid; v_a3 uuid; v_a4 uuid; v_a5 uuid;
  v_sep uuid; v_may uuid; v_jun uuid; v_ajeno uuid;
  v_res jsonb; v_pago_multi jsonb; v_n int; v_hint text;
begin
  select usuario_auth_id into v_sub from perfiles where rol = 'super_admin' limit 1;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_sub, 'role', 'authenticated')::text, true);

  select id into v_ciclo from ciclos_escolares where nombre = '2026-2027';
  select id into v_plan10 from planes_pago where ciclo_escolar_id = v_ciclo and mensualidades = 10;
  select id into v_plan12 from planes_pago where ciclo_escolar_id = v_ciclo and mensualidades = 12;
  select id into v_concepto_insc from conceptos_pago where nombre = 'Inscripción';

  insert into niveles (nombre, orden) values ('ZZ Traza Pagos', 99) returning id into v_nivel;
  insert into grados (nombre, nivel_id, orden) values ('ZZ Grado', v_nivel, 1) returning id into v_grado;
  insert into grupos (grado_id, ciclo_escolar_id, nombre) values (v_grado, v_ciclo, 'ZZ') returning id into v_grupo;
  insert into precios_colegiatura (plan_pago_id, nivel_id, monto_mensual) values (v_plan10, v_nivel, 3000.00);

  insert into alumnos (nombres, apellido_paterno) values ('Uno', 'ZZTraza') returning id into v_a1;    -- plan 10, beca 33.33
  insert into alumnos (nombres, apellido_paterno) values ('Dos', 'ZZTraza') returning id into v_a2;    -- plan 12 sin precio
  insert into alumnos (nombres, apellido_paterno) values ('Tres', 'ZZTraza') returning id into v_a3;   -- sin plan
  insert into alumnos (nombres, apellido_paterno) values ('Cuatro', 'ZZTraza') returning id into v_a4; -- inactivo
  insert into alumnos (nombres, apellido_paterno) values ('Cinco', 'ZZTraza') returning id into v_a5;  -- beca 100
  insert into inscripciones (alumno_id, grupo_id, ciclo_escolar_id, plan_pago_id, beca_porcentaje) values
    (v_a1, v_grupo, v_ciclo, v_plan10, 33.33),
    (v_a2, v_grupo, v_ciclo, v_plan12, 0),
    (v_a3, v_grupo, v_ciclo, null, 0),
    (v_a4, v_grupo, v_ciclo, v_plan10, 0),
    (v_a5, v_grupo, v_ciclo, v_plan10, 100);
  update alumnos set activo = false where id = v_a4;

  -- 1. Generar: a1 y a5 (10 c/u); a2 sin_precio; a3 sin_plan; a4 inactivo se ignora
  v_res := generar_colegiaturas(v_ciclo, v_grupo);
  assert (v_res->>'creados')::int = 20, format('creados esperado 20: %s', v_res);
  assert jsonb_array_length(v_res->'omitidos') = 2, format('omitidos esperado 2: %s', v_res);
  assert v_res->'omitidos' @> jsonb_build_array(jsonb_build_object('alumno_id', v_a2, 'motivo', 'sin_precio')), 'a2 debe ser sin_precio';
  assert v_res->'omitidos' @> jsonb_build_array(jsonb_build_object('alumno_id', v_a3, 'motivo', 'sin_plan')), 'a3 debe ser sin_plan';

  -- 2. Idempotente
  v_res := generar_colegiaturas(v_ciclo, v_grupo);
  assert (v_res->>'creados')::int = 0, format('segunda corrida debe crear 0: %s', v_res);

  -- 3. Beca congelada y redondeo: 3000 * (1 - 0.3333) = 2000.10
  select count(*) into v_n from cargos
  where alumno_id = v_a1 and monto_original = 3000.00 and beca_porcentaje = 33.33 and monto = 2000.10;
  assert v_n = 10, format('a1 debe tener 10 cargos de 2000.10, tiene %s', v_n);

  select id into v_sep from cargos where alumno_id = v_a1 and periodo = date '2026-09-01';
  select id into v_may from cargos where alumno_id = v_a1 and periodo = date '2027-05-01';
  select id into v_jun from cargos where alumno_id = v_a1 and periodo = date '2027-06-01';
  assert (select descripcion from cargos where id = v_sep) = 'Colegiatura septiembre 2026', 'descripcion sep';
  assert (select fecha_vencimiento from cargos where id = v_sep) = date '2026-09-10', 'vencimiento sep';
  assert (select count(*) from cargos where alumno_id = v_a1 and periodo = date '2026-08-01') = 0, 'plan 10 no incluye agosto';

  -- 4. Beca 100 %: monto 0 y estatus pagado
  assert (select bool_and(monto = 0 and estatus = 'pagado') from v_cargos_saldo where alumno_id = v_a5), 'a5 beca 100 debe quedar pagado';

  -- 5. Vencido: septiembre ya venció y no tiene pagos
  assert (select estatus from v_cargos_saldo where id = v_sep) = 'vencido', 'sep debe estar vencido';

  -- 6. Pago parcial en junio 2027 (vence a futuro)
  perform registrar_pago(v_a1, 'efectivo', null, jsonb_build_array(jsonb_build_object('cargo_id', v_jun, 'monto', 1000)));
  assert (select estatus from v_cargos_saldo where id = v_jun) = 'parcial', 'jun debe ser parcial';
  assert (select saldo from v_cargos_saldo where id = v_jun) = 1000.10, 'saldo jun 1000.10';

  -- 7. Un pago para dos cargos: un folio, dos aplicaciones, total 3000.20
  v_pago_multi := registrar_pago(v_a1, 'transferencia', ' SPEI-123 ', jsonb_build_array(
    jsonb_build_object('cargo_id', v_jun, 'monto', 1000.10),
    jsonb_build_object('cargo_id', v_may, 'monto', 2000.10)));
  assert (select monto_total from pagos where id = (v_pago_multi->>'pago_id')::uuid) = 3000.20, 'total multi';
  assert (select referencia from pagos where id = (v_pago_multi->>'pago_id')::uuid) = 'SPEI-123', 'referencia recortada';
  assert (select count(*) from pago_aplicaciones where pago_id = (v_pago_multi->>'pago_id')::uuid) = 2, 'dos aplicaciones';
  assert (select estatus from v_cargos_saldo where id = v_jun) = 'pagado', 'jun pagado';
  assert (select estatus from v_cargos_saldo where id = v_may) = 'pagado', 'may pagado';

  -- 8. Cobrar de nuevo un cargo ya liquidado -> monto_excede_saldo, sin insertar nada
  select count(*) into v_n from pagos where alumno_id = v_a1;
  begin
    perform registrar_pago(v_a1, 'efectivo', null, jsonb_build_array(jsonb_build_object('cargo_id', v_jun, 'monto', 0.01)));
    raise exception 'debió fallar: cobro sobre saldo cero';
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    assert v_hint = 'monto_excede_saldo', format('esperado monto_excede_saldo, obtuvo %s (%s)', v_hint, sqlerrm);
  end;
  assert (select count(*) from pagos where alumno_id = v_a1) = v_n, 'no debe insertar pago al fallar';

  -- 9. Validaciones de entrada
  insert into cargos (alumno_id, concepto_pago_id, ciclo_escolar_id, descripcion, monto_original, monto)
  values (v_a3, v_concepto_insc, v_ciclo, 'Inscripción ajena', 500, 500) returning id into v_ajeno;
  begin
    perform registrar_pago(v_a1, 'efectivo', null, jsonb_build_array(jsonb_build_object('cargo_id', v_ajeno, 'monto', 10)));
    raise exception 'debió fallar: cargo ajeno';
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    assert v_hint = 'cargo_invalido', format('esperado cargo_invalido, obtuvo %s (%s)', v_hint, sqlerrm);
  end;
  begin
    perform registrar_pago(v_a1, 'efectivo', null, jsonb_build_array(
      jsonb_build_object('cargo_id', v_sep, 'monto', 1), jsonb_build_object('cargo_id', v_sep, 'monto', 1)));
    raise exception 'debió fallar: cargo repetido';
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    assert v_hint = 'cargo_repetido', format('esperado cargo_repetido, obtuvo %s (%s)', v_hint, sqlerrm);
  end;
  begin
    perform registrar_pago(v_a1, 'cheque', null, jsonb_build_array(jsonb_build_object('cargo_id', v_sep, 'monto', 1)));
    raise exception 'debió fallar: metodo';
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    assert v_hint = 'metodo_invalido', format('esperado metodo_invalido, obtuvo %s (%s)', v_hint, sqlerrm);
  end;

  -- 10. Anular el pago múltiple restituye saldos; anular dos veces falla
  perform anular_pago((v_pago_multi->>'pago_id')::uuid, 'Error de captura');
  assert (select saldo from v_cargos_saldo where id = v_jun) = 1000.10, 'jun vuelve a 1000.10';
  assert (select estatus from v_cargos_saldo where id = v_jun) = 'parcial', 'jun vuelve a parcial';
  assert (select saldo from v_cargos_saldo where id = v_may) = 2000.10, 'may vuelve a 2000.10';
  begin
    perform anular_pago((v_pago_multi->>'pago_id')::uuid, 'otra vez');
    raise exception 'debió fallar: ya anulado';
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    assert v_hint = 'ya_anulado', format('esperado ya_anulado, obtuvo %s (%s)', v_hint, sqlerrm);
  end;

  -- 11. Cancelar: con pago vigente falla; sin pagos funciona; regenerar recrea
  begin
    perform cancelar_cargo(v_jun, 'prueba');
    raise exception 'debió fallar: cargo con pagos';
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    assert v_hint = 'cargo_con_pagos', format('esperado cargo_con_pagos, obtuvo %s (%s)', v_hint, sqlerrm);
  end;
  perform cancelar_cargo(v_may, 'Beca mal capturada');
  assert (select estatus from v_cargos_saldo where id = v_may) = 'cancelado', 'may cancelado';
  v_res := generar_colegiaturas(v_ciclo, v_grupo);
  assert (v_res->>'creados')::int = 1, format('regenerar debe recrear solo mayo: %s', v_res);

  -- 12. Adeudo por alumno = suma de saldos no cancelados
  assert (select adeudo_total from v_adeudos_alumno where alumno_id = v_a1 and ciclo_escolar_id = v_ciclo)
       = (select sum(saldo) from v_cargos_saldo where alumno_id = v_a1 and estatus <> 'cancelado'),
    'adeudo_total consistente';

  -- 13. Trigger: plan de otro ciclo
  insert into ciclos_escolares (nombre, activo) values ('ZZ Otro', false) returning id into v_ciclo_otro;
  insert into planes_pago (ciclo_escolar_id, mensualidades, primer_mes) values (v_ciclo_otro, 10, date '2027-09-01')
    returning id into v_plan_otro;
  begin
    update inscripciones set plan_pago_id = v_plan_otro where alumno_id = v_a1;
    raise exception 'debió fallar: plan de otro ciclo';
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    assert v_hint = 'plan_otro_ciclo', format('esperado plan_otro_ciclo, obtuvo %s (%s)', v_hint, sqlerrm);
  end;

  -- 14. Trigger: como caja, plan/beca sí; otra columna no
  update perfiles set rol = 'caja' where usuario_auth_id = v_sub;
  update inscripciones set beca_porcentaje = 10 where alumno_id = v_a1;
  assert (select beca_porcentaje from inscripciones where alumno_id = v_a1) = 10, 'caja cambia beca';
  begin
    update inscripciones set fecha_inscripcion = fecha_inscripcion - 1 where alumno_id = v_a1;
    raise exception 'debió fallar: caja cambia otra columna';
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    assert v_hint = 'solo_plan_beca', format('esperado solo_plan_beca, obtuvo %s (%s)', v_hint, sqlerrm);
  end;

  -- 15. Docente no puede generar
  update perfiles set rol = 'docente' where usuario_auth_id = v_sub;
  begin
    perform generar_colegiaturas(v_ciclo, v_grupo);
    raise exception 'debió fallar: docente';
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    assert v_hint = 'sin_permiso', format('esperado sin_permiso, obtuvo %s (%s)', v_hint, sqlerrm);
  end;

  raise exception 'TRAZA_PAGOS_OK';
end $$;
```

Expected: la llamada **termina en error** con el mensaje exacto `TRAZA_PAGOS_OK` (es la señal de éxito y lo que revierte todo). Cualquier otro mensaje (`assert` fallido con su descripción, u otro error) es una falla: corregir la función correspondiente, volver a aplicarla con `create or replace` y repetir.

- [ ] **Step 3: Confirmar que no quedó nada de la traza**

Run:
```sql
select
  (select count(*) from niveles where nombre = 'ZZ Traza Pagos') as niveles_traza,
  (select count(*) from alumnos where apellido_paterno = 'ZZTraza') as alumnos_traza,
  (select count(*) from cargos) as cargos,
  (select count(*) from pagos) as pagos,
  (select rol from perfiles where rol = 'super_admin' limit 1) as rol_super_admin;
```
Expected: `0, 0, 0, 0, 'super_admin'`.

- [ ] **Step 4: Agregar la migración a `database/schema.sql`**

Pegar textual el SQL del Step 1 al final de `database/schema.sql`, precedido de:

```sql

-- ==========================================================
-- Pagos / Colegiaturas — funciones. Aplicada como migración
-- `pagos_colegiaturas_funciones` (plan 2026-09-29-pagos-colegiaturas, Task 2).
-- ==========================================================
```

- [ ] **Step 5: Commit**

```bash
git add database/schema.sql
git commit -m "feat: funciones de Pagos (generar, registrar, anular, cancelar)"
```

---

### Task 3: Utilidades puras (fechas, catálogos, cálculos, schemas, errores) y menú

**Files:**
- Create: `src/lib/fechas.ts`, `src/lib/fechas.test.ts`
- Create: `src/lib/pagos/catalogos.ts`
- Create: `src/lib/pagos/calculos.ts`, `src/lib/pagos/calculos.test.ts`
- Create: `src/lib/pagos/schema.ts`, `src/lib/pagos/schema.test.ts`
- Create: `src/lib/pagos/errores.ts`, `src/lib/pagos/errores.test.ts`
- Modify: `src/lib/nav.ts`, `src/lib/nav.test.ts`

**Interfaces:**
- Produces:
  - `fechas.ts`: `ZONA_ESCUELA`, `fechaHoyMexico(ahora?: Date): string`, `esFechaISO(v: unknown): v is string`, `sumarDias(fechaISO: string, dias: number): string`, `inicioDelDiaEscuela(fechaISO: string): string`, `formatearFechaHora(iso: string): string`, `formatearFecha(fechaISO: string): string`.
  - `catalogos.ts`: `ROLES_PAGOS: Rol[]`, `METODOS_PAGO`, `type MetodoPago`, `ETIQUETAS_METODO`, `ESTATUS_CARGO`, `type EstatusCargo`, `ETIQUETAS_ESTATUS`, `CLASES_ESTATUS`.
  - `calculos.ts`: `sumarMontos(montos: number[]): number`, `formatearMoneda(monto: number): string`, `nombreCompletoAlumno(a): string`, `normalizarTexto(t: string): string`, `interface PagoCorte`, `resumirCorte(pagos: PagoCorte[])`.
  - `schema.ts`: `esUuid`, `registrarPagoSchema`, `agregarCargoSchema`, `planBecaSchema`, `motivoSchema`, `precioSchema`, `planPagoSchema`, `conceptoSchema`.
  - `errores.ts`: `MENSAJES_ERROR_PAGOS`, `codigoDeError(error)`, `mensajeDeError(codigo?)`.

- [ ] **Step 1: Escribir los tests (fallan porque los módulos no existen)**

`src/lib/fechas.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import {
  esFechaISO,
  fechaHoyMexico,
  formatearFecha,
  inicioDelDiaEscuela,
  sumarDias,
} from "./fechas";

describe("fechaHoyMexico", () => {
  it("a las 21:00 de CDMX sigue siendo el mismo día (en UTC ya es mañana)", () => {
    expect(fechaHoyMexico(new Date("2026-09-30T03:00:00Z"))).toBe("2026-09-29");
  });

  it("a mediodía coincide con la fecha UTC", () => {
    expect(fechaHoyMexico(new Date("2026-09-29T18:00:00Z"))).toBe("2026-09-29");
  });
});

describe("esFechaISO", () => {
  it("acepta YYYY-MM-DD válida", () => {
    expect(esFechaISO("2026-09-01")).toBe(true);
  });

  it("rechaza fechas imposibles, formatos cortos y no-strings", () => {
    expect(esFechaISO("2026-02-30")).toBe(false);
    expect(esFechaISO("2026-9-1")).toBe(false);
    expect(esFechaISO("hoy")).toBe(false);
    expect(esFechaISO(undefined)).toBe(false);
    expect(esFechaISO(20260901)).toBe(false);
  });
});

describe("sumarDias", () => {
  it("cruza fin de año", () => {
    expect(sumarDias("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("inicioDelDiaEscuela", () => {
  it("usa el offset fijo de México", () => {
    expect(inicioDelDiaEscuela("2026-09-29")).toBe("2026-09-29T00:00:00-06:00");
  });

  it("un pago a las 23:30 de CDMX cae antes del inicio del día siguiente", () => {
    const pago = new Date("2026-09-30T05:30:00Z"); // 23:30 del 29 en CDMX
    expect(pago < new Date(inicioDelDiaEscuela(sumarDias("2026-09-29", 1)))).toBe(true);
    expect(pago >= new Date(inicioDelDiaEscuela("2026-09-29"))).toBe(true);
  });
});

describe("formatearFecha", () => {
  it("muestra dd/mm/aaaa sin desfase por zona horaria", () => {
    expect(formatearFecha("2026-09-10")).toBe("10/09/2026");
  });
});
```

`src/lib/pagos/calculos.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import {
  formatearMoneda,
  nombreCompletoAlumno,
  normalizarTexto,
  resumirCorte,
  sumarMontos,
} from "./calculos";

describe("sumarMontos", () => {
  it("suma sin error de punto flotante", () => {
    expect(sumarMontos([0.1, 0.2])).toBe(0.3);
    expect(sumarMontos([1000.1, 2000.1])).toBe(3000.2);
  });

  it("regresa 0 para una lista vacía", () => {
    expect(sumarMontos([])).toBe(0);
  });
});

describe("formatearMoneda", () => {
  it("formatea en pesos mexicanos", () => {
    expect(formatearMoneda(3500)).toBe("$3,500.00");
  });
});

describe("nombreCompletoAlumno", () => {
  it("usa formato Apellidos, Nombres", () => {
    expect(
      nombreCompletoAlumno({ nombres: "Ana", apellido_paterno: "López", apellido_materno: "Ruiz" })
    ).toBe("López Ruiz, Ana");
  });

  it("omite el apellido materno faltante", () => {
    expect(
      nombreCompletoAlumno({ nombres: "Ana", apellido_paterno: "López", apellido_materno: null })
    ).toBe("López, Ana");
  });

  it("sin apellidos devuelve solo los nombres", () => {
    expect(
      nombreCompletoAlumno({ nombres: "Ana", apellido_paterno: null, apellido_materno: null })
    ).toBe("Ana");
  });
});

describe("normalizarTexto", () => {
  it("quita acentos, mayúsculas y espacios de los extremos", () => {
    expect(normalizarTexto("  José Pérez ")).toBe("jose perez");
  });
});

describe("resumirCorte", () => {
  it("excluye anulados de los totales y agrupa por método y usuario", () => {
    const resumen = resumirCorte([
      { montoTotal: 1000.1, metodo: "efectivo", registradoPor: "Caja 1", anulado: false },
      { montoTotal: 500, metodo: "transferencia", registradoPor: "Caja 2", anulado: false },
      { montoTotal: 0.2, metodo: "efectivo", registradoPor: "Caja 1", anulado: false },
      { montoTotal: 9999, metodo: "tarjeta", registradoPor: "Caja 1", anulado: true },
    ]);

    expect(resumen.total).toBe(1500.3);
    expect(resumen.cantidad).toBe(3);
    expect(resumen.anulados).toBe(1);
    expect(resumen.porMetodo).toEqual({ efectivo: 1000.3, transferencia: 500, tarjeta: 0 });
    expect(resumen.porUsuario).toEqual([
      { nombre: "Caja 1", total: 1000.3 },
      { nombre: "Caja 2", total: 500 },
    ]);
  });
});
```

`src/lib/pagos/schema.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import {
  agregarCargoSchema,
  conceptoSchema,
  esUuid,
  motivoSchema,
  planBecaSchema,
  planPagoSchema,
  precioSchema,
  registrarPagoSchema,
} from "./schema";

const ID = "3f1c2a4e-8b7d-4c1a-9e2f-0a1b2c3d4e5f";
const ID2 = "4f1c2a4e-8b7d-4c1a-9e2f-0a1b2c3d4e5f";

describe("esUuid", () => {
  it("distingue uuids de otros valores", () => {
    expect(esUuid(ID)).toBe(true);
    expect(esUuid("123")).toBe(false);
    expect(esUuid(undefined)).toBe(false);
  });
});

describe("registrarPagoSchema", () => {
  const base = {
    alumnoId: ID,
    metodo: "efectivo",
    referencia: "",
    aplicaciones: [{ cargoId: ID2, monto: "1500.50" }],
  };

  it("acepta un pago válido y convierte montos y referencia vacía", () => {
    const r = registrarPagoSchema.parse(base);
    expect(r.aplicaciones[0].monto).toBe(1500.5);
    expect(r.referencia).toBeNull();
  });

  it("rechaza montos en cero, negativos o con más de 2 decimales", () => {
    for (const monto of ["0", "-5", "10.555", "abc", ""]) {
      expect(
        registrarPagoSchema.safeParse({ ...base, aplicaciones: [{ cargoId: ID2, monto }] }).success
      ).toBe(false);
    }
  });

  it("rechaza sin aplicaciones, con cargo repetido o método desconocido", () => {
    expect(registrarPagoSchema.safeParse({ ...base, aplicaciones: [] }).success).toBe(false);
    expect(
      registrarPagoSchema.safeParse({
        ...base,
        aplicaciones: [
          { cargoId: ID2, monto: "1" },
          { cargoId: ID2, monto: "2" },
        ],
      }).success
    ).toBe(false);
    expect(registrarPagoSchema.safeParse({ ...base, metodo: "cheque" }).success).toBe(false);
  });
});

describe("agregarCargoSchema", () => {
  it("acepta sin fecha de vencimiento", () => {
    const r = agregarCargoSchema.parse({
      conceptoId: ID,
      descripcion: " Recargo octubre ",
      monto: "150",
      fechaVencimiento: "",
    });
    expect(r).toEqual({
      conceptoId: ID,
      descripcion: "Recargo octubre",
      monto: 150,
      fechaVencimiento: null,
    });
  });

  it("rechaza descripción vacía o fecha inválida", () => {
    expect(
      agregarCargoSchema.safeParse({ conceptoId: ID, descripcion: " ", monto: "1", fechaVencimiento: "" })
        .success
    ).toBe(false);
    expect(
      agregarCargoSchema.safeParse({
        conceptoId: ID,
        descripcion: "x",
        monto: "1",
        fechaVencimiento: "2026-02-30",
      }).success
    ).toBe(false);
  });
});

describe("planBecaSchema", () => {
  it("plan vacío significa sin plan", () => {
    expect(planBecaSchema.parse({ planPagoId: "", becaPorcentaje: "0" })).toEqual({
      planPagoId: null,
      becaPorcentaje: 0,
    });
  });

  it("rechaza beca fuera de 0-100", () => {
    expect(planBecaSchema.safeParse({ planPagoId: ID, becaPorcentaje: "101" }).success).toBe(false);
    expect(planBecaSchema.safeParse({ planPagoId: ID, becaPorcentaje: "-1" }).success).toBe(false);
  });
});

describe("motivoSchema", () => {
  it("exige al menos 3 caracteres", () => {
    expect(motivoSchema.safeParse({ motivo: "  a " }).success).toBe(false);
    expect(motivoSchema.parse({ motivo: " Error de captura " }).motivo).toBe("Error de captura");
  });
});

describe("precioSchema", () => {
  it("acepta 0 pero no negativos", () => {
    expect(precioSchema.safeParse({ planPagoId: ID, nivelId: ID2, montoMensual: "0" }).success).toBe(true);
    expect(precioSchema.safeParse({ planPagoId: ID, nivelId: ID2, montoMensual: "-1" }).success).toBe(false);
  });
});

describe("planPagoSchema", () => {
  it("valida mes YYYY-MM y día 1-28", () => {
    expect(planPagoSchema.safeParse({ primerMes: "2026-09", diaVencimiento: "10" }).success).toBe(true);
    expect(planPagoSchema.safeParse({ primerMes: "2026-13", diaVencimiento: "10" }).success).toBe(false);
    expect(planPagoSchema.safeParse({ primerMes: "2026-09", diaVencimiento: "31" }).success).toBe(false);
  });
});

describe("conceptoSchema", () => {
  it("monto sugerido vacío es null", () => {
    expect(conceptoSchema.parse({ nombre: "Uniforme", montoDefault: "", aplicaBeca: false })).toEqual({
      nombre: "Uniforme",
      montoDefault: null,
      aplicaBeca: false,
    });
  });
});
```

`src/lib/pagos/errores.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { codigoDeError, mensajeDeError, MENSAJES_ERROR_PAGOS } from "./errores";

describe("codigoDeError", () => {
  it("usa el hint cuando es un código conocido", () => {
    expect(codigoDeError({ hint: "monto_excede_saldo", code: "P0001" })).toBe("monto_excede_saldo");
  });

  it("mapea violación de unicidad a duplicado", () => {
    expect(codigoDeError({ hint: null, code: "23505" })).toBe("duplicado");
  });

  it("cae en desconocido para cualquier otra cosa", () => {
    expect(codigoDeError({ hint: "algo_raro" })).toBe("desconocido");
    expect(codigoDeError(null)).toBe("desconocido");
  });
});

describe("mensajeDeError", () => {
  it("devuelve null sin código y el genérico para códigos desconocidos", () => {
    expect(mensajeDeError(undefined)).toBeNull();
    expect(mensajeDeError("<script>")).toBe(MENSAJES_ERROR_PAGOS.desconocido);
  });
});
```

- [ ] **Step 2: Correr los tests y ver que fallan**

Run: `npm test`
Expected: FAIL en los 4 archivos nuevos por módulos inexistentes.

- [ ] **Step 3: Implementar `src/lib/fechas.ts`**

```ts
// México eliminó el horario de verano en 2022: la hora de la escuela es
// siempre UTC-6. Se usa para "hoy" y para rangos de timestamptz por día,
// en vez de la fecha UTC del servidor.
export const ZONA_ESCUELA = "America/Mexico_City";
const OFFSET_ESCUELA = "-06:00";

export function fechaHoyMexico(ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA_ESCUELA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(ahora);
}

export function esFechaISO(valor: unknown): valor is string {
  if (typeof valor !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    return false;
  }
  const fecha = new Date(`${valor}T00:00:00Z`);
  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === valor;
}

export function sumarDias(fechaISO: string, dias: number): string {
  const fecha = new Date(`${fechaISO}T00:00:00Z`);
  fecha.setUTCDate(fecha.getUTCDate() + dias);
  return fecha.toISOString().slice(0, 10);
}

export function inicioDelDiaEscuela(fechaISO: string): string {
  return `${fechaISO}T00:00:00${OFFSET_ESCUELA}`;
}

export function formatearFechaHora(iso: string): string {
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: ZONA_ESCUELA,
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(iso));
}

export function formatearFecha(fechaISO: string): string {
  const [anio, mes, dia] = fechaISO.split("-");
  return `${dia}/${mes}/${anio}`;
}
```

- [ ] **Step 4: Implementar `src/lib/pagos/catalogos.ts`**

```ts
import type { Rol } from "@/lib/roles";

export const ROLES_PAGOS: Rol[] = ["super_admin", "direccion", "caja"];

export const METODOS_PAGO = ["efectivo", "transferencia", "tarjeta"] as const;
export type MetodoPago = (typeof METODOS_PAGO)[number];

export const ETIQUETAS_METODO: Record<MetodoPago, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  tarjeta: "Tarjeta",
};

// Fuente única de los estatus que calcula la vista v_cargos_saldo.
export const ESTATUS_CARGO = ["pendiente", "parcial", "pagado", "vencido", "cancelado"] as const;
export type EstatusCargo = (typeof ESTATUS_CARGO)[number];

export const ETIQUETAS_ESTATUS: Record<EstatusCargo, string> = {
  pendiente: "Pendiente",
  parcial: "Parcial",
  pagado: "Pagado",
  vencido: "Vencido",
  cancelado: "Cancelado",
};

export const CLASES_ESTATUS: Record<EstatusCargo, string> = {
  pendiente: "bg-zinc-100 text-zinc-700",
  parcial: "bg-yellow-100 text-yellow-800",
  pagado: "bg-green-100 text-green-800",
  vencido: "bg-red-100 text-red-800",
  cancelado: "bg-zinc-100 text-zinc-400 line-through",
};
```

- [ ] **Step 5: Implementar `src/lib/pagos/calculos.ts`**

```ts
import { METODOS_PAGO, type MetodoPago } from "./catalogos";

// Suma en centavos enteros para evitar errores de punto flotante.
export function sumarMontos(montos: number[]): number {
  return montos.reduce((total, monto) => total + Math.round(monto * 100), 0) / 100;
}

export function formatearMoneda(monto: number): string {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(monto);
}

export function nombreCompletoAlumno(alumno: {
  nombres: string;
  apellido_paterno: string | null;
  apellido_materno: string | null;
}): string {
  const apellidos = [alumno.apellido_paterno, alumno.apellido_materno].filter(Boolean).join(" ");
  return apellidos ? `${apellidos}, ${alumno.nombres}` : alumno.nombres;
}

export function normalizarTexto(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export interface PagoCorte {
  montoTotal: number;
  metodo: MetodoPago;
  registradoPor: string;
  anulado: boolean;
}

export function resumirCorte(pagos: PagoCorte[]) {
  const vigentes = pagos.filter((pago) => !pago.anulado);
  const totalDe = (lista: PagoCorte[]) => sumarMontos(lista.map((pago) => pago.montoTotal));

  const porMetodo = Object.fromEntries(
    METODOS_PAGO.map((metodo) => [metodo, totalDe(vigentes.filter((p) => p.metodo === metodo))])
  ) as Record<MetodoPago, number>;

  const usuarios = [...new Set(vigentes.map((pago) => pago.registradoPor))].sort((a, b) =>
    a.localeCompare(b, "es")
  );

  return {
    total: totalDe(vigentes),
    cantidad: vigentes.length,
    anulados: pagos.length - vigentes.length,
    porMetodo,
    porUsuario: usuarios.map((nombre) => ({
      nombre,
      total: totalDe(vigentes.filter((p) => p.registradoPor === nombre)),
    })),
  };
}
```

- [ ] **Step 6: Implementar `src/lib/pagos/schema.ts`**

```ts
import { z } from "zod";
import { esFechaISO } from "@/lib/fechas";
import { METODOS_PAGO } from "./catalogos";

const PATRON_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function esUuid(valor: unknown): valor is string {
  return typeof valor === "string" && PATRON_UUID.test(valor);
}

const idSchema = z.string().trim().regex(PATRON_UUID, "Identificador inválido");

const tieneMaximoDosDecimales = (n: number) => Math.abs(Math.round(n * 100) - n * 100) < 1e-6;

const montoPositivoSchema = z.coerce
  .number({ error: "Monto inválido" })
  .positive("El monto debe ser mayor a 0")
  .max(99_999_999.99, "Monto demasiado grande")
  .refine(tieneMaximoDosDecimales, "Máximo 2 decimales");

const montoNoNegativoSchema = z.coerce
  .number({ error: "Monto inválido" })
  .min(0, "El monto no puede ser negativo")
  .max(99_999_999.99, "Monto demasiado grande")
  .refine(tieneMaximoDosDecimales, "Máximo 2 decimales");

const textoOpcionalANull = z
  .string()
  .trim()
  .optional()
  .transform((valor) => (valor ? valor : null));

export const registrarPagoSchema = z.object({
  alumnoId: idSchema,
  metodo: z.enum(METODOS_PAGO, { error: "Elige un método de pago" }),
  referencia: z
    .string()
    .trim()
    .max(100, "Referencia demasiado larga")
    .optional()
    .transform((valor) => (valor ? valor : null)),
  aplicaciones: z
    .array(z.object({ cargoId: idSchema, monto: montoPositivoSchema }))
    .min(1, "Selecciona al menos un cargo")
    .refine(
      (aplicaciones) => new Set(aplicaciones.map((a) => a.cargoId)).size === aplicaciones.length,
      "Un cargo aparece dos veces"
    ),
});

export const agregarCargoSchema = z.object({
  conceptoId: idSchema,
  descripcion: z.string().trim().min(1, "La descripción es requerida").max(120),
  monto: montoPositivoSchema,
  fechaVencimiento: textoOpcionalANull.refine(
    (valor) => valor === null || esFechaISO(valor),
    "Fecha inválida"
  ),
});

export const planBecaSchema = z.object({
  planPagoId: textoOpcionalANull.refine((valor) => valor === null || esUuid(valor), "Plan inválido"),
  becaPorcentaje: z.coerce
    .number({ error: "Beca inválida" })
    .min(0, "La beca va de 0 a 100")
    .max(100, "La beca va de 0 a 100")
    .refine(tieneMaximoDosDecimales, "Máximo 2 decimales"),
});

export const motivoSchema = z.object({
  motivo: z.string().trim().min(3, "Escribe el motivo (mínimo 3 caracteres)").max(300),
});

export const precioSchema = z.object({
  planPagoId: idSchema,
  nivelId: idSchema,
  montoMensual: montoNoNegativoSchema,
});

export const planPagoSchema = z.object({
  primerMes: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Mes inválido"),
  diaVencimiento: z.coerce.number().int().min(1).max(28),
});

export const conceptoSchema = z.object({
  nombre: z.string().trim().min(1, "El nombre es requerido").max(60),
  montoDefault: textoOpcionalANull
    .transform((valor) => (valor === null ? null : Number(valor)))
    .refine(
      (valor) =>
        valor === null || (Number.isFinite(valor) && valor >= 0 && tieneMaximoDosDecimales(valor)),
      "Monto inválido"
    ),
  aplicaBeca: z.boolean(),
});
```

- [ ] **Step 7: Implementar `src/lib/pagos/errores.ts`**

```ts
export const MENSAJES_ERROR_PAGOS: Record<string, string> = {
  validacion: "Revisa los datos capturados.",
  sin_permiso: "No tienes permiso para esta acción.",
  sin_ciclo: "No hay un ciclo escolar activo.",
  sin_inscripcion: "El alumno no está inscrito en el ciclo activo.",
  sin_concepto_colegiatura: "No hay un concepto de Colegiatura configurado.",
  sin_aplicaciones: "Selecciona al menos un cargo a pagar.",
  cargo_repetido: "Un cargo aparece dos veces en el pago.",
  metodo_invalido: "Elige un método de pago válido.",
  cargo_invalido: "Uno de los cargos no pertenece a este alumno.",
  cargo_cancelado: "Uno de los cargos está cancelado.",
  monto_invalido: "Los montos deben ser mayores a 0.",
  monto_excede_saldo:
    "El monto de un cargo supera su saldo pendiente (quizá alguien acaba de registrar otro pago). Revisa los saldos e intenta de nuevo.",
  motivo_requerido: "Escribe el motivo.",
  ya_anulado: "Este pago ya estaba anulado.",
  pago_no_encontrado: "No se encontró el pago.",
  ya_cancelado: "Este cargo ya estaba cancelado.",
  cargo_no_encontrado: "No se encontró el cargo.",
  cargo_con_pagos: "Este cargo tiene pagos vigentes. Anula primero el pago desde su recibo.",
  concepto_colegiatura: "Las colegiaturas se crean con \"Generar colegiaturas\", no a mano.",
  solo_plan_beca: "Caja solo puede cambiar el plan de pagos y la beca.",
  plan_otro_ciclo: "El plan elegido no pertenece al ciclo de esta inscripción.",
  duplicado: "Ya existe un registro con esos datos.",
  desconocido: "No se pudo guardar. Intenta de nuevo.",
};

export function codigoDeError(
  error: { hint?: string | null; code?: string | null } | null | undefined
): string {
  if (!error) {
    return "desconocido";
  }
  if (error.hint && Object.hasOwn(MENSAJES_ERROR_PAGOS, error.hint)) {
    return error.hint;
  }
  if (error.code === "23505") {
    return "duplicado";
  }
  return "desconocido";
}

export function mensajeDeError(codigo: string | undefined): string | null {
  if (!codigo) {
    return null;
  }
  return Object.hasOwn(MENSAJES_ERROR_PAGOS, codigo)
    ? MENSAJES_ERROR_PAGOS[codigo]
    : MENSAJES_ERROR_PAGOS.desconocido;
}
```

- [ ] **Step 8: Restringir "Pagos" en el menú**

En `src/lib/nav.ts`, reemplazar la línea:
```ts
  { label: "Pagos", href: "/pagos" },
```
por:
```ts
  { label: "Pagos", href: "/pagos", rolesPermitidos: ["super_admin", "direccion", "caja"] },
```

En `src/lib/nav.test.ts`:
- Dentro del primer test (`has the 6 modules in order...`), agregar antes del `expect` de `/materias`:
```ts
    expect(NAV_ITEMS.find((item) => item.href === "/pagos")?.rolesPermitidos).toEqual([
      "super_admin",
      "direccion",
      "caja",
    ]);
```
- En `includes items with no rolesPermitidos regardless of rol`, cambiar el esperado a:
```ts
    expect(hrefs).toEqual(["/alumnos", "/asistencia"]);
```
- En `excludes materias y usuarios for docente, but includes calificaciones`, agregar:
```ts
    expect(hrefs).not.toContain("/pagos");
```
- Agregar un test nuevo dentro de `describe("navItemsVisibles")`:
```ts
  it("includes pagos for caja", () => {
    const hrefs = navItemsVisibles("caja").map((item) => item.href);
    expect(hrefs).toContain("/pagos");
  });
```

- [ ] **Step 9: Correr los tests**

Run: `npm test`
Expected: PASS en todos los archivos (los nuevos y los existentes).

- [ ] **Step 10: Commit**

```bash
git add src/lib/fechas.ts src/lib/fechas.test.ts src/lib/pagos src/lib/nav.ts src/lib/nav.test.ts
git commit -m "feat: utilidades de Pagos (fechas México, montos, schemas, errores) y menú por rol"
```

---

### Task 4: Consultas compartidas, submenú y ocultar navegación al imprimir

**Files:**
- Create: `src/lib/pagos/consultas.ts`
- Create: `src/components/pagos/PagosNav.tsx`
- Create: `src/app/(dashboard)/pagos/layout.tsx`
- Modify: `src/components/layout/Sidebar.tsx`, `src/components/layout/Topbar.tsx`

**Interfaces:**
- Consumes: `catalogos.ts`, `calculos.ts` (Task 3); vistas y FK `pagos_registrado_por_fkey` (Task 1).
- Produces (en `consultas.ts`):
  - `primero<T>(valor: T | T[] | null | undefined): T | null`
  - `interface CargoConSaldo { id; conceptoPagoId; periodo: string | null; descripcion; montoOriginal: number; becaPorcentaje: number; monto: number; pagado: number; saldo: number; estatus: EstatusCargo; fechaVencimiento: string | null; motivoCancelacion: string | null }`
  - `obtenerCargosDeAlumno(alumnoId: string, cicloId: string): Promise<CargoConSaldo[]>`
  - `interface PagoResumen { id; folio: number; montoTotal: number; fechaPago: string; metodo: MetodoPago; referencia: string | null; registradoPor: string; anulado: boolean; motivoAnulacion: string | null }`
  - `obtenerPagosDeAlumno(alumnoId: string): Promise<PagoResumen[]>`
  - `interface ContextoAlumno { alumnoId; nombre; matricula: string | null; activo: boolean; inscripcion: { id; planPagoId: string | null; becaPorcentaje: number; grupo: string } | null }`
  - `obtenerContextoAlumno(alumnoId: string, cicloId: string): Promise<ContextoAlumno | null>`
  - `interface PagoRecibo { ... }` y `obtenerPagoParaRecibo(pagoId: string): Promise<PagoRecibo | null>`
  - `interface Estructura { niveles: {id; nombre}[]; grados: {id; nombre; nivelId}[]; grupos: {id; etiqueta; gradoId; nivelId}[] }` y `obtenerEstructura(cicloId: string): Promise<Estructura>`
  - `interface AlumnoConAdeudo { alumnoId; nombre; activo: boolean; grupoId; grupo; gradoId; nivelId; adeudoTotal: number; adeudoVencido: number; vencimientoMasAntiguo: string | null }` y `obtenerAlumnosConAdeudo(cicloId: string, estructura: Estructura): Promise<AlumnoConAdeudo[]>`

- [ ] **Step 1: Implementar `src/lib/pagos/consultas.ts`**

```ts
import { createClient } from "@/lib/supabase/server";
import { nombreCompletoAlumno } from "./calculos";
import type { EstatusCargo, MetodoPago } from "./catalogos";

// Supabase puede tipar un embed de relación a-uno como objeto o como
// arreglo; con RLS además puede venir null. Normaliza a un solo valor.
export function primero<T>(valor: T | T[] | null | undefined): T | null {
  if (Array.isArray(valor)) {
    return valor[0] ?? null;
  }
  return valor ?? null;
}

export interface CargoConSaldo {
  id: string;
  conceptoPagoId: string;
  periodo: string | null;
  descripcion: string;
  montoOriginal: number;
  becaPorcentaje: number;
  monto: number;
  pagado: number;
  saldo: number;
  estatus: EstatusCargo;
  fechaVencimiento: string | null;
  motivoCancelacion: string | null;
}

export async function obtenerCargosDeAlumno(
  alumnoId: string,
  cicloId: string
): Promise<CargoConSaldo[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("v_cargos_saldo")
    .select(
      "id, concepto_pago_id, periodo, descripcion, monto_original, beca_porcentaje, monto, pagado, saldo, estatus, fecha_vencimiento, motivo_cancelacion"
    )
    .eq("alumno_id", alumnoId)
    .eq("ciclo_escolar_id", cicloId)
    .order("fecha_vencimiento", { ascending: true, nullsFirst: false })
    .order("creado_en", { ascending: true });

  if (error) {
    throw new Error(`No se pudieron cargar los cargos: ${error.message}`);
  }

  return (data ?? []).map((cargo) => ({
    id: cargo.id,
    conceptoPagoId: cargo.concepto_pago_id,
    periodo: cargo.periodo,
    descripcion: cargo.descripcion,
    montoOriginal: Number(cargo.monto_original),
    becaPorcentaje: Number(cargo.beca_porcentaje),
    monto: Number(cargo.monto),
    pagado: Number(cargo.pagado),
    saldo: Number(cargo.saldo),
    estatus: cargo.estatus as EstatusCargo,
    fechaVencimiento: cargo.fecha_vencimiento,
    motivoCancelacion: cargo.motivo_cancelacion,
  }));
}

export interface PagoResumen {
  id: string;
  folio: number;
  montoTotal: number;
  fechaPago: string;
  metodo: MetodoPago;
  referencia: string | null;
  registradoPor: string;
  anulado: boolean;
  motivoAnulacion: string | null;
}

export async function obtenerPagosDeAlumno(alumnoId: string): Promise<PagoResumen[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("pagos")
    .select(
      "id, folio, monto_total, fecha_pago, metodo_pago, referencia, anulado_en, motivo_anulacion, registrado:perfiles!pagos_registrado_por_fkey(nombre_completo)"
    )
    .eq("alumno_id", alumnoId)
    .order("fecha_pago", { ascending: false });

  if (error) {
    throw new Error(`No se pudieron cargar los pagos: ${error.message}`);
  }

  return (data ?? []).map((pago) => ({
    id: pago.id,
    folio: Number(pago.folio),
    montoTotal: Number(pago.monto_total),
    fechaPago: pago.fecha_pago,
    metodo: pago.metodo_pago as MetodoPago,
    referencia: pago.referencia,
    registradoPor: primero(pago.registrado)?.nombre_completo ?? "—",
    anulado: pago.anulado_en !== null,
    motivoAnulacion: pago.motivo_anulacion,
  }));
}

export interface ContextoAlumno {
  alumnoId: string;
  nombre: string;
  matricula: string | null;
  activo: boolean;
  inscripcion: {
    id: string;
    planPagoId: string | null;
    becaPorcentaje: number;
    grupo: string;
  } | null;
}

export async function obtenerContextoAlumno(
  alumnoId: string,
  cicloId: string
): Promise<ContextoAlumno | null> {
  const supabase = await createClient();

  const { data: alumno, error: errorAlumno } = await supabase
    .from("alumnos")
    .select("id, nombres, apellido_paterno, apellido_materno, matricula, activo")
    .eq("id", alumnoId)
    .maybeSingle();

  if (errorAlumno) {
    throw new Error(`No se pudo cargar el alumno: ${errorAlumno.message}`);
  }
  if (!alumno) {
    return null;
  }

  const { data: inscripcion, error: errorInscripcion } = await supabase
    .from("inscripciones")
    .select("id, plan_pago_id, beca_porcentaje, grupos(nombre, grados(nombre))")
    .eq("alumno_id", alumnoId)
    .eq("ciclo_escolar_id", cicloId)
    .limit(1)
    .maybeSingle();

  if (errorInscripcion) {
    throw new Error(`No se pudo cargar la inscripción: ${errorInscripcion.message}`);
  }

  const grupo = primero(inscripcion?.grupos);
  const grado = primero(grupo?.grados);

  return {
    alumnoId: alumno.id,
    nombre: nombreCompletoAlumno(alumno),
    matricula: alumno.matricula,
    activo: alumno.activo,
    inscripcion: inscripcion
      ? {
          id: inscripcion.id,
          planPagoId: inscripcion.plan_pago_id,
          becaPorcentaje: Number(inscripcion.beca_porcentaje),
          grupo: grupo ? `${grado?.nombre ?? ""} · Grupo ${grupo.nombre}`.trim() : "—",
        }
      : null,
  };
}

export interface LineaRecibo {
  descripcion: string;
  montoOriginal: number;
  becaPorcentaje: number;
  monto: number;
  aplicado: number;
}

export interface PagoRecibo {
  id: string;
  folio: number;
  fechaPago: string;
  metodo: MetodoPago;
  referencia: string | null;
  montoTotal: number;
  registradoPor: string;
  anulado: boolean;
  motivoAnulacion: string | null;
  alumnoId: string;
  alumnoNombre: string;
  matricula: string | null;
  grupo: string | null;
  lineas: LineaRecibo[];
}

export async function obtenerPagoParaRecibo(pagoId: string): Promise<PagoRecibo | null> {
  const supabase = await createClient();

  const { data: pago, error } = await supabase
    .from("pagos")
    .select(
      "id, folio, fecha_pago, metodo_pago, referencia, monto_total, anulado_en, motivo_anulacion, alumno_id, alumnos(nombres, apellido_paterno, apellido_materno, matricula), registrado:perfiles!pagos_registrado_por_fkey(nombre_completo), pago_aplicaciones(monto_aplicado, cargos(descripcion, monto_original, beca_porcentaje, monto, ciclo_escolar_id, fecha_vencimiento))"
    )
    .eq("id", pagoId)
    .maybeSingle();

  if (error) {
    throw new Error(`No se pudo cargar el pago: ${error.message}`);
  }
  if (!pago) {
    return null;
  }

  const alumno = primero(pago.alumnos);
  const aplicaciones = (pago.pago_aplicaciones ?? [])
    .map((aplicacion) => ({ aplicado: Number(aplicacion.monto_aplicado), cargo: primero(aplicacion.cargos) }))
    .filter((a): a is typeof a & { cargo: NonNullable<typeof a.cargo> } => a.cargo !== null)
    .sort((a, b) => (a.cargo.fecha_vencimiento ?? "").localeCompare(b.cargo.fecha_vencimiento ?? ""));

  let grupo: string | null = null;
  const cicloId = aplicaciones[0]?.cargo.ciclo_escolar_id;
  if (cicloId) {
    const { data: inscripcion } = await supabase
      .from("inscripciones")
      .select("grupos(nombre, grados(nombre))")
      .eq("alumno_id", pago.alumno_id)
      .eq("ciclo_escolar_id", cicloId)
      .limit(1)
      .maybeSingle();
    const g = primero(inscripcion?.grupos);
    grupo = g ? `${primero(g.grados)?.nombre ?? ""} · Grupo ${g.nombre}`.trim() : null;
  }

  return {
    id: pago.id,
    folio: Number(pago.folio),
    fechaPago: pago.fecha_pago,
    metodo: pago.metodo_pago as MetodoPago,
    referencia: pago.referencia,
    montoTotal: Number(pago.monto_total),
    registradoPor: primero(pago.registrado)?.nombre_completo ?? "—",
    anulado: pago.anulado_en !== null,
    motivoAnulacion: pago.motivo_anulacion,
    alumnoId: pago.alumno_id,
    alumnoNombre: alumno ? nombreCompletoAlumno(alumno) : "—",
    matricula: alumno?.matricula ?? null,
    grupo,
    lineas: aplicaciones.map(({ aplicado, cargo }) => ({
      descripcion: cargo.descripcion,
      montoOriginal: Number(cargo.monto_original),
      becaPorcentaje: Number(cargo.beca_porcentaje),
      monto: Number(cargo.monto),
      aplicado,
    })),
  };
}

export interface Estructura {
  niveles: { id: string; nombre: string }[];
  grados: { id: string; nombre: string; nivelId: string }[];
  grupos: { id: string; etiqueta: string; gradoId: string; nivelId: string }[];
}

export async function obtenerEstructura(cicloId: string): Promise<Estructura> {
  const supabase = await createClient();

  const [nivelesRes, gradosRes, gruposRes] = await Promise.all([
    supabase.from("niveles").select("id, nombre").order("orden"),
    supabase.from("grados").select("id, nombre, nivel_id").order("orden"),
    supabase.from("grupos").select("id, nombre, grado_id").eq("ciclo_escolar_id", cicloId).order("nombre"),
  ]);

  for (const resultado of [nivelesRes, gradosRes, gruposRes]) {
    if (resultado.error) {
      throw new Error(`No se pudo cargar la estructura escolar: ${resultado.error.message}`);
    }
  }

  const niveles = nivelesRes.data ?? [];
  const ordenNivel = new Map(niveles.map((nivel, indice) => [nivel.id, indice]));
  const grados = (gradosRes.data ?? []).map((grado) => ({
    id: grado.id,
    nombre: grado.nombre,
    nivelId: grado.nivel_id,
  }));
  const gradoPorId = new Map(grados.map((grado, indice) => [grado.id, { ...grado, indice }]));

  const grupos = (gruposRes.data ?? [])
    .flatMap((grupo) => {
      const grado = gradoPorId.get(grupo.grado_id);
      return grado
        ? [{
            id: grupo.id,
            etiqueta: `${grado.nombre} · Grupo ${grupo.nombre}`,
            gradoId: grado.id,
            nivelId: grado.nivelId,
            orden: [ordenNivel.get(grado.nivelId) ?? 0, grado.indice] as const,
          }]
        : [];
    })
    .sort((a, b) => a.orden[0] - b.orden[0] || a.orden[1] - b.orden[1] || a.etiqueta.localeCompare(b.etiqueta, "es"))
    .map(({ orden: _orden, ...grupo }) => grupo);

  return { niveles, grados, grupos };
}

export interface AlumnoConAdeudo {
  alumnoId: string;
  nombre: string;
  activo: boolean;
  grupoId: string;
  grupo: string;
  gradoId: string;
  nivelId: string;
  adeudoTotal: number;
  adeudoVencido: number;
  vencimientoMasAntiguo: string | null;
}

export async function obtenerAlumnosConAdeudo(
  cicloId: string,
  estructura: Estructura
): Promise<AlumnoConAdeudo[]> {
  const supabase = await createClient();

  const [inscripcionesRes, adeudosRes] = await Promise.all([
    supabase
      .from("inscripciones")
      .select("grupo_id, alumnos(id, nombres, apellido_paterno, apellido_materno, activo)")
      .eq("ciclo_escolar_id", cicloId),
    supabase
      .from("v_adeudos_alumno")
      .select("alumno_id, adeudo_total, adeudo_vencido, vencimiento_mas_antiguo")
      .eq("ciclo_escolar_id", cicloId),
  ]);

  if (inscripcionesRes.error) {
    throw new Error(`No se pudieron cargar los alumnos: ${inscripcionesRes.error.message}`);
  }
  if (adeudosRes.error) {
    throw new Error(`No se pudieron cargar los adeudos: ${adeudosRes.error.message}`);
  }

  const grupoPorId = new Map(estructura.grupos.map((grupo) => [grupo.id, grupo]));
  const adeudoPorAlumno = new Map((adeudosRes.data ?? []).map((a) => [a.alumno_id, a]));

  return (inscripcionesRes.data ?? [])
    .flatMap((inscripcion) => {
      const alumno = primero(inscripcion.alumnos);
      const grupo = grupoPorId.get(inscripcion.grupo_id);
      if (!alumno || !grupo) {
        return [];
      }
      const adeudo = adeudoPorAlumno.get(alumno.id);
      return [{
        alumnoId: alumno.id,
        nombre: nombreCompletoAlumno(alumno),
        activo: alumno.activo,
        grupoId: grupo.id,
        grupo: grupo.etiqueta,
        gradoId: grupo.gradoId,
        nivelId: grupo.nivelId,
        adeudoTotal: Number(adeudo?.adeudo_total ?? 0),
        adeudoVencido: Number(adeudo?.adeudo_vencido ?? 0),
        vencimientoMasAntiguo: adeudo?.vencimiento_mas_antiguo ?? null,
      }];
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}
```

- [ ] **Step 2: Implementar el submenú `src/components/pagos/PagosNav.tsx`**

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isNavItemActive } from "@/lib/nav";

const ITEMS = [
  { label: "Alumnos", href: "/pagos" },
  { label: "Adeudos", href: "/pagos/adeudos" },
  { label: "Corte de caja", href: "/pagos/corte" },
  { label: "Configuración", href: "/pagos/configuracion" },
];

function estaActivo(pathname: string, href: string): boolean {
  if (href === "/pagos") {
    // "Alumnos" cubre la búsqueda, el estado de cuenta y los recibos.
    return (
      pathname === "/pagos" ||
      pathname.startsWith("/pagos/alumno/") ||
      pathname.startsWith("/pagos/recibo/")
    );
  }
  return isNavItemActive(pathname, href);
}

export function PagosNav() {
  const pathname = usePathname();

  return (
    <nav className="mb-6 flex gap-1 border-b border-zinc-200 print:hidden" aria-label="Secciones de Pagos">
      {ITEMS.map((item) => {
        const activo = estaActivo(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={activo ? "page" : undefined}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
              activo
                ? "border-primario text-zinc-900"
                : "border-transparent text-zinc-600 hover:text-zinc-900"
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

- [ ] **Step 3: Crear el layout `src/app/(dashboard)/pagos/layout.tsx`**

```tsx
import type { ReactNode } from "react";
import { requerirRolPagina } from "@/lib/perfiles/requerirRolPagina";
import { ROLES_PAGOS } from "@/lib/pagos/catalogos";
import { PagosNav } from "@/components/pagos/PagosNav";

export default async function PagosLayout({ children }: { children: ReactNode }) {
  await requerirRolPagina(ROLES_PAGOS);

  return (
    <div>
      <PagosNav />
      {children}
    </div>
  );
}
```

- [ ] **Step 4: Ocultar la navegación general al imprimir**

En `src/components/layout/Sidebar.tsx`, en el `className` del `<nav>`, agregar `print:hidden`:
```tsx
      className="flex w-56 shrink-0 flex-col gap-1 border-r border-black/10 bg-white p-4 print:hidden"
```
En `src/components/layout/Topbar.tsx`, en el `className` del `<header>`, agregar `print:hidden`:
```tsx
    <header className="flex h-16 shrink-0 items-center gap-3 border-b border-black/10 bg-white px-6 print:hidden">
```

- [ ] **Step 5: Verificar tipos y build**

Run: `npx tsc --noEmit`
Expected: sin errores. Si Supabase tipa algún embed de forma distinta a la asumida (objeto vs. arreglo), resolverlo **con `primero()`**, nunca con `as any`.

Run: `npm run build`
Expected: build exitoso.

- [ ] **Step 6: Commit**

```bash
git add src/lib/pagos/consultas.ts src/components/pagos/PagosNav.tsx "src/app/(dashboard)/pagos/layout.tsx" src/components/layout/Sidebar.tsx src/components/layout/Topbar.tsx
git commit -m "feat: consultas compartidas y submenú de Pagos"
```

---

### Task 5: Configuración (planes, precios, conceptos, generar colegiaturas)

**Files:**
- Create: `src/app/(dashboard)/pagos/configuracion/actions.ts`
- Create: `src/app/(dashboard)/pagos/configuracion/page.tsx`

**Interfaces:**
- Consumes: `planPagoSchema`, `precioSchema`, `conceptoSchema`, `esUuid` (Task 3); `codigoDeError`, `mensajeDeError`; `ROLES_PAGOS`; `obtenerEstructura`, `primero` (Task 4); rpc `generar_colegiaturas` (Task 2).
- Produces: Server Actions `actualizarPlan(planId, formData)`, `guardarPrecios(formData)`, `crearConcepto(formData)`, `actualizarConcepto(conceptoId, formData)`, `generarColegiaturas(formData)`.

- [ ] **Step 1: Implementar `actions.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requerirRol } from "@/lib/perfiles/requerirRol";
import { obtenerCicloActivoId } from "@/lib/ciclos/activo";
import { ROLES_PAGOS } from "@/lib/pagos/catalogos";
import { codigoDeError } from "@/lib/pagos/errores";
import { conceptoSchema, esUuid, planPagoSchema, precioSchema } from "@/lib/pagos/schema";

const RUTA = "/pagos/configuracion";

export async function actualizarPlan(planId: string, formData: FormData) {
  await requerirRol(ROLES_PAGOS);

  const resultado = planPagoSchema.safeParse({
    primerMes: formData.get("primerMes"),
    diaVencimiento: formData.get("diaVencimiento"),
  });
  if (!resultado.success || !esUuid(planId)) {
    redirect(`${RUTA}?error=validacion`);
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("planes_pago")
    .update({
      primer_mes: `${resultado.data.primerMes}-01`,
      dia_vencimiento: resultado.data.diaVencimiento,
    })
    .eq("id", planId);

  if (error) {
    redirect(`${RUTA}?error=${codigoDeError(error)}`);
  }

  revalidatePath(RUTA);
  redirect(`${RUTA}?ok=plan`);
}

// Campos del formulario: "precio:<planId>:<nivelId>". Vacío = sin precio.
export async function guardarPrecios(formData: FormData) {
  await requerirRol(ROLES_PAGOS);

  const aGuardar: { plan_pago_id: string; nivel_id: string; monto_mensual: number }[] = [];
  const aQuitar: { planPagoId: string; nivelId: string }[] = [];

  for (const [clave, valor] of formData.entries()) {
    if (!clave.startsWith("precio:")) {
      continue;
    }
    const [, planPagoId, nivelId] = clave.split(":");
    const texto = typeof valor === "string" ? valor.trim() : "";

    if (texto === "") {
      if (esUuid(planPagoId) && esUuid(nivelId)) {
        aQuitar.push({ planPagoId, nivelId });
      }
      continue;
    }

    const resultado = precioSchema.safeParse({ planPagoId, nivelId, montoMensual: texto });
    if (!resultado.success) {
      redirect(`${RUTA}?error=validacion`);
    }
    aGuardar.push({
      plan_pago_id: resultado.data.planPagoId,
      nivel_id: resultado.data.nivelId,
      monto_mensual: resultado.data.montoMensual,
    });
  }

  const supabase = await createClient();

  if (aGuardar.length > 0) {
    const { error } = await supabase
      .from("precios_colegiatura")
      .upsert(aGuardar, { onConflict: "plan_pago_id,nivel_id" });
    if (error) {
      redirect(`${RUTA}?error=${codigoDeError(error)}`);
    }
  }

  for (const { planPagoId, nivelId } of aQuitar) {
    const { error } = await supabase
      .from("precios_colegiatura")
      .delete()
      .eq("plan_pago_id", planPagoId)
      .eq("nivel_id", nivelId);
    if (error) {
      redirect(`${RUTA}?error=${codigoDeError(error)}`);
    }
  }

  revalidatePath(RUTA);
  redirect(`${RUTA}?ok=precios`);
}

export async function crearConcepto(formData: FormData) {
  await requerirRol(ROLES_PAGOS);

  const resultado = conceptoSchema.safeParse({
    nombre: formData.get("nombre"),
    montoDefault: formData.get("montoDefault") ?? undefined,
    aplicaBeca: formData.get("aplicaBeca") === "on",
  });
  if (!resultado.success) {
    redirect(`${RUTA}?error=validacion`);
  }

  const supabase = await createClient();
  const { error } = await supabase.from("conceptos_pago").insert({
    nombre: resultado.data.nombre,
    monto_default: resultado.data.montoDefault,
    aplica_beca: resultado.data.aplicaBeca,
  });

  if (error) {
    redirect(`${RUTA}?error=${codigoDeError(error)}`);
  }

  revalidatePath(RUTA);
  redirect(`${RUTA}?ok=concepto`);
}

export async function actualizarConcepto(conceptoId: string, formData: FormData) {
  await requerirRol(ROLES_PAGOS);

  const resultado = conceptoSchema.safeParse({
    nombre: formData.get("nombre"),
    montoDefault: formData.get("montoDefault") ?? undefined,
    aplicaBeca: formData.get("aplicaBeca") === "on",
  });
  if (!resultado.success || !esUuid(conceptoId)) {
    redirect(`${RUTA}?error=validacion`);
  }

  const supabase = await createClient();
  const { data: actual, error: errorActual } = await supabase
    .from("conceptos_pago")
    .select("es_colegiatura")
    .eq("id", conceptoId)
    .maybeSingle();
  if (errorActual || !actual) {
    redirect(`${RUTA}?error=${codigoDeError(errorActual)}`);
  }

  // La colegiatura siempre aplica beca y no se puede desactivar: es la
  // que usa generar_colegiaturas.
  const esColegiatura = actual.es_colegiatura;
  const { error } = await supabase
    .from("conceptos_pago")
    .update({
      nombre: resultado.data.nombre,
      monto_default: resultado.data.montoDefault,
      aplica_beca: esColegiatura ? true : resultado.data.aplicaBeca,
      activo: esColegiatura ? true : formData.get("activo") === "on",
    })
    .eq("id", conceptoId);

  if (error) {
    redirect(`${RUTA}?error=${codigoDeError(error)}`);
  }

  revalidatePath(RUTA);
  redirect(`${RUTA}?ok=concepto`);
}

export async function generarColegiaturas(formData: FormData) {
  await requerirRol(ROLES_PAGOS);

  const grupoId = formData.get("grupoId");
  const grupo = typeof grupoId === "string" && grupoId !== "" ? grupoId : null;
  if (grupo !== null && !esUuid(grupo)) {
    redirect(`${RUTA}?error=validacion`);
  }

  const cicloId = await obtenerCicloActivoId();
  if (!cicloId) {
    redirect(`${RUTA}?error=sin_ciclo`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("generar_colegiaturas", {
    p_ciclo_id: cicloId,
    p_grupo_id: grupo,
  });

  if (error) {
    redirect(`${RUTA}?error=${codigoDeError(error)}`);
  }

  revalidatePath("/pagos", "layout");
  redirect(`${RUTA}?creados=${Number(data?.creados ?? 0)}`);
}
```

- [ ] **Step 2: Implementar `page.tsx`**

```tsx
import { createClient } from "@/lib/supabase/server";
import { requerirRolPagina } from "@/lib/perfiles/requerirRolPagina";
import { obtenerCicloActivoId } from "@/lib/ciclos/activo";
import { ROLES_PAGOS } from "@/lib/pagos/catalogos";
import { nombreCompletoAlumno } from "@/lib/pagos/calculos";
import { mensajeDeError } from "@/lib/pagos/errores";
import { obtenerEstructura, primero } from "@/lib/pagos/consultas";
import { BotonEnviar } from "@/components/ui/BotonEnviar";
import {
  actualizarConcepto,
  actualizarPlan,
  crearConcepto,
  generarColegiaturas,
  guardarPrecios,
} from "./actions";

export const dynamic = "force-dynamic";

const MENSAJES_OK: Record<string, string> = {
  plan: "✓ Plan actualizado.",
  precios: "✓ Precios guardados.",
  concepto: "✓ Concepto guardado.",
};

const CLASE_BOTON = "rounded-md bg-primario px-4 py-2 text-sm font-medium text-white hover:opacity-90";
const CLASE_INPUT = "rounded-md border border-zinc-300 px-2 py-1 text-sm";

interface Plan {
  id: string;
  mensualidades: number;
  primerMes: string;
  diaVencimiento: number;
  precios: Map<string, number>;
}

async function obtenerPlanes(cicloId: string): Promise<Plan[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("planes_pago")
    .select("id, mensualidades, primer_mes, dia_vencimiento, precios_colegiatura(nivel_id, monto_mensual)")
    .eq("ciclo_escolar_id", cicloId)
    .order("mensualidades");

  if (error) {
    throw new Error(`No se pudieron cargar los planes: ${error.message}`);
  }

  return (data ?? []).map((plan) => ({
    id: plan.id,
    mensualidades: plan.mensualidades,
    primerMes: String(plan.primer_mes).slice(0, 7),
    diaVencimiento: plan.dia_vencimiento,
    precios: new Map(
      (plan.precios_colegiatura ?? []).map((p) => [p.nivel_id, Number(p.monto_mensual)])
    ),
  }));
}

async function obtenerConceptos() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("conceptos_pago")
    .select("id, nombre, monto_default, aplica_beca, es_colegiatura, activo")
    .order("es_colegiatura", { ascending: false })
    .order("nombre");

  if (error) {
    throw new Error(`No se pudieron cargar los conceptos: ${error.message}`);
  }
  return data ?? [];
}

// Alumnos activos que "Generar colegiaturas" omitiría, calculado en vivo.
async function obtenerPendientesDeConfigurar(cicloId: string, planes: Plan[]) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inscripciones")
    .select(
      "plan_pago_id, alumnos(nombres, apellido_paterno, apellido_materno, activo), grupos(nombre, grados(nombre, nivel_id))"
    )
    .eq("ciclo_escolar_id", cicloId);

  if (error) {
    throw new Error(`No se pudieron revisar las inscripciones: ${error.message}`);
  }

  const planPorId = new Map(planes.map((plan) => [plan.id, plan]));

  return (data ?? [])
    .flatMap((inscripcion) => {
      const alumno = primero(inscripcion.alumnos);
      const grupo = primero(inscripcion.grupos);
      const grado = primero(grupo?.grados);
      if (!alumno || !alumno.activo || !grupo || !grado) {
        return [];
      }
      const etiqueta = `${grado.nombre} · Grupo ${grupo.nombre}`;
      const plan = inscripcion.plan_pago_id ? planPorId.get(inscripcion.plan_pago_id) : undefined;
      if (!plan) {
        return [{ nombre: nombreCompletoAlumno(alumno), grupo: etiqueta, motivo: "Sin plan" }];
      }
      if (!plan.precios.has(grado.nivel_id)) {
        return [{ nombre: nombreCompletoAlumno(alumno), grupo: etiqueta, motivo: `Sin precio (plan ${plan.mensualidades})` }];
      }
      return [];
    })
    .sort((a, b) => a.grupo.localeCompare(b.grupo, "es") || a.nombre.localeCompare(b.nombre, "es"));
}

export default async function ConfiguracionPagosPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string; creados?: string }>;
}) {
  await requerirRolPagina(ROLES_PAGOS);
  const { ok, error, creados } = await searchParams;

  const cicloId = await obtenerCicloActivoId();
  if (!cicloId) {
    return <p className="text-zinc-600">No hay un ciclo escolar activo.</p>;
  }

  const [planes, conceptos, estructura] = await Promise.all([
    obtenerPlanes(cicloId),
    obtenerConceptos(),
    obtenerEstructura(cicloId),
  ]);
  const pendientes = await obtenerPendientesDeConfigurar(cicloId, planes);
  const mensajeError = mensajeDeError(error);
  const creadosNumero = Number(creados);

  return (
    <div className="space-y-10">
      <h1 className="text-2xl font-semibold text-zinc-900">Configuración de pagos</h1>

      {ok && MENSAJES_OK[ok] && (
        <p className="rounded-md bg-green-50 px-4 py-2 text-sm font-medium text-green-800">{MENSAJES_OK[ok]}</p>
      )}
      {creados !== undefined && Number.isFinite(creadosNumero) && (
        <p className="rounded-md bg-green-50 px-4 py-2 text-sm font-medium text-green-800">
          ✓ Se generaron {creadosNumero} cargo{creadosNumero === 1 ? "" : "s"} de colegiatura.
        </p>
      )}
      {mensajeError && (
        <p className="rounded-md bg-red-50 px-4 py-2 text-sm font-medium text-red-800">{mensajeError}</p>
      )}

      <section>
        <h2 className="text-lg font-semibold text-zinc-900">Planes de pago del ciclo</h2>
        <div className="mt-3 space-y-3">
          {planes.map((plan) => (
            <form key={plan.id} action={actualizarPlan.bind(null, plan.id)} className="flex flex-wrap items-end gap-3">
              <span className="w-32 text-sm font-medium text-zinc-900">{plan.mensualidades} mensualidades</span>
              <label className="text-sm text-zinc-700">
                Primer mes
                <input type="month" name="primerMes" defaultValue={plan.primerMes} required className={`ml-2 ${CLASE_INPUT}`} />
              </label>
              <label className="text-sm text-zinc-700">
                Día de vencimiento
                <input type="number" name="diaVencimiento" min={1} max={28} defaultValue={plan.diaVencimiento} required className={`ml-2 w-20 ${CLASE_INPUT}`} />
              </label>
              <BotonEnviar textoEnviando="Guardando..." className={CLASE_BOTON}>Guardar</BotonEnviar>
            </form>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-zinc-900">Precio de colegiatura mensual por nivel</h2>
        <p className="text-sm text-zinc-600">Deja vacío un nivel si ese plan no aplica.</p>
        <form action={guardarPrecios} className="mt-3">
          <table className="text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-zinc-500">
                <th className="py-2 pr-6">Nivel</th>
                {planes.map((plan) => (
                  <th key={plan.id} className="py-2 pr-6">Plan {plan.mensualidades}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {estructura.niveles.map((nivel) => (
                <tr key={nivel.id} className="border-b border-zinc-100">
                  <td className="py-2 pr-6 font-medium text-zinc-900">{nivel.nombre}</td>
                  {planes.map((plan) => (
                    <td key={plan.id} className="py-2 pr-6">
                      <input
                        type="number"
                        name={`precio:${plan.id}:${nivel.id}`}
                        min={0}
                        step="0.01"
                        defaultValue={plan.precios.get(nivel.id) ?? ""}
                        className={`w-32 ${CLASE_INPUT}`}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3">
            <BotonEnviar textoEnviando="Guardando..." className={CLASE_BOTON}>Guardar precios</BotonEnviar>
          </div>
        </form>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-zinc-900">Conceptos de cobro</h2>
        <div className="mt-3 space-y-2">
          {conceptos.map((concepto) => (
            <form key={concepto.id} action={actualizarConcepto.bind(null, concepto.id)} className="flex flex-wrap items-center gap-3">
              <input name="nombre" defaultValue={concepto.nombre} required className={`w-48 ${CLASE_INPUT}`} />
              <input
                name="montoDefault"
                type="number"
                min={0}
                step="0.01"
                placeholder="Monto sugerido"
                defaultValue={concepto.monto_default ?? ""}
                className={`w-36 ${CLASE_INPUT}`}
              />
              <label className="text-sm text-zinc-700">
                <input type="checkbox" name="aplicaBeca" defaultChecked={concepto.aplica_beca} disabled={concepto.es_colegiatura} /> Aplica beca
              </label>
              <label className="text-sm text-zinc-700">
                <input type="checkbox" name="activo" defaultChecked={concepto.activo} disabled={concepto.es_colegiatura} /> Activo
              </label>
              <BotonEnviar textoEnviando="Guardando..." className={CLASE_BOTON}>Guardar</BotonEnviar>
            </form>
          ))}
        </div>
        <form action={crearConcepto} className="mt-4 flex flex-wrap items-center gap-3">
          <input name="nombre" placeholder="Nuevo concepto (ej. Uniforme)" required className={`w-48 ${CLASE_INPUT}`} />
          <input name="montoDefault" type="number" min={0} step="0.01" placeholder="Monto sugerido" className={`w-36 ${CLASE_INPUT}`} />
          <label className="text-sm text-zinc-700">
            <input type="checkbox" name="aplicaBeca" /> Aplica beca
          </label>
          <BotonEnviar textoEnviando="Agregando..." className={CLASE_BOTON}>Agregar concepto</BotonEnviar>
        </form>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-zinc-900">Generar colegiaturas</h2>
        <p className="text-sm text-zinc-600">
          Crea las mensualidades del ciclo para cada alumno activo según su plan, el precio de su nivel y su beca.
          Se puede correr las veces que haga falta: nunca duplica un mes que ya existe.
        </p>
        <form action={generarColegiaturas} className="mt-3 flex flex-wrap items-end gap-3">
          <select name="grupoId" defaultValue="" className={CLASE_INPUT}>
            <option value="">Todo el ciclo</option>
            {estructura.grupos.map((grupo) => (
              <option key={grupo.id} value={grupo.id}>{grupo.etiqueta}</option>
            ))}
          </select>
          <BotonEnviar textoEnviando="Generando..." className={CLASE_BOTON}>Generar colegiaturas</BotonEnviar>
        </form>

        <h3 className="mt-6 text-sm font-semibold text-zinc-900">
          Alumnos que se omitirían ({pendientes.length})
        </h3>
        {pendientes.length === 0 ? (
          <p className="text-sm text-zinc-600">Todos los alumnos activos tienen plan y precio.</p>
        ) : (
          <table className="mt-2 text-sm">
            <tbody>
              {pendientes.map((p, i) => (
                <tr key={`${p.nombre}-${i}`} className="border-b border-zinc-100">
                  <td className="py-1 pr-6 text-zinc-900">{p.nombre}</td>
                  <td className="py-1 pr-6 text-zinc-600">{p.grupo}</td>
                  <td className="py-1 text-red-700">{p.motivo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: sin errores.

Verificación de datos (vía `execute_sql`) de que la página verá lo esperado: `select count(*) from planes_pago` = 2 y `select count(*) from conceptos_pago` = 3.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(dashboard)/pagos/configuracion"
git commit -m "feat: configuración de Pagos (planes, precios, conceptos, generar colegiaturas)"
```

---

### Task 6: Buscar alumno (`/pagos`)

**Files:**
- Modify (reemplazo completo): `src/app/(dashboard)/pagos/page.tsx`

**Interfaces:**
- Consumes: `obtenerEstructura`, `obtenerAlumnosConAdeudo` (Task 4); `normalizarTexto`, `formatearMoneda` (Task 3); `esUuid`.

- [ ] **Step 1: Reemplazar `page.tsx`**

```tsx
import Link from "next/link";
import { requerirRolPagina } from "@/lib/perfiles/requerirRolPagina";
import { obtenerCicloActivoId } from "@/lib/ciclos/activo";
import { ROLES_PAGOS } from "@/lib/pagos/catalogos";
import { formatearMoneda, normalizarTexto } from "@/lib/pagos/calculos";
import { esUuid } from "@/lib/pagos/schema";
import { obtenerAlumnosConAdeudo, obtenerEstructura } from "@/lib/pagos/consultas";

export const dynamic = "force-dynamic";

export default async function PagosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; grupo?: string }>;
}) {
  await requerirRolPagina(ROLES_PAGOS);
  const { q = "", grupo = "" } = await searchParams;

  const cicloId = await obtenerCicloActivoId();
  if (!cicloId) {
    return <p className="text-zinc-600">No hay un ciclo escolar activo.</p>;
  }

  const estructura = await obtenerEstructura(cicloId);
  const busqueda = normalizarTexto(q);
  const grupoId = esUuid(grupo) ? grupo : null;
  const hayFiltro = busqueda.length >= 2 || grupoId !== null;

  const alumnos = hayFiltro
    ? (await obtenerAlumnosConAdeudo(cicloId, estructura)).filter(
        (alumno) =>
          (grupoId === null || alumno.grupoId === grupoId) &&
          (busqueda.length < 2 || normalizarTexto(alumno.nombre).includes(busqueda))
      )
    : [];

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900">Pagos — Alumnos</h1>

      <form className="mt-4 flex flex-wrap items-end gap-3" action="/pagos">
        <input
          name="q"
          defaultValue={q}
          placeholder="Buscar por nombre o apellido"
          className="w-72 rounded-md border border-zinc-300 px-3 py-2 text-sm"
        />
        <select name="grupo" defaultValue={grupoId ?? ""} className="rounded-md border border-zinc-300 px-3 py-2 text-sm">
          <option value="">Todos los grupos</option>
          {estructura.grupos.map((g) => (
            <option key={g.id} value={g.id}>{g.etiqueta}</option>
          ))}
        </select>
        <button type="submit" className="rounded-md bg-primario px-4 py-2 text-sm font-medium text-white hover:opacity-90">
          Buscar
        </button>
      </form>

      {!hayFiltro && (
        <p className="mt-6 text-sm text-zinc-600">Escribe al menos 2 letras del nombre o elige un grupo.</p>
      )}
      {hayFiltro && alumnos.length === 0 && (
        <p className="mt-6 text-sm text-zinc-600">No se encontraron alumnos inscritos en el ciclo activo.</p>
      )}

      {alumnos.length > 0 && (
        <table className="mt-6 w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-zinc-500">
              <th className="py-2">Alumno</th>
              <th className="py-2">Grupo</th>
              <th className="py-2 text-right">Adeudo</th>
              <th className="py-2 text-right">Vencido</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {alumnos.map((alumno) => (
              <tr key={alumno.alumnoId} className="border-b border-zinc-100">
                <td className="py-2 text-zinc-900">
                  {alumno.nombre}
                  {!alumno.activo && <span className="ml-2 text-xs text-zinc-500">(baja)</span>}
                </td>
                <td className="py-2 text-zinc-600">{alumno.grupo}</td>
                <td className="py-2 text-right">{formatearMoneda(alumno.adeudoTotal)}</td>
                <td className={`py-2 text-right ${alumno.adeudoVencido > 0 ? "font-medium text-red-700" : "text-zinc-600"}`}>
                  {formatearMoneda(alumno.adeudoVencido)}
                </td>
                <td className="py-2 text-right">
                  <Link href={`/pagos/alumno/${alumno.alumnoId}`} className="font-medium text-primario hover:underline">
                    Estado de cuenta →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verificar**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(dashboard)/pagos/page.tsx"
git commit -m "feat: búsqueda de alumnos en Pagos"
```

---

### Task 7: Estado de cuenta (plan/beca, agregar cargo, cancelar cargo)

**Files:**
- Create: `src/app/(dashboard)/pagos/alumno/[alumnoId]/actions.ts`
- Create: `src/app/(dashboard)/pagos/alumno/[alumnoId]/page.tsx`

**Interfaces:**
- Consumes: `obtenerContextoAlumno`, `obtenerCargosDeAlumno`, `obtenerPagosDeAlumno` (Task 4); `planBecaSchema`, `agregarCargoSchema`, `motivoSchema`, `esUuid`; `codigoDeError`, `mensajeDeError`; `ETIQUETAS_ESTATUS`, `CLASES_ESTATUS`, `ETIQUETAS_METODO`; `sumarMontos`, `formatearMoneda`; `formatearFecha`, `formatearFechaHora`; rpc `cancelar_cargo`.
- Produces: Server Actions `actualizarPlanBeca(alumnoId, inscripcionId, formData)`, `agregarCargo(alumnoId, formData)`, `cancelarCargo(alumnoId, cargoId, formData)`. Enlaza a `/pagos/alumno/[alumnoId]/pago` (Task 8) y `/pagos/recibo/[pagoId]` (Task 9).

- [ ] **Step 1: Implementar `actions.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requerirRol } from "@/lib/perfiles/requerirRol";
import { obtenerCicloActivoId } from "@/lib/ciclos/activo";
import { ROLES_PAGOS } from "@/lib/pagos/catalogos";
import { codigoDeError } from "@/lib/pagos/errores";
import { agregarCargoSchema, esUuid, motivoSchema, planBecaSchema } from "@/lib/pagos/schema";

function ruta(alumnoId: string) {
  return `/pagos/alumno/${alumnoId}`;
}

export async function actualizarPlanBeca(alumnoId: string, inscripcionId: string, formData: FormData) {
  await requerirRol(ROLES_PAGOS);

  const resultado = planBecaSchema.safeParse({
    planPagoId: formData.get("planPagoId") ?? undefined,
    becaPorcentaje: formData.get("becaPorcentaje"),
  });
  if (!resultado.success || !esUuid(alumnoId) || !esUuid(inscripcionId)) {
    redirect(`${ruta(alumnoId)}?error=validacion`);
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("inscripciones")
    .update({
      plan_pago_id: resultado.data.planPagoId,
      beca_porcentaje: resultado.data.becaPorcentaje,
    })
    .eq("id", inscripcionId)
    .eq("alumno_id", alumnoId);

  if (error) {
    redirect(`${ruta(alumnoId)}?error=${codigoDeError(error)}`);
  }

  revalidatePath(ruta(alumnoId));
  redirect(`${ruta(alumnoId)}?ok=plan`);
}

export async function agregarCargo(alumnoId: string, formData: FormData) {
  const perfil = await requerirRol(ROLES_PAGOS);

  const resultado = agregarCargoSchema.safeParse({
    conceptoId: formData.get("conceptoId"),
    descripcion: formData.get("descripcion"),
    monto: formData.get("monto"),
    fechaVencimiento: formData.get("fechaVencimiento") ?? undefined,
  });
  if (!resultado.success || !esUuid(alumnoId)) {
    redirect(`${ruta(alumnoId)}?error=validacion`);
  }

  const cicloId = await obtenerCicloActivoId();
  if (!cicloId) {
    redirect(`${ruta(alumnoId)}?error=sin_ciclo`);
  }

  const supabase = await createClient();
  const { data: concepto } = await supabase
    .from("conceptos_pago")
    .select("es_colegiatura, activo")
    .eq("id", resultado.data.conceptoId)
    .maybeSingle();
  if (!concepto || !concepto.activo) {
    redirect(`${ruta(alumnoId)}?error=validacion`);
  }
  if (concepto.es_colegiatura) {
    redirect(`${ruta(alumnoId)}?error=concepto_colegiatura`);
  }

  // Los cargos sueltos nunca llevan beca (solo aplica a colegiaturas).
  const { error } = await supabase.from("cargos").insert({
    alumno_id: alumnoId,
    concepto_pago_id: resultado.data.conceptoId,
    ciclo_escolar_id: cicloId,
    descripcion: resultado.data.descripcion,
    monto_original: resultado.data.monto,
    beca_porcentaje: 0,
    monto: resultado.data.monto,
    fecha_vencimiento: resultado.data.fechaVencimiento,
    creado_por: perfil.id,
  });

  if (error) {
    redirect(`${ruta(alumnoId)}?error=${codigoDeError(error)}`);
  }

  revalidatePath(ruta(alumnoId));
  redirect(`${ruta(alumnoId)}?ok=cargo`);
}

export async function cancelarCargo(alumnoId: string, cargoId: string, formData: FormData) {
  await requerirRol(ROLES_PAGOS);

  const resultado = motivoSchema.safeParse({ motivo: formData.get("motivo") });
  if (!resultado.success || !esUuid(alumnoId) || !esUuid(cargoId)) {
    redirect(`${ruta(alumnoId)}?error=validacion`);
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("cancelar_cargo", {
    p_cargo_id: cargoId,
    p_motivo: resultado.data.motivo,
  });

  if (error) {
    redirect(`${ruta(alumnoId)}?error=${codigoDeError(error)}`);
  }

  revalidatePath(ruta(alumnoId));
  redirect(`${ruta(alumnoId)}?ok=cancelado`);
}
```

- [ ] **Step 2: Implementar `page.tsx`**

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requerirRolPagina } from "@/lib/perfiles/requerirRolPagina";
import { obtenerCicloActivoId } from "@/lib/ciclos/activo";
import { CLASES_ESTATUS, ETIQUETAS_ESTATUS, ETIQUETAS_METODO, ROLES_PAGOS } from "@/lib/pagos/catalogos";
import { formatearMoneda, sumarMontos } from "@/lib/pagos/calculos";
import { mensajeDeError } from "@/lib/pagos/errores";
import { esUuid } from "@/lib/pagos/schema";
import { formatearFecha, formatearFechaHora } from "@/lib/fechas";
import {
  obtenerCargosDeAlumno,
  obtenerContextoAlumno,
  obtenerPagosDeAlumno,
} from "@/lib/pagos/consultas";
import { BotonEnviar } from "@/components/ui/BotonEnviar";
import { actualizarPlanBeca, agregarCargo, cancelarCargo } from "./actions";

export const dynamic = "force-dynamic";

const MENSAJES_OK: Record<string, string> = {
  plan: "✓ Plan y beca actualizados. Los cargos ya generados no cambian; para corregirlos, cancélalos y vuelve a generar.",
  cargo: "✓ Cargo agregado.",
  cancelado: "✓ Cargo cancelado.",
};

const CLASE_BOTON = "rounded-md bg-primario px-4 py-2 text-sm font-medium text-white hover:opacity-90";
const CLASE_INPUT = "rounded-md border border-zinc-300 px-2 py-1 text-sm";

export default async function EstadoCuentaPage({
  params,
  searchParams,
}: {
  params: Promise<{ alumnoId: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  await requerirRolPagina(ROLES_PAGOS);
  const { alumnoId } = await params;
  const { ok, error } = await searchParams;

  if (!esUuid(alumnoId)) {
    notFound();
  }

  const cicloId = await obtenerCicloActivoId();
  if (!cicloId) {
    return <p className="text-zinc-600">No hay un ciclo escolar activo.</p>;
  }

  const contexto = await obtenerContextoAlumno(alumnoId, cicloId);
  if (!contexto) {
    notFound();
  }

  const supabase = await createClient();
  const [cargos, pagos, planesRes, conceptosRes] = await Promise.all([
    obtenerCargosDeAlumno(alumnoId, cicloId),
    obtenerPagosDeAlumno(alumnoId),
    supabase.from("planes_pago").select("id, mensualidades").eq("ciclo_escolar_id", cicloId).order("mensualidades"),
    supabase
      .from("conceptos_pago")
      .select("id, nombre, monto_default")
      .eq("activo", true)
      .eq("es_colegiatura", false)
      .order("nombre"),
  ]);

  const planes = planesRes.data ?? [];
  const conceptos = conceptosRes.data ?? [];
  const vigentes = cargos.filter((cargo) => cargo.estatus !== "cancelado");
  const saldoTotal = sumarMontos(vigentes.map((cargo) => cargo.saldo));
  const saldoVencido = sumarMontos(vigentes.filter((c) => c.estatus === "vencido").map((c) => c.saldo));
  const hayPorPagar = vigentes.some((cargo) => cargo.saldo > 0);
  const mensajeError = mensajeDeError(error);

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm text-zinc-600">
          <Link href="/pagos" className="hover:underline">← Alumnos</Link>
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-zinc-900">{contexto.nombre}</h1>
        <p className="text-sm text-zinc-600">
          {contexto.inscripcion?.grupo ?? "Sin inscripción en el ciclo activo"}
          {contexto.matricula && ` · Matrícula ${contexto.matricula}`}
          {!contexto.activo && " · Dado de baja"}
        </p>
        <div className="mt-3 flex gap-6 text-sm">
          <span>Saldo: <strong>{formatearMoneda(saldoTotal)}</strong></span>
          <span className={saldoVencido > 0 ? "font-medium text-red-700" : ""}>
            Vencido: <strong>{formatearMoneda(saldoVencido)}</strong>
          </span>
        </div>
      </div>

      {ok && MENSAJES_OK[ok] && (
        <p className="rounded-md bg-green-50 px-4 py-2 text-sm font-medium text-green-800">{MENSAJES_OK[ok]}</p>
      )}
      {mensajeError && (
        <p className="rounded-md bg-red-50 px-4 py-2 text-sm font-medium text-red-800">{mensajeError}</p>
      )}

      {contexto.inscripcion && (
        <form
          action={actualizarPlanBeca.bind(null, alumnoId, contexto.inscripcion.id)}
          className="flex flex-wrap items-end gap-3"
        >
          <label className="text-sm text-zinc-700">
            Plan de pagos
            <select name="planPagoId" defaultValue={contexto.inscripcion.planPagoId ?? ""} className={`ml-2 ${CLASE_INPUT}`}>
              <option value="">Sin plan</option>
              {planes.map((plan) => (
                <option key={plan.id} value={plan.id}>{plan.mensualidades} mensualidades</option>
              ))}
            </select>
          </label>
          <label className="text-sm text-zinc-700">
            Beca %
            <input
              type="number"
              name="becaPorcentaje"
              min={0}
              max={100}
              step="0.01"
              defaultValue={contexto.inscripcion.becaPorcentaje}
              className={`ml-2 w-24 ${CLASE_INPUT}`}
            />
          </label>
          <BotonEnviar textoEnviando="Guardando..." className={CLASE_BOTON}>Guardar plan y beca</BotonEnviar>
        </form>
      )}

      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-900">Cargos del ciclo</h2>
          {hayPorPagar && (
            <Link href={`/pagos/alumno/${alumnoId}/pago`} className={CLASE_BOTON}>Registrar pago</Link>
          )}
        </div>
        {cargos.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-600">Este alumno no tiene cargos en el ciclo activo.</p>
        ) : (
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-zinc-500">
                <th className="py-2">Concepto</th>
                <th className="py-2">Vence</th>
                <th className="py-2 text-right">Original</th>
                <th className="py-2 text-right">Beca</th>
                <th className="py-2 text-right">Monto</th>
                <th className="py-2 text-right">Pagado</th>
                <th className="py-2 text-right">Saldo</th>
                <th className="py-2">Estatus</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {cargos.map((cargo) => (
                <tr key={cargo.id} className="border-b border-zinc-100 align-top">
                  <td className="py-2 text-zinc-900">
                    {cargo.descripcion}
                    {cargo.motivoCancelacion && (
                      <div className="text-xs text-zinc-500">Motivo: {cargo.motivoCancelacion}</div>
                    )}
                  </td>
                  <td className="py-2 text-zinc-600">{cargo.fechaVencimiento ? formatearFecha(cargo.fechaVencimiento) : "—"}</td>
                  <td className="py-2 text-right">{formatearMoneda(cargo.montoOriginal)}</td>
                  <td className="py-2 text-right">{cargo.becaPorcentaje > 0 ? `${cargo.becaPorcentaje}%` : "—"}</td>
                  <td className="py-2 text-right">{formatearMoneda(cargo.monto)}</td>
                  <td className="py-2 text-right">{formatearMoneda(cargo.pagado)}</td>
                  <td className="py-2 text-right font-medium">{formatearMoneda(cargo.saldo)}</td>
                  <td className="py-2">
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${CLASES_ESTATUS[cargo.estatus]}`}>
                      {ETIQUETAS_ESTATUS[cargo.estatus]}
                    </span>
                  </td>
                  <td className="py-2 text-right">
                    {cargo.estatus !== "cancelado" && cargo.pagado === 0 && (
                      <details>
                        <summary className="cursor-pointer text-xs text-red-700">Cancelar</summary>
                        <form action={cancelarCargo.bind(null, alumnoId, cargo.id)} className="mt-2 flex gap-2">
                          <input name="motivo" placeholder="Motivo" required minLength={3} className={`w-40 ${CLASE_INPUT}`} />
                          <BotonEnviar textoEnviando="..." className="rounded-md bg-red-700 px-2 py-1 text-xs font-medium text-white">
                            Confirmar
                          </BotonEnviar>
                        </form>
                      </details>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-medium text-primario">+ Agregar cargo (inscripción, recargo, etc.)</summary>
          <form action={agregarCargo.bind(null, alumnoId)} className="mt-3 flex flex-wrap items-end gap-3">
            <select name="conceptoId" required className={CLASE_INPUT} defaultValue="">
              <option value="" disabled>Concepto</option>
              {conceptos.map((concepto) => (
                <option key={concepto.id} value={concepto.id}>
                  {concepto.nombre}
                  {concepto.monto_default !== null && ` (sugerido ${formatearMoneda(Number(concepto.monto_default))})`}
                </option>
              ))}
            </select>
            <input name="descripcion" placeholder="Descripción (ej. Recargo octubre)" required className={`w-64 ${CLASE_INPUT}`} />
            <input name="monto" type="number" min={0.01} step="0.01" placeholder="Monto" required className={`w-32 ${CLASE_INPUT}`} />
            <label className="text-sm text-zinc-700">
              Vence
              <input name="fechaVencimiento" type="date" className={`ml-2 ${CLASE_INPUT}`} />
            </label>
            <BotonEnviar textoEnviando="Agregando..." className={CLASE_BOTON}>Agregar cargo</BotonEnviar>
          </form>
        </details>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-zinc-900">Pagos</h2>
        {pagos.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-600">Sin pagos registrados.</p>
        ) : (
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-zinc-500">
                <th className="py-2">Folio</th>
                <th className="py-2">Fecha</th>
                <th className="py-2 text-right">Total</th>
                <th className="py-2">Método</th>
                <th className="py-2">Registró</th>
              </tr>
            </thead>
            <tbody>
              {pagos.map((pago) => (
                <tr key={pago.id} className={`border-b border-zinc-100 ${pago.anulado ? "text-zinc-400 line-through" : ""}`}>
                  <td className="py-2">
                    <Link href={`/pagos/recibo/${pago.id}`} className="font-medium text-primario hover:underline">
                      {pago.folio}
                    </Link>
                  </td>
                  <td className="py-2">{formatearFechaHora(pago.fechaPago)}</td>
                  <td className="py-2 text-right">{formatearMoneda(pago.montoTotal)}</td>
                  <td className="py-2">{ETIQUETAS_METODO[pago.metodo]}</td>
                  <td className="py-2">{pago.registradoPor}{pago.anulado && " (anulado)"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(dashboard)/pagos/alumno/[alumnoId]/actions.ts" "src/app/(dashboard)/pagos/alumno/[alumnoId]/page.tsx"
git commit -m "feat: estado de cuenta del alumno (plan, beca, cargos sueltos, cancelación)"
```

---

### Task 8: Registrar pago

**Files:**
- Create: `src/components/pagos/FormularioPago.tsx`
- Create: `src/app/(dashboard)/pagos/alumno/[alumnoId]/pago/actions.ts`
- Create: `src/app/(dashboard)/pagos/alumno/[alumnoId]/pago/page.tsx`

**Interfaces:**
- Consumes: `registrarPagoSchema`, `esUuid`; `codigoDeError`, `mensajeDeError`; `sumarMontos`, `formatearMoneda`; `METODOS_PAGO`, `ETIQUETAS_METODO`; `obtenerContextoAlumno`, `obtenerCargosDeAlumno`; rpc `registrar_pago`.
- Produces: Server Action `registrarPago(alumnoId: string, formData: FormData)`; campos del formulario: `cargo` (múltiple, id del cargo), `monto-<cargoId>`, `metodo`, `referencia`. Redirige a `/pagos/recibo/<pagoId>?nuevo=1`.

- [ ] **Step 1: Implementar `FormularioPago.tsx` (componente cliente)**

```tsx
"use client";

import { useState } from "react";
import { BotonEnviar } from "@/components/ui/BotonEnviar";
import { formatearMoneda, sumarMontos } from "@/lib/pagos/calculos";
import { ETIQUETAS_METODO, METODOS_PAGO } from "@/lib/pagos/catalogos";

export interface CargoPagable {
  id: string;
  descripcion: string;
  saldo: number;
  vencido: boolean;
}

export function FormularioPago({
  cargos,
  accion,
}: {
  cargos: CargoPagable[];
  accion: (formData: FormData) => Promise<void>;
}) {
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());
  const [montos, setMontos] = useState<Record<string, string>>(
    Object.fromEntries(cargos.map((cargo) => [cargo.id, cargo.saldo.toFixed(2)]))
  );

  const total = sumarMontos(
    [...seleccionados].map((id) => {
      const valor = Number(montos[id]);
      return Number.isFinite(valor) ? valor : 0;
    })
  );

  function alternar(id: string) {
    setSeleccionados((actual) => {
      const siguiente = new Set(actual);
      if (siguiente.has(id)) {
        siguiente.delete(id);
      } else {
        siguiente.add(id);
      }
      return siguiente;
    });
  }

  return (
    <form action={accion} className="space-y-6">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-left text-zinc-500">
            <th className="py-2" />
            <th className="py-2">Cargo</th>
            <th className="py-2 text-right">Saldo</th>
            <th className="py-2 text-right">A pagar</th>
          </tr>
        </thead>
        <tbody>
          {cargos.map((cargo) => {
            const marcado = seleccionados.has(cargo.id);
            return (
              <tr key={cargo.id} className="border-b border-zinc-100">
                <td className="py-2">
                  <input
                    type="checkbox"
                    name="cargo"
                    value={cargo.id}
                    checked={marcado}
                    onChange={() => alternar(cargo.id)}
                    aria-label={`Pagar ${cargo.descripcion}`}
                  />
                </td>
                <td className={`py-2 ${cargo.vencido ? "text-red-700" : "text-zinc-900"}`}>
                  {cargo.descripcion}
                  {cargo.vencido && " (vencido)"}
                </td>
                <td className="py-2 text-right">{formatearMoneda(cargo.saldo)}</td>
                <td className="py-2 text-right">
                  <input
                    type="number"
                    name={`monto-${cargo.id}`}
                    min={0.01}
                    max={cargo.saldo}
                    step="0.01"
                    required={marcado}
                    disabled={!marcado}
                    value={montos[cargo.id]}
                    onChange={(evento) => setMontos((m) => ({ ...m, [cargo.id]: evento.target.value }))}
                    className="w-32 rounded-md border border-zinc-300 px-2 py-1 text-right disabled:bg-zinc-50 disabled:text-zinc-400"
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="flex flex-wrap items-end gap-4">
        <label className="text-sm text-zinc-700">
          Método
          <select name="metodo" required defaultValue="" className="ml-2 rounded-md border border-zinc-300 px-2 py-1">
            <option value="" disabled>Elige</option>
            {METODOS_PAGO.map((metodo) => (
              <option key={metodo} value={metodo}>{ETIQUETAS_METODO[metodo]}</option>
            ))}
          </select>
        </label>
        <label className="text-sm text-zinc-700">
          Referencia (opcional)
          <input name="referencia" maxLength={100} className="ml-2 w-56 rounded-md border border-zinc-300 px-2 py-1" />
        </label>
      </div>

      <div className="flex items-center gap-6">
        <span className="text-lg">
          Total: <strong>{formatearMoneda(total)}</strong>
        </span>
        {seleccionados.size > 0 && total > 0 && (
          <BotonEnviar
            textoEnviando="Registrando..."
            className="rounded-md bg-primario px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            Registrar pago
          </BotonEnviar>
        )}
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Implementar `pago/actions.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requerirRol } from "@/lib/perfiles/requerirRol";
import { ROLES_PAGOS } from "@/lib/pagos/catalogos";
import { codigoDeError } from "@/lib/pagos/errores";
import { registrarPagoSchema } from "@/lib/pagos/schema";

export async function registrarPago(alumnoId: string, formData: FormData) {
  await requerirRol(ROLES_PAGOS);
  const rutaFormulario = `/pagos/alumno/${alumnoId}/pago`;

  const cargoIds = formData.getAll("cargo").filter((v): v is string => typeof v === "string");
  const resultado = registrarPagoSchema.safeParse({
    alumnoId,
    metodo: formData.get("metodo"),
    referencia: formData.get("referencia") ?? undefined,
    aplicaciones: cargoIds.map((cargoId) => ({
      cargoId,
      monto: formData.get(`monto-${cargoId}`),
    })),
  });

  if (!resultado.success) {
    redirect(`${rutaFormulario}?error=validacion`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("registrar_pago", {
    p_alumno_id: resultado.data.alumnoId,
    p_metodo: resultado.data.metodo,
    p_referencia: resultado.data.referencia,
    p_aplicaciones: resultado.data.aplicaciones.map((a) => ({ cargo_id: a.cargoId, monto: a.monto })),
  });

  if (error || !data?.pago_id) {
    redirect(`${rutaFormulario}?error=${codigoDeError(error)}`);
  }

  revalidatePath(`/pagos/alumno/${alumnoId}`);
  redirect(`/pagos/recibo/${data.pago_id}?nuevo=1`);
}
```

- [ ] **Step 3: Implementar `pago/page.tsx`**

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { requerirRolPagina } from "@/lib/perfiles/requerirRolPagina";
import { obtenerCicloActivoId } from "@/lib/ciclos/activo";
import { ROLES_PAGOS } from "@/lib/pagos/catalogos";
import { mensajeDeError } from "@/lib/pagos/errores";
import { esUuid } from "@/lib/pagos/schema";
import { obtenerCargosDeAlumno, obtenerContextoAlumno } from "@/lib/pagos/consultas";
import { FormularioPago } from "@/components/pagos/FormularioPago";
import { registrarPago } from "./actions";

export const dynamic = "force-dynamic";

export default async function RegistrarPagoPage({
  params,
  searchParams,
}: {
  params: Promise<{ alumnoId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  await requerirRolPagina(ROLES_PAGOS);
  const { alumnoId } = await params;
  const { error } = await searchParams;

  if (!esUuid(alumnoId)) {
    notFound();
  }

  const cicloId = await obtenerCicloActivoId();
  if (!cicloId) {
    return <p className="text-zinc-600">No hay un ciclo escolar activo.</p>;
  }

  const contexto = await obtenerContextoAlumno(alumnoId, cicloId);
  if (!contexto) {
    notFound();
  }

  // Solo cargos con saldo: excluye pagados (incluidas becas de 100 %) y cancelados.
  const cargos = (await obtenerCargosDeAlumno(alumnoId, cicloId))
    .filter((cargo) => cargo.estatus !== "cancelado" && cargo.saldo > 0)
    .map((cargo) => ({
      id: cargo.id,
      descripcion: cargo.descripcion,
      saldo: cargo.saldo,
      vencido: cargo.estatus === "vencido",
    }));

  const mensajeError = mensajeDeError(error);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-zinc-600">
          <Link href={`/pagos/alumno/${alumnoId}`} className="hover:underline">← Estado de cuenta</Link>
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-zinc-900">Registrar pago — {contexto.nombre}</h1>
        <p className="text-sm text-zinc-600">
          Marca los cargos que cubre este pago. Puedes bajar el monto de un cargo para registrar un abono parcial.
        </p>
      </div>

      {mensajeError && (
        <p className="rounded-md bg-red-50 px-4 py-2 text-sm font-medium text-red-800">{mensajeError}</p>
      )}

      {cargos.length === 0 ? (
        <p className="text-sm text-zinc-600">Este alumno no tiene cargos pendientes.</p>
      ) : (
        <FormularioPago cargos={cargos} accion={registrarPago.bind(null, alumnoId)} />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Verificar**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/components/pagos/FormularioPago.tsx "src/app/(dashboard)/pagos/alumno/[alumnoId]/pago"
git commit -m "feat: registrar pago (parcial y de varios cargos)"
```

---

### Task 9: Recibo imprimible y anulación de pago

**Files:**
- Create: `src/components/pagos/Recibo.tsx`
- Create: `src/components/pagos/BotonImprimir.tsx`
- Create: `src/app/(dashboard)/pagos/recibo/[pagoId]/actions.ts`
- Create: `src/app/(dashboard)/pagos/recibo/[pagoId]/page.tsx`

**Interfaces:**
- Consumes: `obtenerPagoParaRecibo`, `PagoRecibo` (Task 4); `getConfiguracion`, `ConfiguracionEscuela` (existente, `src/lib/config.ts`); `motivoSchema`, `esUuid`; `codigoDeError`, `mensajeDeError`; rpc `anular_pago`.
- Produces: componente `Recibo({ pago, config })` (server, sin datos propios: recibe todo, para reutilizarlo en el futuro correo al tutor); Server Action `anularPago(pagoId, formData)`.

- [ ] **Step 1: Implementar `Recibo.tsx`**

```tsx
import Image from "next/image";
import type { ConfiguracionEscuela } from "@/lib/config";
import { ETIQUETAS_METODO } from "@/lib/pagos/catalogos";
import { formatearMoneda } from "@/lib/pagos/calculos";
import type { PagoRecibo } from "@/lib/pagos/consultas";
import { formatearFechaHora } from "@/lib/fechas";

// Presentación pura del recibo: recibe el pago ya cargado para poder
// reutilizarse fuera de esta página (ej. un futuro envío por correo).
export function Recibo({ pago, config }: { pago: PagoRecibo; config: ConfiguracionEscuela }) {
  return (
    <article className="relative max-w-2xl rounded-lg border border-zinc-200 bg-white p-8 print:border-0 print:p-0">
      {pago.anulado && (
        <div className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
          <span className="rotate-[-20deg] text-6xl font-bold text-red-600/25">ANULADO</span>
        </div>
      )}

      <header className="flex items-center justify-between border-b-4 pb-4" style={{ borderColor: config.colorPrimario }}>
        <div className="flex items-center gap-3">
          {config.logoUrl && <Image src={config.logoUrl} alt={config.nombre} width={48} height={48} />}
          <div>
            <div className="text-lg font-bold text-zinc-900">{config.nombre}</div>
            <div className="text-sm text-zinc-600">Recibo de pago</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase text-zinc-500">Folio</div>
          <div className="text-2xl font-bold" style={{ color: config.colorPrimario }}>{pago.folio}</div>
        </div>
      </header>

      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
        <dt className="text-zinc-500">Alumno</dt>
        <dd className="text-zinc-900">{pago.alumnoNombre}</dd>
        {pago.grupo && (
          <>
            <dt className="text-zinc-500">Grupo</dt>
            <dd className="text-zinc-900">{pago.grupo}</dd>
          </>
        )}
        {pago.matricula && (
          <>
            <dt className="text-zinc-500">Matrícula</dt>
            <dd className="text-zinc-900">{pago.matricula}</dd>
          </>
        )}
        <dt className="text-zinc-500">Fecha</dt>
        <dd className="text-zinc-900">{formatearFechaHora(pago.fechaPago)}</dd>
        <dt className="text-zinc-500">Método</dt>
        <dd className="text-zinc-900">
          {ETIQUETAS_METODO[pago.metodo]}
          {pago.referencia && ` · Ref. ${pago.referencia}`}
        </dd>
      </dl>

      <table className="mt-6 w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-left text-zinc-500">
            <th className="py-2">Concepto</th>
            <th className="py-2 text-right">Precio</th>
            <th className="py-2 text-right">Beca</th>
            <th className="py-2 text-right">Con beca</th>
            <th className="py-2 text-right">Pagado</th>
          </tr>
        </thead>
        <tbody>
          {pago.lineas.map((linea, indice) => (
            <tr key={indice} className="border-b border-zinc-100">
              <td className="py-2 text-zinc-900">{linea.descripcion}</td>
              <td className="py-2 text-right">{formatearMoneda(linea.montoOriginal)}</td>
              <td className="py-2 text-right">{linea.becaPorcentaje > 0 ? `${linea.becaPorcentaje}%` : "—"}</td>
              <td className="py-2 text-right">{formatearMoneda(linea.monto)}</td>
              <td className="py-2 text-right font-medium">{formatearMoneda(linea.aplicado)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={4} className="py-3 text-right font-semibold text-zinc-900">Total pagado</td>
            <td className="py-3 text-right text-lg font-bold text-zinc-900">{formatearMoneda(pago.montoTotal)}</td>
          </tr>
        </tfoot>
      </table>

      <footer className="mt-6 text-xs text-zinc-500">
        Registró: {pago.registradoPor}
        {pago.anulado && pago.motivoAnulacion && (
          <div className="mt-1 font-medium text-red-700">Pago anulado. Motivo: {pago.motivoAnulacion}</div>
        )}
      </footer>
    </article>
  );
}
```

- [ ] **Step 2: Implementar `BotonImprimir.tsx`**

```tsx
"use client";

export function BotonImprimir() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-md bg-primario px-4 py-2 text-sm font-medium text-white hover:opacity-90 print:hidden"
    >
      Imprimir / Guardar PDF
    </button>
  );
}
```

- [ ] **Step 3: Implementar `recibo/[pagoId]/actions.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requerirRol } from "@/lib/perfiles/requerirRol";
import { ROLES_PAGOS } from "@/lib/pagos/catalogos";
import { codigoDeError } from "@/lib/pagos/errores";
import { esUuid, motivoSchema } from "@/lib/pagos/schema";

export async function anularPago(pagoId: string, formData: FormData) {
  await requerirRol(ROLES_PAGOS);
  const ruta = `/pagos/recibo/${pagoId}`;

  const resultado = motivoSchema.safeParse({ motivo: formData.get("motivo") });
  if (!resultado.success || !esUuid(pagoId)) {
    redirect(`${ruta}?error=validacion`);
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("anular_pago", {
    p_pago_id: pagoId,
    p_motivo: resultado.data.motivo,
  });

  if (error) {
    redirect(`${ruta}?error=${codigoDeError(error)}`);
  }

  revalidatePath("/pagos", "layout");
  redirect(`${ruta}?ok=anulado`);
}
```

- [ ] **Step 4: Implementar `recibo/[pagoId]/page.tsx`**

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { requerirRolPagina } from "@/lib/perfiles/requerirRolPagina";
import { getConfiguracion } from "@/lib/config";
import { ROLES_PAGOS } from "@/lib/pagos/catalogos";
import { mensajeDeError } from "@/lib/pagos/errores";
import { esUuid } from "@/lib/pagos/schema";
import { obtenerPagoParaRecibo } from "@/lib/pagos/consultas";
import { Recibo } from "@/components/pagos/Recibo";
import { BotonImprimir } from "@/components/pagos/BotonImprimir";
import { BotonEnviar } from "@/components/ui/BotonEnviar";
import { anularPago } from "./actions";

export const dynamic = "force-dynamic";

export default async function ReciboPage({
  params,
  searchParams,
}: {
  params: Promise<{ pagoId: string }>;
  searchParams: Promise<{ nuevo?: string; ok?: string; error?: string }>;
}) {
  await requerirRolPagina(ROLES_PAGOS);
  const { pagoId } = await params;
  const { nuevo, ok, error } = await searchParams;

  if (!esUuid(pagoId)) {
    notFound();
  }

  const [pago, config] = await Promise.all([obtenerPagoParaRecibo(pagoId), getConfiguracion()]);
  if (!pago) {
    notFound();
  }

  const mensajeError = mensajeDeError(error);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <Link href={`/pagos/alumno/${pago.alumnoId}`} className="text-sm text-zinc-600 hover:underline">
          ← Estado de cuenta
        </Link>
        <BotonImprimir />
      </div>

      {nuevo === "1" && (
        <p className="rounded-md bg-green-50 px-4 py-2 text-sm font-medium text-green-800 print:hidden">
          ✓ Pago registrado con folio {pago.folio}.
        </p>
      )}
      {ok === "anulado" && (
        <p className="rounded-md bg-green-50 px-4 py-2 text-sm font-medium text-green-800 print:hidden">
          ✓ Pago anulado. Los saldos de sus cargos se restituyeron.
        </p>
      )}
      {mensajeError && (
        <p className="rounded-md bg-red-50 px-4 py-2 text-sm font-medium text-red-800 print:hidden">{mensajeError}</p>
      )}

      <Recibo pago={pago} config={config} />

      {!pago.anulado && (
        <details className="max-w-2xl print:hidden">
          <summary className="cursor-pointer text-sm text-red-700">Anular este pago</summary>
          <form action={anularPago.bind(null, pago.id)} className="mt-2 flex flex-wrap gap-2">
            <input
              name="motivo"
              placeholder="Motivo de la anulación"
              required
              minLength={3}
              className="w-72 rounded-md border border-zinc-300 px-2 py-1 text-sm"
            />
            <BotonEnviar textoEnviando="Anulando..." className="rounded-md bg-red-700 px-3 py-1 text-sm font-medium text-white">
              Confirmar anulación
            </BotonEnviar>
          </form>
          <p className="mt-1 text-xs text-zinc-500">
            El pago conserva su folio y queda marcado como anulado; los cargos que cubría vuelven a quedar pendientes.
          </p>
        </details>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Verificar**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add src/components/pagos/Recibo.tsx src/components/pagos/BotonImprimir.tsx "src/app/(dashboard)/pagos/recibo"
git commit -m "feat: recibo imprimible y anulación de pagos"
```

---

### Task 10: Reporte de adeudos

**Files:**
- Create: `src/app/(dashboard)/pagos/adeudos/page.tsx`

**Interfaces:**
- Consumes: `obtenerEstructura`, `obtenerAlumnosConAdeudo` (Task 4); `sumarMontos`, `formatearMoneda`; `formatearFecha`; `esUuid`.

- [ ] **Step 1: Implementar `page.tsx`**

```tsx
import Link from "next/link";
import { requerirRolPagina } from "@/lib/perfiles/requerirRolPagina";
import { obtenerCicloActivoId } from "@/lib/ciclos/activo";
import { ROLES_PAGOS } from "@/lib/pagos/catalogos";
import { formatearMoneda, sumarMontos } from "@/lib/pagos/calculos";
import { esUuid } from "@/lib/pagos/schema";
import { formatearFecha } from "@/lib/fechas";
import { obtenerAlumnosConAdeudo, obtenerEstructura } from "@/lib/pagos/consultas";

export const dynamic = "force-dynamic";

const CLASE_INPUT = "rounded-md border border-zinc-300 px-3 py-2 text-sm";

export default async function AdeudosPage({
  searchParams,
}: {
  searchParams: Promise<{ nivel?: string; grado?: string; grupo?: string; vencidos?: string }>;
}) {
  await requerirRolPagina(ROLES_PAGOS);
  const filtros = await searchParams;
  const nivelId = esUuid(filtros.nivel) ? filtros.nivel : null;
  const gradoId = esUuid(filtros.grado) ? filtros.grado : null;
  const grupoId = esUuid(filtros.grupo) ? filtros.grupo : null;
  const soloVencidos = filtros.vencidos === "1";

  const cicloId = await obtenerCicloActivoId();
  if (!cicloId) {
    return <p className="text-zinc-600">No hay un ciclo escolar activo.</p>;
  }

  const estructura = await obtenerEstructura(cicloId);
  const filas = (await obtenerAlumnosConAdeudo(cicloId, estructura))
    .filter(
      (alumno) =>
        alumno.adeudoTotal > 0 &&
        (!soloVencidos || alumno.adeudoVencido > 0) &&
        (grupoId === null || alumno.grupoId === grupoId) &&
        (gradoId === null || alumno.gradoId === gradoId) &&
        (nivelId === null || alumno.nivelId === nivelId)
    )
    .sort((a, b) => b.adeudoVencido - a.adeudoVencido || a.nombre.localeCompare(b.nombre, "es"));

  const totalAdeudo = sumarMontos(filas.map((f) => f.adeudoTotal));
  const totalVencido = sumarMontos(filas.map((f) => f.adeudoVencido));

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900">Adeudos</h1>

      <form action="/pagos/adeudos" className="mt-4 flex flex-wrap items-end gap-3">
        <select name="nivel" defaultValue={nivelId ?? ""} className={CLASE_INPUT}>
          <option value="">Todos los niveles</option>
          {estructura.niveles.map((n) => <option key={n.id} value={n.id}>{n.nombre}</option>)}
        </select>
        <select name="grado" defaultValue={gradoId ?? ""} className={CLASE_INPUT}>
          <option value="">Todos los grados</option>
          {estructura.grados
            .filter((g) => nivelId === null || g.nivelId === nivelId)
            .map((g) => <option key={g.id} value={g.id}>{g.nombre}</option>)}
        </select>
        <select name="grupo" defaultValue={grupoId ?? ""} className={CLASE_INPUT}>
          <option value="">Todos los grupos</option>
          {estructura.grupos
            .filter((g) => (nivelId === null || g.nivelId === nivelId) && (gradoId === null || g.gradoId === gradoId))
            .map((g) => <option key={g.id} value={g.id}>{g.etiqueta}</option>)}
        </select>
        <label className="text-sm text-zinc-700">
          <input type="checkbox" name="vencidos" value="1" defaultChecked={soloVencidos} /> Solo con vencidos
        </label>
        <button type="submit" className="rounded-md bg-primario px-4 py-2 text-sm font-medium text-white hover:opacity-90">
          Filtrar
        </button>
      </form>

      {filas.length === 0 ? (
        <p className="mt-6 text-sm text-zinc-600">Sin adeudos con estos filtros.</p>
      ) : (
        <table className="mt-6 w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-zinc-500">
              <th className="py-2">Alumno</th>
              <th className="py-2">Grupo</th>
              <th className="py-2 text-right">Adeudo</th>
              <th className="py-2 text-right">Vencido</th>
              <th className="py-2">Vence desde</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((fila) => (
              <tr key={fila.alumnoId} className="border-b border-zinc-100">
                <td className="py-2">
                  <Link href={`/pagos/alumno/${fila.alumnoId}`} className="text-zinc-900 hover:underline">
                    {fila.nombre}
                  </Link>
                  {!fila.activo && <span className="ml-2 text-xs text-zinc-500">(baja)</span>}
                </td>
                <td className="py-2 text-zinc-600">{fila.grupo}</td>
                <td className="py-2 text-right">{formatearMoneda(fila.adeudoTotal)}</td>
                <td className={`py-2 text-right ${fila.adeudoVencido > 0 ? "font-medium text-red-700" : "text-zinc-600"}`}>
                  {formatearMoneda(fila.adeudoVencido)}
                </td>
                <td className="py-2 text-zinc-600">
                  {fila.vencimientoMasAntiguo ? formatearFecha(fila.vencimientoMasAntiguo) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-semibold text-zinc-900">
              <td className="py-3" colSpan={2}>Total ({filas.length} alumno{filas.length === 1 ? "" : "s"})</td>
              <td className="py-3 text-right">{formatearMoneda(totalAdeudo)}</td>
              <td className="py-3 text-right text-red-700">{formatearMoneda(totalVencido)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verificar**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(dashboard)/pagos/adeudos"
git commit -m "feat: reporte de adeudos por nivel, grado y grupo"
```

---

### Task 11: Corte de caja

**Files:**
- Create: `src/app/(dashboard)/pagos/corte/page.tsx`

**Interfaces:**
- Consumes: `resumirCorte`, `formatearMoneda`, `nombreCompletoAlumno` (Task 3); `fechaHoyMexico`, `esFechaISO`, `sumarDias`, `inicioDelDiaEscuela`, `formatearFechaHora`; `primero`; `ETIQUETAS_METODO`, `METODOS_PAGO`.

- [ ] **Step 1: Implementar `page.tsx`**

```tsx
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requerirRolPagina } from "@/lib/perfiles/requerirRolPagina";
import { ETIQUETAS_METODO, METODOS_PAGO, ROLES_PAGOS, type MetodoPago } from "@/lib/pagos/catalogos";
import { formatearMoneda, nombreCompletoAlumno, resumirCorte } from "@/lib/pagos/calculos";
import { primero } from "@/lib/pagos/consultas";
import {
  esFechaISO,
  fechaHoyMexico,
  formatearFechaHora,
  inicioDelDiaEscuela,
  sumarDias,
} from "@/lib/fechas";

export const dynamic = "force-dynamic";

export default async function CortePage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string }>;
}) {
  await requerirRolPagina(ROLES_PAGOS);
  const parametros = await searchParams;
  const hoy = fechaHoyMexico();

  const fechasInvalidas =
    (parametros.desde !== undefined && !esFechaISO(parametros.desde)) ||
    (parametros.hasta !== undefined && !esFechaISO(parametros.hasta));
  const desde = esFechaISO(parametros.desde) ? parametros.desde : hoy;
  const hasta = esFechaISO(parametros.hasta) ? parametros.hasta : desde;
  const rangoInvertido = desde > hasta;

  const supabase = await createClient();
  const { data, error } = rangoInvertido
    ? { data: [], error: null }
    : await supabase
        .from("pagos")
        .select(
          "id, folio, fecha_pago, monto_total, metodo_pago, referencia, anulado_en, alumnos(nombres, apellido_paterno, apellido_materno), registrado:perfiles!pagos_registrado_por_fkey(nombre_completo)"
        )
        .gte("fecha_pago", inicioDelDiaEscuela(desde))
        .lt("fecha_pago", inicioDelDiaEscuela(sumarDias(hasta, 1)))
        .order("fecha_pago", { ascending: true });

  if (error) {
    throw new Error(`No se pudo cargar el corte: ${error.message}`);
  }

  const pagos = (data ?? []).map((pago) => {
    const alumno = primero(pago.alumnos);
    return {
      id: pago.id,
      folio: Number(pago.folio),
      fechaPago: pago.fecha_pago,
      montoTotal: Number(pago.monto_total),
      metodo: pago.metodo_pago as MetodoPago,
      referencia: pago.referencia,
      anulado: pago.anulado_en !== null,
      alumno: alumno ? nombreCompletoAlumno(alumno) : "—",
      registradoPor: primero(pago.registrado)?.nombre_completo ?? "—",
    };
  });
  const resumen = resumirCorte(pagos);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900">Corte de caja</h1>

      <form action="/pagos/corte" className="mt-4 flex flex-wrap items-end gap-3">
        <label className="text-sm text-zinc-700">
          Desde
          <input type="date" name="desde" defaultValue={desde} className="ml-2 rounded-md border border-zinc-300 px-2 py-1" />
        </label>
        <label className="text-sm text-zinc-700">
          Hasta
          <input type="date" name="hasta" defaultValue={hasta} className="ml-2 rounded-md border border-zinc-300 px-2 py-1" />
        </label>
        <button type="submit" className="rounded-md bg-primario px-4 py-2 text-sm font-medium text-white hover:opacity-90">
          Ver corte
        </button>
      </form>

      {fechasInvalidas && (
        <p className="mt-4 rounded-md bg-yellow-50 px-4 py-2 text-sm text-yellow-800">
          Alguna fecha no era válida; se muestra el día de hoy.
        </p>
      )}
      {rangoInvertido && (
        <p className="mt-4 rounded-md bg-red-50 px-4 py-2 text-sm text-red-800">
          La fecha "desde" es posterior a "hasta".
        </p>
      )}

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-zinc-200 p-4">
          <div className="text-xs uppercase text-zinc-500">Total</div>
          <div className="text-xl font-bold text-zinc-900">{formatearMoneda(resumen.total)}</div>
          <div className="text-xs text-zinc-500">
            {resumen.cantidad} pago{resumen.cantidad === 1 ? "" : "s"}
            {resumen.anulados > 0 && ` · ${resumen.anulados} anulado${resumen.anulados === 1 ? "" : "s"}`}
          </div>
        </div>
        {METODOS_PAGO.map((metodo) => (
          <div key={metodo} className="rounded-lg border border-zinc-200 p-4">
            <div className="text-xs uppercase text-zinc-500">{ETIQUETAS_METODO[metodo]}</div>
            <div className="text-xl font-semibold text-zinc-900">{formatearMoneda(resumen.porMetodo[metodo])}</div>
          </div>
        ))}
      </div>

      {resumen.porUsuario.length > 0 && (
        <div className="mt-4 text-sm text-zinc-700">
          <span className="font-medium">Por quien registró: </span>
          {resumen.porUsuario.map((u) => `${u.nombre} ${formatearMoneda(u.total)}`).join(" · ")}
        </div>
      )}

      {pagos.length === 0 ? (
        <p className="mt-6 text-sm text-zinc-600">Sin pagos en este rango.</p>
      ) : (
        <table className="mt-6 w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-zinc-500">
              <th className="py-2">Folio</th>
              <th className="py-2">Fecha</th>
              <th className="py-2">Alumno</th>
              <th className="py-2">Método</th>
              <th className="py-2 text-right">Monto</th>
              <th className="py-2">Registró</th>
            </tr>
          </thead>
          <tbody>
            {pagos.map((pago) => (
              <tr key={pago.id} className={`border-b border-zinc-100 ${pago.anulado ? "text-zinc-400 line-through" : ""}`}>
                <td className="py-2">
                  <Link href={`/pagos/recibo/${pago.id}`} className="font-medium text-primario hover:underline">{pago.folio}</Link>
                </td>
                <td className="py-2">{formatearFechaHora(pago.fechaPago)}</td>
                <td className="py-2">{pago.alumno}</td>
                <td className="py-2">
                  {ETIQUETAS_METODO[pago.metodo]}
                  {pago.referencia && <span className="text-xs text-zinc-500"> · {pago.referencia}</span>}
                </td>
                <td className="py-2 text-right">{formatearMoneda(pago.montoTotal)}</td>
                <td className="py-2">{pago.registradoPor}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verificar**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(dashboard)/pagos/corte"
git commit -m "feat: corte de caja por rango de fechas (hora de México)"
```

---

### Task 12: Verificación final y documentación

**Files:**
- Modify: `CONTEXTO_CLAUDE_CODE.md`, `README.md` (línea que dice que Pagos es placeholder)

- [ ] **Step 1: Suite completa**

Run: `npm test && npx tsc --noEmit && npm run lint && npm run build`
Expected: todo en verde.

- [ ] **Step 2: Advisors**

Run: `mcp__supabase-ibero__get_advisors` con `type: "security"` y con `type: "performance"`.
Expected:
- Sin `rls_disabled_in_public` para ninguna tabla.
- Sin `security_definer_view`.
- Sin `unindexed_foreign_keys` en `planes_pago`, `precios_colegiatura`, `conceptos_pago`, `cargos`, `pagos`, `pago_aplicaciones`.
- Sin `function_search_path_mutable` para las 5 funciones nuevas.
- Sin `anon_security_definer_function_executable` nuevos (las 4 funciones nuevas son `security invoker` y con `execute` revocado a `anon`).
- Los WARN preexistentes (11 funciones `security definer`, `auth_leaked_password_protection`, `multiple_permissive_policies`) pueden seguir; reportarlos sin corregir.

- [ ] **Step 3: Reiniciar el folio si no hay pagos reales**

La traza de Task 2 avanzó la secuencia aunque revirtió los datos. Si todavía no hay pagos:
```sql
select setval('pagos_folio_seq', 1, false) where not exists (select 1 from pagos);
```
Expected: el primer pago real sale con folio 1.

- [ ] **Step 4: Prueba real en navegador con una cuenta `caja`**

Requiere una cuenta con rol `caja`. Si no existe, **pedirle al usuario** que invite una desde `/usuarios` (rol "Caja") o que indique cuál usar; no crearla por script. Con esa cuenta, en producción o en `npm run dev`:

1. Configuración: capturar precios para al menos el nivel de un alumno de prueba; ver la lista "Alumnos que se omitirían".
2. Estado de cuenta: asignar plan 10 y beca al alumno de prueba; Generar colegiaturas para su grupo; verificar 10 cargos con la beca aplicada.
3. Registrar pago: abono parcial a un cargo + pago completo de otro en un solo pago; llega al recibo con folio; "Imprimir / Guardar PDF" muestra solo el recibo (sin menú lateral ni barra superior).
4. Doble clic rápido en "Registrar pago": se registra un solo pago.
5. Anular el pago desde el recibo: los saldos regresan; el pago sale tachado en historial y corte.
6. Corte de caja de hoy: totales por método correctos, anulado fuera del total.
7. Adeudos: el alumno aparece con su vencido.
8. Con la misma cuenta `caja`: abrir `/asistencia` y `/calificaciones` → 404. El menú no muestra Materias, Calificaciones ni Usuarios.
9. Limpiar: cancelar o anular lo que se haya creado de prueba **solo si el usuario lo pide**; si se usó un alumno real, avisar qué quedó registrado.

Anotar cualquier hallazgo; corregir los bugs antes de dar la pieza por terminada.

- [ ] **Step 5: Documentar**

En `CONTEXTO_CLAUDE_CODE.md`, agregar al final de "Estado actual" una entrada **"Pagos / Colegiaturas"** con: spec y plan; decisiones (plan 10/12 por alumno, precio por nivel y plan, beca congelada por cargo, pagos parciales, sin recargos automáticos, Caja con control total); arquitectura (4 funciones `security invoker` + 2 vistas `security_invoker`, trigger de plan/beca, política nueva de lectura de `perfiles` para `caja`); verificación hecha (traza SQL con `TRAZA_PAGOS_OK`, tests, advisors, prueba con `caja`, y lo que no se pudo probar); y lo que queda fuera (correo del recibo, recargos automáticos, saldo a favor, CFDI, arrastre entre ciclos). En "Próximos pasos pendientes", marcar Pagos como resuelto: **los 3 módulos del MVP quedan con funcionalidad real**. En "Perfiles de usuario del MVP", actualizar la línea de Caja.

En `README.md`, cambiar la frase que dice que Pagos sigue siendo placeholder.

- [ ] **Step 6: Commit**

```bash
git add CONTEXTO_CLAUDE_CODE.md README.md
git commit -m "docs: documentar Pagos / Colegiaturas"
```

No hacer `git push` sin que el usuario lo pida (cada push a `main` despliega a producción en Vercel).
