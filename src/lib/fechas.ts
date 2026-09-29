// México eliminó el horario de verano en 2022: la hora de la escuela es
// siempre UTC-6. Se usa para "hoy" y para rangos de timestamptz por día,
// en vez de la fecha UTC del servidor.
export const ZONA_ESCUELA = "America/Mexico_City";
const OFFSET_ESCUELA = "-06:00";

export function fechaHoyMexico(ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA_ESCUELA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(ahora);
}

export function esFechaISO(valor: unknown): valor is string {
  if (typeof valor !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    return false;
  }
  const fecha = new Date(`${valor}T00:00:00Z`);
  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === valor;
}

export function sumarDias(fechaISO: string, dias: number): string {
  const fecha = new Date(`${fechaISO}T00:00:00Z`);
  fecha.setUTCDate(fecha.getUTCDate() + dias);
  return fecha.toISOString().slice(0, 10);
}

export function inicioDelDiaEscuela(fechaISO: string): string {
  return `${fechaISO}T00:00:00${OFFSET_ESCUELA}`;
}

export function formatearFechaHora(iso: string): string {
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: ZONA_ESCUELA,
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(iso));
}

export function formatearFecha(fechaISO: string): string {
  const [anio, mes, dia] = fechaISO.split("-");
  return `${dia}/${mes}/${anio}`;
}
