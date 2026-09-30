-- Esquema inicial MVP — plataforma de gestión escolar
-- Cada escuela corre su propia instancia (proyecto de Supabase propio).
-- No hay aislamiento multi-tenant por escuela_id: una escuela nueva se
-- atiende replicando este proyecto completo, no agregando una fila.
-- Row Level Security (RLS) se define en un archivo aparte una vez
-- que los roles de usuario estén definidos en Supabase Auth.

create extension if not exists "pgcrypto";

-- ==========================================================
-- Configuración de marca de esta instancia (fila única)
-- ==========================================================
create table configuracion (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  nombre_corto text not null,
  color_primario text not null,      -- ej. '#E3312D'
  color_secundario text not null,    -- ej. '#FEDC01'
  logo_url text,
  actualizado_en timestamptz not null default now()
);

-- ==========================================================
-- Ciclos escolares, niveles, grados y grupos
-- ==========================================================
create table ciclos_escolares (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,          -- ej. '2026-2027'
  fecha_inicio date,
  fecha_fin date,
  activo boolean not null default true
);

-- Niveles (Villa, Primaria, Secundaria, Preparatoria) — editables por el
-- personal desde la UI de Alumnos, no una lista fija en código.
create table niveles (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  orden int
);

create table grados (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,          -- ej. '1° preparatoria'
  nivel_id uuid not null references niveles(id),
  orden int
);

create table grupos (
  id uuid primary key default gen_random_uuid(),
  grado_id uuid not null references grados(id),
  ciclo_escolar_id uuid not null references ciclos_escolares(id),
  nombre text not null            -- ej. '1°A'
);

-- Evita duplicados accidentales al crear desde la UI.
create unique index idx_grados_nombre_por_nivel on grados(nivel_id, nombre);
create unique index idx_grupos_nombre_por_grado on grupos(grado_id, ciclo_escolar_id, nombre);

-- ==========================================================
-- Alumnos e inscripciones
-- ==========================================================
create table alumnos (
  id uuid primary key default gen_random_uuid(),
  nombres text not null,
  apellido_paterno text,       -- requerido a nivel de app (Zod), no en DB —
  apellido_materno text,       -- para no bloquear alumnos ya capturados antes
                                -- de este cambio, que aún no lo tienen.
  fecha_nacimiento date,
  matricula text,
  tutor_nombre text,
  tutor_telefono text,
  tutor_email text,
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);

create table inscripciones (
  id uuid primary key default gen_random_uuid(),
  alumno_id uuid not null references alumnos(id),
  grupo_id uuid not null references grupos(id),
  ciclo_escolar_id uuid not null references ciclos_escolares(id),
  fecha_inscripcion date not null default current_date
);

-- ==========================================================
-- Pagos
-- ==========================================================
create table conceptos_pago (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,          -- ej. 'Colegiatura', 'Inscripción'
  monto_default numeric(10,2)
);

create table cargos (
  id uuid primary key default gen_random_uuid(),
  alumno_id uuid not null references alumnos(id),
  concepto_pago_id uuid not null references conceptos_pago(id),
  ciclo_escolar_id uuid not null references ciclos_escolares(id),
  monto numeric(10,2) not null,
  fecha_vencimiento date,
  estatus text not null default 'pendiente'  -- pendiente | pagado | vencido
);

create table pagos (
  id uuid primary key default gen_random_uuid(),
  cargo_id uuid not null references cargos(id),
  monto_pagado numeric(10,2) not null,
  fecha_pago timestamptz not null default now(),
  metodo_pago text,               -- efectivo | transferencia | tarjeta
  registrado_por uuid             -- referencia a usuarios/perfiles
);

-- ==========================================================
-- Asistencia
-- ==========================================================
create table asistencias (
  id uuid primary key default gen_random_uuid(),
  alumno_id uuid not null references alumnos(id),
  grupo_id uuid not null references grupos(id),
  fecha date not null,
  estatus text not null,          -- presente | falta | retardo | justificado
  registrado_por uuid,
  unique (alumno_id, fecha)
);

