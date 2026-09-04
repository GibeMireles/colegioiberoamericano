"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

export function BotonEnviar({
  children,
  textoEnviando,
  className,
}: {
  children: ReactNode;
  textoEnviando: string;
  className: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={`${className} disabled:cursor-not-allowed disabled:opacity-60`}
    >
      {pending ? textoEnviando : children}
    </button>
  );
}
