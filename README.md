# Colegio Iberoamericano — Plataforma de gestión escolar

Plataforma para centralizar la gestión administrativa del Colegio
Iberoamericano (nivel preparatoria), diseñada desde el inicio para
poder replicarse a otras escuelas.

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

- **Super admin** — administra la configuración y usuarios de esta instancia.
- **Administrativo / Dirección** — gestión general y reportes.
- **Caja / Finanzas** — pagos y cobranza.
- *(Docente queda para una v2)*

## Diseño pensado a futuro

Cada escuela corre su propia instancia dedicada (su propio proyecto de
Supabase y su propio deploy) — ver
[`docs/arquitectura.md`](docs/arquitectura.md). No hay una base de
datos compartida entre escuelas: agregar una institución nueva es
replicar este proyecto, no una migración de esquema. Cada escuela
tiene su propia configuración de marca (colores, logo) en su propia
instancia.

## Ruta del proyecto

MVP funcional en Iberoamericano → ajustes con uso real → replicar la
instancia para otras escuelas → empaquetar el proceso de replicación
para ofrecerlo externamente.

## Estructura del repo

```
docs/          Documentación de producto y arquitectura
database/      Esquema de base de datos (Supabase / Postgres)
src/           App Next.js (App Router)
```

(No hay carpeta `public/`: los SVG del starter template de Next.js se
eliminaron.)

## Stack

- **Backend / base de datos**: Supabase (Postgres, autenticación, RLS
  por rol dentro de la instancia)
- **Frontend**: Next.js / React

## Estado actual

🚧 En desarrollo — layout base terminado (navegación + tema de marca);
Supabase real conectado y con el esquema migrado. El módulo **Alumnos
y grados** está implementado (alta, edición, listado, baja/reactivación
lógica), y los otros dos módulos del MVP (Pagos / colegiaturas y
Listas/Asistencia) ya tienen funcionalidad real.

### Variables de entorno

Para correr el proyecto en un clon nuevo se necesitan estas variables
(ver plantilla en `.env.example`):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `GRUPO_PILOTO_ID`
- `CICLO_PILOTO_ID`
