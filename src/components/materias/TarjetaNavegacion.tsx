import Link from "next/link";

export function TarjetaNavegacion({
  nombre,
  subtitulo,
  href,
  color,
}: {
  nombre: string;
  subtitulo: string;
  href: string;
  color: string;
}) {
  return (
    <Link
      href={href}
      className="block rounded-2xl p-5 text-white"
      style={{ backgroundColor: color }}
    >
      <div className="text-base font-bold">{nombre}</div>
      <div className="text-sm opacity-90">{subtitulo}</div>
    </Link>
  );
}
