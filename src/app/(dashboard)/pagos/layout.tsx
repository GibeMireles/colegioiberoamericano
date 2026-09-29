import type { ReactNode } from "react";
import { requerirRolPagina } from "@/lib/perfiles/requerirRolPagina";
import { ROLES_PAGOS } from "@/lib/pagos/catalogos";
import { PagosNav } from "@/components/pagos/PagosNav";

export default async function PagosLayout({ children }: { children: ReactNode }) {
  await requerirRolPagina(ROLES_PAGOS);

  return (
    <div>
      <PagosNav />
      {children}
    </div>
  );
}
