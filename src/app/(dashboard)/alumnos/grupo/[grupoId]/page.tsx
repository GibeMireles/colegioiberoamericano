import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { alternarActivoAlumno } from "../../actions";

export const dynamic = "force-dynamic";

interface AlumnoListado {
  id: string;
  nombre_completo: string;
  matricula: string | null;
  tutor_nombre: string | null;
  activo: boolean;
}

interface ContextoGrupo {
  gradoId: string;
  gradoNombre: string;
  grupoNombre: string;
}

async function obtenerContexto(grupoId: string): Promise<ContextoGrupo | null> {
  const supabase = createClient();

  const { data: grupo, error: errorGrupo } = await supabase
    .from("grupos")
    .select("nombre, grado_id")
    .eq("id", grupoId)
    .single();

  if (errorGrupo || !grupo) {
    return null;
  }

  const { data: grado, error: errorGrado } = await supabase
    .from("grados")
    .select("nombre")
    .eq("id", grupo.grado_id)
    .single();

  if (errorGrado || !grado) {
    return null;
  }

  return {
    gradoId: grupo.grado_id,
    gradoNombre: grado.nombre,
    grupoNombre: grupo.nombre,
  };
}

async function obtenerAlumnosDelGrupo(grupoId: string): Promise<AlumnoListado[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("inscripciones")
    .select("alumnos(id, nombre_completo, matricula, tutor_nombre, activo)")
    .eq("grupo_id", grupoId);

  if (error) {
    throw new Error(`No se pudo cargar la lista de alumnos: ${error.message}`);
  }

  return (data ?? []).flatMap((inscripcion) => inscripcion.alumnos);
}

export default async function ListadoAlumnosPage({
  params,
}: {
  params: Promise<{ grupoId: string }>;
}) {
  const { grupoId } = await params;
  const contexto = await obtenerContexto(grupoId);

  if (!contexto) {
    notFound();
  }

  const alumnos = await obtenerAlumnosDelGrupo(grupoId);

  return (
    <div>
      <p className="text-sm text-zinc-600">
        <Link href={`/alumnos/grado/${contexto.gradoId}`} className="hover:underline">
          ← {contexto.gradoNombre}
        </Link>{" "}
        / <span className="font-medium text-zinc-900">Grupo {contexto.grupoNombre}</span>
      </p>
      <div className="mt-1 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-zinc-900">
          Alumnos — {contexto.gradoNombre}, Grupo {contexto.grupoNombre}
        </h1>
        <Link
          href={`/alumnos/grupo/${grupoId}/nuevo`}
          className="rounded-md bg-primario px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          Agregar alumno
        </Link>
      </div>

      {alumnos.length === 0 ? (
        <p className="mt-6 text-zinc-600">Todavía no hay alumnos registrados.</p>
      ) : (
        <table className="mt-6 w-full text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-zinc-500">
              <th className="py-2 font-medium">Nombre</th>
              <th className="py-2 font-medium">Matrícula</th>
              <th className="py-2 font-medium">Tutor</th>
              <th className="py-2 font-medium">Estatus</th>
              <th className="py-2 font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {alumnos.map((alumno) => (
              <tr key={alumno.id} className="border-b border-zinc-100">
                <td className="py-2 text-zinc-900">{alumno.nombre_completo}</td>
                <td className="py-2 text-zinc-600">{alumno.matricula ?? "—"}</td>
                <td className="py-2 text-zinc-600">{alumno.tutor_nombre ?? "—"}</td>
                <td className="py-2 text-zinc-600">
                  {alumno.activo ? "Activo" : "Inactivo"}
                </td>
                <td className="py-2">
                  <Link
                    href={`/alumnos/grupo/${grupoId}/${alumno.id}/editar`}
                    className="text-primario hover:underline"
                  >
                    Editar
                  </Link>
                  <form
                    action={alternarActivoAlumno.bind(
                      null,
                      alumno.id,
                      grupoId,
                      alumno.activo
                    )}
                    className="inline"
                  >
                    <button type="submit" className="ml-3 text-zinc-600 hover:underline">
                      {alumno.activo ? "Dar de baja" : "Reactivar"}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
