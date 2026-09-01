import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TarjetaAgregar } from "@/components/alumnos/TarjetaAgregar";
import { FilaMateria } from "@/components/materias/FilaMateria";
import { crearMateria, renombrarMateria, eliminarMateria } from "../../actions";

export const dynamic = "force-dynamic";

interface ContextoGrado {
  nivelId: string;
  nivelNombre: string;
  gradoNombre: string;
}

interface MateriaListado {
  id: string;
  nombre: string;
  cantidadAsignaciones: number;
}

async function obtenerContexto(gradoId: string): Promise<ContextoGrado | null> {
  const supabase = await createClient();

  const { data: grado, error: errorGrado } = await supabase
    .from("grados")
    .select("nombre, nivel_id")
    .eq("id", gradoId)
    .single();

  if (errorGrado || !grado) {
    return null;
  }

  const { data: nivel, error: errorNivel } = await supabase
    .from("niveles")
    .select("nombre")
    .eq("id", grado.nivel_id)
    .single();

  if (errorNivel || !nivel) {
    return null;
  }

  return {
    nivelId: grado.nivel_id,
    nivelNombre: nivel.nombre,
    gradoNombre: grado.nombre,
  };
}

async function obtenerMaterias(gradoId: string): Promise<MateriaListado[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("materias")
    .select("id, nombre")
    .eq("grado_id", gradoId)
    .order("orden");

  if (error) {
    throw new Error(`No se pudieron cargar las materias: ${error.message}`);
  }

  return Promise.all(
    (data ?? []).map(async (materia) => {
      const { count } = await supabase
        .from("asignaciones")
        .select("id", { count: "exact", head: true })
        .eq("materia_id", materia.id);

      return { id: materia.id, nombre: materia.nombre, cantidadAsignaciones: count ?? 0 };
    })
  );
}

export default async function MateriasGradoPage({
  params,
}: {
  params: Promise<{ gradoId: string }>;
}) {
  const { gradoId } = await params;
  const contexto = await obtenerContexto(gradoId);

  if (!contexto) {
    notFound();
  }

  const materias = await obtenerMaterias(gradoId);

  return (
    <div>
      <p className="text-sm text-zinc-600">
        <Link href="/materias" className="hover:underline">
          ← Niveles
        </Link>{" "}
        /{" "}
        <Link href={`/materias/nivel/${contexto.nivelId}`} className="hover:underline">
          {contexto.nivelNombre}
        </Link>{" "}
        / <span className="font-medium text-zinc-900">{contexto.gradoNombre}</span>
      </p>
      <h1 className="mt-1 text-2xl font-semibold text-zinc-900">
        Materias — {contexto.gradoNombre}
      </h1>

      {materias.length === 0 && (
        <p className="mt-6 text-zinc-600">Este grado todavía no tiene materias.</p>
      )}

      <div className="mt-6 space-y-3">
        {materias.map((materia) => (
          <FilaMateria
            key={materia.id}
            nombre={materia.nombre}
            cantidadAsignaciones={materia.cantidadAsignaciones}
            accionRenombrar={renombrarMateria.bind(null, materia.id, gradoId)}
            accionEliminar={eliminarMateria.bind(null, materia.id, gradoId)}
          />
        ))}
      </div>

      <div className="mt-6 max-w-xs">
        <TarjetaAgregar etiqueta="materia" accionCrear={crearMateria.bind(null, gradoId)} />
      </div>
    </div>
  );
}
