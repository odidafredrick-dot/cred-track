export function normalizePhoneNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");

  if (!digits) {
    return "";
  }

  if (digits.startsWith("254") && digits.length === 12) {
    return `+${digits}`;
  }

  if (digits.startsWith("0") && digits.length === 10) {
    return `+254${digits.slice(1)}`;
  }

  if ((digits.startsWith("7") || digits.startsWith("1")) && digits.length === 9) {
    return `+254${digits}`;
  }

  return hasPlus ? `+${digits}` : digits;
}

export function getPhoneSearchVariants(value: string) {
  const normalized = normalizePhoneNumber(value);
  const variants = new Set<string>();
  const compact = value.trim().replace(/\s+/g, "");
  const digits = compact.replace(/\D/g, "");

  if (normalized) {
    variants.add(normalized);
    variants.add(normalized.replace(/^\+/, ""));
  }

  if (compact) {
    variants.add(compact);
  }

  if (digits) {
    variants.add(digits);

    if (digits.startsWith("254") && digits.length === 12) {
      variants.add(`0${digits.slice(3)}`);
      variants.add(digits.slice(3));
    }

    if (digits.startsWith("0") && digits.length === 10) {
      variants.add(`254${digits.slice(1)}`);
      variants.add(`+254${digits.slice(1)}`);
      variants.add(digits.slice(1));
    }
  }

  return Array.from(variants).filter(Boolean);
}
