import { createClient } from "@/lib/supabase/server";
import { requerirAccesoAsignacionPagina } from "@/lib/asignaciones/requerirAccesoAsignacionPagina";
import { obtenerAlumnosDeAsignacion } from "@/lib/calificaciones/roster";
import { TablaAsistencia, type FilaAsistencia } from "@/components/asistencia/TablaAsistencia";
import { guardarAsistencia } from "./actions";

export const dynamic = "force-dynamic";

interface ContextoAsignacion {
  materiaNombre: string;
  gradoNombre: string;
  grupoNombre: string;
}

async function obtenerContexto(materiaId: string, grupoId: string): Promise<ContextoAsignacion> {
  const supabase = await createClient();

  const { data: materia } = await supabase
    .from("materias")
    .select("nombre, grado_id")
    .eq("id", materiaId)
    .single();

  const { data: grado } = materia
    ? await supabase.from("grados").select("nombre").eq("id", materia.grado_id).single()
    : { data: null };

  const { data: grupo } = await supabase.from("grupos").select("nombre").eq("id", grupoId).single();

  return {
    materiaNombre: materia?.nombre ?? "?",
    gradoNombre: grado?.nombre ?? "?",
    grupoNombre: grupo?.nombre ?? "?",
  };
}

function fechaDeHoy(): string {
  return new Date().toISOString().slice(0, 10);
}

interface FilasAsistencia {
  filas: FilaAsistencia[];
  hayGuardadas: boolean;
}

async function obtenerFilasAsistencia(asignacionId: string, fecha: string): Promise<FilasAsistencia> {
  const alumnos = await obtenerAlumnosDeAsignacion(asignacionId);
  const supabase = await createClient();

  const { data: asistencias, error } = await supabase
    .from("asistencias")
    .select("alumno_id, estatus")
    .eq("asignacion_id", asignacionId)
    .eq("fecha", fecha);

  if (error) {
    throw new Error(`No se pudo cargar la asistencia: ${error.message}`);
  }

  const porAlumno = new Map((asistencias ?? []).map((fila) => [fila.alumno_id, fila.estatus]));

  const filas = alumnos
    .map((alumno) => {
      const apellidos = [alumno.apellido_paterno, alumno.apellido_materno]
        .filter((valor): valor is string => Boolean(valor))
        .join(" ");

      return {
        alumnoId: alumno.id,
        nombre: apellidos ? `${apellidos}, ${alumno.nombres}` : alumno.nombres,
        estatus: (porAlumno.get(alumno.id) ?? "presente") as FilaAsistencia["estatus"],
      };
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

  return { filas, hayGuardadas: (asistencias ?? []).length > 0 };
}

export default async function AsistenciaAsignacionPage({
  params,
  searchParams,
}: {
  params: Promise<{ asignacionId: string }>;
  searchParams: Promise<{ fecha?: string; editar?: string; guardado?: string }>;
}) {
  const { asignacionId } = await params;
  const { fecha: fechaParam, editar, guardado } = await searchParams;
  const asignacion = await requerirAccesoAsignacionPagina(asignacionId);
  const contexto = await obtenerContexto(asignacion.materia_id, asignacion.grupo_id);

  const fecha = fechaParam && fechaParam.trim().length > 0 ? fechaParam : fechaDeHoy();

  const { filas, hayGuardadas } = await obtenerFilasAsistencia(asignacionId, fecha);
  const soloLectura = hayGuardadas && editar !== "1";

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900">
        {contexto.materiaNombre} — {contexto.gradoNombre}, Grupo {contexto.grupoNombre}
      </h1>

      {guardado === "1" && (
        <p className="mt-4 rounded-md bg-green-50 px-4 py-2 text-sm font-medium text-green-800">
          ✓ Se ha guardado la asistencia.
        </p>
      )}

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

      {filas.length === 0 ? (
        <p className="mt-6 text-zinc-600">Este grupo todavía no tiene alumnos.</p>
      ) : (
        <>
          {soloLectura && (
            <a
              href={`/asistencia/${asignacionId}?fecha=${fecha}&editar=1`}
              className="mt-6 inline-block text-sm font-medium text-primario hover:underline"
            >
              Editar asistencia
            </a>
          )}
          <TablaAsistencia
            filas={filas}
            accionGuardar={guardarAsistencia.bind(null, asignacionId)}
            fecha={fecha}
            soloLectura={soloLectura}
          />
        </>
      )}
    </div>
  );
}