-- ==========================================================
-- Usuarios y perfiles (roles dentro de esta instancia)
-- ==========================================================
create table perfiles (
  id uuid primary key default gen_random_uuid(),
  usuario_auth_id uuid not null,  -- referencia a auth.users de Supabase
  nombre_completo text not null,
  rol text not null,              -- super_admin | direccion | caja | docente
  creado_en timestamptz not null default now()
);

-- Índices básicos para las consultas más comunes
create index idx_inscripciones_alumno on inscripciones(alumno_id);
create index idx_cargos_alumno on cargos(alumno_id);
create index idx_asistencias_grupo_fecha on asistencias(grupo_id, fecha);

-- ==========================================================
-- Autenticación + rol Docente
-- ==========================================================
alter table perfiles
  add constraint perfiles_rol_check
  check (rol in ('super_admin', 'direccion', 'caja', 'docente'));

alter table perfiles enable row level security;

create policy "cada usuario lee su propio perfil"
  on perfiles for select
  using (usuario_auth_id = auth.uid());

-- security definer: evita "infinite recursion detected in policy for
-- relation perfiles" que causa una política que consulta su propia tabla
-- directamente en el using().
create or replace function public.es_super_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from perfiles
    where usuario_auth_id = auth.uid() and rol = 'super_admin'
  );
$$;

create policy "super_admin lee todos los perfiles"
  on perfiles for select
  using (public.es_super_admin());

alter table perfiles
  add constraint perfiles_usuario_auth_id_key unique (usuario_auth_id);

-- ==========================================================
-- Materias + asignación docente-materia-grupo
-- ==========================================================
create table materias (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  grado_id uuid not null references grados(id),
  orden int
);
create unique index idx_materias_nombre_por_grado on materias(grado_id, nombre);

create table asignaciones (
  id uuid primary key default gen_random_uuid(),
  materia_id uuid not null references materias(id),
  grupo_id uuid not null references grupos(id),
  docente_perfil_id uuid not null references perfiles(id),
  ciclo_escolar_id uuid not null references ciclos_escolares(id)
);
create unique index idx_asignaciones_unica on asignaciones(materia_id, grupo_id, ciclo_escolar_id);

-- Solo se llena para materias con lista propia (ej. niveles de inglés).
-- Si no hay filas para una materia+ciclo, la lista es el grupo completo.
create table materia_alumnos (
  id uuid primary key default gen_random_uuid(),
  materia_id uuid not null references materias(id),
  alumno_id uuid not null references alumnos(id),
  ciclo_escolar_id uuid not null references ciclos_escolares(id)
);
create unique index idx_materia_alumnos_unica on materia_alumnos(materia_id, alumno_id, ciclo_escolar_id);

-- ==========================================================
-- Captura de calificaciones
-- ==========================================================
alter table asignaciones
  add column parcial1_max numeric,
  add column parcial2_max numeric,
  add column producto_max numeric;

create table calificaciones (
  id uuid primary key default gen_random_uuid(),
  asignacion_id uuid not null references asignaciones(id),
  alumno_id uuid not null references alumnos(id),
  parcial1_adas numeric,
  parcial1_examen numeric,
  parcial2_adas numeric,
  parcial2_examen numeric,
  producto_proyecto numeric,
  producto_examen numeric,
  actualizado_en timestamptz not null default now()
);
create unique index idx_calificaciones_unica on calificaciones(asignacion_id, alumno_id);

-- ==========================================================
-- RLS completo + login en Alumnos/Pagos/Asistencia
-- ==========================================================
-- Migración 1 de 2 (aplicada vía apply_migration antes del Task 1 del
-- plan): funciones helper, corrección del bug real en la política de
-- perfiles, y todas las políticas nuevas. No activa RLS todavía —
-- eso lo hace la Migración 2, hasta que el código que depende de estas
-- políticas (Tasks 1-3) ya está en su lugar.

