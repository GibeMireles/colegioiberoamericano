import { requerirRolPagina } from "@/lib/perfiles/requerirRolPagina";

export default async function AsistenciaPage() {
  await requerirRolPagina(["super_admin", "direccion", "docente"]);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900">
        Listas / Asistencia
      </h1>
      <p className="mt-2 text-zinc-600">Próximamente.</p>
    </div>
  );
}
