import type { Rol } from "../roles";

export const ROLES_PAGOS: Rol[] = ["super_admin", "direccion", "caja"];

export const METODOS_PAGO = ["efectivo", "transferencia", "tarjeta"] as const;
export type MetodoPago = (typeof METODOS_PAGO)[number];

export const ETIQUETAS_METODO: Record<MetodoPago, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  tarjeta: "Tarjeta",
};

// Fuente única de los estatus que calcula la vista v_cargos_saldo.
export const ESTATUS_CARGO = ["pendiente", "parcial", "pagado", "vencido", "cancelado"] as const;
export type EstatusCargo = (typeof ESTATUS_CARGO)[number];

export const ETIQUETAS_ESTATUS: Record<EstatusCargo, string> = {
  pendiente: "Pendiente",
  parcial: "Parcial",
  pagado: "Pagado",
  vencido: "Vencido",
  cancelado: "Cancelado",
};

export const CLASES_ESTATUS: Record<EstatusCargo, string> = {
  pendiente: "bg-zinc-100 text-zinc-700",
  parcial: "bg-yellow-100 text-yellow-800",
  pagado: "bg-green-100 text-green-800",
  vencido: "bg-red-100 text-red-800",
  cancelado: "bg-zinc-100 text-zinc-400 line-through",
};
