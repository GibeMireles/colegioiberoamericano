import { AlumnoForm } from "@/components/alumnos/AlumnoForm";
import { crearAlumno } from "../actions";

export default function NuevoAlumnoPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900">Agregar alumno</h1>
      <div className="mt-6">
        <AlumnoForm action={crearAlumno} textoBoton="Guardar alumno" />
      </div>
    </div>
  );
}
