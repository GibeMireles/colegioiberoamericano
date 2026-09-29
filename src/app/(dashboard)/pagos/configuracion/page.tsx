import { createClient } from "@/lib/supabase/server";
import { requerirRolPagina } from "@/lib/perfiles/requerirRolPagina";
import { obtenerCicloActivoId } from "@/lib/ciclos/activo";
import { ROLES_PAGOS } from "@/lib/pagos/catalogos";
import { nombreCompletoAlumno } from "@/lib/pagos/calculos";
import { mensajeDeError } from "@/lib/pagos/errores";
import { obtenerEstructura, primero } from "@/lib/pagos/consultas";
import { BotonEnviar } from "@/components/ui/BotonEnviar";
import {
  actualizarConcepto,
  actualizarPlan,
  crearConcepto,
  generarColegiaturas,
  guardarPrecios,
} from "./actions";

export const dynamic = "force-dynamic";

const MENSAJES_OK: Record<string, string> = {
  plan: "✓ Plan actualizado.",
  precios: "✓ Precios guardados.",
  concepto: "✓ Concepto guardado.",
};

const CLASE_BOTON = "rounded-md bg-primario px-4 py-2 text-sm font-medium text-white hover:opacity-90";
const CLASE_INPUT = "rounded-md border border-zinc-300 px-2 py-1 text-sm";

interface Plan {
  id: string;
  mensualidades: number;
  primerMes: string;
  diaVencimiento: number;
  precios: Map<string, number>;
}

async function obtenerPlanes(cicloId: string): Promise<Plan[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("planes_pago")
    .select("id, mensualidades, primer_mes, dia_vencimiento, precios_colegiatura(nivel_id, monto_mensual)")
    .eq("ciclo_escolar_id", cicloId)
    .order("mensualidades");

  if (error) {
    throw new Error(`No se pudieron cargar los planes: ${error.message}`);
  }

  return (data ?? []).map((plan) => ({
    id: plan.id,
    mensualidades: plan.mensualidades,
    primerMes: String(plan.primer_mes).slice(0, 7),
    diaVencimiento: plan.dia_vencimiento,
    precios: new Map(
      (plan.precios_colegiatura ?? []).map((p) => [p.nivel_id, Number(p.monto_mensual)])
    ),
  }));
}

async function obtenerConceptos() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("conceptos_pago")
    .select("id, nombre, monto_default, aplica_beca, es_colegiatura, activo")
    .order("es_colegiatura", { ascending: false })
    .order("nombre");

  if (error) {
    throw new Error(`No se pudieron cargar los conceptos: ${error.message}`);
  }
  return data ?? [];
}

// Alumnos activos que "Generar colegiaturas" omitiría, calculado en vivo.
async function obtenerPendientesDeConfigurar(cicloId: string, planes: Plan[]) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inscripciones")
    .select(
      "plan_pago_id, alumnos(nombres, apellido_paterno, apellido_materno, activo), grupos(nombre, grados(nombre, nivel_id))"
    )
    .eq("ciclo_escolar_id", cicloId);

  if (error) {
    throw new Error(`No se pudieron revisar las inscripciones: ${error.message}`);
  }

  const planPorId = new Map(planes.map((plan) => [plan.id, plan]));

  return (data ?? [])
    .flatMap((inscripcion) => {
      const alumno = primero(inscripcion.alumnos);
      const grupo = primero(inscripcion.grupos);
      const grado = primero(grupo?.grados);
      if (!alumno || !alumno.activo || !grupo || !grado) {
        return [];
      }
      const etiqueta = `${grado.nombre} · Grupo ${grupo.nombre}`;
      const plan = inscripcion.plan_pago_id ? planPorId.get(inscripcion.plan_pago_id) : undefined;
      if (!plan) {
        return [{ nombre: nombreCompletoAlumno(alumno), grupo: etiqueta, motivo: "Sin plan" }];
      }
      if (!plan.precios.has(grado.nivel_id)) {
        return [{ nombre: nombreCompletoAlumno(alumno), grupo: etiqueta, motivo: `Sin precio (plan ${plan.mensualidades})` }];
      }
      return [];
    })
    .sort((a, b) => a.grupo.localeCompare(b.grupo, "es") || a.nombre.localeCompare(b.nombre, "es"));
}

