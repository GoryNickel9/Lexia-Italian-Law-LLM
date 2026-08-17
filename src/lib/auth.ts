import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/schema";

// Email (separate da virgole) che al login diventano automaticamente admin.
export const adminEmails = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  trustHost: true,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        const email = typeof credentials?.email === "string" ? credentials.email.trim().toLowerCase() : "";
        const password = typeof credentials?.password === "string" ? credentials.password : "";
        if (!email || !password) return null;

        const user = await db.query.users.findFirst({ where: eq(users.email, email) });
        if (!user) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        // Promuove admin le email elencate in ADMIN_EMAILS
        if (adminEmails.includes(user.email) && user.role !== "admin") {
          await db.update(users).set({ role: "admin" }).where(eq(users.id, user.id));
          return { id: user.id, email: user.email, name: user.name, role: "admin" };
        }

        return { id: user.id, email: user.email, name: user.name, role: user.role };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user?.id) {
        token.id = user.id;
        const role = (user as { role?: "user" | "admin" }).role;
        token.role = role === "admin" ? "admin" : "user";
      }
      // Dopo un cambio email (o un update() dal client) risincronizza il token col database
      if (trigger === "update" && token.id) {
        const fresh = await db.query.users.findFirst({ where: eq(users.id, token.id as string) });
        if (fresh) {
          token.email = fresh.email;
          token.name = fresh.name;
          token.role = fresh.role;
        }
      }
      return token;
    },
    session({ session, token }) {
      if (token.id) session.user.id = token.id as string;
      session.user.role = token.role === "admin" ? "admin" : "user";
      return session;
    },
  },
});
