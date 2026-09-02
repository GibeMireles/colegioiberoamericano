import { calcularSubtotal, calcularTotal } from "@/lib/calificaciones/calculos";

export interface FilaCaptura {
  alumnoId: string;
  nombre: string;
  parcial1_adas: number | null;
  parcial1_examen: number | null;
  parcial2_adas: number | null;
  parcial2_examen: number | null;
  producto_proyecto: number | null;
  producto_examen: number | null;
}

const CAMPO_CLASE = "w-20 rounded-md border border-zinc-300 px-1 py-0.5 text-sm";

export function TablaCaptura({
  filas,
  accionGuardar,
  parcial1Max,
  parcial2Max,
  productoMax,
}: {
  filas: FilaCaptura[];
  accionGuardar: (formData: FormData) => void | Promise<void>;
  parcial1Max: number;
  parcial2Max: number;
  productoMax: number;
}) {
  return (
    <form action={accionGuardar} className="mt-6 overflow-x-auto">
      <table className="min-w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-left text-xs font-medium text-zinc-500">
            <th className="p-2">Alumno</th>
            <th className="p-2">ADAS 1</th>
            <th className="p-2">Examen 1</th>
            <th className="p-2">Calif 1 / {parcial1Max}</th>
            <th className="p-2">ADAS 2</th>
            <th className="p-2">Examen 2</th>
            <th className="p-2">Calif 2 / {parcial2Max}</th>
            <th className="p-2">Proyecto</th>
            <th className="p-2">Examen prod.</th>
            <th className="p-2">Subtotal / {productoMax}</th>
            <th className="p-2">Total</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((fila) => {
            const calif1 = calcularSubtotal(fila.parcial1_adas, fila.parcial1_examen);
            const calif2 = calcularSubtotal(fila.parcial2_adas, fila.parcial2_examen);
            const subtotalProducto = calcularSubtotal(fila.producto_proyecto, fila.producto_examen);
            const total = calcularTotal(fila);

            return (
              <tr key={fila.alumnoId} className="border-b border-zinc-100">
                <td className="p-2 font-medium text-zinc-900">{fila.nombre}</td>
                <td className="p-2">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    name={`parcial1_adas-${fila.alumnoId}`}
                    defaultValue={fila.parcial1_adas ?? ""}
                    className={CAMPO_CLASE}
                  />
                </td>
                <td className="p-2">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    name={`parcial1_examen-${fila.alumnoId}`}
                    defaultValue={fila.parcial1_examen ?? ""}
                    className={CAMPO_CLASE}
                  />
                </td>
                <td className="p-2 text-zinc-600">{calif1}</td>
                <td className="p-2">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    name={`parcial2_adas-${fila.alumnoId}`}
                    defaultValue={fila.parcial2_adas ?? ""}
                    className={CAMPO_CLASE}
                  />
                </td>
                <td className="p-2">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    name={`parcial2_examen-${fila.alumnoId}`}
                    defaultValue={fila.parcial2_examen ?? ""}
                    className={CAMPO_CLASE}
                  />
                </td>
                <td className="p-2 text-zinc-600">{calif2}</td>
                <td className="p-2">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    name={`producto_proyecto-${fila.alumnoId}`}
                    defaultValue={fila.producto_proyecto ?? ""}
                    className={CAMPO_CLASE}
                  />
                </td>
                <td className="p-2">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    name={`producto_examen-${fila.alumnoId}`}
                    defaultValue={fila.producto_examen ?? ""}
                    className={CAMPO_CLASE}
                  />
                </td>
                <td className="p-2 text-zinc-600">{subtotalProducto}</td>
                <td className="p-2 font-semibold text-zinc-900">{total}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <button
        type="submit"
        className="mt-4 rounded-md bg-primario px-4 py-2 text-sm font-medium text-white hover:opacity-90"
      >
        Guardar calificaciones
      </button>
    </form>
  );
}
