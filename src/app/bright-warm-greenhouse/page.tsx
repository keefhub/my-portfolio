import type { Metadata } from "next";
import AdminPanel from "../components/admin/AdminPanel";
import { getPanelState } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Admin",
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false },
  },
};

export const dynamic = "force-dynamic";

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const state = await getPanelState();
  const params = await searchParams;
  const failed = state === "signed-out" && params.error !== undefined;
  return <AdminPanel state={state} failed={failed} />;
}
