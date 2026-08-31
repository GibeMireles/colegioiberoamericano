import { z } from "zod";

export const nombreEstructuraSchema = z.object({
  nombre: z.string().trim().min(1, "El nombre es requerido"),
});

export type NombreEstructuraInput = z.infer<typeof nombreEstructuraSchema>;
