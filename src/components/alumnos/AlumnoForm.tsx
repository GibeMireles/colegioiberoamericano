"use client";

import { useState, type FormEvent } from "react";
import { alumnoSchema } from "@/lib/alumnos/schema";

export interface AlumnoFormValues {
  nombre_completo: string;
  fecha_nacimiento: string;
  matricula: string;
  tutor_nombre: string;
  tutor_telefono: string;
  tutor_email: string;
}

const VALORES_VACIOS: AlumnoFormValues = {
  nombre_completo: "",
  fecha_nacimiento: "",
  matricula: "",
  tutor_nombre: "",
  tutor_telefono: "",
  tutor_email: "",
};

type Errores = Partial<Record<keyof AlumnoFormValues, string>>;

function campo(formData: FormData, nombre: string) {
  return formData.get(nombre) ?? undefined;
}

export function AlumnoForm({
  action,
  valoresIniciales = VALORES_VACIOS,
  textoBoton,
}: {
  action: (formData: FormData) => void;
  valoresIniciales?: AlumnoFormValues;
  textoBoton: string;
}) {
  const [errores, setErrores] = useState<Errores>({});

  function manejarEnvio(evento: FormEvent<HTMLFormElement>) {
    const formData = new FormData(evento.currentTarget);
    const resultado = alumnoSchema.safeParse({
      nombre_completo: campo(formData, "nombre_completo"),
      fecha_nacimiento: campo(formData, "fecha_nacimiento"),
      matricula: campo(formData, "matricula"),
      tutor_nombre: campo(formData, "tutor_nombre"),
      tutor_telefono: campo(formData, "tutor_telefono"),
      tutor_email: campo(formData, "tutor_email"),
    });

    if (!resultado.success) {
      evento.preventDefault();
      const nuevosErrores: Errores = {};
      for (const issue of resultado.error.issues) {
        const campoConError = issue.path[0] as keyof AlumnoFormValues;
        nuevosErrores[campoConError] = issue.message;
      }
      setErrores(nuevosErrores);
      return;
    }

    setErrores({});
  }

  return (
    <form action={action} onSubmit={manejarEnvio} noValidate className="max-w-lg space-y-4">
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
          defaultValue={valoresIniciales.nombre_completo}
          className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2"
        />
        {errores.nombre_completo && (
          <p className="mt-1 text-sm text-red-600">{errores.nombre_completo}</p>
        )}
      </div>
      <div>
        <label
          htmlFor="fecha_nacimiento"
          className="block text-sm font-medium text-zinc-700"
        >
          Fecha de nacimiento
        </label>
        <input
          id="fecha_nacimiento"
          name="fecha_nacimiento"
          type="date"
          defaultValue={valoresIniciales.fecha_nacimiento}
          className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2"
        />
      </div>
      <div>
        <label htmlFor="matricula" className="block text-sm font-medium text-zinc-700">
          Matrícula
        </label>
        <input
          id="matricula"
          name="matricula"
          defaultValue={valoresIniciales.matricula}
          className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2"
        />
      </div>
      <div>
        <label
          htmlFor="tutor_nombre"
          className="block text-sm font-medium text-zinc-700"
        >
          Nombre del tutor
        </label>
        <input
          id="tutor_nombre"
          name="tutor_nombre"
          defaultValue={valoresIniciales.tutor_nombre}
          className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2"
        />
      </div>
      <div>
        <label
          htmlFor="tutor_telefono"
          className="block text-sm font-medium text-zinc-700"
        >
          Teléfono del tutor
        </label>
        <input
          id="tutor_telefono"
          name="tutor_telefono"
          defaultValue={valoresIniciales.tutor_telefono}
          className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2"
        />
      </div>
      <div>
        <label
          htmlFor="tutor_email"
          className="block text-sm font-medium text-zinc-700"
        >
          Correo del tutor
        </label>
        <input
          id="tutor_email"
          name="tutor_email"
          type="email"
          defaultValue={valoresIniciales.tutor_email}
          className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2"
        />
        {errores.tutor_email && (
          <p className="mt-1 text-sm text-red-600">{errores.tutor_email}</p>
        )}
      </div>
      <button
        type="submit"
        className="rounded-md bg-primario px-4 py-2 text-sm font-medium text-white hover:opacity-90"
      >
        {textoBoton}
      </button>
    </form>
  );
}
