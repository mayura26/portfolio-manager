import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { isAuthFullyConfigured } from "@/lib/auth-env";
import { timingSafeEqualUtf8 } from "@/lib/auth-timing";

function resolveSecret(): string {
  const fromEnv =
    process.env.AUTH_SECRET?.trim() || process.env.NEXTAUTH_SECRET?.trim();
  if (fromEnv) return fromEnv;
  if (process.env.NODE_ENV !== "production") {
    return "__development_placeholder_secret__";
  }
  return "__production_open_mode_secret_set_AUTH_SECRET_when_using_login__";
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: resolveSecret(),
  trustHost: process.env.AUTH_TRUST_HOST === "true",
  providers: [
    Credentials({
      credentials: {
        username: { label: "Username" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!isAuthFullyConfigured()) return null;

        const expectedUser = process.env.APP_AUTH_USERNAME?.trim() ?? "";
        const expectedPass = process.env.APP_AUTH_PASSWORD ?? "";
        const username = String(credentials?.username ?? "");
        const password = String(credentials?.password ?? "");

        if (
          !timingSafeEqualUtf8(username, expectedUser) ||
          !timingSafeEqualUtf8(password, expectedPass)
        ) {
          return null;
        }

        return { id: "ledger-user", name: "Ledger" };
      },
    }),
  ],
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  callbacks: {
    authorized({ request, auth }) {
      if (!isAuthFullyConfigured()) return true;

      const { pathname } = request.nextUrl;
      if (pathname.startsWith("/api/auth")) return true;
      if (pathname === "/login") return true;
      if (
        pathname === "/manifest.webmanifest" ||
        pathname === "/notification-icon.svg" ||
        pathname === "/notification-badge.svg" ||
        pathname === "/logo.png" ||
        pathname === "/web-app-manifest-192x192.png" ||
        pathname === "/web-app-manifest-512x512.png" ||
        pathname === "/apple-icon.png" ||
        /^\/icon\d+\.(svg|png)$/.test(pathname)
      ) {
        return true;
      }

      return !!auth?.user;
    },
    jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
});