-- ==========================================================
-- Funciones helper de seguridad (RLS)
-- ==========================================================
create or replace function es_direccion()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from perfiles
    where usuario_auth_id = auth.uid() and rol = 'direccion'
  );
$$;

create or replace function es_super_admin_o_direccion()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select es_super_admin() or es_direccion();
$$;

create or replace function es_docente()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from perfiles
    where usuario_auth_id = auth.uid() and rol = 'docente'
  );
$$;

create or replace function es_caja()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from perfiles
    where usuario_auth_id = auth.uid() and rol = 'caja'
  );
$$;

create or replace function mi_perfil_id()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select id from perfiles where usuario_auth_id = auth.uid();
$$;

create or replace function docente_tiene_grupo(p_grupo_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from asignaciones a
    join ciclos_escolares c on c.id = a.ciclo_escolar_id and c.activo = true
    where a.docente_perfil_id = mi_perfil_id() and a.grupo_id = p_grupo_id
  );
$$;

create or replace function docente_tiene_materia(p_materia_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from asignaciones a
    join ciclos_escolares c on c.id = a.ciclo_escolar_id and c.activo = true
    where a.docente_perfil_id = mi_perfil_id() and a.materia_id = p_materia_id
  );
$$;

create or replace function docente_tiene_asignacion(p_asignacion_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from asignaciones
    where id = p_asignacion_id and docente_perfil_id = mi_perfil_id()
  );
$$;

-- ==========================================================
-- Corrección del bug real en perfiles (direccion no leía a nadie)
-- ==========================================================
drop policy if exists "super_admin lee todos los perfiles" on perfiles;
create policy "super_admin y direccion leen todos los perfiles"
  on perfiles for select
  using (es_super_admin_o_direccion());

-- ==========================================================
-- Políticas nuevas (RLS se activa hasta el último task del plan)
-- ==========================================================

-- configuracion: lectura pública (la necesita /login antes de iniciar sesión)
create policy "configuracion lectura publica" on configuracion
  for select using (true);
create policy "configuracion solo super_admin escribe" on configuracion
  for all using (es_super_admin()) with check (es_super_admin());

-- ciclos_escolares, niveles, grados, grupos: lectura para cualquier
-- autenticado, escritura super_admin/direccion
create policy "ciclos_escolares lectura autenticados" on ciclos_escolares
  for select using (auth.uid() is not null);
create policy "ciclos_escolares escritura admin" on ciclos_escolares
  for all using (es_super_admin_o_direccion()) with check (es_super_admin_o_direccion());

create policy "niveles lectura autenticados" on niveles
  for select using (auth.uid() is not null);
create policy "niveles escritura admin" on niveles
  for all using (es_super_admin_o_direccion()) with check (es_super_admin_o_direccion());

create policy "grados lectura autenticados" on grados
  for select using (auth.uid() is not null);
create policy "grados escritura admin" on grados
  for all using (es_super_admin_o_direccion()) with check (es_super_admin_o_direccion());

create policy "grupos lectura autenticados" on grupos
  for select using (auth.uid() is not null);
create policy "grupos escritura admin" on grupos
  for all using (es_super_admin_o_direccion()) with check (es_super_admin_o_direccion());

-- materias: igual que niveles/grados/grupos (nombres no sensibles)
create policy "materias lectura autenticados" on materias
  for select using (auth.uid() is not null);
create policy "materias escritura admin" on materias
  for all using (es_super_admin_o_direccion()) with check (es_super_admin_o_direccion());

-- alumnos: admin+caja todo, docente solo lectura de sus grupos
create policy "alumnos lectura admin y caja" on alumnos
  for select using (es_super_admin_o_direccion() or es_caja());
