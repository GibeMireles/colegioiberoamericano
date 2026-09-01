import type { ReactNode } from "react";
import { obtenerPerfilActual } from "@/lib/perfiles/actual";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

export async function AppShell({ children }: { children: ReactNode }) {
  const perfil = await obtenerPerfilActual();

  return (
    <div className="flex min-h-screen flex-col">
      <Topbar perfil={perfil} />
      <div className="flex flex-1">
        <Sidebar rol={perfil?.rol ?? null} />
        <main className="flex-1 p-8">{children}</main>
      </div>
    </div>
  );
}
