import Link from "next/link";
import { requerirRolPagina } from "@/lib/perfiles/requerirRolPagina";
import { obtenerCicloActivoId } from "@/lib/ciclos/activo";
import { ROLES_PAGOS } from "@/lib/pagos/catalogos";
import { formatearMoneda, sumarMontos } from "@/lib/pagos/calculos";
import { esUuid } from "@/lib/pagos/schema";
import { formatearFecha } from "@/lib/fechas";
import { obtenerAlumnosConAdeudo, obtenerEstructura } from "@/lib/pagos/consultas";

export const dynamic = "force-dynamic";

const CLASE_INPUT = "rounded-md border border-zinc-300 px-3 py-2 text-sm";

export default async function AdeudosPage({
  searchParams,
}: {
  searchParams: Promise<{ nivel?: string; grado?: string; grupo?: string; vencidos?: string }>;
}) {
  await requerirRolPagina(ROLES_PAGOS);
  const filtros = await searchParams;
  const nivelId = esUuid(filtros.nivel) ? filtros.nivel : null;
  const gradoId = esUuid(filtros.grado) ? filtros.grado : null;
  const grupoId = esUuid(filtros.grupo) ? filtros.grupo : null;
  const soloVencidos = filtros.vencidos === "1";

  const cicloId = await obtenerCicloActivoId();
  if (!cicloId) {
    return <p className="text-zinc-600">No hay un ciclo escolar activo.</p>;
  }

  const estructura = await obtenerEstructura(cicloId);
  const filas = (await obtenerAlumnosConAdeudo(cicloId, estructura))
    .filter(
      (alumno) =>
        alumno.adeudoTotal > 0 &&
        (!soloVencidos || alumno.adeudoVencido > 0) &&
        (grupoId === null || alumno.grupoId === grupoId) &&
        (gradoId === null || alumno.gradoId === gradoId) &&
        (nivelId === null || alumno.nivelId === nivelId)
    )
    .sort((a, b) => b.adeudoVencido - a.adeudoVencido || a.nombre.localeCompare(b.nombre, "es"));

  const totalAdeudo = sumarMontos(filas.map((f) => f.adeudoTotal));
  const totalVencido = sumarMontos(filas.map((f) => f.adeudoVencido));

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900">Adeudos</h1>

      <form action="/pagos/adeudos" className="mt-4 flex flex-wrap items-end gap-3">
        <select name="nivel" defaultValue={nivelId ?? ""} className={CLASE_INPUT}>
          <option value="">Todos los niveles</option>
          {estructura.niveles.map((n) => <option key={n.id} value={n.id}>{n.nombre}</option>)}
        </select>
        <select name="grado" defaultValue={gradoId ?? ""} className={CLASE_INPUT}>
          <option value="">Todos los grados</option>
          {estructura.grados
            .filter((g) => nivelId === null || g.nivelId === nivelId)
            .map((g) => <option key={g.id} value={g.id}>{g.nombre}</option>)}
        </select>
        <select name="grupo" defaultValue={grupoId ?? ""} className={CLASE_INPUT}>
          <option value="">Todos los grupos</option>
          {estructura.grupos
            .filter((g) => (nivelId === null || g.nivelId === nivelId) && (gradoId === null || g.gradoId === gradoId))
            .map((g) => <option key={g.id} value={g.id}>{g.etiqueta}</option>)}
        </select>
        <label className="text-sm text-zinc-700">
          <input type="checkbox" name="vencidos" value="1" defaultChecked={soloVencidos} /> Solo con vencidos
        </label>
        <button type="submit" className="rounded-md bg-primario px-4 py-2 text-sm font-medium text-white hover:opacity-90">
          Filtrar
        </button>
      </form>

      {filas.length === 0 ? (
        <p className="mt-6 text-sm text-zinc-600">Sin adeudos con estos filtros.</p>
      ) : (
        <table className="mt-6 w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-zinc-500">
              <th className="py-2">Alumno</th>
              <th className="py-2">Grupo</th>
              <th className="py-2 text-right">Adeudo</th>
              <th className="py-2 text-right">Vencido</th>
              <th className="py-2">Vence desde</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((fila) => (
              <tr key={fila.alumnoId} className="border-b border-zinc-100">
                <td className="py-2">
                  <Link href={`/pagos/alumno/${fila.alumnoId}`} className="text-zinc-900 hover:underline">
                    {fila.nombre}
                  </Link>
                  {!fila.activo && <span className="ml-2 text-xs text-zinc-500">(baja)</span>}
                </td>
                <td className="py-2 text-zinc-600">{fila.grupo}</td>
                <td className="py-2 text-right">{formatearMoneda(fila.adeudoTotal)}</td>
                <td className={`py-2 text-right ${fila.adeudoVencido > 0 ? "font-medium text-red-700" : "text-zinc-600"}`}>
                  {formatearMoneda(fila.adeudoVencido)}
                </td>
                <td className="py-2 text-zinc-600">
                  {fila.vencimientoMasAntiguo ? formatearFecha(fila.vencimientoMasAntiguo) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-semibold text-zinc-900">
              <td className="py-3" colSpan={2}>Total ({filas.length} alumno{filas.length === 1 ? "" : "s"})</td>
              <td className="py-3 text-right">{formatearMoneda(totalAdeudo)}</td>
              <td className="py-3 text-right text-red-700">{formatearMoneda(totalVencido)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  );
}
