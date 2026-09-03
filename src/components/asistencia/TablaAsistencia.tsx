export interface FilaAsistencia {
  alumnoId: string;
  nombre: string;
  estatus: "presente" | "ausente" | "retardo" | "justificado";
}

const ETIQUETAS: Record<FilaAsistencia["estatus"], string> = {
  presente: "Presente",
  ausente: "Ausente",
  retardo: "Retardo",
  justificado: "Justificado",
};

export function TablaAsistencia({
  filas,
  accionGuardar,
  fecha,
  soloLectura = false,
}: {
  filas: FilaAsistencia[];
  accionGuardar: (formData: FormData) => void | Promise<void>;
  fecha: string;
  soloLectura?: boolean;
}) {
  const Wrapper = soloLectura ? "div" : "form";
  const wrapperProps = soloLectura ? {} : { action: accionGuardar };

  return (
    <Wrapper {...wrapperProps} className="mt-6 overflow-x-auto">
      {!soloLectura && <input type="hidden" name="fecha" value={fecha} />}
      <table className="min-w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-left text-xs font-medium text-zinc-500">
            <th className="p-2">Alumno</th>
            <th className="p-2">Estatus</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((fila) => (
            <tr key={fila.alumnoId} className="border-b border-zinc-100">
              <td className="p-2 font-medium text-zinc-900">{fila.nombre}</td>
              <td className="p-2">
                {soloLectura ? (
                  <span className="text-zinc-600">{ETIQUETAS[fila.estatus]}</span>
                ) : (
                  <select
                    name={`estatus-${fila.alumnoId}`}
                    defaultValue={fila.estatus}
                    className="rounded-md border border-zinc-300 px-2 py-1 text-sm"
                  >
                    <option value="presente">Presente</option>
                    <option value="ausente">Ausente</option>
                    <option value="retardo">Retardo</option>
                    <option value="justificado">Justificado</option>
                  </select>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!soloLectura && (
        <button
          type="submit"
          className="mt-4 rounded-md bg-primario px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          Guardar asistencia
        </button>
      )}
    </Wrapper>
  );
}
