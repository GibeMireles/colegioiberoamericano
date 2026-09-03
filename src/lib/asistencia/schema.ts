import { z } from "zod";

export const asistenciaSchema = z.object({
  estatus: z.enum(["presente", "ausente", "retardo", "justificado"]),
});

export type AsistenciaInput = z.infer<typeof asistenciaSchema>;
