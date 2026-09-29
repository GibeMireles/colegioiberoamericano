import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requerirRolPagina } from "@/lib/perfiles/requerirRolPagina";
import { obtenerCicloActivoId } from "@/lib/ciclos/activo";
import { CLASES_ESTATUS, ETIQUETAS_ESTATUS, ETIQUETAS_METODO, ROLES_PAGOS } from "@/lib/pagos/catalogos";
import { formatearMoneda, sumarMontos } from "@/lib/pagos/calculos";
import { mensajeDeError } from "@/lib/pagos/errores";
import { esUuid } from "@/lib/pagos/schema";
import { formatearFecha, formatearFechaHora } from "@/lib/fechas";
import {
  obtenerCargosDeAlumno,
  obtenerContextoAlumno,
  obtenerPagosDeAlumno,
} from "@/lib/pagos/consultas";
import { BotonEnviar } from "@/components/ui/BotonEnviar";
import { actualizarPlanBeca, agregarCargo, cancelarCargo } from "./actions";

export const dynamic = "force-dynamic";

const MENSAJES_OK: Record<string, string> = {
  plan: "✓ Plan y beca actualizados. Los cargos ya generados no cambian; para corregirlos, cancélalos y vuelve a generar.",
  cargo: "✓ Cargo agregado.",
  cancelado: "✓ Cargo cancelado.",
};

const CLASE_BOTON = "rounded-md bg-primario px-4 py-2 text-sm font-medium text-white hover:opacity-90";
const CLASE_INPUT = "rounded-md border border-zinc-300 px-2 py-1 text-sm";

