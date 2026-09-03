export function obtenerSiteUrl(): string {
  const siteUrl = process.env.SITE_URL;

  if (!siteUrl) {
    throw new Error("Falta la variable de entorno SITE_URL");
  }

  return siteUrl;
}
