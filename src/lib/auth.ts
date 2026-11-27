import "server-only";
import NextAuth, { type DefaultSession, type Session } from "next-auth";
import Google from "next-auth/providers/google";
import { accessFor, authLogLine, verifiedClaim, type PanelState } from "@/lib/admin/access";

declare module "next-auth" {
  interface Session {
    user: { emailVerified?: boolean } & DefaultSession["user"];
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/bright-warm-greenhouse/", error: "/bright-warm-greenhouse/" },
  callbacks: {
    jwt({ token, profile }) {
      if (profile) token.emailVerified = verifiedClaim(profile);
      return token;
    },
    session({ session, token }) {
      // The token type is an open record (emailVerified is unknown there), and the adapter user type behind
      // session.user declares an unrelated emailVerified, so write through the declared Session type.
      (session as Session).user.emailVerified = token.emailVerified === true;
      return session;
    },
  },
  logger: {
    error: (problem) => console.error(authLogLine(problem)),
    warn: () => {},
    debug: () => {},
  },
});

export async function getPanelState(): Promise<PanelState> {
  try {
    const session = await auth();
    if (!session?.user) return "signed-out";
    return accessFor(session.user.email, session.user.emailVerified, process.env.ADMIN_EMAIL);
  } catch {
    return "signed-out";
  }
}
