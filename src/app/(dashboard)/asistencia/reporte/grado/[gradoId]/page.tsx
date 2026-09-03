import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requerirRolPagina } from "@/lib/perfiles/requerirRolPagina";
import { TarjetaNavegacion } from "@/components/materias/TarjetaNavegacion";

export const dynamic = "force-dynamic";

const COLORES_GRUPO = ["#E3312D", "#c02926", "#8a3a38", "#5a2a29"];

interface GrupoSimple {
  id: string;
  nombre: string;
}

export default async function ReporteGradoPage({
  params,
}: {
  params: Promise<{ gradoId: string }>;
}) {
  await requerirRolPagina(["super_admin", "direccion"]);

  const { gradoId } = await params;
  const supabase = await createClient();

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

  const { data: grupos, error: errorGrupos } = await supabase
    .from("grupos")
    .select("id, nombre")
    .eq("grado_id", gradoId)
    .order("nombre");

  if (errorGrupos) {
    throw new Error(`No se pudieron cargar los grupos: ${errorGrupos.message}`);
  }

  const gruposSimples: GrupoSimple[] = grupos ?? [];

  if (gruposSimples.length === 1) {
    redirect(`/asistencia/reporte/grupo/${gruposSimples[0].id}`);
  }

  return (
    <div>
      <p className="text-sm text-zinc-600">
        <Link href="/asistencia/reporte" className="hover:underline">
          ← Niveles
        </Link>{" "}
        /{" "}
        {nivel && (
          <>
            <Link
              href={`/asistencia/reporte/nivel/${grado.nivel_id}`}
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

      {gruposSimples.length === 0 && (
        <p className="mt-6 text-zinc-600">Este grado todavía no tiene grupos.</p>
      )}

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        {gruposSimples.map((grupo, indice) => (
          <TarjetaNavegacion
            key={grupo.id}
            nombre={`Grupo ${grupo.nombre}`}
            subtitulo="Ver asistencia"
            href={`/asistencia/reporte/grupo/${grupo.id}`}
            color={COLORES_GRUPO[indice % COLORES_GRUPO.length]}
          />
        ))}
      </div>
    </div>
  );
}
