"use client";

import { useState } from "react";

export interface FilaMateriaProps {
  nombre: string;
  cantidadAsignaciones: number;
  accionRenombrar: (formData: FormData) => void | Promise<void>;
  accionEliminar: () => void | Promise<void>;
  children?: React.ReactNode;
}

export function FilaMateria({
  nombre,
  cantidadAsignaciones,
  accionRenombrar,
  accionEliminar,
  children,
}: FilaMateriaProps) {
  const [editando, setEditando] = useState(false);

  return (
    <div className="rounded-md border border-zinc-200 p-3">
      {editando ? (
        <form
          action={async (formData) => {
            await accionRenombrar(formData);
            setEditando(false);
          }}
          className="flex items-center gap-2"
        >
          <input
            name="nombre"
            defaultValue={nombre}
            required
            autoFocus
            className="flex-1 rounded-md border border-zinc-300 px-2 py-1 text-sm"
          />
          <button
            type="submit"
            className="rounded-md bg-primario px-3 py-1 text-xs font-medium text-white"
          >
            Guardar
          </button>
          <button
            type="button"
            onClick={() => setEditando(false)}
            className="rounded-md border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-700"
          >
            Cancelar
          </button>
        </form>
      ) : (
        <div className="flex items-center justify-between">
          <span className="font-medium text-zinc-900">{nombre}</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setEditando(true)}
              className="rounded-md border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
            >
              Renombrar
            </button>
            {cantidadAsignaciones > 0 ? (
              <span
                title="No se puede eliminar: tiene un maestro asignado."
                className="cursor-not-allowed rounded-md border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-400"
              >
                Eliminar
              </span>
            ) : (
              <form
                action={accionEliminar}
                onSubmit={(evento) => {
                  if (!confirm(`¿Eliminar "${nombre}"? Esta acción no se puede deshacer.`)) {
                    evento.preventDefault();
                  }
                }}
              >
                <button
                  type="submit"
                  className="rounded-md border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
                >
                  Eliminar
                </button>
              </form>
            )}
          </div>
        </div>
      )}
      {children}
    </div>
  );
}
