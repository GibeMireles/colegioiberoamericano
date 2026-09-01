"use client";

import { useState, type FormEvent } from "react";
import { alumnoSchema } from "@/lib/alumnos/schema";

export interface AlumnoFormValues {
  nombres: string;
  apellido_paterno: string;
  apellido_materno: string;
  fecha_nacimiento: string;
  matricula: string;
  tutor_nombre: string;
  tutor_telefono: string;
  tutor_email: string;
}

const VALORES_VACIOS: AlumnoFormValues = {
  nombres: "",
  apellido_paterno: "",
  apellido_materno: "",
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
      nombres: campo(formData, "nombres"),
      apellido_paterno: campo(formData, "apellido_paterno"),
      apellido_materno: campo(formData, "apellido_materno"),
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
        <label htmlFor="nombres" className="block text-sm font-medium text-zinc-700">
          Nombre(s)
        </label>
        <input
          id="nombres"
          name="nombres"
          defaultValue={valoresIniciales.nombres}
          className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2"
        />
        {errores.nombres && (
          <p className="mt-1 text-sm text-red-600">{errores.nombres}</p>
        )}
      </div>
      <div>
        <label
          htmlFor="apellido_paterno"
          className="block text-sm font-medium text-zinc-700"
        >
          Apellido paterno
        </label>
        <input
          id="apellido_paterno"
          name="apellido_paterno"
          defaultValue={valoresIniciales.apellido_paterno}
          className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2"
        />
        {errores.apellido_paterno && (
          <p className="mt-1 text-sm text-red-600">{errores.apellido_paterno}</p>
        )}
      </div>
      <div>
        <label
          htmlFor="apellido_materno"
          className="block text-sm font-medium text-zinc-700"
        >
          Apellido materno
        </label>
        <input
          id="apellido_materno"
          name="apellido_materno"
          defaultValue={valoresIniciales.apellido_materno}
          className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2"
        />
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
