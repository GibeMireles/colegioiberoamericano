# Contexto del proyecto — para Claude Code

Repo: https://github.com/GibeMireles/colegioiberoamericano

## Qué es esto

Plataforma de gestión escolar para el Colegio Iberoamericano
(preparatoria), pensada desde el inicio para poder replicarse a otras
escuelas del mismo dueño (2 más actualmente) y eventualmente a
terceros. Reemplaza un sistema actual basado en múltiples archivos de
Excel.

Lee primero `README.md` y `docs/arquitectura.md` en el repo — ahí está
el planteamiento completo y el modelo de instancia dedicada por
escuela. No los repito aquí para evitar que queden desincronizados.

## Stack

- **Backend / DB**: Supabase (Postgres + Auth + RLS)
- **Frontend**: Next.js / React
- El esquema inicial ya existe en `database/schema.sql`. Cada escuela
  corre su propia instancia (su propio proyecto Supabase): no hay
  `escuela_id` compartido, la identidad de marca vive en una tabla
  `configuracion` de una sola fila por instancia.

## Estado actual

- Planteamiento del producto: cerrado.
- Modelo de datos: instancia dedicada por escuela (no multi-tenant
  compartido) — ver `docs/arquitectura.md`.
- Esquema de base de datos: primera versión escrita, sin correr aún
  en un proyecto real de Supabase.
- Identidad visual: colores institucionales de Ibero son rojo
  (`#D85A30` aprox.) y amarillo/dorado (`#EF9F27` aprox.), tomados de
  su sitio/logo actual. Viven como configuración (`color_primario` /
  `color_secundario` en la tabla `configuracion`), no hardcodeados en
  el frontend — para que una réplica en otra escuela solo cambie esa
  fila, sin tocar código.
- Repo de Next.js scaffoldeado (App Router, TypeScript, Tailwind).
  Layout base (navegación + tema de marca) terminado — ver
  `docs/superpowers/plans/2026-08-28-single-tenant-base-layout.md`. Los
  3 módulos del MVP son placeholders (`/alumnos`, `/pagos`,
  `/asistencia`).
- Proyecto de Supabase real: aún no creado.

## Alcance del MVP — 3 módulos

1. Alumnos y grados
2. Pagos / colegiaturas
3. Listas / asistencia

## Perfiles de usuario del MVP

- Super admin (administra la configuración y usuarios de esta instancia)
- Administrativo / Dirección
- Caja / Finanzas

(Docente queda para una v2, no construir aún.)

## Enfoque de trabajo

Vamos avanzando de forma iterativa: validar estructura → mostrar
avance → ajustar → agregar la siguiente pieza. No sobre-construir de
golpe. Priorizar que el MVP funcione bien en Iberoamericano antes de
replicar a otras escuelas.

## Próximos pasos pendientes

1. Crear el proyecto de Supabase real y correr `database/schema.sql`.
2. Reemplazar el mock de `src/lib/config.ts` por una consulta real a
   la tabla `configuracion`.
3. Configurar RLS básico por rol (`perfiles.rol`) — ya no por
   `escuela_id`, porque no aplica en una instancia dedicada.
