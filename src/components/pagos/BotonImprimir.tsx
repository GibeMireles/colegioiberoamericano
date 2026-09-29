"use client";

export function BotonImprimir() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-md bg-primario px-4 py-2 text-sm font-medium text-white hover:opacity-90 print:hidden"
    >
      Imprimir / Guardar PDF
    </button>
  );
}
