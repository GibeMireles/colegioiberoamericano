import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TarjetaAgregar } from "@/components/alumnos/TarjetaAgregar";
import { FilaMateria } from "@/components/materias/FilaMateria";
import {
  AsignacionesMateria,
  type AsignacionListada,
  type OpcionSelect,
} from "@/components/materias/AsignacionesMateria";
import { obtenerDocentes } from "@/lib/perfiles/docentes";
import {
  crearMateria,
  renombrarMateria,
  eliminarMateria,
  guardarAsignacion,
  eliminarAsignacion,
} from "../../actions";

export const dynamic = "force-dynamic";

interface ContextoGrado {
  nivelId: string;
  nivelNombre: string;
  gradoNombre: string;
}

interface MateriaListado {
  id: string;
  nombre: string;
  asignaciones: AsignacionListada[];
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

async function obtenerAsignacionesDeMateria(materiaId: string): Promise<AsignacionListada[]> {
  const supabase = await createClient();

  const { data: asignaciones, error } = await supabase
    .from("asignaciones")
    .select("id, grupo_id, docente_perfil_id")
    .eq("materia_id", materiaId);

  if (error) {
    throw new Error(`No se pudieron cargar las asignaciones: ${error.message}`);
  }

  return Promise.all(
    (asignaciones ?? []).map(async (asignacion) => {
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
        grupoNombre: grupo?.nombre ?? "?",
        docenteNombre: docente?.nombre_completo ?? "?",
      };
    })
  );
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
    (data ?? []).map(async (materia) => ({
      id: materia.id,
      nombre: materia.nombre,
      asignaciones: await obtenerAsignacionesDeMateria(materia.id),
    }))
  );
}

async function obtenerGruposDelGrado(gradoId: string): Promise<OpcionSelect[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("grupos")
    .select("id, nombre")
    .eq("grado_id", gradoId)
    .order("nombre");

  if (error) {
    throw new Error(`No se pudieron cargar los grupos: ${error.message}`);
  }

  return (data ?? []).map((grupo) => ({ id: grupo.id, etiqueta: `Grupo ${grupo.nombre}` }));
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

  const [materias, grupos, docentesListado] = await Promise.all([
    obtenerMaterias(gradoId),
    obtenerGruposDelGrado(gradoId),
    obtenerDocentes(),
  ]);

  const docentes: OpcionSelect[] = docentesListado.map((docente) => ({
    id: docente.id,
    etiqueta: docente.nombre_completo,
  }));

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
            cantidadAsignaciones={materia.asignaciones.length}
            accionRenombrar={renombrarMateria.bind(null, materia.id, gradoId)}
            accionEliminar={eliminarMateria.bind(null, materia.id, gradoId)}
          >
            <AsignacionesMateria
              asignaciones={materia.asignaciones}
              grupos={grupos}
              docentes={docentes}
              accionCrear={guardarAsignacion.bind(null, materia.id, gradoId)}
              accionEliminar={(id) => eliminarAsignacion(id, gradoId)}
            />
            <Link
              href={`/materias/${materia.id}/lista`}
              className="mt-2 inline-block text-xs font-medium text-primario hover:underline"
            >
              Lista propia
            </Link>
          </FilaMateria>
        ))}
      </div>

      <div className="mt-6 max-w-xs">
        <TarjetaAgregar etiqueta="materia" accionCrear={crearMateria.bind(null, gradoId)} />
      </div>
    </div>
  );
}
