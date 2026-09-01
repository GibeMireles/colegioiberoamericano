import { notFound } from "next/navigation";
import { AlumnoForm, type AlumnoFormValues } from "@/components/alumnos/AlumnoForm";
import { createClient } from "@/lib/supabase/server";
import { actualizarAlumno } from "../../../../actions";

export default async function EditarAlumnoPage({
  params,
}: {
  params: Promise<{ grupoId: string; id: string }>;
}) {
  const { grupoId, id } = await params;
  const supabase = await createClient();

  const { data: alumno, error } = await supabase
    .from("alumnos")
    .select(
      "nombres, apellido_paterno, apellido_materno, fecha_nacimiento, matricula, tutor_nombre, tutor_telefono, tutor_email"
    )
    .eq("id", id)
    .single();

  if (error || !alumno) {
    notFound();
  }

  const valoresIniciales: AlumnoFormValues = {
    nombres: alumno.nombres,
    apellido_paterno: alumno.apellido_paterno ?? "",
    apellido_materno: alumno.apellido_materno ?? "",
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
          action={actualizarAlumno.bind(null, id, grupoId)}
          valoresIniciales={valoresIniciales}
          textoBoton="Guardar cambios"
        />
      </div>
    </div>
  );
}
