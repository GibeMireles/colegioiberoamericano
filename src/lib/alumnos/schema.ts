import { z } from "zod";

const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value && value.length > 0 ? value : null));

export const alumnoSchema = z.object({
  nombres: z.string().trim().min(1, "El nombre es requerido"),
  apellido_paterno: z.string().trim().min(1, "El apellido paterno es requerido"),
  apellido_materno: optionalText,
  fecha_nacimiento: optionalText,
  matricula: optionalText,
  tutor_nombre: optionalText,
  tutor_telefono: optionalText,
  tutor_email: optionalText.refine(
    (value) => value === null || z.string().email().safeParse(value).success,
    { message: "El correo del tutor no es válido" }
  ),
});

export type AlumnoInput = z.infer<typeof alumnoSchema>;
