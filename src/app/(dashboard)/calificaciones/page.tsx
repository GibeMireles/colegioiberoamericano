import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requerirRolPagina } from "@/lib/perfiles/requerirRolPagina";
import { obtenerCicloActivoId } from "@/lib/ciclos/activo";
import type { PerfilActual } from "@/lib/perfiles/actual";

export const dynamic = "force-dynamic";

interface AsignacionListado {
  id: string;
  materiaNombre: string;
  gradoNombre: string;
  grupoNombre: string;
  docenteNombre: string;
}

async function obtenerAsignacionesVisibles(
  perfil: PerfilActual,
  cicloId: string
): Promise<AsignacionListado[]> {
  const supabase = await createClient();

  let consulta = supabase
    .from("asignaciones")
    .select("id, materia_id, grupo_id, docente_perfil_id")
    .eq("ciclo_escolar_id", cicloId);

  if (perfil.rol === "docente") {
    consulta = consulta.eq("docente_perfil_id", perfil.id);
  }

  const { data, error } = await consulta;

  if (error) {
    throw new Error(`No se pudieron cargar las asignaciones: ${error.message}`);
  }

  return Promise.all(
    (data ?? []).map(async (asignacion) => {
      const { data: materia } = await supabase
        .from("materias")
        .select("nombre, grado_id")
        .eq("id", asignacion.materia_id)
        .single();

      const { data: grado } = materia
        ? await supabase.from("grados").select("nombre").eq("id", materia.grado_id).single()
        : { data: null };

      const { data: grupo } = await supabase
        .from("grupos")
        .select("nombre")
        .eq("id", asignacion.grupo_id)
        .single();

      const { data: docente } = await supabase
        .from("perfiles")
        .select("nombre_completo")
        .eq("id", asignacion.docente_perfil_id)
        .single();

      return {
        id: asignacion.id,
        materiaNombre: materia?.nombre ?? "?",
        gradoNombre: grado?.nombre ?? "?",
        grupoNombre: grupo?.nombre ?? "?",
        docenteNombre: docente?.nombre_completo ?? "?",
      };
    })
  );
}

export default async function CalificacionesPage() {
  const perfil = await requerirRolPagina(["super_admin", "direccion", "docente"]);

  const cicloId = await obtenerCicloActivoId();
  if (!cicloId) {
    throw new Error("No hay un ciclo escolar activo.");
  }

  const asignaciones = await obtenerAsignacionesVisibles(perfil, cicloId);
  const esDocente = perfil.rol === "docente";

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900">
        {esDocente ? "Mis materias" : "Calificaciones"}
      </h1>

      {asignaciones.length === 0 ? (
        <p className="mt-6 text-zinc-600">
          {esDocente
            ? "Todavía no tienes materias asignadas."
            : "Todavía no hay asignaciones registradas."}
        </p>
      ) : (
        <div className="mt-6 space-y-2">
          {asignaciones.map((asignacion) => (
            <Link
              key={asignacion.id}
              href={`/calificaciones/${asignacion.id}`}
              className="block rounded-md border border-zinc-200 p-3 hover:bg-zinc-50"
            >
              <div className="font-medium text-zinc-900">{asignacion.materiaNombre}</div>
              <div className="text-sm text-zinc-600">
                {asignacion.gradoNombre} — Grupo {asignacion.grupoNombre} — {asignacion.docenteNombre}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
