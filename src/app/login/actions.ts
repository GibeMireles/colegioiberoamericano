"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { obtenerSiteUrl } from "@/lib/site-url";

export async function enviarEnlaceAcceso(formData: FormData) {
  const correo = formData.get("correo");
  const next = formData.get("next");

  if (typeof correo !== "string" || correo.trim().length === 0) {
    redirect("/login?error=correo_invalido");
  }

  const supabase = await createClient();

  const siteUrl = obtenerSiteUrl();
  const nextParam =
    typeof next === "string" && next.trim().length > 0
      ? `?next=${encodeURIComponent(next)}`
      : "";

  const { error } = await supabase.auth.signInWithOtp({
    email: correo.trim(),
    options: {
      shouldCreateUser: false,
      emailRedirectTo: `${siteUrl}/auth/callback${nextParam}`,
    },
  });

  if (error) {
    redirect("/login?error=envio_fallido");
  }

  redirect("/login?enviado=1");
}

export async function iniciarSesionConContrasena(formData: FormData) {
  const correo = formData.get("correo");
  const contrasena = formData.get("contrasena");
  const next = formData.get("next");

  if (
    typeof correo !== "string" ||
    correo.trim().length === 0 ||
    typeof contrasena !== "string" ||
    contrasena.length === 0
  ) {
    redirect("/login?error=credenciales_invalidas");
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email: correo.trim(),
    password: contrasena,
  });

  if (error) {
    redirect("/login?error=credenciales_invalidas");
  }

  const destino = typeof next === "string" && next.trim().length > 0 ? next : "/";
  redirect(destino);
}
