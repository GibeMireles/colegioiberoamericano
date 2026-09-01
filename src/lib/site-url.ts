export function obtenerSiteUrl(): string {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;

  if (!siteUrl) {
    throw new Error("Falta la variable de entorno NEXT_PUBLIC_SITE_URL");
  }

  return siteUrl;
}
