import { createClient } from "@/lib/supabase/server";
import { nombreCompletoAlumno } from "./calculos";
import type { EstatusCargo, MetodoPago } from "./catalogos";

// Supabase puede tipar un embed de relación a-uno como objeto o como
// arreglo; con RLS además puede venir null. Normaliza a un solo valor.
export function primero<T>(valor: T | T[] | null | undefined): T | null {
  if (Array.isArray(valor)) {
    return valor[0] ?? null;
  }
  return valor ?? null;
}

export interface CargoConSaldo {
  id: string;
  conceptoPagoId: string;
  periodo: string | null;
  descripcion: string;
  montoOriginal: number;
  becaPorcentaje: number;
  monto: number;
  pagado: number;
  saldo: number;
  estatus: EstatusCargo;
  fechaVencimiento: string | null;
  motivoCancelacion: string | null;
}

export async function obtenerCargosDeAlumno(
  alumnoId: string,
  cicloId: string
): Promise<CargoConSaldo[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("v_cargos_saldo")
    .select(
      "id, concepto_pago_id, periodo, descripcion, monto_original, beca_porcentaje, monto, pagado, saldo, estatus, fecha_vencimiento, motivo_cancelacion"
    )
    .eq("alumno_id", alumnoId)
    .eq("ciclo_escolar_id", cicloId)
    .order("fecha_vencimiento", { ascending: true, nullsFirst: false })
    .order("creado_en", { ascending: true });

  if (error) {
    throw new Error(`No se pudieron cargar los cargos: ${error.message}`);
  }

  return (data ?? []).map((cargo) => ({
    id: cargo.id,
    conceptoPagoId: cargo.concepto_pago_id,
    periodo: cargo.periodo,
    descripcion: cargo.descripcion,
    montoOriginal: Number(cargo.monto_original),
    becaPorcentaje: Number(cargo.beca_porcentaje),
    monto: Number(cargo.monto),
    pagado: Number(cargo.pagado),
    saldo: Number(cargo.saldo),
    estatus: cargo.estatus as EstatusCargo,
    fechaVencimiento: cargo.fecha_vencimiento,
    motivoCancelacion: cargo.motivo_cancelacion,
  }));
}

export interface PagoResumen {
  id: string;
  folio: number;
  montoTotal: number;
  fechaPago: string;
  metodo: MetodoPago;
  referencia: string | null;
  registradoPor: string;
  anulado: boolean;
  motivoAnulacion: string | null;
}

export async function obtenerPagosDeAlumno(alumnoId: string): Promise<PagoResumen[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("pagos")
    .select(
      "id, folio, monto_total, fecha_pago, metodo_pago, referencia, anulado_en, motivo_anulacion, registrado:perfiles!pagos_registrado_por_fkey(nombre_completo)"
    )
    .eq("alumno_id", alumnoId)
    .order("fecha_pago", { ascending: false });

  if (error) {
    throw new Error(`No se pudieron cargar los pagos: ${error.message}`);
  }

  return (data ?? []).map((pago) => ({
    id: pago.id,
    folio: Number(pago.folio),
    montoTotal: Number(pago.monto_total),
    fechaPago: pago.fecha_pago,
    metodo: pago.metodo_pago as MetodoPago,
    referencia: pago.referencia,
    registradoPor: primero(pago.registrado)?.nombre_completo ?? "—",
    anulado: pago.anulado_en !== null,
    motivoAnulacion: pago.motivo_anulacion,
  }));
}

export interface ContextoAlumno {
  alumnoId: string;
  nombre: string;
  matricula: string | null;
  activo: boolean;
  inscripcion: {
    id: string;
    planPagoId: string | null;
    becaPorcentaje: number;
    grupo: string;
  } | null;
}

