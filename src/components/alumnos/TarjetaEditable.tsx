"use client";

import Link from "next/link";
import { useState } from "react";

export interface TarjetaEditableProps {
  nombre: string;
  subtitulo: string;
  href: string;
  color: string;
  cantidadHijos: number;
  etiquetaHijos: string;
  accionRenombrar: (formData: FormData) => void | Promise<void>;
  accionEliminar: () => void | Promise<void>;
}

export function TarjetaEditable({
  nombre,
  subtitulo,
  href,
  color,
  cantidadHijos,
  etiquetaHijos,
  accionRenombrar,
  accionEliminar,
}: TarjetaEditableProps) {
  const [editando, setEditando] = useState(false);

  if (editando) {
    return (
      <form
        action={async (formData) => {
          await accionRenombrar(formData);
          setEditando(false);
        }}
        className="rounded-2xl border-2 border-zinc-300 bg-white p-4"
      >
        <input
          name="nombre"
          defaultValue={nombre}
          required
          autoFocus
          className="w-full rounded-md border border-zinc-300 px-2 py-1 text-sm"
        />
        <div className="mt-2 flex gap-2">
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
        </div>
      </form>
    );
  }

  return (
    <div
      className="rounded-2xl p-5 text-white"
      style={{ backgroundColor: color }}
    >
      <Link href={href} className="block">
        <div className="text-base font-bold">{nombre}</div>
        <div className="text-sm opacity-90">{subtitulo}</div>
      </Link>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => setEditando(true)}
          className="rounded-md bg-white/20 px-2 py-1 text-xs font-medium hover:bg-white/30"
        >
          Renombrar
        </button>
        {cantidadHijos > 0 ? (
          <span
            title={`No se puede eliminar: tiene ${cantidadHijos} ${etiquetaHijos}.`}
            className="cursor-not-allowed rounded-md bg-white/10 px-2 py-1 text-xs font-medium opacity-50"
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
              className="rounded-md bg-white/20 px-2 py-1 text-xs font-medium hover:bg-white/30"
            >
              Eliminar
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
