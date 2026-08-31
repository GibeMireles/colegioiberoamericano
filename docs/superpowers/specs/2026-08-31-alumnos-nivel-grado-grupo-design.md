# Diseño: Alumnos — navegación por Nivel / Grado / Grupo

## Contexto

El módulo de Alumnos (ver `docs/superpowers/specs/2026-08-31-alumnos-piloto-1ro-prepa-design.md`)
se construyó fijo a un solo grupo real ("1° Preparatoria, Grupo 1°A")
vía las variables de entorno `GRUPO_PILOTO_ID`/`CICLO_PILOTO_ID`, a
propósito, porque cuando se escribió ese era el único salón real del
colegio.

Eso dejó de ser cierto: el colegio necesita dar de alta, en este mismo
ciclo escolar, alumnos de **13 grados reales** repartidos en 4 niveles:

- **Villa** (preescolar/kinder) — 3 grados
- **Primaria** — 6 grados
- **Secundaria** — 3 grados
- **Preparatoria** — 1 grado (ya en uso, con alumnos reales)

El personal administrativo necesita poder ubicar y navegar entre esos
grados/grupos desde la UI — hoy no hay ninguna forma de hacerlo, todo
está fijo al piloto. Este documento diseña esa navegación.

## Decisión de alcance: sin pantalla de administración de grados/grupos

Cuando haga falta un grado o grupo nuevo, se siembra directo en
Supabase (por quien opera este proyecto), igual que se hizo para el
piloto. **No** se construye una UI de alta/edición de
niveles/grados/grupos en este documento — sigue explícitamente fuera
de alcance, igual que en la spec del piloto. Lo único que cambia es
que la UI de Alumnos deja de asumir que existe un solo grupo y pasa a
leer/navegar lo que sí exista en la base.

## Modelo de datos

Un solo cambio de esquema: agregar una columna `nivel` a la tabla
`grados` existente (`database/schema.sql`) — sin tabla nueva, porque
son 4 valores fijos que prácticamente nunca cambian y no tienen
metadata propia más allá del nombre/orden que ya tiene `grados`.

```sql
alter table grados
  add column nivel text not null
  check (nivel in ('villa', 'primaria', 'secundaria', 'preparatoria'));

update grados set nivel = 'preparatoria' where nombre = '1° Preparatoria';
```

`grados.orden` sigue existiendo y sigue ordenando dentro del nivel
(1-6 para primaria, etc.). `grupos` e `inscripciones` no cambian — ahí
ya vive correctamente la relación alumno↔grupo desde el piloto, así
que los 2 alumnos ya dados de alta en Preparatoria no requieren
ninguna migración de datos, solo dejan de depender de la variable de
entorno para encontrarse.

**Orden y etiquetas de nivel** viven como una constante en el código
(no en la base — son 4 valores fijos):

```ts
export const NIVELES = [
  { valor: "villa", etiqueta: "Villa" },
  { valor: "primaria", etiqueta: "Primaria" },
  { valor: "secundaria", etiqueta: "Secundaria" },
  { valor: "preparatoria", etiqueta: "Preparatoria" },
] as const;
```

**Ciclo escolar:** deja de pedirse en la URL o en variables de
entorno. Se resuelve solo, consultando `ciclos_escolares` por
`activo = true` — el personal no navega entre ciclos en el día a día,
así que no tiene sentido pedírselo en cada pantalla.

## Navegación y rutas

Reemplaza `src/app/(dashboard)/alumnos/page.tsx` (que hoy es el
listado directo) y agrega rutas nuevas dentro de
`src/app/(dashboard)/alumnos/`:

```
/alumnos                              → tarjetas de nivel (4, fijas)
/alumnos/nivel/[nivel]                → tarjetas de grado de ese nivel
/alumnos/grado/[gradoId]              → tarjetas de grupo de ese grado
/alumnos/grupo/[grupoId]              → listado de alumnos (lo que hoy es /alumnos)
/alumnos/grupo/[grupoId]/nuevo        → alta, inscribe en ese grupo
/alumnos/grupo/[grupoId]/[id]/editar  → edición (mismo formulario de hoy)
```

**Regla de "saltar cuando hay un solo hijo":** si un nivel tiene
exactamente 1 grado, `/alumnos/nivel/[nivel]` redirige directo a ese
grado en vez de mostrar una pantalla de tarjetas con una sola opción.
Igual para grado→grupo: si un grado tiene exactamente 1 grupo,
`/alumnos/grado/[gradoId]` redirige directo a
`/alumnos/grupo/[grupoId]`. Con esta regla, el caso de hoy
(Preparatoria → 1 grado → 1 grupo) sigue llegando al listado en el
mismo número de clics que ahora — la navegación por tarjetas solo
aparece cuando de verdad hay algo entre qué elegir (como Primaria, con
6 grados).

