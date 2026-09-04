import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CompletarSesionDesdeFragmento } from "@/components/auth/CompletarSesionDesdeFragmento";

export const dynamic = "force-dynamic";

export default async function AuthCallbackPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; next?: string }>;
}) {
  const { code, next: nextParam } = await searchParams;
  const next =
    nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      redirect(next);
    }

    redirect("/login?error=enlace_invalido");
  }

  return <CompletarSesionDesdeFragmento next={next} />;
}
