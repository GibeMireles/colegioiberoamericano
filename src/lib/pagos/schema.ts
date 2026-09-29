import { z } from "zod";
import { esFechaISO } from "../fechas";
import { METODOS_PAGO } from "./catalogos";

const PATRON_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function esUuid(valor: unknown): valor is string {
  return typeof valor === "string" && PATRON_UUID.test(valor);
}

const idSchema = z.string().trim().regex(PATRON_UUID, "Identificador inválido");

const tieneMaximoDosDecimales = (n: number) => Math.abs(Math.round(n * 100) - n * 100) < 1e-6;

const montoPositivoSchema = z.coerce
  .number({ error: "Monto inválido" })
  .positive("El monto debe ser mayor a 0")
  .max(99_999_999.99, "Monto demasiado grande")
  .refine(tieneMaximoDosDecimales, "Máximo 2 decimales");

const montoNoNegativoSchema = z.coerce
  .number({ error: "Monto inválido" })
  .min(0, "El monto no puede ser negativo")
  .max(99_999_999.99, "Monto demasiado grande")
  .refine(tieneMaximoDosDecimales, "Máximo 2 decimales");

const textoOpcionalANull = z
  .string()
  .trim()
  .optional()
  .transform((valor) => (valor ? valor : null));

export const registrarPagoSchema = z.object({
  alumnoId: idSchema,
  metodo: z.enum(METODOS_PAGO, { error: "Elige un método de pago" }),
  referencia: z
    .string()
    .trim()
    .max(100, "Referencia demasiado larga")
    .optional()
    .transform((valor) => (valor ? valor : null)),
  aplicaciones: z
    .array(z.object({ cargoId: idSchema, monto: montoPositivoSchema }))
    .min(1, "Selecciona al menos un cargo")
    .refine(
      (aplicaciones) => new Set(aplicaciones.map((a) => a.cargoId)).size === aplicaciones.length,
      "Un cargo aparece dos veces"
    ),
});

export const agregarCargoSchema = z.object({
  conceptoId: idSchema,
  descripcion: z.string().trim().min(1, "La descripción es requerida").max(120),
  monto: montoPositivoSchema,
  fechaVencimiento: textoOpcionalANull.refine(
    (valor) => valor === null || esFechaISO(valor),
    "Fecha inválida"
  ),
});

export const planBecaSchema = z.object({
  planPagoId: textoOpcionalANull.refine((valor) => valor === null || esUuid(valor), "Plan inválido"),
  becaPorcentaje: z.coerce
    .number({ error: "Beca inválida" })
    .min(0, "La beca va de 0 a 100")
    .max(100, "La beca va de 0 a 100")
    .refine(tieneMaximoDosDecimales, "Máximo 2 decimales"),
});

export const motivoSchema = z.object({
  motivo: z.string().trim().min(3, "Escribe el motivo (mínimo 3 caracteres)").max(300),
});

export const precioSchema = z.object({
  planPagoId: idSchema,
  nivelId: idSchema,
  montoMensual: montoNoNegativoSchema,
});

export const planPagoSchema = z.object({
  primerMes: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Mes inválido"),
  diaVencimiento: z.coerce.number().int().min(1).max(28),
});

export const conceptoSchema = z.object({
  nombre: z.string().trim().min(1, "El nombre es requerido").max(60),
  montoDefault: textoOpcionalANull
    .transform((valor) => (valor === null ? null : Number(valor)))
    .refine(
      (valor) =>
        valor === null || (Number.isFinite(valor) && valor >= 0 && tieneMaximoDosDecimales(valor)),
      "Monto inválido"
    ),
  aplicaBeca: z.boolean(),
});
