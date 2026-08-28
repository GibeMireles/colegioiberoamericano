# Arquitectura

## Principio central: multi-escuela desde el día uno

Aunque el MVP solo se usa en el Colegio Iberoamericano, cada tabla
principal incluye una columna `escuela_id`. Esto evita una migración
dolorosa después y permite que, cuando se sume una segunda escuela,
sea cuestión de crear un registro nuevo en `escuelas` — no de cambiar
el esquema.

El aislamiento de datos entre escuelas se implementa con **Row Level
Security (RLS)** de Supabase/Postgres: cada usuario solo puede leer o
escribir filas de su propia `escuela_id`.

## Configuración de marca por escuela

Cada escuela puede tener su propia identidad visual (colores, logo,
nombre corto) sin tocar el código de la aplicación. Esto vive en la
tabla `escuelas` como configuración, no como valores fijos en el
frontend.

Ejemplo de campos en `escuelas`:

- `nombre`
- `color_primario`, `color_secundario`
- `logo_url`

El frontend lee esta configuración al cargar la sesión del usuario y
aplica los colores institucionales (por ejemplo, rojo y amarillo para
Ibero) como variables de tema.

## Entidades principales (alto nivel)

- `escuelas` — una fila por institución.
- `ciclos_escolares` — periodo (ej. 2026-2027), pertenece a una escuela.
- `grados` — ej. "1° preparatoria", pertenece a una escuela.
- `grupos` — ej. "1°A", pertenece a un grado y a un ciclo escolar.
- `alumnos` — ficha del alumno, pertenece a una escuela.
- `inscripciones` — relación alumno–grupo–ciclo escolar.
- `conceptos_pago` — catálogo de conceptos (colegiatura, inscripción, etc.).
- `cargos` — monto que se le debe a un alumno por un concepto.
- `pagos` — registro de pagos aplicados a uno o varios cargos.
- `asistencias` — registro de asistencia por alumno, grupo y fecha.
- `usuarios` / `perfiles` — usuarios del sistema y su rol (admin,
  dirección, caja) dentro de una escuela.

El detalle de columnas y relaciones vive en
[`database/schema.sql`](../database/schema.sql).

## Perfiles y permisos (alto nivel)

| Perfil | Puede |
|---|---|
| Super admin | Administrar escuelas y usuarios de la plataforma |
| Administrativo / Dirección | Gestionar alumnos, grados, grupos; ver reportes |
| Caja / Finanzas | Gestionar conceptos, cargos y pagos |

Los permisos finos se implementan vía RLS + rol del usuario, no en el
frontend.

## Frontend

- Next.js / React.
- El tema visual (colores institucionales) se carga dinámicamente por
  escuela — ver "Configuración de marca" arriba.

## Estado de este documento

Vivo — se actualiza conforme se validan decisiones con uso real en el
Colegio Iberoamericano.