export async function obtenerContextoAlumno(
  alumnoId: string,
  cicloId: string
): Promise<ContextoAlumno | null> {
  const supabase = await createClient();

  const { data: alumno, error: errorAlumno } = await supabase
    .from("alumnos")
    .select("id, nombres, apellido_paterno, apellido_materno, matricula, activo")
    .eq("id", alumnoId)
    .maybeSingle();

  if (errorAlumno) {
    throw new Error(`No se pudo cargar el alumno: ${errorAlumno.message}`);
  }
  if (!alumno) {
    return null;
  }

  const { data: inscripcion, error: errorInscripcion } = await supabase
    .from("inscripciones")
    .select("id, plan_pago_id, beca_porcentaje, grupos(nombre, grados(nombre))")
    .eq("alumno_id", alumnoId)
    .eq("ciclo_escolar_id", cicloId)
    .limit(1)
    .maybeSingle();

  if (errorInscripcion) {
    throw new Error(`No se pudo cargar la inscripción: ${errorInscripcion.message}`);
  }

  const grupo = primero(inscripcion?.grupos);
  const grado = primero(grupo?.grados);

  return {
    alumnoId: alumno.id,
    nombre: nombreCompletoAlumno(alumno),
    matricula: alumno.matricula,
    activo: alumno.activo,
    inscripcion: inscripcion
      ? {
          id: inscripcion.id,
          planPagoId: inscripcion.plan_pago_id,
          becaPorcentaje: Number(inscripcion.beca_porcentaje),
          grupo: grupo ? `${grado?.nombre ?? ""} · Grupo ${grupo.nombre}`.trim() : "—",
        }
      : null,
  };
}

export interface LineaRecibo {
  descripcion: string;
  montoOriginal: number;
  becaPorcentaje: number;
  monto: number;
  aplicado: number;
}

export interface PagoRecibo {
  id: string;
  folio: number;
  fechaPago: string;
  metodo: MetodoPago;
  referencia: string | null;
  montoTotal: number;
  registradoPor: string;
  anulado: boolean;
  motivoAnulacion: string | null;
  alumnoId: string;
  alumnoNombre: string;
  matricula: string | null;
  grupo: string | null;
  lineas: LineaRecibo[];
}

export async function obtenerPagoParaRecibo(pagoId: string): Promise<PagoRecibo | null> {
  const supabase = await createClient();

  const { data: pago, error } = await supabase
    .from("pagos")
    .select(
      "id, folio, fecha_pago, metodo_pago, referencia, monto_total, anulado_en, motivo_anulacion, alumno_id, alumnos(nombres, apellido_paterno, apellido_materno, matricula), registrado:perfiles!pagos_registrado_por_fkey(nombre_completo), pago_aplicaciones(monto_aplicado, cargos(descripcion, monto_original, beca_porcentaje, monto, ciclo_escolar_id, fecha_vencimiento))"
    )
    .eq("id", pagoId)
    .maybeSingle();

  if (error) {
    throw new Error(`No se pudo cargar el pago: ${error.message}`);
  }
  if (!pago) {
    return null;
  }

  const alumno = primero(pago.alumnos);
  const aplicaciones = (pago.pago_aplicaciones ?? [])
    .map((aplicacion) => ({ aplicado: Number(aplicacion.monto_aplicado), cargo: primero(aplicacion.cargos) }))
    .filter((a): a is typeof a & { cargo: NonNullable<typeof a.cargo> } => a.cargo !== null)
    .sort((a, b) => (a.cargo.fecha_vencimiento ?? "").localeCompare(b.cargo.fecha_vencimiento ?? ""));

  let grupo: string | null = null;
  const cicloId = aplicaciones[0]?.cargo.ciclo_escolar_id;
  if (cicloId) {
    const { data: inscripcion } = await supabase
      .from("inscripciones")
      .select("grupos(nombre, grados(nombre))")
      .eq("alumno_id", pago.alumno_id)
      .eq("ciclo_escolar_id", cicloId)
      .limit(1)
      .maybeSingle();
    const g = primero(inscripcion?.grupos);
    grupo = g ? `${primero(g.grados)?.nombre ?? ""} · Grupo ${g.nombre}`.trim() : null;
  }

  return {
    id: pago.id,
    folio: Number(pago.folio),
    fechaPago: pago.fecha_pago,
    metodo: pago.metodo_pago as MetodoPago,
    referencia: pago.referencia,
    montoTotal: Number(pago.monto_total),
    registradoPor: primero(pago.registrado)?.nombre_completo ?? "—",
    anulado: pago.anulado_en !== null,
    motivoAnulacion: pago.motivo_anulacion,
    alumnoId: pago.alumno_id,
    alumnoNombre: alumno ? nombreCompletoAlumno(alumno) : "—",
    matricula: alumno?.matricula ?? null,
    grupo,
    lineas: aplicaciones.map(({ aplicado, cargo }) => ({
      descripcion: cargo.descripcion,
      montoOriginal: Number(cargo.monto_original),
      becaPorcentaje: Number(cargo.beca_porcentaje),
      monto: Number(cargo.monto),
      aplicado,
    })),
  };
}

