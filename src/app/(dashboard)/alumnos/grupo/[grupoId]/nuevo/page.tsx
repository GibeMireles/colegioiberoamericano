import { notFound } from "next/navigation";
import { AlumnoForm } from "@/components/alumnos/AlumnoForm";
import { createClient } from "@/lib/supabase/server";
import { crearAlumno } from "../../../actions";
import { requerirRolPagina } from "@/lib/perfiles/requerirRolPagina";

export default async function NuevoAlumnoPage({
  params,
}: {
  params: Promise<{ grupoId: string }>;
}) {
  await requerirRolPagina(["super_admin", "direccion"]);
  const { grupoId } = await params;
  const supabase = await createClient();

  const { data: grupo, error } = await supabase
    .from("grupos")
    .select("nombre")
    .eq("id", grupoId)
    .single();

  if (error || !grupo) {
    notFound();
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900">Agregar alumno</h1>
      <p className="mt-1 text-sm text-zinc-600">Se inscribirá en Grupo {grupo.nombre}</p>
      <div className="mt-6">
        <AlumnoForm action={crearAlumno.bind(null, grupoId)} textoBoton="Guardar alumno" />
      </div>
    </div>
  );
}
