-- Esquema inicial MVP — plataforma de gestión escolar
-- Diseñado para multi-escuela desde el día uno (columna escuela_id).
-- Row Level Security (RLS) se define en un archivo aparte una vez
-- que los roles de usuario estén definidos en Supabase Auth.

create extension if not exists "pgcrypto";

-- ==========================================================
-- Escuelas y configuración de marca
-- ==========================================================
create table escuelas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  nombre_corto text,
  color_primario text,      -- ej. '#D85A30'
  color_secundario text,    -- ej. '#EF9F27'
  logo_url text,
  creado_en timestamptz not null default now()
);

-- ==========================================================
-- Ciclos escolares, grados y grupos
-- ==========================================================
create table ciclos_escolares (
  id uuid primary key default gen_random_uuid(),
  escuela_id uuid not null references escuelas(id),
  nombre text not null,          -- ej. '2026-2027'
  fecha_inicio date,
  fecha_fin date,
  activo boolean not null default true
);

create table grados (
  id uuid primary key default gen_random_uuid(),
  escuela_id uuid not null references escuelas(id),
  nivel text not null,           -- 'villa' | 'primaria' | 'secundaria' | 'preparatoria'
  nombre text not null,          -- ej. '1° preparatoria'
  orden int
);

create table grupos (
  id uuid primary key default gen_random_uuid(),
  escuela_id uuid not null references escuelas(id),
  grado_id uuid not null references grados(id),
  ciclo_escolar_id uuid not null references ciclos_escolares(id),
  nombre text not null            -- ej. '1°A'
);

-- ==========================================================
-- Alumnos e inscripciones
-- ==========================================================
create table alumnos (
  id uuid primary key default gen_random_uuid(),
  escuela_id uuid not null references escuelas(id),
  nombre_completo text not null,
  fecha_nacimiento date,
  matricula text,
  tutor_nombre text,
  tutor_telefono text,
  tutor_email text,
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);

-- Datos como beca, tipo y facturación se guardan por inscripción
-- (no en el alumno) porque pueden cambiar de un ciclo escolar a otro,
-- tal como se maneja hoy en el control de pagos de Yoli.
create table inscripciones (
  id uuid primary key default gen_random_uuid(),
  escuela_id uuid not null references escuelas(id),
  alumno_id uuid not null references alumnos(id),
  grupo_id uuid not null references grupos(id),
  ciclo_escolar_id uuid not null references ciclos_escolares(id),
  fecha_inscripcion date not null default current_date,
  tipo_alumno text,               -- 'R' (recursante/regular) | 'NI' (nuevo ingreso) — confirmar con Yoli
  requiere_factura boolean not null default false,  -- columna "Cred" del control actual
  beca_porcentaje numeric(5,2) not null default 0   -- % de descuento mensual sobre colegiatura
);

-- ==========================================================
-- Pagos
-- ==========================================================
create table conceptos_pago (
  id uuid primary key default gen_random_uuid(),
  escuela_id uuid not null references escuelas(id),
  nombre text not null,          -- ej. 'Colegiatura', 'Inscripción'
  monto_default numeric(10,2)
);

-- Un cargo = lo que se le debe a un alumno por un concepto en un mes
-- del ciclo (ej. "Colegiatura septiembre"). "monto" ya trae aplicado
-- el % de beca de la inscripción del alumno en ese ciclo; se guarda
-- también el monto sin descuento para que el recibo pueda mostrar
-- ambos, igual que hoy se ve en el control de Excel.
create table cargos (
  id uuid primary key default gen_random_uuid(),
  escuela_id uuid not null references escuelas(id),
  alumno_id uuid not null references alumnos(id),
  concepto_pago_id uuid not null references conceptos_pago(id),
  ciclo_escolar_id uuid not null references ciclos_escolares(id),
  mes int,                        -- 1-12, útil para conceptos mensuales como colegiatura
  monto_original numeric(10,2) not null,
  monto numeric(10,2) not null,   -- monto_original con la beca ya aplicada
  fecha_vencimiento date,
  estatus text not null default 'pendiente'  -- pendiente | pagado | vencido
);

