import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requerirRolPagina } from "@/lib/perfiles/requerirRolPagina";
import { ETIQUETAS_METODO, METODOS_PAGO, ROLES_PAGOS, type MetodoPago } from "@/lib/pagos/catalogos";
import { formatearMoneda, nombreCompletoAlumno, resumirCorte } from "@/lib/pagos/calculos";
import { primero } from "@/lib/pagos/consultas";
import {
  esFechaISO,
  fechaHoyMexico,
  formatearFechaHora,
  inicioDelDiaEscuela,
  sumarDias,
} from "@/lib/fechas";

export const dynamic = "force-dynamic";

// PostgREST corta las respuestas en 1000 filas (max-rows del proyecto).
const LIMITE_FILAS = 1000;

export default async function CortePage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string }>;
}) {
  await requerirRolPagina(ROLES_PAGOS);
  const parametros = await searchParams;
  const hoy = fechaHoyMexico();

  const fechasInvalidas =
    (parametros.desde !== undefined && !esFechaISO(parametros.desde)) ||
    (parametros.hasta !== undefined && !esFechaISO(parametros.hasta));
  const desde = esFechaISO(parametros.desde) ? parametros.desde : hoy;
  const hasta = esFechaISO(parametros.hasta) ? parametros.hasta : desde;
  const rangoInvertido = desde > hasta;

  const supabase = await createClient();
  const { data, error } = rangoInvertido
    ? { data: [], error: null }
    : await supabase
        .from("pagos")
        .select(
          "id, folio, fecha_pago, monto_total, metodo_pago, referencia, anulado_en, alumnos(nombres, apellido_paterno, apellido_materno), registrado:perfiles!pagos_registrado_por_fkey(nombre_completo)"
        )
        .gte("fecha_pago", inicioDelDiaEscuela(desde))
        .lt("fecha_pago", inicioDelDiaEscuela(sumarDias(hasta, 1)))
        .order("fecha_pago", { ascending: true });

  if (error) {
    throw new Error(`No se pudo cargar el corte: ${error.message}`);
  }

  const pagos = (data ?? []).map((pago) => {
    const alumno = primero(pago.alumnos);
    return {
      id: pago.id,
      folio: Number(pago.folio),
      fechaPago: pago.fecha_pago,
      montoTotal: Number(pago.monto_total),
      metodo: pago.metodo_pago as MetodoPago,
      referencia: pago.referencia,
      anulado: pago.anulado_en !== null,
      alumno: alumno ? nombreCompletoAlumno(alumno) : "—",
      registradoPor: primero(pago.registrado)?.nombre_completo ?? "—",
    };
  });
  const resumen = resumirCorte(pagos);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900">Corte de caja</h1>

      <form action="/pagos/corte" className="mt-4 flex flex-wrap items-end gap-3">
        <label className="text-sm text-zinc-700">
          Desde
          <input type="date" name="desde" defaultValue={desde} className="ml-2 rounded-md border border-zinc-300 px-2 py-1" />
        </label>
        <label className="text-sm text-zinc-700">
          Hasta
          <input type="date" name="hasta" defaultValue={hasta} className="ml-2 rounded-md border border-zinc-300 px-2 py-1" />
        </label>
        <button type="submit" className="rounded-md bg-primario px-4 py-2 text-sm font-medium text-white hover:opacity-90">
          Ver corte
        </button>
      </form>

      {fechasInvalidas && (
        <p className="mt-4 rounded-md bg-yellow-50 px-4 py-2 text-sm text-yellow-800">
          Alguna fecha no era válida; se muestra el día de hoy.
        </p>
      )}
      {rangoInvertido && (
        <p className="mt-4 rounded-md bg-red-50 px-4 py-2 text-sm text-red-800">
          La fecha &quot;desde&quot; es posterior a &quot;hasta&quot;.
        </p>
      )}

      {pagos.length >= LIMITE_FILAS && (
        <p className="mt-4 rounded-md bg-red-50 px-4 py-2 text-sm text-red-800">
          El rango tiene demasiados pagos para mostrarse completo; los totales podrían estar incompletos. Elige un rango más corto.
        </p>
      )}

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-zinc-200 p-4">
          <div className="text-xs uppercase text-zinc-500">Total</div>
          <div className="text-xl font-bold text-zinc-900">{formatearMoneda(resumen.total)}</div>
          <div className="text-xs text-zinc-500">
            {resumen.cantidad} pago{resumen.cantidad === 1 ? "" : "s"}
            {resumen.anulados > 0 && ` · ${resumen.anulados} anulado${resumen.anulados === 1 ? "" : "s"}`}
          </div>
        </div>
        {METODOS_PAGO.map((metodo) => (
          <div key={metodo} className="rounded-lg border border-zinc-200 p-4">
            <div className="text-xs uppercase text-zinc-500">{ETIQUETAS_METODO[metodo]}</div>
            <div className="text-xl font-semibold text-zinc-900">{formatearMoneda(resumen.porMetodo[metodo])}</div>
          </div>
        ))}
      </div>

      {resumen.porUsuario.length > 0 && (
        <div className="mt-4 text-sm text-zinc-700">
          <span className="font-medium">Por quien registró: </span>
          {resumen.porUsuario.map((u) => `${u.nombre} ${formatearMoneda(u.total)}`).join(" · ")}
        </div>
      )}

      {pagos.length === 0 ? (
        <p className="mt-6 text-sm text-zinc-600">Sin pagos en este rango.</p>
      ) : (
        <table className="mt-6 w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-zinc-500">
              <th className="py-2">Folio</th>
              <th className="py-2">Fecha</th>
              <th className="py-2">Alumno</th>
              <th className="py-2">Método</th>
              <th className="py-2 text-right">Monto</th>
              <th className="py-2">Registró</th>
            </tr>
          </thead>
          <tbody>
            {pagos.map((pago) => (
              <tr key={pago.id} className={`border-b border-zinc-100 ${pago.anulado ? "text-zinc-400 line-through" : ""}`}>
                <td className="py-2">
                  <Link href={`/pagos/recibo/${pago.id}`} className="font-medium text-primario hover:underline">{pago.folio}</Link>
                </td>
                <td className="py-2">{formatearFechaHora(pago.fechaPago)}</td>
                <td className="py-2">{pago.alumno}</td>
                <td className="py-2">
                  {ETIQUETAS_METODO[pago.metodo]}
                  {pago.referencia && <span className="text-xs text-zinc-500"> · {pago.referencia}</span>}
                </td>
                <td className="py-2 text-right">{formatearMoneda(pago.montoTotal)}</td>
                <td className="py-2">{pago.registradoPor}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
