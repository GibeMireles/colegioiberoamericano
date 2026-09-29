import Link from "next/link";
import { requerirRolPagina } from "@/lib/perfiles/requerirRolPagina";
import { obtenerCicloActivoId } from "@/lib/ciclos/activo";
import { ROLES_PAGOS } from "@/lib/pagos/catalogos";
import { formatearMoneda, normalizarTexto } from "@/lib/pagos/calculos";
import { esUuid } from "@/lib/pagos/schema";
import { obtenerAlumnosConAdeudo, obtenerEstructura } from "@/lib/pagos/consultas";

export const dynamic = "force-dynamic";

export default async function PagosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; grupo?: string }>;
}) {
  await requerirRolPagina(ROLES_PAGOS);
  const { q = "", grupo = "" } = await searchParams;

  const cicloId = await obtenerCicloActivoId();
  if (!cicloId) {
    return <p className="text-zinc-600">No hay un ciclo escolar activo.</p>;
  }

  const estructura = await obtenerEstructura(cicloId);
  const busqueda = normalizarTexto(q);
  const grupoId = esUuid(grupo) ? grupo : null;
  const hayFiltro = busqueda.length >= 2 || grupoId !== null;

  const alumnos = hayFiltro
    ? (await obtenerAlumnosConAdeudo(cicloId, estructura)).filter(
        (alumno) =>
          (grupoId === null || alumno.grupoId === grupoId) &&
          (busqueda.length < 2 || normalizarTexto(alumno.nombre).includes(busqueda))
      )
    : [];

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900">Pagos — Alumnos</h1>

      <form className="mt-4 flex flex-wrap items-end gap-3" action="/pagos">
        <input
          name="q"
          defaultValue={q}
          placeholder="Buscar por nombre o apellido"
          className="w-72 rounded-md border border-zinc-300 px-3 py-2 text-sm"
        />
        <select name="grupo" defaultValue={grupoId ?? ""} className="rounded-md border border-zinc-300 px-3 py-2 text-sm">
          <option value="">Todos los grupos</option>
          {estructura.grupos.map((g) => (
            <option key={g.id} value={g.id}>{g.etiqueta}</option>
          ))}
        </select>
        <button type="submit" className="rounded-md bg-primario px-4 py-2 text-sm font-medium text-white hover:opacity-90">
          Buscar
        </button>
      </form>

      {!hayFiltro && (
        <p className="mt-6 text-sm text-zinc-600">Escribe al menos 2 letras del nombre o elige un grupo.</p>
      )}
      {hayFiltro && alumnos.length === 0 && (
        <p className="mt-6 text-sm text-zinc-600">No se encontraron alumnos inscritos en el ciclo activo.</p>
      )}

      {alumnos.length > 0 && (
        <table className="mt-6 w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-zinc-500">
              <th className="py-2">Alumno</th>
              <th className="py-2">Grupo</th>
              <th className="py-2 text-right">Adeudo</th>
              <th className="py-2 text-right">Vencido</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {alumnos.map((alumno) => (
              <tr key={alumno.alumnoId} className="border-b border-zinc-100">
                <td className="py-2 text-zinc-900">
                  {alumno.nombre}
                  {!alumno.activo && <span className="ml-2 text-xs text-zinc-500">(baja)</span>}
                </td>
                <td className="py-2 text-zinc-600">{alumno.grupo}</td>
                <td className="py-2 text-right">{formatearMoneda(alumno.adeudoTotal)}</td>
                <td className={`py-2 text-right ${alumno.adeudoVencido > 0 ? "font-medium text-red-700" : "text-zinc-600"}`}>
                  {formatearMoneda(alumno.adeudoVencido)}
                </td>
                <td className="py-2 text-right">
                  <Link href={`/pagos/alumno/${alumno.alumnoId}`} className="font-medium text-primario hover:underline">
                    Estado de cuenta →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
