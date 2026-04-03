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
