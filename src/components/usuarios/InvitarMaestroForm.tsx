"use client";

import { useState, type FormEvent } from "react";
import { invitarMaestroSchema } from "@/lib/usuarios/schema";

type Errores = { correo?: string; nombre_completo?: string };

export function InvitarMaestroForm({
  action,
}: {
  action: (formData: FormData) => void;
}) {
  const [errores, setErrores] = useState<Errores>({});

  function manejarEnvio(evento: FormEvent<HTMLFormElement>) {
    const formData = new FormData(evento.currentTarget);
    const resultado = invitarMaestroSchema.safeParse({
      correo: formData.get("correo") ?? undefined,
      nombre_completo: formData.get("nombre_completo") ?? undefined,
    });

    if (!resultado.success) {
      evento.preventDefault();
      const nuevosErrores: Errores = {};
      for (const issue of resultado.error.issues) {
        const campo = issue.path[0] as keyof Errores;
        nuevosErrores[campo] = issue.message;
      }
      setErrores(nuevosErrores);
      return;
    }

    setErrores({});
  }

  return (
    <form
      action={action}
      onSubmit={manejarEnvio}
      noValidate
      className="flex flex-wrap items-end gap-3"
    >
      <div>
        <label
          htmlFor="nombre_completo"
          className="block text-sm font-medium text-zinc-700"
        >
          Nombre completo
        </label>
        <input
          id="nombre_completo"
          name="nombre_completo"
          className="mt-1 block w-56 rounded-md border border-zinc-300 px-3 py-2"
        />
        {errores.nombre_completo && (
          <p className="mt-1 text-sm text-red-600">{errores.nombre_completo}</p>
        )}
      </div>
      <div>
        <label htmlFor="correo" className="block text-sm font-medium text-zinc-700">
          Correo
        </label>
        <input
          id="correo"
          name="correo"
          type="email"
          className="mt-1 block w-64 rounded-md border border-zinc-300 px-3 py-2"
        />
        {errores.correo && (
          <p className="mt-1 text-sm text-red-600">{errores.correo}</p>
        )}
      </div>
      <button
        type="submit"
        className="rounded-md bg-primario px-4 py-2 text-sm font-medium text-white hover:opacity-90"
      >
        Invitar maestro
      </button>
    </form>
  );
}
