import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { obtenerPerfilActual } from "@/lib/perfiles/actual";
import { InvitarMaestroForm } from "@/components/usuarios/InvitarMaestroForm";
import { invitarDocente } from "./actions";

export const dynamic = "force-dynamic";

const ETIQUETAS_ROL: Record<string, string> = {
  super_admin: "Super admin",
  direccion: "Dirección",
  caja: "Caja",
  docente: "Docente",
};

interface PerfilListado {
  id: string;
  nombre_completo: string;
  rol: string;
  creado_en: string;
}

async function obtenerPerfiles(): Promise<PerfilListado[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("perfiles")
    .select("id, nombre_completo, rol, creado_en")
    .order("creado_en", { ascending: false });

  if (error) {
    throw new Error(`No se pudo cargar la lista de usuarios: ${error.message}`);
  }

  return data ?? [];
}

export default async function UsuariosPage() {
  const perfilActual = await obtenerPerfilActual();

  if (!perfilActual || perfilActual.rol !== "super_admin") {
    notFound();
  }

  const perfiles = await obtenerPerfiles();

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900">Usuarios</h1>

      <div className="mt-6">
        <InvitarMaestroForm action={invitarDocente} />
      </div>

      <table className="mt-8 w-full text-left text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-zinc-500">
            <th className="py-2 font-medium">Nombre</th>
            <th className="py-2 font-medium">Rol</th>
          </tr>
        </thead>
        <tbody>
          {perfiles.map((perfil) => (
            <tr key={perfil.id} className="border-b border-zinc-100">
              <td className="py-2 text-zinc-900">{perfil.nombre_completo}</td>
              <td className="py-2 text-zinc-600">
                {ETIQUETAS_ROL[perfil.rol] ?? perfil.rol}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
