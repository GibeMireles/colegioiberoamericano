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