create policy "alumnos lectura docente propio grupo" on alumnos
  for select using (
    es_docente() and exists (
      select 1 from inscripciones i
      where i.alumno_id = alumnos.id and docente_tiene_grupo(i.grupo_id)
    )
  );
create policy "alumnos escritura admin" on alumnos
  for all using (es_super_admin_o_direccion()) with check (es_super_admin_o_direccion());

-- inscripciones: mismo criterio que alumnos
create policy "inscripciones lectura admin y caja" on inscripciones
  for select using (es_super_admin_o_direccion() or es_caja());
create policy "inscripciones lectura docente propio grupo" on inscripciones
  for select using (es_docente() and docente_tiene_grupo(grupo_id));
create policy "inscripciones escritura admin" on inscripciones
  for all using (es_super_admin_o_direccion()) with check (es_super_admin_o_direccion());

-- asignaciones: admin todo, docente solo sus propias filas
create policy "asignaciones lectura admin" on asignaciones
  for select using (es_super_admin_o_direccion());
create policy "asignaciones lectura docente propia" on asignaciones
  for select using (es_docente() and docente_perfil_id = mi_perfil_id());
create policy "asignaciones escritura admin" on asignaciones
  for all using (es_super_admin_o_direccion()) with check (es_super_admin_o_direccion());

-- materia_alumnos: admin todo, docente scoped a sus materias
create policy "materia_alumnos lectura admin" on materia_alumnos
  for select using (es_super_admin_o_direccion());
create policy "materia_alumnos lectura docente propia materia" on materia_alumnos
  for select using (es_docente() and docente_tiene_materia(materia_id));
create policy "materia_alumnos escritura admin" on materia_alumnos
  for all using (es_super_admin_o_direccion()) with check (es_super_admin_o_direccion());

-- calificaciones: admin todo, docente scoped a su propia asignacion
create policy "calificaciones lectura admin" on calificaciones
  for select using (es_super_admin_o_direccion());
create policy "calificaciones lectura docente propia asignacion" on calificaciones
  for select using (es_docente() and docente_tiene_asignacion(asignacion_id));
create policy "calificaciones escritura admin" on calificaciones
  for insert with check (es_super_admin_o_direccion());
create policy "calificaciones escritura docente propia asignacion insert" on calificaciones
  for insert with check (es_docente() and docente_tiene_asignacion(asignacion_id));
create policy "calificaciones actualizacion admin" on calificaciones
  for update using (es_super_admin_o_direccion()) with check (es_super_admin_o_direccion());
create policy "calificaciones actualizacion docente propia asignacion" on calificaciones
  for update using (es_docente() and docente_tiene_asignacion(asignacion_id))
  with check (es_docente() and docente_tiene_asignacion(asignacion_id));
create policy "calificaciones borrado super_admin" on calificaciones
  for delete using (es_super_admin());

-- conceptos_pago, cargos, pagos: admin+direccion+caja, todo
create policy "conceptos_pago admin caja" on conceptos_pago
  for all using (es_super_admin_o_direccion() or es_caja())
  with check (es_super_admin_o_direccion() or es_caja());
create policy "cargos admin caja" on cargos
  for all using (es_super_admin_o_direccion() or es_caja())
  with check (es_super_admin_o_direccion() or es_caja());
create policy "pagos admin caja" on pagos
  for all using (es_super_admin_o_direccion() or es_caja())
  with check (es_super_admin_o_direccion() or es_caja());

-- asistencias: admin+docente scoped a su grupo
create policy "asistencias lectura admin" on asistencias
  for select using (es_super_admin_o_direccion());
create policy "asistencias lectura docente propio grupo" on asistencias
  for select using (es_docente() and docente_tiene_grupo(grupo_id));
create policy "asistencias escritura admin" on asistencias
  for insert with check (es_super_admin_o_direccion());
create policy "asistencias escritura docente propio grupo insert" on asistencias
  for insert with check (es_docente() and docente_tiene_grupo(grupo_id));