export default async function ConfiguracionPagosPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string; creados?: string }>;
}) {
  await requerirRolPagina(ROLES_PAGOS);
  const { ok, error, creados } = await searchParams;

  const cicloId = await obtenerCicloActivoId();
  if (!cicloId) {
    return <p className="text-zinc-600">No hay un ciclo escolar activo.</p>;
  }

  const [planes, conceptos, estructura] = await Promise.all([
    obtenerPlanes(cicloId),
    obtenerConceptos(),
    obtenerEstructura(cicloId),
  ]);
  const pendientes = await obtenerPendientesDeConfigurar(cicloId, planes);
  const mensajeError = mensajeDeError(error);
  const creadosNumero = Number(creados);

  return (
    <div className="space-y-10">
      <h1 className="text-2xl font-semibold text-zinc-900">Configuración de pagos</h1>

      {ok && Object.hasOwn(MENSAJES_OK, ok) && (
        <p className="rounded-md bg-green-50 px-4 py-2 text-sm font-medium text-green-800">{MENSAJES_OK[ok]}</p>
      )}
      {creados !== undefined && Number.isFinite(creadosNumero) && (
        <p className="rounded-md bg-green-50 px-4 py-2 text-sm font-medium text-green-800">
          ✓ Se generaron {creadosNumero} cargo{creadosNumero === 1 ? "" : "s"} de colegiatura.
        </p>
      )}
      {mensajeError && (
        <p className="rounded-md bg-red-50 px-4 py-2 text-sm font-medium text-red-800">{mensajeError}</p>
      )}

      <section>
        <h2 className="text-lg font-semibold text-zinc-900">Planes de pago del ciclo</h2>
        <div className="mt-3 space-y-3">
          {planes.map((plan) => (
            <form key={plan.id} action={actualizarPlan.bind(null, plan.id)} className="flex flex-wrap items-end gap-3">
              <span className="w-32 text-sm font-medium text-zinc-900">{plan.mensualidades} mensualidades</span>
              <label className="text-sm text-zinc-700">
                Primer mes
                <input type="month" name="primerMes" defaultValue={plan.primerMes} required className={`ml-2 ${CLASE_INPUT}`} />
              </label>
              <label className="text-sm text-zinc-700">
                Día de vencimiento
                <input type="number" name="diaVencimiento" min={1} max={28} defaultValue={plan.diaVencimiento} required className={`ml-2 w-20 ${CLASE_INPUT}`} />
              </label>
              <BotonEnviar textoEnviando="Guardando..." className={CLASE_BOTON}>Guardar</BotonEnviar>
            </form>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-zinc-900">Precio de colegiatura mensual por nivel</h2>
        <p className="text-sm text-zinc-600">Deja vacío un nivel si ese plan no aplica.</p>
        <form action={guardarPrecios} className="mt-3">
          <table className="text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-zinc-500">
                <th className="py-2 pr-6">Nivel</th>
                {planes.map((plan) => (
                  <th key={plan.id} className="py-2 pr-6">Plan {plan.mensualidades}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {estructura.niveles.map((nivel) => (
                <tr key={nivel.id} className="border-b border-zinc-100">
                  <td className="py-2 pr-6 font-medium text-zinc-900">{nivel.nombre}</td>
                  {planes.map((plan) => (
                    <td key={plan.id} className="py-2 pr-6">
                      <input
                        type="number"
                        name={`precio:${plan.id}:${nivel.id}`}
                        min={0}
                        step="0.01"
                        defaultValue={plan.precios.get(nivel.id) ?? ""}
                        className={`w-32 ${CLASE_INPUT}`}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3">
            <BotonEnviar textoEnviando="Guardando..." className={CLASE_BOTON}>Guardar precios</BotonEnviar>
          </div>
        </form>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-zinc-900">Conceptos de cobro</h2>
        <div className="mt-3 space-y-2">
          {conceptos.map((concepto) => (
            <form key={concepto.id} action={actualizarConcepto.bind(null, concepto.id)} className="flex flex-wrap items-center gap-3">
              <input name="nombre" defaultValue={concepto.nombre} required className={`w-48 ${CLASE_INPUT}`} />
              <input
                name="montoDefault"
                type="number"
                min={0}
                step="0.01"
                placeholder="Monto sugerido"
                defaultValue={concepto.monto_default ?? ""}
                className={`w-36 ${CLASE_INPUT}`}
              />
              <label className="text-sm text-zinc-700">
                <input type="checkbox" name="aplicaBeca" defaultChecked={concepto.aplica_beca} disabled={concepto.es_colegiatura} /> Aplica beca
              </label>
              <label className="text-sm text-zinc-700">
                <input type="checkbox" name="activo" defaultChecked={concepto.activo} disabled={concepto.es_colegiatura} /> Activo
              </label>
              <BotonEnviar textoEnviando="Guardando..." className={CLASE_BOTON}>Guardar</BotonEnviar>
            </form>
          ))}
        </div>
        <form action={crearConcepto} className="mt-4 flex flex-wrap items-center gap-3">
          <input name="nombre" placeholder="Nuevo concepto (ej. Uniforme)" required className={`w-48 ${CLASE_INPUT}`} />
          <input name="montoDefault" type="number" min={0} step="0.01" placeholder="Monto sugerido" className={`w-36 ${CLASE_INPUT}`} />
          <label className="text-sm text-zinc-700">
            <input type="checkbox" name="aplicaBeca" /> Aplica beca
          </label>
          <BotonEnviar textoEnviando="Agregando..." className={CLASE_BOTON}>Agregar concepto</BotonEnviar>
        </form>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-zinc-900">Generar colegiaturas</h2>
        <p className="text-sm text-zinc-600">
          Crea las mensualidades del ciclo para cada alumno activo según su plan, el precio de su nivel y su beca.
          Se puede correr las veces que haga falta: nunca duplica un mes que ya existe.
        </p>
        <form action={generarColegiaturas} className="mt-3 flex flex-wrap items-end gap-3">
          <select name="grupoId" defaultValue="" className={CLASE_INPUT}>
            <option value="">Todo el ciclo</option>
            {estructura.grupos.map((grupo) => (
              <option key={grupo.id} value={grupo.id}>{grupo.etiqueta}</option>
            ))}
          </select>
          <BotonEnviar textoEnviando="Generando..." className={CLASE_BOTON}>Generar colegiaturas</BotonEnviar>
        </form>

        <h3 className="mt-6 text-sm font-semibold text-zinc-900">
          Alumnos que se omitirían ({pendientes.length})
        </h3>
        {pendientes.length === 0 ? (
          <p className="text-sm text-zinc-600">Todos los alumnos activos tienen plan y precio.</p>
        ) : (
          <table className="mt-2 text-sm">
            <tbody>
              {pendientes.map((p, i) => (
                <tr key={`${p.nombre}-${i}`} className="border-b border-zinc-100">
                  <td className="py-1 pr-6 text-zinc-900">{p.nombre}</td>
                  <td className="py-1 pr-6 text-zinc-600">{p.grupo}</td>
                  <td className="py-1 text-red-700">{p.motivo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
