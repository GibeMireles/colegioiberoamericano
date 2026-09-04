import { enviarEnlaceAcceso, iniciarSesionConContrasena } from "./actions";

const MENSAJES_ERROR: Record<string, string> = {
  correo_invalido: "Escribe un correo válido.",
  envio_fallido: "No se pudo enviar el enlace. Intenta de nuevo.",
  enlace_invalido: "Tu enlace ya no es válido o expiró. Pide uno nuevo.",
  credenciales_invalidas: "Correo o contraseña incorrectos.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ enviado?: string; error?: string; next?: string; modo?: string }>;
}) {
  const { enviado, error, next, modo } = await searchParams;
  const modoEnlace = modo === "enlace";
  const sufijoNext = next ? `next=${encodeURIComponent(next)}` : "";

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50">
      <div className="w-full max-w-sm rounded-lg border border-zinc-200 bg-white p-8">
        <h1 className="text-xl font-semibold text-zinc-900">Iniciar sesión</h1>

        {modoEnlace ? (
          enviado ? (
            <p className="mt-4 text-sm text-zinc-600">
              Revisa tu correo: te enviamos un enlace para entrar.
            </p>
          ) : (
            <>
              <form action={enviarEnlaceAcceso} className="mt-4 space-y-4">
                {next && <input type="hidden" name="next" value={next} />}
                <div>
                  <label
                    htmlFor="correo"
                    className="block text-sm font-medium text-zinc-700"
                  >
                    Correo
                  </label>
                  <input
                    id="correo"
                    name="correo"
                    type="email"
                    required
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
                  className="w-full rounded-md bg-primario px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                >
                  Enviar enlace de acceso
                </button>
              </form>
              <a
                href={`/login${sufijoNext ? `?${sufijoNext}` : ""}`}
                className="mt-4 block text-sm font-medium text-primario hover:underline"
              >
                Entrar con correo y contraseña
              </a>
            </>
          )
        ) : (
          <>
            <form action={iniciarSesionConContrasena} className="mt-4 space-y-4">
              {next && <input type="hidden" name="next" value={next} />}
              <div>
                <label
                  htmlFor="correo"
                  className="block text-sm font-medium text-zinc-700"
                >
                  Correo
                </label>
                <input
                  id="correo"
                  name="correo"
                  type="email"
                  required
                  className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2"
                />
              </div>
              <div>
                <label
                  htmlFor="contrasena"
                  className="block text-sm font-medium text-zinc-700"
                >
                  Contraseña
                </label>
                <input
                  id="contrasena"
                  name="contrasena"
                  type="password"
                  required
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
                className="w-full rounded-md bg-primario px-4 py-2 text-sm font-medium text-white hover:opacity-90"
              >
                Iniciar sesión
              </button>
            </form>
            <a
              href={`/login?modo=enlace${sufijoNext ? `&${sufijoNext}` : ""}`}
              className="mt-4 block text-sm font-medium text-primario hover:underline"
            >
              ¿No tienes contraseña o la olvidaste? Entra con un enlace por correo
            </a>
          </>
        )}
      </div>
    </div>
  );
}
