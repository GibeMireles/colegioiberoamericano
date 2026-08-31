import { AlumnoForm } from "@/components/alumnos/AlumnoForm";
import { obtenerGrupoPilotoInfo } from "@/lib/grupos/piloto";
import { crearAlumno } from "../actions";

export default async function NuevoAlumnoPage() {
  const grupoInfo = await obtenerGrupoPilotoInfo();

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900">Agregar alumno</h1>
      <p className="mt-1 text-sm text-zinc-600">
        Se inscribirá en {grupoInfo.grado} · Grupo {grupoInfo.grupo}
      </p>
      <div className="mt-6">
        <AlumnoForm action={crearAlumno} textoBoton="Guardar alumno" />
      </div>
    </div>
  );
}
