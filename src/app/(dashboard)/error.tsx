"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900">Algo salió mal</h1>
      <p className="mt-2 text-zinc-600">
        {error.message || "Ocurrió un error al procesar tu solicitud. Intenta de nuevo."}
      </p>
      <button
        type="button"
        onClick={() => reset()}
        className="mt-4 rounded-md bg-primario px-4 py-2 text-sm font-medium text-white hover:opacity-90"
      >
        Reintentar
      </button>
    </div>
  );
}
