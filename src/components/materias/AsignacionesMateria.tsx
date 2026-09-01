"use client";

import { useState } from "react";

export interface AsignacionListada {
  id: string;
  grupoNombre: string;
  docenteNombre: string;
}

export interface OpcionSelect {
  id: string;
  etiqueta: string;
}

export function AsignacionesMateria({
  asignaciones,
  grupos,
  docentes,
  accionCrear,
  accionEliminar,
}: {
  asignaciones: AsignacionListada[];
  grupos: OpcionSelect[];
  docentes: OpcionSelect[];
  accionCrear: (formData: FormData) => void | Promise<void>;
  accionEliminar: (id: string) => void | Promise<void>;
}) {
  const [asignando, setAsignando] = useState(false);

  return (
    <div className="mt-2 space-y-2 border-t border-zinc-100 pt-2 text-sm">
      {asignaciones.length === 0 && (
        <p className="text-zinc-500">Sin maestro asignado.</p>
      )}
      {asignaciones.map((asignacion) => (
        <div key={asignacion.id} className="flex items-center justify-between">
          <span className="text-zinc-700">
            Grupo {asignacion.grupoNombre} — {asignacion.docenteNombre}
          </span>
          <form action={accionEliminar.bind(null, asignacion.id)}>
            <button type="submit" className="text-xs font-medium text-zinc-500 hover:underline">
              Quitar
            </button>
          </form>
        </div>
      ))}

      {asignando ? (
        <form
          action={async (formData) => {
            await accionCrear(formData);
            setAsignando(false);
          }}
          className="flex flex-wrap items-center gap-2"
        >
          <select
            name="grupo_id"
            required
            defaultValue=""
            className="rounded-md border border-zinc-300 px-2 py-1 text-xs"
          >
            <option value="" disabled>
              Grupo…
            </option>
            {grupos.map((grupo) => (
              <option key={grupo.id} value={grupo.id}>
                {grupo.etiqueta}
              </option>
            ))}
          </select>
          <select
            name="docente_perfil_id"
            required
            defaultValue=""
            className="rounded-md border border-zinc-300 px-2 py-1 text-xs"
          >
            <option value="" disabled>
              Maestro…
            </option>
            {docentes.map((docente) => (
              <option key={docente.id} value={docente.id}>
                {docente.etiqueta}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-md bg-primario px-2 py-1 text-xs font-medium text-white"
          >
            Guardar
          </button>
          <button
            type="button"
            onClick={() => setAsignando(false)}
            className="rounded-md border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-700"
          >
            Cancelar
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAsignando(true)}
          className="text-xs font-medium text-primario hover:underline"
        >
          + Asignar a un grupo
        </button>
      )}
    </div>
  );
}