El nivel "Alumnos y grados" en el sidebar (`src/lib/nav.ts`) sigue
apuntando a `/alumnos` sin cambios.

### Contenido de cada pantalla de tarjetas

- **Nivel** (`/alumnos`): 4 tarjetas redondeadas, una por nivel en el
  orden fijo de `NIVELES`, con el nombre y "N grados". Estilo
  aprobado: tarjeta de color sólido, usando 4 tonos derivados del rojo
  institucional (`#E3312D`, `#c02926`, `#8a3a38`, `#5a2a29` —
  hardcodeados por ahora; si esto se replica a otra escuela con otro
  color de marca, se revisita entonces, no antes).
- **Grado** (`/alumnos/nivel/[nivel]`): tarjetas por cada grado del
  nivel (ordenadas por `grados.orden`), mismo estilo, con "N grupos"
  como subtítulo. Breadcrumb "← Niveles / {Nivel}" arriba.
- **Grupo** (`/alumnos/grado/[gradoId]`): tarjetas por cada grupo del
  grado, con "N alumnos" (activos, del ciclo activo) como subtítulo.
  Breadcrumb "← {Nivel} / {Grado}" arriba.
- **Listado** (`/alumnos/grupo/[grupoId]`): el mismo listado que existe
  hoy (tabla con nombre/matrícula/tutor/estatus/acciones), con
  breadcrumb "← {Grado} / {Grupo}" arriba y el título cambiado a
  "Alumnos — {Grado}, {Grupo}".

Mockups del recorrido completo aprobados en la sesión de brainstorming
(navegador, no versionados aquí).

## Server Actions

`src/app/(dashboard)/alumnos/actions.ts`:

- `crearAlumno(grupoId: string, formData: FormData)` — cambia de firma:
  ya no lee `GRUPO_PILOTO_ID`/`CICLO_PILOTO_ID` de `process.env`, recibe
  `grupoId` como parámetro (viene de la URL) y resuelve el ciclo activo
  internamente (`ciclos_escolares.activo = true`).
- `actualizarAlumno(id, formData)` y `alternarActivoAlumno(id, activo)`
  — sin cambios, no necesitan contexto de grupo.

`GRUPO_PILOTO_ID` y `CICLO_PILOTO_ID` quedan obsoletas y se retiran de
`.env.local`/`.env.example` una vez esto esté implementado.
`src/lib/grupos/piloto.ts` (el helper que las leía) se reemplaza por
funciones que resuelven nivel/grado/grupo/ciclo a partir de parámetros
reales, no de variables fijas.

## Manejo de errores

- Nivel en la URL que no es uno de los 4 valores válidos → `notFound()`.
- `gradoId`/`grupoId` que no existen → `notFound()` (mismo patrón que
  ya usa hoy "editar alumno").
- Grado sin grupos, o nivel sin grados (no debería pasar con los datos
  reales, pero la UI no debe tronar si pasa) → mensaje de estado vacío
  en la pantalla de tarjetas correspondiente, igual que el listado ya
  maneja "Todavía no hay alumnos registrados."

## Testing

No hay lógica pura nueva que valga la pena testear con Vitest más allá
de lo que ya cubre `schema.ts` — la validación de nivel es solo un
`check` de Postgres más un `.find()` contra la constante `NIVELES` en
el código, no una regla de negocio compleja. Las páginas de tarjetas
no se prueban con RTL/jsdom, mismo criterio que el resto del proyecto.

**Verificación real:** `npm run build` + `npm run lint` limpios, y
verificación manual contra Supabase real: navegar Villa (3 grados),
Primaria (6 grados, probar un grado con más de 1 grupo si ya existe
alguno sembrado), Secundaria (3 grados), y confirmar que Preparatoria
sigue llegando al listado existente (con Ana Torres y Luis Hernández)
sin pasos de más.

## Explícitamente fuera de alcance

- UI de administración (alta/edición) de niveles, grados, grupos o
  ciclos escolares — se siembran directo en Supabase.
- Colores de tarjeta configurables por instancia/marca — hardcoded por
  ahora.
- Cualquier trabajo sobre Pagos o Listas/Asistencia (ver nota en
  `CONTEXTO_CLAUDE_CODE.md` sobre decidir el patrón de escrituras
  acotadas por grupo antes de planear esos módulos).
- Login, roles, RLS — sigue pendiente como trabajo aparte.

## Datos a sembrar antes de implementar

Antes de escribir el plan de implementación hace falta que el usuario
provea, para los 12 grados nuevos (3 Villa + 6 Primaria + 3
Secundaria): nombre exacto de cada grado y cuántos grupos tiene cada
uno (y sus nombres, ej. "Grupo A"/"Grupo B"). Sin esto el plan puede
escribirse (la lógica no depende de cuántos grados/grupos haya), pero
la siembra real de datos para probar contra Supabase sí lo necesita.
