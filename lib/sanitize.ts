export function sanitizeText(value: unknown, maxLength = 200) {
  if (typeof value !== "string") {
    return "";
  }

  const normalized = value
    .replace(/<[^>]*>/g, "")
    .replace(/javascript:/gi, "")
    .replace(/on\w+\s*=\s*/gi, "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim();

  return normalized.slice(0, maxLength);
}
