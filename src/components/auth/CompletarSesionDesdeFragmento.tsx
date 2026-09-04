"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

export function CompletarSesionDesdeFragmento({ next }: { next: string }) {
  useEffect(() => {
    const hash = window.location.hash.startsWith("#")
      ? window.location.hash.slice(1)
      : window.location.hash;
    const params = new URLSearchParams(hash);
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");

    if (!accessToken || !refreshToken) {
      const errorCode = params.get("error_code");
      if (errorCode) {
        console.error(`Enlace de acceso inválido: ${errorCode}`);
      }
      window.location.href = "/login?error=enlace_invalido";
      return;
    }

    const supabase = createClient();
    supabase.auth
      .setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(({ error }) => {
        window.location.href = error ? "/login?error=enlace_invalido" : next;
      });
  }, [next]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50">
      <p className="text-sm text-zinc-600">Iniciando sesión...</p>
    </div>
  );
}
