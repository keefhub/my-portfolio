"use server";

import { redirect, unstable_rethrow } from "next/navigation";
import { signIn, signOut } from "@/lib/auth";

export async function signInAction(): Promise<void> {
  try {
    await signIn("google", { redirectTo: "/bright-warm-greenhouse/" });
  } catch (error) {
    unstable_rethrow(error);
    redirect("/bright-warm-greenhouse/?error=SignIn");
  }
}

export async function signOutAction(): Promise<void> {
  try {
    await signOut({ redirectTo: "/bright-warm-greenhouse/" });
  } catch (error) {
    unstable_rethrow(error);
    redirect("/bright-warm-greenhouse/");
  }
}