export interface Estructura {
  niveles: { id: string; nombre: string }[];
  grados: { id: string; nombre: string; nivelId: string }[];
  grupos: { id: string; etiqueta: string; gradoId: string; nivelId: string }[];
}

export async function obtenerEstructura(cicloId: string): Promise<Estructura> {
  const supabase = await createClient();

  const [nivelesRes, gradosRes, gruposRes] = await Promise.all([
    supabase.from("niveles").select("id, nombre").order("orden"),
    supabase.from("grados").select("id, nombre, nivel_id").order("orden"),
    supabase.from("grupos").select("id, nombre, grado_id").eq("ciclo_escolar_id", cicloId).order("nombre"),
  ]);

  for (const resultado of [nivelesRes, gradosRes, gruposRes]) {
    if (resultado.error) {
      throw new Error(`No se pudo cargar la estructura escolar: ${resultado.error.message}`);
    }
  }

  const niveles = nivelesRes.data ?? [];
  const ordenNivel = new Map(niveles.map((nivel, indice) => [nivel.id, indice]));
  const grados = (gradosRes.data ?? []).map((grado) => ({
    id: grado.id,
    nombre: grado.nombre,
    nivelId: grado.nivel_id,
  }));
  const gradoPorId = new Map(grados.map((grado, indice) => [grado.id, { ...grado, indice }]));

  const grupos = (gruposRes.data ?? [])
    .flatMap((grupo) => {
      const grado = gradoPorId.get(grupo.grado_id);
      return grado
        ? [{
            id: grupo.id,
            etiqueta: `${grado.nombre} · Grupo ${grupo.nombre}`,
            gradoId: grado.id,
            nivelId: grado.nivelId,
            orden: [ordenNivel.get(grado.nivelId) ?? 0, grado.indice] as const,
          }]
        : [];
    })
    .sort((a, b) => a.orden[0] - b.orden[0] || a.orden[1] - b.orden[1] || a.etiqueta.localeCompare(b.etiqueta, "es"))
    .map(({ orden: _orden, ...grupo }) => grupo);

  return { niveles, grados, grupos };
}

export interface AlumnoConAdeudo {
  alumnoId: string;
  nombre: string;
  activo: boolean;
  grupoId: string;
  grupo: string;
  gradoId: string;
  nivelId: string;
  adeudoTotal: number;
  adeudoVencido: number;
  vencimientoMasAntiguo: string | null;
}

export async function obtenerAlumnosConAdeudo(
  cicloId: string,
  estructura: Estructura
): Promise<AlumnoConAdeudo[]> {
  const supabase = await createClient();

  const [inscripcionesRes, adeudosRes] = await Promise.all([
    supabase
      .from("inscripciones")
      .select("grupo_id, alumnos(id, nombres, apellido_paterno, apellido_materno, activo)")
      .eq("ciclo_escolar_id", cicloId),
    supabase
      .from("v_adeudos_alumno")
      .select("alumno_id, adeudo_total, adeudo_vencido, vencimiento_mas_antiguo")
      .eq("ciclo_escolar_id", cicloId),
  ]);

  if (inscripcionesRes.error) {
    throw new Error(`No se pudieron cargar los alumnos: ${inscripcionesRes.error.message}`);
  }
  if (adeudosRes.error) {
    throw new Error(`No se pudieron cargar los adeudos: ${adeudosRes.error.message}`);
  }

  const grupoPorId = new Map(estructura.grupos.map((grupo) => [grupo.id, grupo]));
  const adeudoPorAlumno = new Map((adeudosRes.data ?? []).map((a) => [a.alumno_id, a]));

  return (inscripcionesRes.data ?? [])
    .flatMap((inscripcion) => {
      const alumno = primero(inscripcion.alumnos);
      const grupo = grupoPorId.get(inscripcion.grupo_id);
      if (!alumno || !grupo) {
        return [];
      }
      const adeudo = adeudoPorAlumno.get(alumno.id);
      return [{
        alumnoId: alumno.id,
        nombre: nombreCompletoAlumno(alumno),
        activo: alumno.activo,
        grupoId: grupo.id,
        grupo: grupo.etiqueta,
        gradoId: grupo.gradoId,
        nivelId: grupo.nivelId,
        adeudoTotal: Number(adeudo?.adeudo_total ?? 0),
        adeudoVencido: Number(adeudo?.adeudo_vencido ?? 0),
        vencimientoMasAntiguo: adeudo?.vencimiento_mas_antiguo ?? null,
      }];
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}
