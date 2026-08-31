import { notFound } from "next/navigation";
import { AlumnoForm, type AlumnoFormValues } from "@/components/alumnos/AlumnoForm";
import { createClient } from "@/lib/supabase/server";
import { actualizarAlumno } from "../../actions";

export default async function EditarAlumnoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createClient();

  const { data: alumno, error } = await supabase
    .from("alumnos")
    .select(
      "nombre_completo, fecha_nacimiento, matricula, tutor_nombre, tutor_telefono, tutor_email"
    )
    .eq("id", id)
    .single();

  if (error || !alumno) {
    notFound();
  }

  const valoresIniciales: AlumnoFormValues = {
    nombre_completo: alumno.nombre_completo,
    fecha_nacimiento: alumno.fecha_nacimiento ?? "",
    matricula: alumno.matricula ?? "",
    tutor_nombre: alumno.tutor_nombre ?? "",
    tutor_telefono: alumno.tutor_telefono ?? "",
    tutor_email: alumno.tutor_email ?? "",
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900">Editar alumno</h1>
      <div className="mt-6">
        <AlumnoForm
          action={actualizarAlumno.bind(null, id)}
          valoresIniciales={valoresIniciales}
          textoBoton="Guardar cambios"
        />
      </div>
    </div>
  );
}
