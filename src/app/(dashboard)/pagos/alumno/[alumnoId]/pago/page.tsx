import Link from "next/link";
import { notFound } from "next/navigation";
import { requerirRolPagina } from "@/lib/perfiles/requerirRolPagina";
import { obtenerCicloActivoId } from "@/lib/ciclos/activo";
import { ROLES_PAGOS } from "@/lib/pagos/catalogos";
import { mensajeDeError } from "@/lib/pagos/errores";
import { esUuid } from "@/lib/pagos/schema";
import { obtenerCargosDeAlumno, obtenerContextoAlumno } from "@/lib/pagos/consultas";
import { FormularioPago } from "@/components/pagos/FormularioPago";
import { registrarPago } from "./actions";

export const dynamic = "force-dynamic";

export default async function RegistrarPagoPage({
  params,
  searchParams,
}: {
  params: Promise<{ alumnoId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  await requerirRolPagina(ROLES_PAGOS);
  const { alumnoId } = await params;
  const { error } = await searchParams;

  if (!esUuid(alumnoId)) {
    notFound();
  }

  const cicloId = await obtenerCicloActivoId();
  if (!cicloId) {
    return <p className="text-zinc-600">No hay un ciclo escolar activo.</p>;
  }

  const contexto = await obtenerContextoAlumno(alumnoId, cicloId);
  if (!contexto) {
    notFound();
  }

  // Solo cargos con saldo: excluye pagados (incluidas becas de 100 %) y cancelados.
  const cargos = (await obtenerCargosDeAlumno(alumnoId, cicloId))
    .filter((cargo) => cargo.estatus !== "cancelado" && cargo.saldo > 0)
    .map((cargo) => ({
      id: cargo.id,
      descripcion: cargo.descripcion,
      saldo: cargo.saldo,
      vencido: cargo.estatus === "vencido",
    }));

  const mensajeError = mensajeDeError(error);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-zinc-600">
          <Link href={`/pagos/alumno/${alumnoId}`} className="hover:underline">← Estado de cuenta</Link>
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-zinc-900">Registrar pago — {contexto.nombre}</h1>
        <p className="text-sm text-zinc-600">
          Marca los cargos que cubre este pago. Puedes bajar el monto de un cargo para registrar un abono parcial.
        </p>
      </div>

      {mensajeError && (
        <p className="rounded-md bg-red-50 px-4 py-2 text-sm font-medium text-red-800">{mensajeError}</p>
      )}

      {cargos.length === 0 ? (
        <p className="text-sm text-zinc-600">Este alumno no tiene cargos pendientes.</p>
      ) : (
        <FormularioPago cargos={cargos} accion={registrarPago.bind(null, alumnoId)} />
      )}
    </div>
  );
}
