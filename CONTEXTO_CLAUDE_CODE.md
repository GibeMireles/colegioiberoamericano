# Contexto del proyecto — para Claude Code

Repo: https://github.com/GibeMireles/colegioiberoamericano

## Qué es esto

Plataforma de gestión escolar para el Colegio Iberoamericano
(preparatoria), pensada desde el inicio para poder extenderse a otras
escuelas del mismo dueño (2 más actualmente) y eventualmente a
terceros. Reemplaza un sistema actual basado en múltiples archivos de
Excel.

Lee primero `README.md` y `docs/arquitectura.md` en el repo — ahí está
el planteamiento completo y el modelo de datos multi-escuela. No los
repito aquí para evitar que queden desincronizados.

## Stack

- **Backend / DB**: Supabase (Postgres + Auth + RLS)
- **Frontend**: Next.js / React
- El esquema inicial ya existe en `database/schema.sql` — created uses
  `escuela_id` en cada tabla para separar datos por institución desde
  el día uno.

## Estado actual

- Planteamiento del producto: cerrado.
- Esquema de base de datos: primera versión escrita, sin correr aún
  en un proyecto real de Supabase.
- Identidad visual: colores institucionales de Ibero son rojo
  (`#D85A30` aprox.) y amarillo/dorado (`#EF9F27` aprox.), tomados de
  su sitio/logo actual. Estos deben vivir como configuración por
  escuela (columnas `color_primario` / `color_secundario` en la tabla
  `escuelas`), no hardcodeados en el frontend — para que otras
  escuelas puedan tener los suyos sin tocar código.
- Aún no hay frontend ni proyecto de Supabase creado.

## Alcance del MVP — 3 módulos

1. Alumnos y grados
2. Pagos / colegiaturas
3. Listas / asistencia

## Perfiles de usuario del MVP

- Super admin (administra escuelas dentro de la plataforma)
- Administrativo / Dirección
- Caja / Finanzas

(Docente queda para una v2, no construir aún.)

## Enfoque de trabajo

Vamos avanzando de forma iterativa: validar estructura → mostrar
avance → ajustar → agregar la siguiente pieza. No sobre-construir de
golpe. Priorizar que el MVP funcione bien en Iberoamericano antes de
generalizar para otras escuelas.

## Primeros pasos sugeridos para esta sesión

1. Crear el proyecto de Supabase y correr `database/schema.sql`.
2. Configurar RLS básico por `escuela_id` y por rol (`perfiles.rol`).
3. Scaffolding del proyecto Next.js con conexión a Supabase.
4. Layout base con navegación lateral y tema dinámico por escuela
   (leyendo `color_primario` / `color_secundario` de la tabla
   `escuelas`), sobre el cual se irán montando los 3 módulos.
