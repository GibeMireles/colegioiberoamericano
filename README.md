# Colegio Iberoamericano — Plataforma de gestión escolar

Plataforma para centralizar la gestión administrativa del Colegio
Iberoamericano (nivel preparatoria), diseñada desde el inicio para
poder extenderse a otras escuelas.

## Problema

Actualmente la gestión administrativa (alumnos, grados, pagos, listas)
se lleva en múltiples archivos de Excel dispersos. Esto genera
duplicidad de información, riesgo de errores y falta de visibilidad
centralizada.

## Visión

Una plataforma web centralizada donde el personal administrativo
gestione alumnos, grados, listas y pagos desde un solo lugar, con
información organizada por perfiles de usuario.

## Alcance del MVP

Tres módulos base:

1. **Alumnos y grados** — ficha del alumno, grado, grupo, ciclo escolar.
2. **Pagos / colegiaturas** — conceptos, cargos, pagos, saldos.
3. **Listas / asistencia** — grupos, pase de lista, reportes de faltas.

## Perfiles de usuario (MVP)

- **Super admin** — administra las escuelas dentro de la plataforma.
- **Administrativo / Dirección** — gestión general y reportes.
- **Caja / Finanzas** — pagos y cobranza.
- *(Docente queda para una v2)*

## Diseño pensado a futuro

Aunque el MVP se valida con el Colegio Iberoamericano, el modelo de
datos está diseñado para multi-escuela desde el día uno (ver
[`docs/arquitectura.md`](docs/arquitectura.md)), de forma que agregar
una nueva institución no requiera rediseñar el sistema, y cada escuela
pueda tener su propia configuración de marca (colores, logo) y sus
particularidades.

## Ruta del proyecto

MVP funcional en Iberoamericano → ajustes con uso real → extensión a
otras escuelas → generalización para ofrecerlo externamente.

## Estructura del repo

```
docs/          Documentación de producto y arquitectura
database/      Esquema de base de datos (Supabase / Postgres)
```

## Stack

- **Backend / base de datos**: Supabase (Postgres, autenticación, RLS
  para separar datos por escuela y por perfil)
- **Frontend**: Next.js / React

## Estado actual

🚧 En planeación — definiendo estructura de datos y bocetos de
interfaz antes de iniciar la programación de los módulos.
