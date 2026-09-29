import Image from "next/image";
import type { ConfiguracionEscuela } from "@/lib/config";
import { ETIQUETAS_METODO } from "@/lib/pagos/catalogos";
import { formatearMoneda } from "@/lib/pagos/calculos";
import type { PagoRecibo } from "@/lib/pagos/consultas";
import { formatearFechaHora } from "@/lib/fechas";

// Presentación pura del recibo: recibe el pago ya cargado para poder
// reutilizarse fuera de esta página (ej. un futuro envío por correo).
export function Recibo({ pago, config }: { pago: PagoRecibo; config: ConfiguracionEscuela }) {
  return (
    <article className="relative max-w-2xl rounded-lg border border-zinc-200 bg-white p-8 print:border-0 print:p-0">
      {pago.anulado && (
        <div className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
          <span className="rotate-[-20deg] text-6xl font-bold text-red-600/25">ANULADO</span>
        </div>
      )}

      <header className="flex items-center justify-between border-b-4 pb-4" style={{ borderColor: config.colorPrimario }}>
        <div className="flex items-center gap-3">
          {config.logoUrl && <Image src={config.logoUrl} alt={config.nombre} width={48} height={48} />}
          <div>
            <div className="text-lg font-bold text-zinc-900">{config.nombre}</div>
            <div className="text-sm text-zinc-600">Recibo de pago</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase text-zinc-500">Folio</div>
          <div className="text-2xl font-bold" style={{ color: config.colorPrimario }}>{pago.folio}</div>
        </div>
      </header>

      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
        <dt className="text-zinc-500">Alumno</dt>
        <dd className="text-zinc-900">{pago.alumnoNombre}</dd>
        {pago.grupo && (
          <>
            <dt className="text-zinc-500">Grupo</dt>
            <dd className="text-zinc-900">{pago.grupo}</dd>
          </>
        )}
        {pago.matricula && (
          <>
            <dt className="text-zinc-500">Matrícula</dt>
            <dd className="text-zinc-900">{pago.matricula}</dd>
          </>
        )}
        <dt className="text-zinc-500">Fecha</dt>
        <dd className="text-zinc-900">{formatearFechaHora(pago.fechaPago)}</dd>
        <dt className="text-zinc-500">Método</dt>
        <dd className="text-zinc-900">
          {ETIQUETAS_METODO[pago.metodo]}
          {pago.referencia && ` · Ref. ${pago.referencia}`}
        </dd>
      </dl>

      <table className="mt-6 w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-left text-zinc-500">
            <th className="py-2">Concepto</th>
            <th className="py-2 text-right">Precio</th>
            <th className="py-2 text-right">Beca</th>
            <th className="py-2 text-right">Con beca</th>
            <th className="py-2 text-right">Pagado</th>
          </tr>
        </thead>
        <tbody>
          {pago.lineas.map((linea, indice) => (
            <tr key={indice} className="border-b border-zinc-100">
              <td className="py-2 text-zinc-900">{linea.descripcion}</td>
              <td className="py-2 text-right">{formatearMoneda(linea.montoOriginal)}</td>
              <td className="py-2 text-right">{linea.becaPorcentaje > 0 ? `${linea.becaPorcentaje}%` : "—"}</td>
              <td className="py-2 text-right">{formatearMoneda(linea.monto)}</td>
              <td className="py-2 text-right font-medium">{formatearMoneda(linea.aplicado)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={4} className="py-3 text-right font-semibold text-zinc-900">Total pagado</td>
            <td className="py-3 text-right text-lg font-bold text-zinc-900">{formatearMoneda(pago.montoTotal)}</td>
          </tr>
        </tfoot>
      </table>

      <footer className="mt-6 text-xs text-zinc-500">
        Registró: {pago.registradoPor}
        {pago.anulado && pago.motivoAnulacion && (
          <div className="mt-1 font-medium text-red-700">Pago anulado. Motivo: {pago.motivoAnulacion}</div>
        )}
      </footer>
    </article>
  );
}
