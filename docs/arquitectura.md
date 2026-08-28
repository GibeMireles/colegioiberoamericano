# Arquitectura

## Principio central: una instancia por escuela

Cada escuela corre su propia instancia dedicada: su propio proyecto de
Supabase (base de datos, Auth, Storage) y su propio deploy de
Next.js. No existe una base de datos ni un deploy compartido entre
escuelas — el aislamiento de datos es total porque, estructuralmente,
no hay ningún dato de otra escuela en la misma base.

Agregar una escuela nueva significa **replicar el proyecto completo**,
no agregar una fila a una tabla. El proceso de replicación:

1. Crear un nuevo proyecto de Supabase para la escuela.
2. Correr `database/schema.sql` en ese proyecto.
3. Insertar la fila única de `configuracion` con el nombre, colores y
   logo de esa escuela.
4. Desplegar una nueva instancia de la app (Vercel u otro) apuntando a
   ese proyecto de Supabase.

Este proceso es manual por ahora — automatizarlo (plantilla/CLI de
replicación) es trabajo futuro, a resolver cuando el número de
escuelas lo justifique.

## Configuración de marca de la instancia

Cada instancia tiene su propia identidad visual (colores, logo,
nombre corto) sin tocar el código de la aplicación. Esto vive en la
tabla `configuracion` (una sola fila por instancia), no como valores
fijos en el frontend.

Campos de `configuracion`:

- `nombre`
- `nombre_corto`
- `color_primario`, `color_secundario`
- `logo_url`

El frontend lee esta configuración al arrancar y aplica los colores
institucionales (por ejemplo, rojo y amarillo para Ibero) como
variables de tema.

## Entidades principales (alto nivel)

- `configuracion` — una sola fila con la identidad de marca de esta instancia.
- `ciclos_escolares` — periodo (ej. 2026-2027).
- `grados` — ej. "1° preparatoria".
- `grupos` — ej. "1°A", pertenece a un grado y a un ciclo escolar.
- `alumnos` — ficha del alumno.
- `inscripciones` — relación alumno–grupo–ciclo escolar.
- `conceptos_pago` — catálogo de conceptos (colegiatura, inscripción, etc.).
- `cargos` — monto que se le debe a un alumno por un concepto.
- `pagos` — registro de pagos aplicados a uno o varios cargos.
- `asistencias` — registro de asistencia por alumno, grupo y fecha.
- `usuarios` / `perfiles` — usuarios del sistema y su rol (admin,
  dirección, caja) dentro de esta instancia.

El detalle de columnas y relaciones vive en
[`database/schema.sql`](../database/schema.sql).

## Perfiles y permisos (alto nivel)

| Perfil | Puede |
|---|---|
| Super admin | Administrar la configuración y usuarios de esta instancia |
| Administrativo / Dirección | Gestionar alumnos, grados, grupos; ver reportes |
| Caja / Finanzas | Gestionar conceptos, cargos y pagos |

Los permisos finos se implementan vía RLS + rol del usuario, no en el
frontend.

## Frontend

- Next.js / React.
- El tema visual (colores institucionales) se carga dinámicamente
  desde `configuracion` — ver "Configuración de marca" arriba.

## Estado de este documento

Vivo — se actualiza conforme se validan decisiones con uso real en el
Colegio Iberoamericano.