create policy "asistencias actualizacion admin" on asistencias
  for update using (es_super_admin_o_direccion()) with check (es_super_admin_o_direccion());
create policy "asistencias actualizacion docente propio grupo" on asistencias
  for update using (es_docente() and docente_tiene_grupo(grupo_id))
  with check (es_docente() and docente_tiene_grupo(grupo_id));
create policy "asistencias borrado admin" on asistencias
  for delete using (es_super_admin_o_direccion());

-- ==========================================================
-- Migración 2 de 2 (Task 4 del plan, aplicada después de que Tasks 1-3
-- ya están commiteados): activa RLS en las 15 tablas que todavía no lo
-- tenían (perfiles ya lo tenía desde la pieza de Autenticación). A
-- partir de aquí las políticas de arriba pasan de "definidas" a
-- "exigidas" de verdad.
-- ==========================================================
alter table configuracion enable row level security;
alter table ciclos_escolares enable row level security;
alter table niveles enable row level security;
alter table grados enable row level security;
alter table grupos enable row level security;
alter table materias enable row level security;
alter table alumnos enable row level security;
alter table inscripciones enable row level security;
alter table asignaciones enable row level security;
alter table materia_alumnos enable row level security;
alter table calificaciones enable row level security;
alter table conceptos_pago enable row level security;
alter table cargos enable row level security;
alter table pagos enable row level security;
alter table asistencias enable row level security;

-- ==========================================================
-- RLS: validar roster en escrituras de docente (calificaciones/asistencias)
-- Migración 3 de la historia de RLS (aplicada después de las dos de
-- arriba). El review final detectó que las políticas de escritura de
-- docente en calificaciones y asistencias validaban que el docente fuera
-- dueño de la asignación/grupo, pero nunca validaban que alumno_id
-- perteneciera al roster de esa asignación/grupo — un docente podía,
-- vía llamada directa a la API saltándose la app de Next.js, escribir
-- una calificación/asistencia para un alumno fuera de su clase. Estas
-- funciones y políticas refuerzan esa validación.
-- ==========================================================

create or replace function alumno_en_grupo_de_asignacion(p_asignacion_id uuid, p_alumno_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from asignaciones a
    join inscripciones i on i.grupo_id = a.grupo_id and i.ciclo_escolar_id = a.ciclo_escolar_id
    where a.id = p_asignacion_id and i.alumno_id = p_alumno_id
  );
$$;

create or replace function alumno_en_grupo(p_grupo_id uuid, p_alumno_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from inscripciones
    where grupo_id = p_grupo_id and alumno_id = p_alumno_id
  );
$$;

drop policy if exists "calificaciones escritura docente propia asignacion insert" on calificaciones;
create policy "calificaciones escritura docente propia asignacion insert" on calificaciones
  for insert with check (
    es_docente()
    and docente_tiene_asignacion(asignacion_id)
    and alumno_en_grupo_de_asignacion(asignacion_id, alumno_id)
  );

drop policy if exists "calificaciones actualizacion docente propia asignacion" on calificaciones;
create policy "calificaciones actualizacion docente propia asignacion" on calificaciones
  for update using (es_docente() and docente_tiene_asignacion(asignacion_id))
  with check (
    es_docente()
    and docente_tiene_asignacion(asignacion_id)
    and alumno_en_grupo_de_asignacion(asignacion_id, alumno_id)
  );

drop policy if exists "asistencias escritura docente propio grupo insert" on asistencias;
create policy "asistencias escritura docente propio grupo insert" on asistencias
  for insert with check (
    es_docente()
    and docente_tiene_grupo(grupo_id)
    and alumno_en_grupo(grupo_id, alumno_id)
  );

drop policy if exists "asistencias actualizacion docente propio grupo" on asistencias;
create policy "asistencias actualizacion docente propio grupo" on asistencias
  for update using (es_docente() and docente_tiene_grupo(grupo_id))
  with check (
    es_docente()
    and docente_tiene_grupo(grupo_id)
    and alumno_en_grupo(grupo_id, alumno_id)
  );