export default async function EstadoCuentaPage({
  params,
  searchParams,
}: {
  params: Promise<{ alumnoId: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  await requerirRolPagina(ROLES_PAGOS);
  const { alumnoId } = await params;
  const { ok, error } = await searchParams;

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

  const supabase = await createClient();
  const [cargos, pagos, planesRes, conceptosRes] = await Promise.all([
    obtenerCargosDeAlumno(alumnoId, cicloId),
    obtenerPagosDeAlumno(alumnoId),
    supabase.from("planes_pago").select("id, mensualidades").eq("ciclo_escolar_id", cicloId).order("mensualidades"),
    supabase
      .from("conceptos_pago")
      .select("id, nombre, monto_default")
      .eq("activo", true)
      .eq("es_colegiatura", false)
      .order("nombre"),
  ]);

  const planes = planesRes.data ?? [];
  const conceptos = conceptosRes.data ?? [];
  const vigentes = cargos.filter((cargo) => cargo.estatus !== "cancelado");
  const saldoTotal = sumarMontos(vigentes.map((cargo) => cargo.saldo));
  const saldoVencido = sumarMontos(vigentes.filter((c) => c.estatus === "vencido").map((c) => c.saldo));
  const hayPorPagar = vigentes.some((cargo) => cargo.saldo > 0);
  const mensajeError = mensajeDeError(error);

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm text-zinc-600">
          <Link href="/pagos" className="hover:underline">← Alumnos</Link>
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-zinc-900">{contexto.nombre}</h1>
        <p className="text-sm text-zinc-600">
          {contexto.inscripcion?.grupo ?? "Sin inscripción en el ciclo activo"}
          {contexto.matricula && ` · Matrícula ${contexto.matricula}`}
          {!contexto.activo && " · Dado de baja"}
        </p>
        <div className="mt-3 flex gap-6 text-sm">
          <span>Saldo: <strong>{formatearMoneda(saldoTotal)}</strong></span>
          <span className={saldoVencido > 0 ? "font-medium text-red-700" : ""}>
            Vencido: <strong>{formatearMoneda(saldoVencido)}</strong>
          </span>
        </div>
      </div>

      {ok && Object.hasOwn(MENSAJES_OK, ok) && (
        <p className="rounded-md bg-green-50 px-4 py-2 text-sm font-medium text-green-800">{MENSAJES_OK[ok]}</p>
      )}
      {mensajeError && (
        <p className="rounded-md bg-red-50 px-4 py-2 text-sm font-medium text-red-800">{mensajeError}</p>
      )}

      {contexto.inscripcion && (
        <form
          action={actualizarPlanBeca.bind(null, alumnoId, contexto.inscripcion.id)}
          className="flex flex-wrap items-end gap-3"
        >
          <label className="text-sm text-zinc-700">
            Plan de pagos
            <select name="planPagoId" defaultValue={contexto.inscripcion.planPagoId ?? ""} className={`ml-2 ${CLASE_INPUT}`}>
              <option value="">Sin plan</option>
              {planes.map((plan) => (
                <option key={plan.id} value={plan.id}>{plan.mensualidades} mensualidades</option>
              ))}
            </select>
          </label>
          <label className="text-sm text-zinc-700">
            Beca %
            <input
              type="number"
              name="becaPorcentaje"
              min={0}
              max={100}
              step="0.01"
              defaultValue={contexto.inscripcion.becaPorcentaje}
              className={`ml-2 w-24 ${CLASE_INPUT}`}
            />
          </label>
          <BotonEnviar textoEnviando="Guardando..." className={CLASE_BOTON}>Guardar plan y beca</BotonEnviar>
        </form>
      )}

      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-900">Cargos del ciclo</h2>
          {hayPorPagar && (
            <Link href={`/pagos/alumno/${alumnoId}/pago`} className={CLASE_BOTON}>Registrar pago</Link>
          )}
        </div>
        {cargos.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-600">Este alumno no tiene cargos en el ciclo activo.</p>
        ) : (
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-zinc-500">
                <th className="py-2">Concepto</th>
                <th className="py-2">Vence</th>
                <th className="py-2 text-right">Original</th>
                <th className="py-2 text-right">Beca</th>
                <th className="py-2 text-right">Monto</th>
                <th className="py-2 text-right">Pagado</th>
                <th className="py-2 text-right">Saldo</th>
                <th className="py-2">Estatus</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {cargos.map((cargo) => (
                <tr key={cargo.id} className="border-b border-zinc-100 align-top">
                  <td className="py-2 text-zinc-900">
                    {cargo.descripcion}
                    {cargo.motivoCancelacion && (
                      <div className="text-xs text-zinc-500">Motivo: {cargo.motivoCancelacion}</div>
                    )}
                  </td>
                  <td className="py-2 text-zinc-600">{cargo.fechaVencimiento ? formatearFecha(cargo.fechaVencimiento) : "—"}</td>
                  <td className="py-2 text-right">{formatearMoneda(cargo.montoOriginal)}</td>
                  <td className="py-2 text-right">{cargo.becaPorcentaje > 0 ? `${cargo.becaPorcentaje}%` : "—"}</td>
                  <td className="py-2 text-right">{formatearMoneda(cargo.monto)}</td>
                  <td className="py-2 text-right">{formatearMoneda(cargo.pagado)}</td>
                  <td className="py-2 text-right font-medium">{formatearMoneda(cargo.saldo)}</td>
                  <td className="py-2">
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${CLASES_ESTATUS[cargo.estatus]}`}>
                      {ETIQUETAS_ESTATUS[cargo.estatus]}
                    </span>
                  </td>
                  <td className="py-2 text-right">
                    {cargo.estatus !== "cancelado" && cargo.pagado === 0 && (
                      <details>
                        <summary className="cursor-pointer text-xs text-red-700">Cancelar</summary>
                        <form action={cancelarCargo.bind(null, alumnoId, cargo.id)} className="mt-2 flex gap-2">
                          <input name="motivo" placeholder="Motivo" required minLength={3} className={`w-40 ${CLASE_INPUT}`} />
                          <BotonEnviar textoEnviando="..." className="rounded-md bg-red-700 px-2 py-1 text-xs font-medium text-white">
                            Confirmar
                          </BotonEnviar>
                        </form>
                      </details>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-medium text-primario">+ Agregar cargo (inscripción, recargo, etc.)</summary>
          <form action={agregarCargo.bind(null, alumnoId)} className="mt-3 flex flex-wrap items-end gap-3">
            <select name="conceptoId" required className={CLASE_INPUT} defaultValue="">
              <option value="" disabled>Concepto</option>
              {conceptos.map((concepto) => (
                <option key={concepto.id} value={concepto.id}>
                  {concepto.nombre}
                  {concepto.monto_default !== null && ` (sugerido ${formatearMoneda(Number(concepto.monto_default))})`}
                </option>
              ))}
            </select>
            <input name="descripcion" placeholder="Descripción (ej. Recargo octubre)" required className={`w-64 ${CLASE_INPUT}`} />
            <input name="monto" type="number" min={0.01} step="0.01" placeholder="Monto" required className={`w-32 ${CLASE_INPUT}`} />
            <label className="text-sm text-zinc-700">
              Vence
              <input name="fechaVencimiento" type="date" className={`ml-2 ${CLASE_INPUT}`} />
            </label>
            <BotonEnviar textoEnviando="Agregando..." className={CLASE_BOTON}>Agregar cargo</BotonEnviar>
          </form>
        </details>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-zinc-900">Pagos</h2>
        {pagos.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-600">Sin pagos registrados.</p>
        ) : (
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-zinc-500">
                <th className="py-2">Folio</th>
                <th className="py-2">Fecha</th>
                <th className="py-2 text-right">Total</th>
                <th className="py-2">Método</th>
                <th className="py-2">Registró</th>
              </tr>
            </thead>
            <tbody>
              {pagos.map((pago) => (
                <tr key={pago.id} className={`border-b border-zinc-100 ${pago.anulado ? "text-zinc-400 line-through" : ""}`}>
                  <td className="py-2">
                    <Link href={`/pagos/recibo/${pago.id}`} className="font-medium text-primario hover:underline">
                      {pago.folio}
                    </Link>
                  </td>
                  <td className="py-2">{formatearFechaHora(pago.fechaPago)}</td>
                  <td className="py-2 text-right">{formatearMoneda(pago.montoTotal)}</td>
                  <td className="py-2">{ETIQUETAS_METODO[pago.metodo]}</td>
                  <td className="py-2">{pago.registradoPor}{pago.anulado && " (anulado)"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
