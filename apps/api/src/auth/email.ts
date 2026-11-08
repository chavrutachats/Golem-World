/** E-mail em forma canônica (sem espaços, minúsculo): é assim que fica guardado e é buscado. */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}
