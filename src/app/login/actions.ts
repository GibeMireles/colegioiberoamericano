"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function enviarEnlaceAcceso(formData: FormData) {
  const correo = formData.get("correo");

  if (typeof correo !== "string" || correo.trim().length === 0) {
    redirect("/login?error=correo_invalido");
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithOtp({
    email: correo.trim(),
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
    },
  });

  if (error) {
    redirect("/login?error=envio_fallido");
  }

  redirect("/login?enviado=1");
}
