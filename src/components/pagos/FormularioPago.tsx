"use client";

import { useState } from "react";
import { BotonEnviar } from "@/components/ui/BotonEnviar";
import { formatearMoneda, sumarMontos } from "@/lib/pagos/calculos";
import { ETIQUETAS_METODO, METODOS_PAGO } from "@/lib/pagos/catalogos";

export interface CargoPagable {
  id: string;
  descripcion: string;
  saldo: number;
  vencido: boolean;
}

export function FormularioPago({
  cargos,
  accion,
}: {
  cargos: CargoPagable[];
  accion: (formData: FormData) => Promise<void>;
}) {
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());
  const [montos, setMontos] = useState<Record<string, string>>(
    Object.fromEntries(cargos.map((cargo) => [cargo.id, cargo.saldo.toFixed(2)]))
  );

  const total = sumarMontos(
    [...seleccionados].map((id) => {
      const valor = Number(montos[id]);
      return Number.isFinite(valor) ? valor : 0;
    })
  );

  function alternar(id: string) {
    setSeleccionados((actual) => {
      const siguiente = new Set(actual);
      if (siguiente.has(id)) {
        siguiente.delete(id);
      } else {
        siguiente.add(id);
      }
      return siguiente;
    });
  }

  return (
    <form action={accion} className="space-y-6">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-left text-zinc-500">
            <th className="py-2" />
            <th className="py-2">Cargo</th>
            <th className="py-2 text-right">Saldo</th>
            <th className="py-2 text-right">A pagar</th>
          </tr>
        </thead>
        <tbody>
          {cargos.map((cargo) => {
            const marcado = seleccionados.has(cargo.id);
            return (
              <tr key={cargo.id} className="border-b border-zinc-100">
                <td className="py-2">
                  <input
                    type="checkbox"
                    name="cargo"
                    value={cargo.id}
                    checked={marcado}
                    onChange={() => alternar(cargo.id)}
                    aria-label={`Pagar ${cargo.descripcion}`}
                  />
                </td>
                <td className={`py-2 ${cargo.vencido ? "text-red-700" : "text-zinc-900"}`}>
                  {cargo.descripcion}
                  {cargo.vencido && " (vencido)"}
                </td>
                <td className="py-2 text-right">{formatearMoneda(cargo.saldo)}</td>
                <td className="py-2 text-right">
                  <input
                    type="number"
                    name={`monto-${cargo.id}`}
                    min={0.01}
                    max={cargo.saldo}
                    step="0.01"
                    required={marcado}
                    disabled={!marcado}
                    value={montos[cargo.id]}
                    onChange={(evento) => setMontos((m) => ({ ...m, [cargo.id]: evento.target.value }))}
                    className="w-32 rounded-md border border-zinc-300 px-2 py-1 text-right disabled:bg-zinc-50 disabled:text-zinc-400"
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="flex flex-wrap items-end gap-4">
        <label className="text-sm text-zinc-700">
          Método
          <select name="metodo" required defaultValue="" className="ml-2 rounded-md border border-zinc-300 px-2 py-1">
            <option value="" disabled>Elige</option>
            {METODOS_PAGO.map((metodo) => (
              <option key={metodo} value={metodo}>{ETIQUETAS_METODO[metodo]}</option>
            ))}
          </select>
        </label>
        <label className="text-sm text-zinc-700">
          Referencia (opcional)
          <input name="referencia" maxLength={100} className="ml-2 w-56 rounded-md border border-zinc-300 px-2 py-1" />
        </label>
      </div>

      <div className="flex items-center gap-6">
        <span className="text-lg">
          Total: <strong>{formatearMoneda(total)}</strong>
        </span>
        {seleccionados.size > 0 && total > 0 && (
          <BotonEnviar
            textoEnviando="Registrando..."
            className="rounded-md bg-primario px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            Registrar pago
          </BotonEnviar>
        )}
      </div>
    </form>
  );
}
