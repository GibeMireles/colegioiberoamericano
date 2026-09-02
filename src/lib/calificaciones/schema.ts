import { z } from "zod";

const campoNumericoOpcional = z.preprocess((valor) => {
  if (valor === "" || valor === null || valor === undefined) {
    return undefined;
  }
  return Number(valor);
}, z.number().min(0, "No puede ser negativo").optional());

export const calificacionSchema = z.object({
  parcial1_adas: campoNumericoOpcional,
  parcial1_examen: campoNumericoOpcional,
  parcial2_adas: campoNumericoOpcional,
  parcial2_examen: campoNumericoOpcional,
  producto_proyecto: campoNumericoOpcional,
  producto_examen: campoNumericoOpcional,
});

export type CalificacionInput = z.infer<typeof calificacionSchema>;

export const ponderacionSchema = z.object({
  parcial1_max: z.coerce.number().positive("Debe ser mayor a 0"),
  parcial2_max: z.coerce.number().positive("Debe ser mayor a 0"),
  producto_max: z.coerce.number().positive("Debe ser mayor a 0"),
});

export type PonderacionInput = z.infer<typeof ponderacionSchema>;
