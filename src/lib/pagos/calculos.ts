import { METODOS_PAGO, type MetodoPago } from "./catalogos";

// Suma en centavos enteros para evitar errores de punto flotante.
export function sumarMontos(montos: number[]): number {
  return montos.reduce((total, monto) => total + Math.round(monto * 100), 0) / 100;
}

export function formatearMoneda(monto: number): string {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(monto);
}

export function nombreCompletoAlumno(alumno: {
  nombres: string;
  apellido_paterno: string | null;
  apellido_materno: string | null;
}): string {
  const apellidos = [alumno.apellido_paterno, alumno.apellido_materno].filter(Boolean).join(" ");
  return apellidos ? `${apellidos}, ${alumno.nombres}` : alumno.nombres;
}

export function normalizarTexto(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export interface PagoCorte {
  montoTotal: number;
  metodo: MetodoPago;
  registradoPor: string;
  anulado: boolean;
}

export function resumirCorte(pagos: PagoCorte[]) {
  const vigentes = pagos.filter((pago) => !pago.anulado);
  const totalDe = (lista: PagoCorte[]) => sumarMontos(lista.map((pago) => pago.montoTotal));

  const porMetodo = Object.fromEntries(
    METODOS_PAGO.map((metodo) => [metodo, totalDe(vigentes.filter((p) => p.metodo === metodo))])
  ) as Record<MetodoPago, number>;

  const usuarios = [...new Set(vigentes.map((pago) => pago.registradoPor))].sort((a, b) =>
    a.localeCompare(b, "es")
  );

  return {
    total: totalDe(vigentes),
    cantidad: vigentes.length,
    anulados: pagos.length - vigentes.length,
    porMetodo,
    porUsuario: usuarios.map((nombre) => ({
      nombre,
      total: totalDe(vigentes.filter((p) => p.registradoPor === nombre)),
    })),
  };
}
