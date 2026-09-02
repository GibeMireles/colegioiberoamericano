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
