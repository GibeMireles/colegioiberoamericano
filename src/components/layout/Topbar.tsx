import Image from "next/image";
import { getConfiguracion } from "@/lib/config";

export async function Topbar() {
  const config = await getConfiguracion();

  return (
    <header className="flex h-16 shrink-0 items-center gap-3 border-b border-black/10 bg-white px-6">
      {config.logoUrl ? (
        <Image
          src={config.logoUrl}
          alt={config.nombre}
          width={32}
          height={32}
        />
      ) : (
        <div
          className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold text-white"
          style={{ backgroundColor: config.colorPrimario }}
          aria-hidden="true"
        >
          {config.nombreCorto.charAt(0)}
        </div>
      )}
      <span className="text-lg font-semibold text-zinc-900">
        {config.nombre}
      </span>
    </header>
  );
}
