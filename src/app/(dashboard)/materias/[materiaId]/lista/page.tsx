import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { obtenerCicloActivoId } from "@/lib/ciclos/activo";
import { obtenerAlumnosDelGrupoDeMateria } from "@/lib/materias/roster";
import { guardarListaMateria } from "./actions";

export const dynamic = "force-dynamic";

interface ContextoMateria {
  gradoId: string;
  materiaNombre: string;
}

interface AlumnoOpcion {
  id: string;
  nombre: string;
  marcado: boolean;
}

async function obtenerContexto(materiaId: string): Promise<ContextoMateria | null> {
  const supabase = await createClient();

  const { data: materia, error } = await supabase
    .from("materias")
    .select("nombre, grado_id")
    .eq("id", materiaId)
    .single();

  if (error || !materia) {
    return null;
  }

  return { gradoId: materia.grado_id, materiaNombre: materia.nombre };
}

async function obtenerAlumnosParaLista(
  materiaId: string,
  cicloId: string
): Promise<AlumnoOpcion[]> {
  const supabase = await createClient();

  const alumnosDelGrupo = await obtenerAlumnosDelGrupoDeMateria(materiaId, cicloId);

  if (alumnosDelGrupo.length === 0) {
    return [];
  }

  const { data: yaEnLista, error: errorLista } = await supabase
    .from("materia_alumnos")
    .select("alumno_id")
    .eq("materia_id", materiaId)
    .eq("ciclo_escolar_id", cicloId);

  if (errorLista) {
    throw new Error(`No se pudo cargar la lista propia: ${errorLista.message}`);
  }

  const idsEnLista = new Set((yaEnLista ?? []).map((fila) => fila.alumno_id));
  const hayListaPropia = idsEnLista.size > 0;

  return alumnosDelGrupo
    .map((alumno) => {
      const apellidos = [alumno.apellido_paterno, alumno.apellido_materno]
        .filter((valor): valor is string => Boolean(valor))
        .join(" ");

      return {
        id: alumno.id,
        nombre: apellidos ? `${apellidos}, ${alumno.nombres}` : alumno.nombres,
        marcado: hayListaPropia ? idsEnLista.has(alumno.id) : true,
      };
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

export default async function ListaMateriaPage({
  params,
}: {
  params: Promise<{ materiaId: string }>;
}) {
  const { materiaId } = await params;
  const contexto = await obtenerContexto(materiaId);

  if (!contexto) {
    notFound();
  }

  const cicloId = await obtenerCicloActivoId();

  if (!cicloId) {
    throw new Error("No hay un ciclo escolar activo.");
  }

  const alumnos = await obtenerAlumnosParaLista(materiaId, cicloId);

  return (
    <div>
      <p className="text-sm text-zinc-600">
        <Link href={`/materias/grado/${contexto.gradoId}`} className="hover:underline">
          ← {contexto.materiaNombre}
        </Link>
      </p>
      <h1 className="mt-1 text-2xl font-semibold text-zinc-900">
        Lista propia — {contexto.materiaNombre}
      </h1>
      <p className="mt-1 text-sm text-zinc-600">
        Por defecto la materia toma a todo el grupo. Desmarca a quien no
        deba estar en esta materia.
      </p>

      {alumnos.length === 0 ? (
        <p className="mt-6 text-zinc-600">
          Esta materia todavía no tiene un grupo asignado.
        </p>
      ) : (
        <form action={guardarListaMateria.bind(null, materiaId)} className="mt-6">
          <div className="space-y-2">
            {alumnos.map((alumno) => (
              <label key={alumno.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="alumno_id" value={alumno.id} defaultChecked={alumno.marcado} />
                {alumno.nombre}
              </label>
            ))}
          </div>
          <button
            type="submit"
            className="mt-4 rounded-md bg-primario px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            Guardar lista
          </button>
        </form>
      )}
    </div>
  );
}
