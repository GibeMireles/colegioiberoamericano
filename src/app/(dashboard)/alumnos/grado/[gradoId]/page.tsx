import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TarjetaEditable } from "@/components/alumnos/TarjetaEditable";
import { TarjetaAgregar } from "@/components/alumnos/TarjetaAgregar";
import { crearGrupo, renombrarGrupo, eliminarGrupo } from "../../estructura-actions";
import { obtenerCicloActivoId } from "@/lib/ciclos/activo";
import { requerirRolPagina } from "@/lib/perfiles/requerirRolPagina";

export const dynamic = "force-dynamic";

const COLORES_GRUPO = ["#E3312D", "#c02926", "#8a3a38", "#5a2a29"];

interface GrupoConConteo {
  id: string;
  nombre: string;
  cantidadAlumnos: number;
}

export default async function GrupoCardsPage({
  params,
  searchParams,
}: {
  params: Promise<{ gradoId: string }>;
  searchParams: Promise<{ ver?: string }>;
}) {
  await requerirRolPagina(["super_admin", "direccion", "docente"]);
  const { gradoId } = await params;
  const { ver } = await searchParams;
  const supabase = await createClient();

  // Nested embeds (e.g. .select("nivel:niveles(nombre)")) are avoided
  // project-wide — see Global Constraints. Two flat queries instead.
  const { data: grado, error: errorGrado } = await supabase
    .from("grados")
    .select("nombre, nivel_id")
    .eq("id", gradoId)
    .single();

  if (errorGrado || !grado) {
    notFound();
  }

  const { data: nivel } = await supabase
    .from("niveles")
    .select("nombre")
    .eq("id", grado.nivel_id)
    .single();

  const cicloId = await obtenerCicloActivoId();

  const { data: grupos, error: errorGrupos } = await supabase
    .from("grupos")
    .select("id, nombre")
    .eq("grado_id", gradoId)
    .order("nombre");

  if (errorGrupos) {
    throw new Error(`No se pudieron cargar los grupos: ${errorGrupos.message}`);
  }

  const gruposConConteo: GrupoConConteo[] = await Promise.all(
    (grupos ?? []).map(async (grupo) => {
      const { count } = await supabase
        .from("inscripciones")
        .select("id", { count: "exact", head: true })
        .eq("grupo_id", grupo.id)
        .eq("ciclo_escolar_id", cicloId ?? "");

      return { id: grupo.id, nombre: grupo.nombre, cantidadAlumnos: count ?? 0 };
    })
  );

  if (gruposConConteo.length === 1 && ver !== "todos") {
    redirect(`/alumnos/grupo/${gruposConConteo[0].id}`);
  }

  return (
    <div>
      <p className="text-sm text-zinc-600">
        <Link href="/alumnos" className="hover:underline">
          ← Niveles
        </Link>{" "}
        /{" "}
        {nivel && (
          <>
            <Link
              href={`/alumnos/nivel/${grado.nivel_id}?ver=todos`}
              className="hover:underline"
            >
              {nivel.nombre}
            </Link>{" "}
            /{" "}
          </>
        )}
        <span className="font-medium text-zinc-900">{grado.nombre}</span>
      </p>
      <h1 className="mt-1 text-2xl font-semibold text-zinc-900">{grado.nombre}</h1>

      {gruposConConteo.length === 0 && (
        <p className="mt-6 text-zinc-600">Este grado todavía no tiene grupos.</p>
      )}

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        {gruposConConteo.map((grupo, indice) => (
          <TarjetaEditable
            key={grupo.id}
            nombre={`Grupo ${grupo.nombre}`}
            subtitulo={`${grupo.cantidadAlumnos} alumno${grupo.cantidadAlumnos === 1 ? "" : "s"}`}
            href={`/alumnos/grupo/${grupo.id}`}
            color={COLORES_GRUPO[indice % COLORES_GRUPO.length]}
            cantidadHijos={grupo.cantidadAlumnos}
            etiquetaHijos="alumnos inscritos"
            accionRenombrar={renombrarGrupo.bind(null, grupo.id, gradoId)}
            accionEliminar={eliminarGrupo.bind(null, grupo.id, gradoId)}
          />
        ))}
        <TarjetaAgregar
          etiqueta="grupo"
          accionCrear={crearGrupo.bind(null, gradoId)}
        />
      </div>
    </div>
  );
}
