import { requerirRolPagina } from "@/lib/perfiles/requerirRolPagina";

export default async function PagosPage() {
  await requerirRolPagina(["super_admin", "direccion", "caja"]);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900">Pagos</h1>
      <p className="mt-2 text-zinc-600">Próximamente.</p>
    </div>
  );
}
