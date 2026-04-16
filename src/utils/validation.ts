const MD5_REGEX = /^[a-f0-9]{32}$/i;

export function isValidMd5(value: string): boolean {
  return MD5_REGEX.test(value);
}

export function normalizeMd5(value: string): string {
  return value.toLowerCase();
}

export function isMembershipError(error: string): boolean {
  const lower = error.toLowerCase();
  return (
    lower.includes("not a member") ||
    lower.includes("invalid") ||
    lower.includes("expired")
  );
}

export function isQuotaExhaustedError(
  error: string | undefined,
  httpStatus?: number,
): boolean {
  if (httpStatus === 429) return true;
  if (!error) return false;
  const lower = error.toLowerCase();
  return lower.includes("no downloads left") || lower.includes("download limit");
}
