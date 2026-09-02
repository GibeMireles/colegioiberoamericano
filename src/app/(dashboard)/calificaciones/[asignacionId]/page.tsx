import { createClient } from "@/lib/supabase/server";
import { requerirAccesoAsignacionPagina } from "@/lib/asignaciones/requerirAccesoAsignacionPagina";
import { obtenerAlumnosDeAsignacion } from "@/lib/calificaciones/roster";
import { TablaCaptura, type FilaCaptura } from "@/components/calificaciones/TablaCaptura";
import { guardarPonderacion, guardarCalificaciones } from "./actions";

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

async function obtenerFilasCaptura(asignacionId: string): Promise<FilaCaptura[]> {
  const alumnos = await obtenerAlumnosDeAsignacion(asignacionId);
  const supabase = await createClient();

  const { data: calificaciones, error } = await supabase
    .from("calificaciones")
    .select(
      "alumno_id, parcial1_adas, parcial1_examen, parcial2_adas, parcial2_examen, producto_proyecto, producto_examen"
    )
    .eq("asignacion_id", asignacionId);

  if (error) {
    throw new Error(`No se pudieron cargar las calificaciones: ${error.message}`);
  }

  const porAlumno = new Map((calificaciones ?? []).map((fila) => [fila.alumno_id, fila]));

  return alumnos
    .map((alumno) => {
      const apellidos = [alumno.apellido_paterno, alumno.apellido_materno]
        .filter((valor): valor is string => Boolean(valor))
        .join(" ");
      const existente = porAlumno.get(alumno.id);

      return {
        alumnoId: alumno.id,
        nombre: apellidos ? `${apellidos}, ${alumno.nombres}` : alumno.nombres,
        parcial1_adas: existente?.parcial1_adas ?? null,
        parcial1_examen: existente?.parcial1_examen ?? null,
        parcial2_adas: existente?.parcial2_adas ?? null,
        parcial2_examen: existente?.parcial2_examen ?? null,
        producto_proyecto: existente?.producto_proyecto ?? null,
        producto_examen: existente?.producto_examen ?? null,
      };
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

export default async function CalificacionesAsignacionPage({
  params,
}: {
  params: Promise<{ asignacionId: string }>;
}) {
  const { asignacionId } = await params;
  const asignacion = await requerirAccesoAsignacionPagina(asignacionId);
  const contexto = await obtenerContexto(asignacion.materia_id, asignacion.grupo_id);

  const ponderacionDefinida =
    asignacion.parcial1_max !== null &&
    asignacion.parcial2_max !== null &&
    asignacion.producto_max !== null;

  const filas = ponderacionDefinida ? await obtenerFilasCaptura(asignacionId) : [];

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900">
        {contexto.materiaNombre} — {contexto.gradoNombre}, Grupo {contexto.grupoNombre}
      </h1>

      <div className="mt-6 max-w-sm">
        <h2 className="text-lg font-semibold text-zinc-900">
          {ponderacionDefinida ? "Ponderación" : "Define la ponderación"}
        </h2>
        <p className="text-sm text-zinc-600">
          Define cuántos puntos vale cada parcial y el producto antes de capturar
          calificaciones. Puedes cambiar estos valores cuando lo necesites.
        </p>
        <form action={guardarPonderacion.bind(null, asignacionId)} className="mt-4 space-y-3">
          <div>
            <label className="block text-sm font-medium text-zinc-700">
              Puntos del Parcial 1
            </label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              name="parcial1_max"
              defaultValue={asignacion.parcial1_max ?? ""}
              required
              className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700">
              Puntos del Parcial 2
            </label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              name="parcial2_max"
              defaultValue={asignacion.parcial2_max ?? ""}
              required
              className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700">
              Puntos del Producto
            </label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              name="producto_max"
              defaultValue={asignacion.producto_max ?? ""}
              required
              className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1 text-sm"
            />
          </div>
          <button
            type="submit"
            className="rounded-md bg-primario px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            Guardar ponderación
          </button>
        </form>
      </div>

      {!ponderacionDefinida ? null : filas.length === 0 ? (
        <p className="mt-6 text-zinc-600">Este grupo todavía no tiene alumnos.</p>
      ) : (
        <TablaCaptura
          filas={filas}
          accionGuardar={guardarCalificaciones.bind(null, asignacionId)}
          parcial1Max={asignacion.parcial1_max!}
          parcial2Max={asignacion.parcial2_max!}
          productoMax={asignacion.producto_max!}
        />
      )}
    </div>
  );
}
