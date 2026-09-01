"use client";

import { useState } from "react";

export interface TarjetaAgregarProps {
  etiqueta: string;
  accionCrear: (formData: FormData) => void | Promise<void>;
}

export function TarjetaAgregar({ etiqueta, accionCrear }: TarjetaAgregarProps) {
  const [creando, setCreando] = useState(false);

  if (creando) {
    return (
      <form
        action={async (formData) => {
          await accionCrear(formData);
          setCreando(false);
        }}
        className="rounded-2xl border-2 border-zinc-300 bg-white p-4"
      >
        <input
          name="nombre"
          placeholder="Nombre"
          required
          autoFocus
          className="w-full rounded-md border border-zinc-300 px-2 py-1 text-sm"
        />
        <div className="mt-2 flex gap-2">
          <button
            type="submit"
            className="rounded-md bg-primario px-3 py-1 text-xs font-medium text-white"
          >
            Crear
          </button>
          <button
            type="button"
            onClick={() => setCreando(false)}
            className="rounded-md border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-700"
          >
            Cancelar
          </button>
        </div>
      </form>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setCreando(true)}
      className="flex min-h-[110px] items-center justify-center rounded-2xl border-2 border-dashed border-zinc-300 text-sm font-medium text-zinc-500 hover:border-primario hover:text-primario"
    >
      + Agregar {etiqueta}
    </button>
  );
}