-- El "adeudo" que se ve por alumno en el control actual (suma de todos
-- los cargos pendientes) se calcula al consultar, no se guarda como
-- columna — así siempre refleja el estado real de los pagos.
--
-- estatus = 'vencido' se actualiza automáticamente por fecha (cargos
-- con estatus 'pendiente' cuya fecha_vencimiento ya pasó), no es algo
-- que capture manualmente caja. Esto se implementa como un job
-- programado (o una vista) en la aplicación, no aquí en el esquema.

-- Un pago es lo que entra de dinero en una sola transacción (ej. el
-- papá paga septiembre y octubre juntos). "pago_aplicaciones" reparte
-- ese monto entre uno o más cargos, así un pago puede cubrir varios
-- meses y un recibo puede listar todos los cargos que liquidó.
create table pagos (
  id uuid primary key default gen_random_uuid(),
  escuela_id uuid not null references escuelas(id),
  alumno_id uuid not null references alumnos(id),
  monto_total numeric(10,2) not null,
  fecha_pago timestamptz not null default now(),
  metodo_pago text,               -- efectivo | transferencia | tarjeta
  registrado_por uuid             -- referencia a usuarios/perfiles
);

create table pago_aplicaciones (
  id uuid primary key default gen_random_uuid(),
  pago_id uuid not null references pagos(id),
  cargo_id uuid not null references cargos(id),
  monto_aplicado numeric(10,2) not null
);

-- ==========================================================
-- Materias y horario de clase
-- ==========================================================
create table materias (
  id uuid primary key default gen_random_uuid(),
  escuela_id uuid not null references escuelas(id),
  nombre text not null            -- ej. 'Matemáticas'
);

-- Una fila = una clase recurrente: esta materia, a este grupo,
-- este día de la semana, en este horario, este ciclo escolar.
-- docente_id queda nullable: no se usa en el MVP (solo admin/dirección
-- pasa lista), pero ya existe para cuando el docente entre en v2.
create table horarios_clase (
  id uuid primary key default gen_random_uuid(),
  escuela_id uuid not null references escuelas(id),
  grupo_id uuid not null references grupos(id),
  materia_id uuid not null references materias(id),
  ciclo_escolar_id uuid not null references ciclos_escolares(id),
  docente_id uuid,                -- referencia a perfiles, se usa en v2
  dia_semana int not null,        -- 1=lunes ... 7=domingo
  hora_inicio time,
  hora_fin time
);

-- ==========================================================
-- Asistencia
-- ==========================================================
-- Un registro = un alumno, en una sesión de clase (horario_clase),
-- en una fecha específica. Esto permite varios registros el mismo
-- día para un mismo alumno, uno por cada materia/periodo.
create table asistencias (
  id uuid primary key default gen_random_uuid(),
  escuela_id uuid not null references escuelas(id),
  alumno_id uuid not null references alumnos(id),
  horario_clase_id uuid not null references horarios_clase(id),
  fecha date not null,
  estatus text not null,          -- presente | falta | retardo | justificado
  registrado_por uuid,
  unique (alumno_id, horario_clase_id, fecha)
);

-- ==========================================================
-- Usuarios y perfiles (roles dentro de una escuela)
-- ==========================================================
create table perfiles (
  id uuid primary key default gen_random_uuid(),
  escuela_id uuid not null references escuelas(id),
  usuario_auth_id uuid not null,  -- referencia a auth.users de Supabase
  nombre_completo text not null,
  rol text not null,              -- super_admin | direccion | caja
  creado_en timestamptz not null default now()
);

-- Índices básicos para las consultas más comunes
create index idx_alumnos_escuela on alumnos(escuela_id);
create index idx_inscripciones_alumno on inscripciones(alumno_id);
create index idx_cargos_alumno on cargos(alumno_id);
create index idx_pagos_alumno on pagos(alumno_id);
create index idx_pago_aplicaciones_cargo on pago_aplicaciones(cargo_id);
create index idx_pago_aplicaciones_pago on pago_aplicaciones(pago_id);
create index idx_asistencias_horario_fecha on asistencias(horario_clase_id, fecha);
create index idx_horarios_clase_grupo on horarios_clase(grupo_id);
