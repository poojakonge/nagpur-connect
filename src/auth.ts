/* ════════════════════════════════════════════════════════
   Auth.js (NextAuth v5) Configuration
   Google OAuth provider with JWT session
   Links guest reports to Google account on first sign-in
   ════════════════════════════════════════════════════════ */

import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { env } from "@/lib/env";
import { execute, query } from "@/lib/db";
import { generateULID } from "@/lib/ids";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: env.googleClientId,
      clientSecret: env.googleClientSecret,
    }),
  ],
  secret: env.nextAuthSecret,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    async signIn({ user, account }) {
      if (!account || account.provider !== "google") return true;

      try {
        const googleId = account.providerAccountId;
        const email = user.email || "";
        const name = user.name || "";
        const avatar = user.image || "";

        // Upsert citizen record
        const existing = await query<{ id: string; guest_id: string | null }>(
          `SELECT id, guest_id FROM citizens WHERE google_id = ? LIMIT 1`,
          [googleId]
        ).catch(() => []);

        if (existing.length === 0) {
          // New Google user — create citizen record
          await execute(
            `INSERT INTO citizens (id, google_id, email, name, avatar_url)
             VALUES (?, ?, ?, ?, ?)`,
            [generateULID(), googleId, email, name, avatar]
          ).catch((err: unknown) => {
            console.warn("[Auth] Failed to create citizen:", err);
          });
        } else {
          // Update existing
          await execute(
            `UPDATE citizens SET email = ?, name = ?, avatar_url = ?, updated_at = NOW()
             WHERE google_id = ?`,
            [email, name, avatar, googleId]
          ).catch(() => {});
        }
      } catch (err) {
        console.warn("[Auth] signIn callback error:", err);
      }

      return true;
    },

    async jwt({ token, account, user }) {
      if (account) {
        token.googleId = account.providerAccountId;
        token.provider = account.provider;
      }
      if (user) {
        token.name = user.name;
        token.email = user.email;
        token.picture = user.image;
      }
      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        (session.user as unknown as Record<string, unknown>).googleId = token.googleId;
        (session.user as unknown as Record<string, unknown>).provider = token.provider;
      }
      return session;
    },
  },
});