-- ==========================================================
-- Asistencia: migrar de grupo_id a asignacion_id
-- Prerequisites del plan de Listas/Asistencia (aplicada vía
-- apply_migration antes del Task 1 de ese plan, por el orquestador, no
-- por un subagente). Lleva a `asistencias` al mismo patrón por
-- asignacion_id que ya tenía `calificaciones`, con la validación de
-- roster incluida desde el inicio en las políticas de escritura de
-- docente — a diferencia de calificaciones/asistencias arriba, que la
-- agregaron después en una revisión final (Migración 3).
-- ==========================================================

-- 1. Soltar políticas existentes (referencian grupo_id)
drop policy if exists "asistencias lectura admin" on asistencias;
drop policy if exists "asistencias lectura docente propio grupo" on asistencias;
drop policy if exists "asistencias escritura admin" on asistencias;
drop policy if exists "asistencias escritura docente propio grupo insert" on asistencias;
drop policy if exists "asistencias actualizacion admin" on asistencias;
drop policy if exists "asistencias actualizacion docente propio grupo" on asistencias;
drop policy if exists "asistencias borrado admin" on asistencias;

-- 2. Redefinir columnas
alter table asistencias drop column grupo_id;
alter table asistencias add column asignacion_id uuid not null references asignaciones(id);
alter table asistencias add constraint asistencias_estatus_check
  check (estatus = any (array['presente', 'ausente', 'retardo', 'justificado']));
create unique index idx_asistencias_unica on asistencias(asignacion_id, alumno_id, fecha);

-- 3. Recrear políticas scoped por asignacion_id (incluye validación de
--    roster desde el inicio, a diferencia de calificaciones que la
--    agregó después en una revisión final)
create policy "asistencias lectura admin" on asistencias
  for select using (es_super_admin_o_direccion());
create policy "asistencias lectura docente propia asignacion" on asistencias
  for select using (es_docente() and docente_tiene_asignacion(asignacion_id));
create policy "asistencias escritura admin insert" on asistencias
  for insert with check (es_super_admin_o_direccion());
create policy "asistencias escritura docente propia asignacion insert" on asistencias
  for insert with check (
    es_docente()
    and docente_tiene_asignacion(asignacion_id)
    and alumno_en_grupo_de_asignacion(asignacion_id, alumno_id)
  );
create policy "asistencias actualizacion admin" on asistencias
  for update using (es_super_admin_o_direccion()) with check (es_super_admin_o_direccion());
create policy "asistencias actualizacion docente propia asignacion" on asistencias
  for update using (es_docente() and docente_tiene_asignacion(asignacion_id))
  with check (
    es_docente()
    and docente_tiene_asignacion(asignacion_id)
    and alumno_en_grupo_de_asignacion(asignacion_id, alumno_id)
  );
create policy "asistencias borrado admin" on asistencias
  for delete using (es_super_admin_o_direccion());

-- ==========================================================
-- Asistencia: corrección posterior (encontrada durante Task 2 del plan)
-- Un constraint UNIQUE (alumno_id, fecha) preexistía en el esquema
-- original de asistencias (de antes de que existiera el scope por
-- asignación, ver definición de la tabla arriba) y la migración de
-- Prerequisites de arriba no lo eliminaba. Esto habría impedido que un
-- alumno tuviera asistencia registrada en más de una materia el mismo
-- día — justo lo contrario del propósito de esta pieza. Se soltó
-- directamente contra el proyecto real, aplicada por separado y después
-- de la migración de Prerequisites de arriba.
-- ==========================================================
alter table asistencias drop constraint asistencias_alumno_id_fecha_key;

