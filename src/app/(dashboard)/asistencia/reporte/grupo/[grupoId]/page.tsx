import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requerirRolPagina } from "@/lib/perfiles/requerirRolPagina";
import { obtenerCicloActivoId } from "@/lib/ciclos/activo";

export const dynamic = "force-dynamic";

interface AlumnoSimple {
  id: string;
  nombre: string;
}

interface MateriaColumna {
  asignacionId: string;
  materiaNombre: string;
}

function fechaDeHoy(): string {
  return new Date().toISOString().slice(0, 10);
}

async function obtenerAlumnosDelGrupo(grupoId: string): Promise<AlumnoSimple[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("inscripciones")
    .select("alumnos(id, nombres, apellido_paterno, apellido_materno)")
    .eq("grupo_id", grupoId);

  if (error) {
    throw new Error(`No se pudo cargar la lista de alumnos: ${error.message}`);
  }

  return (data ?? [])
    .flatMap((fila) => fila.alumnos ?? [])
    .map((alumno) => {
      const apellidos = [alumno.apellido_paterno, alumno.apellido_materno]
        .filter((valor): valor is string => Boolean(valor))
        .join(" ");

      return {
        id: alumno.id,
        nombre: apellidos ? `${apellidos}, ${alumno.nombres}` : alumno.nombres,
      };
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

async function obtenerMateriasDelGrupo(
  grupoId: string,
  cicloId: string
): Promise<MateriaColumna[]> {
  const supabase = await createClient();

  const { data: asignaciones, error } = await supabase
    .from("asignaciones")
    .select("id, materia_id")
    .eq("grupo_id", grupoId)
    .eq("ciclo_escolar_id", cicloId);

  if (error) {
    throw new Error(`No se pudieron cargar las materias: ${error.message}`);
  }

  return Promise.all(
    (asignaciones ?? []).map(async (asignacion) => {
      const { data: materia } = await supabase
        .from("materias")
        .select("nombre")
        .eq("id", asignacion.materia_id)
        .single();

      return { asignacionId: asignacion.id, materiaNombre: materia?.nombre ?? "?" };
    })
  );
}

async function obtenerEstatusPorCelda(
  asignacionIds: string[],
  fecha: string
): Promise<Map<string, string>> {
  if (asignacionIds.length === 0) {
    return new Map();
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("asistencias")
    .select("asignacion_id, alumno_id, estatus")
    .in("asignacion_id", asignacionIds)
    .eq("fecha", fecha);

  if (error) {
    throw new Error(`No se pudo cargar la asistencia: ${error.message}`);
  }

  return new Map((data ?? []).map((fila) => [`${fila.asignacion_id}:${fila.alumno_id}`, fila.estatus]));
}

const ETIQUETAS: Record<string, string> = {
  presente: "Presente",
  ausente: "Ausente",
  retardo: "Retardo",
  justificado: "Justificado",
};

export default async function ReporteGrupoPage({
  params,
  searchParams,
}: {
  params: Promise<{ grupoId: string }>;
  searchParams: Promise<{ fecha?: string }>;
}) {
  await requerirRolPagina(["super_admin", "direccion"]);

  const { grupoId } = await params;
  const { fecha: fechaParam } = await searchParams;
  const fecha = fechaParam && fechaParam.trim().length > 0 ? fechaParam : fechaDeHoy();

  const supabase = await createClient();
  const { data: grupo, error: errorGrupo } = await supabase
    .from("grupos")
    .select("nombre")
    .eq("id", grupoId)
    .single();

  if (errorGrupo || !grupo) {
    notFound();
  }

  const cicloId = await obtenerCicloActivoId();
  if (!cicloId) {
    throw new Error("No hay un ciclo escolar activo.");
  }

  const [alumnos, materias] = await Promise.all([
    obtenerAlumnosDelGrupo(grupoId),
    obtenerMateriasDelGrupo(grupoId, cicloId),
  ]);

  const celdas = await obtenerEstatusPorCelda(
    materias.map((m) => m.asignacionId),
    fecha
  );

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900">
        Asistencia — Grupo {grupo.nombre}
      </h1>

      <form method="get" className="mt-4 flex items-center gap-2">
        <label className="text-sm font-medium text-zinc-700" htmlFor="fecha">
          Fecha
        </label>
        <input
          type="date"
          id="fecha"
          name="fecha"
          defaultValue={fecha}
          className="rounded-md border border-zinc-300 px-2 py-1 text-sm"
        />
        <button
          type="submit"
          className="rounded-md border border-zinc-300 px-3 py-1 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
        >
          Ver
        </button>
      </form>

      {alumnos.length === 0 ? (
        <p className="mt-6 text-zinc-600">Este grupo todavía no tiene alumnos.</p>
      ) : materias.length === 0 ? (
        <p className="mt-6 text-zinc-600">Este grupo todavía no tiene materias asignadas.</p>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs font-medium text-zinc-500">
                <th className="p-2">Alumno</th>
                {materias.map((materia) => (
                  <th key={materia.asignacionId} className="p-2">
                    {materia.materiaNombre}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {alumnos.map((alumno) => (
                <tr key={alumno.id} className="border-b border-zinc-100">
                  <td className="p-2 font-medium text-zinc-900">{alumno.nombre}</td>
                  {materias.map((materia) => {
                    const estatus = celdas.get(`${materia.asignacionId}:${alumno.id}`);
                    return (
                      <td key={materia.asignacionId} className="p-2 text-zinc-600">
                        {estatus ? ETIQUETAS[estatus] : "—"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
