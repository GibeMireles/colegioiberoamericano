import { requerirRolPagina } from "@/lib/perfiles/requerirRolPagina";
import { ROLES } from "@/lib/roles";
import { actualizarContrasena } from "./actions";

export const dynamic = "force-dynamic";

const MENSAJES_ERROR: Record<string, string> = {
  validacion:
    "Revisa los campos: la contraseña debe tener al menos 8 caracteres y las dos deben coincidir.",
  actualizacion_fallida: "No se pudo actualizar la contraseña. Intenta de nuevo.",
};

export default async function MiCuentaPage({
  searchParams,
}: {
  searchParams: Promise<{ guardado?: string; error?: string }>;
}) {
  await requerirRolPagina([...ROLES]);
  const { guardado, error } = await searchParams;

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900">Mi cuenta</h1>

      {guardado === "1" && (
        <p className="mt-4 rounded-md bg-green-50 px-4 py-2 text-sm font-medium text-green-800">
          ✓ Contraseña actualizada.
        </p>
      )}

      <div className="mt-6 max-w-sm">
        <h2 className="text-lg font-semibold text-zinc-900">Crear o cambiar contraseña</h2>
        <p className="text-sm text-zinc-600">
          Úsala para entrar más rápido la próxima vez, sin depender de un enlace por correo.
        </p>
        <form action={actualizarContrasena} className="mt-4 space-y-4">
          <div>
            <label
              htmlFor="contrasena"
              className="block text-sm font-medium text-zinc-700"
            >
              Nueva contraseña
            </label>
            <input
              id="contrasena"
              name="contrasena"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2"
            />
          </div>
          <div>
            <label
              htmlFor="confirmar"
              className="block text-sm font-medium text-zinc-700"
            >
              Confirmar contraseña
            </label>
            <input
              id="confirmar"
              name="confirmar"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2"
            />
          </div>
          {error && (
            <p className="text-sm text-red-600">
              {MENSAJES_ERROR[error] ?? "Ocurrió un error. Intenta de nuevo."}
            </p>
          )}
          <button
            type="submit"
            className="rounded-md bg-primario px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            Guardar contraseña
          </button>
        </form>
      </div>
    </div>
  );
}