-- ==========================================================
-- Pagos / Colegiaturas — esquema. Aplicada como migración
-- `pagos_colegiaturas_esquema` (plan 2026-09-29-pagos-colegiaturas, Task 1).
-- Redefine conceptos_pago, cargos y pagos (definidas arriba en su versión
-- original, vacías al momento de esta migración).
-- ==========================================================
-- ==========================================================
-- Pagos / Colegiaturas: esquema (spec 2026-09-29-pagos-colegiaturas)
-- Las tablas conceptos_pago, cargos y pagos del esquema original
-- estaban vacías y se redefinen completas.
-- ==========================================================

-- ⚠️ SOLO SE APLICÓ UNA VEZ, con las tablas vacías. NO re-ejecutar este bloque
-- contra una base con datos: borraría todos los cargos y pagos.
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

-- ==========================================================
-- Pagos / Colegiaturas — funciones. Aplicada como migración
-- `pagos_colegiaturas_funciones` (plan 2026-09-29-pagos-colegiaturas, Task 2).
-- ==========================================================
-- ==========================================================
-- Pagos / Colegiaturas: funciones (security invoker: el RLS de quien
-- llama aplica dentro de la función)
-- ==========================================================
-- Nota: registrar_pago, anular_pago y cancelar_cargo pasan a security definer más abajo (migración pagos_colegiaturas_endurecer_escrituras).

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

-- ==========================================================
-- Pagos / Colegiaturas — endurecimiento de escrituras. Aplicada como migración
-- `pagos_colegiaturas_endurecer_escrituras` (revisión final del plan
-- 2026-09-29-pagos-colegiaturas). Cierra un hallazgo: con las políticas
-- anteriores, caja/dirección podían modificar pagos y cargos directo por la API.
-- ==========================================================
-- Las escrituras de dinero solo pasan por las funciones: nadie (ni caja ni
-- dirección) puede insertar o modificar pagos/aplicaciones, ni modificar
-- cargos, directo por la API. Las funciones pasan a security definer (ya
-- validan el rol de quien llama de forma explícita y no son ejecutables por
-- anon); así corren con privilegios del dueño sin que authenticated necesite
-- permisos de escritura sobre esas tablas.

alter function registrar_pago(uuid, text, text, jsonb) security definer;

create or replace function anular_pago(p_pago_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if mi_perfil_id() is null or not (es_super_admin_o_direccion() or es_caja()) then
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
security definer
set search_path = public
as $$
declare
  v_cargo cargos%rowtype;
  v_folio bigint;
begin
  if mi_perfil_id() is null or not (es_super_admin_o_direccion() or es_caja()) then
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

revoke execute on function anular_pago(uuid, text) from public, anon;
revoke execute on function cancelar_cargo(uuid, text) from public, anon;
grant execute on function anular_pago(uuid, text) to authenticated;
grant execute on function cancelar_cargo(uuid, text) to authenticated;

-- Sin escritura directa por la API
drop policy "pagos alta personal pagos" on pagos;
drop policy "pagos actualizacion personal pagos" on pagos;
drop policy "pago_aplicaciones alta personal pagos" on pago_aplicaciones;
drop policy "cargos actualizacion personal pagos" on cargos;
revoke insert, update, delete on pagos, pago_aplicaciones from authenticated, anon;
revoke update, delete on cargos from authenticated, anon;
revoke insert on cargos from anon;
revoke all on sequence pagos_folio_seq from anon, authenticated;

-- Los cargos sueltos sí se insertan directo (desde la Server Action) y
-- generar_colegiaturas los inserta como invoker: la autoría y el estado de
-- cancelación no se pueden falsificar al insertar.
create or replace function cargos_normalizar_alta()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.creado_por := mi_perfil_id();
  new.creado_en := now();
  new.cancelado_en := null;
  new.cancelado_por := null;
  new.motivo_cancelacion := null;
  return new;
end;
$$;

create trigger cargos_normalizar_alta
  before insert on cargos
  for each row execute function cargos_normalizar_alta();
