import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { alternarActivoAlumno } from "./actions";

const GRUPO_PILOTO_ID = process.env.GRUPO_PILOTO_ID!;

interface AlumnoListado {
  id: string;
  nombre_completo: string;
  matricula: string | null;
  tutor_nombre: string | null;
  activo: boolean;
}

async function obtenerAlumnosDelGrupo(): Promise<AlumnoListado[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("inscripciones")
    .select("alumnos(id, nombre_completo, matricula, tutor_nombre, activo)")
    .eq("grupo_id", GRUPO_PILOTO_ID);

  if (error) {
    throw new Error(`No se pudo cargar la lista de alumnos: ${error.message}`);
  }

  return (data ?? []).flatMap((inscripcion) => inscripcion.alumnos);
}

export default async function AlumnosPage() {
  const alumnos = await obtenerAlumnosDelGrupo();

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-zinc-900">
          Alumnos y grados
        </h1>
        <Link
          href="/alumnos/nuevo"
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
                    href={`/alumnos/${alumno.id}/editar`}
                    className="text-primario hover:underline"
                  >
                    Editar
                  </Link>
                  <form
                    action={alternarActivoAlumno.bind(null, alumno.id, alumno.activo)}
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
