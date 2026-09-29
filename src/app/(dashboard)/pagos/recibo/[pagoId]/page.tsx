import Link from "next/link";
import { notFound } from "next/navigation";
import { requerirRolPagina } from "@/lib/perfiles/requerirRolPagina";
import { getConfiguracion } from "@/lib/config";
import { ROLES_PAGOS } from "@/lib/pagos/catalogos";
import { mensajeDeError } from "@/lib/pagos/errores";
import { esUuid } from "@/lib/pagos/schema";
import { obtenerPagoParaRecibo } from "@/lib/pagos/consultas";
import { Recibo } from "@/components/pagos/Recibo";
import { BotonImprimir } from "@/components/pagos/BotonImprimir";
import { BotonEnviar } from "@/components/ui/BotonEnviar";
import { anularPago } from "./actions";

export const dynamic = "force-dynamic";

export default async function ReciboPage({
  params,
  searchParams,
}: {
  params: Promise<{ pagoId: string }>;
  searchParams: Promise<{ nuevo?: string; ok?: string; error?: string }>;
}) {
  await requerirRolPagina(ROLES_PAGOS);
  const { pagoId } = await params;
  const { nuevo, ok, error } = await searchParams;

  if (!esUuid(pagoId)) {
    notFound();
  }

  const [pago, config] = await Promise.all([obtenerPagoParaRecibo(pagoId), getConfiguracion()]);
  if (!pago) {
    notFound();
  }

  const mensajeError = mensajeDeError(error);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <Link href={`/pagos/alumno/${pago.alumnoId}`} className="text-sm text-zinc-600 hover:underline">
          ← Estado de cuenta
        </Link>
        <BotonImprimir />
      </div>

      {nuevo === "1" && (
        <p className="rounded-md bg-green-50 px-4 py-2 text-sm font-medium text-green-800 print:hidden">
          ✓ Pago registrado con folio {pago.folio}.
        </p>
      )}
      {ok === "anulado" && (
        <p className="rounded-md bg-green-50 px-4 py-2 text-sm font-medium text-green-800 print:hidden">
          ✓ Pago anulado. Los saldos de sus cargos se restituyeron.
        </p>
      )}
      {mensajeError && (
        <p className="rounded-md bg-red-50 px-4 py-2 text-sm font-medium text-red-800 print:hidden">{mensajeError}</p>
      )}

      <Recibo pago={pago} config={config} />

      {!pago.anulado && (
        <details className="max-w-2xl print:hidden">
          <summary className="cursor-pointer text-sm text-red-700">Anular este pago</summary>
          <form action={anularPago.bind(null, pago.id)} className="mt-2 flex flex-wrap gap-2">
            <input
              name="motivo"
              placeholder="Motivo de la anulación"
              required
              minLength={3}
              className="w-72 rounded-md border border-zinc-300 px-2 py-1 text-sm"
            />
            <BotonEnviar textoEnviando="Anulando..." className="rounded-md bg-red-700 px-3 py-1 text-sm font-medium text-white">
              Confirmar anulación
            </BotonEnviar>
          </form>
          <p className="mt-1 text-xs text-zinc-500">
            El pago conserva su folio y queda marcado como anulado; los cargos que cubría vuelven a quedar pendientes.
          </p>
        </details>
      )}
    </div>
  );
}
