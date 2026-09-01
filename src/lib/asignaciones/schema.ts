import { z } from "zod";

export const asignacionSchema = z.object({
  grupo_id: z.string().trim().min(1, "Selecciona un grupo"),
  docente_perfil_id: z.string().trim().min(1, "Selecciona un maestro"),
});

export type AsignacionInput = z.infer<typeof asignacionSchema>;
