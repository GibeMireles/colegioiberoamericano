import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TarjetaEditable } from "@/components/alumnos/TarjetaEditable";
import { TarjetaAgregar } from "@/components/alumnos/TarjetaAgregar";
import { crearGrado, renombrarGrado, eliminarGrado } from "../../estructura-actions";

export const dynamic = "force-dynamic";

const COLORES_GRADO = ["#E3312D", "#c02926", "#8a3a38", "#5a2a29"];

interface GradoConConteo {
  id: string;
  nombre: string;
  cantidadGrupos: number;
}

export default async function GradoCardsPage({
  params,
}: {
  params: Promise<{ nivelId: string }>;
}) {
  const { nivelId } = await params;
  const supabase = createClient();

  const { data: nivel, error: errorNivel } = await supabase
    .from("niveles")
    .select("nombre")
    .eq("id", nivelId)
    .single();

  if (errorNivel || !nivel) {
    notFound();
  }

  const { data: grados, error: errorGrados } = await supabase
    .from("grados")
    .select("id, nombre")
    .eq("nivel_id", nivelId)
    .order("orden");

  if (errorGrados) {
    throw new Error(`No se pudieron cargar los grados: ${errorGrados.message}`);
  }

  const gradosConConteo: GradoConConteo[] = await Promise.all(
    (grados ?? []).map(async (grado) => {
      const { count } = await supabase
        .from("grupos")
        .select("id", { count: "exact", head: true })
        .eq("grado_id", grado.id);

      return { id: grado.id, nombre: grado.nombre, cantidadGrupos: count ?? 0 };
    })
  );

  if (gradosConConteo.length === 1) {
    redirect(`/alumnos/grado/${gradosConConteo[0].id}`);
  }

  return (
    <div>
      <p className="text-sm text-zinc-600">
        <Link href="/alumnos" className="hover:underline">
          ← Niveles
        </Link>{" "}
        / <span className="font-medium text-zinc-900">{nivel.nombre}</span>
      </p>
      <h1 className="mt-1 text-2xl font-semibold text-zinc-900">{nivel.nombre}</h1>

      {gradosConConteo.length === 0 && (
        <p className="mt-6 text-zinc-600">Este nivel todavía no tiene grados.</p>
      )}

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        {gradosConConteo.map((grado, indice) => (
          <TarjetaEditable
            key={grado.id}
            nombre={grado.nombre}
            subtitulo={`${grado.cantidadGrupos} grupo${grado.cantidadGrupos === 1 ? "" : "s"}`}
            href={`/alumnos/grado/${grado.id}`}
            color={COLORES_GRADO[indice % COLORES_GRADO.length]}
            cantidadHijos={grado.cantidadGrupos}
            etiquetaHijos="grupos"
            accionRenombrar={renombrarGrado.bind(null, grado.id, nivelId)}
            accionEliminar={eliminarGrado.bind(null, grado.id, nivelId)}
          />
        ))}
        <TarjetaAgregar
          etiqueta="grado"
          accionCrear={crearGrado.bind(null, nivelId)}
        />
      </div>
    </div>
  );
}
