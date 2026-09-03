"use client";

import { useState, type FormEvent } from "react";
import { invitarUsuarioSchema } from "@/lib/usuarios/schema";
import { ETIQUETAS_ROL, ROLES } from "@/lib/roles";

type Errores = { correo?: string; nombre_completo?: string; rol?: string };

export function InvitarUsuarioForm({
  action,
}: {
  action: (formData: FormData) => void;
}) {
  const [errores, setErrores] = useState<Errores>({});

  function manejarEnvio(evento: FormEvent<HTMLFormElement>) {
    const formData = new FormData(evento.currentTarget);
    const resultado = invitarUsuarioSchema.safeParse({
      correo: formData.get("correo") ?? undefined,
      nombre_completo: formData.get("nombre_completo") ?? undefined,
      rol: formData.get("rol") ?? undefined,
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
      <div>
        <label htmlFor="rol" className="block text-sm font-medium text-zinc-700">
          Rol
        </label>
        <select
          id="rol"
          name="rol"
          defaultValue="docente"
          className="mt-1 block w-40 rounded-md border border-zinc-300 px-3 py-2"
        >
          {ROLES.map((rol) => (
            <option key={rol} value={rol}>
              {ETIQUETAS_ROL[rol]}
            </option>
          ))}
        </select>
        {errores.rol && <p className="mt-1 text-sm text-red-600">{errores.rol}</p>}
      </div>
      <button
        type="submit"
        className="rounded-md bg-primario px-4 py-2 text-sm font-medium text-white hover:opacity-90"
      >
        Invitar usuario
      </button>
    </form>
  );
}
