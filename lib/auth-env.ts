/** Single-account gate: all must be set to require sign-in across the app. */
export function isAuthFullyConfigured(): boolean {
  const secretOk = Boolean(
    process.env.AUTH_SECRET?.trim() || process.env.NEXTAUTH_SECRET?.trim(),
  );
  const userOk = Boolean(process.env.APP_AUTH_USERNAME?.trim());
  const passOk = Boolean(
    process.env.APP_AUTH_PASSWORD && process.env.APP_AUTH_PASSWORD.length > 0,
  );
  return secretOk && userOk && passOk;
}
