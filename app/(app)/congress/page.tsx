import { redirect } from "next/navigation";

// Merged into the unified "Smart Money" hub.
export default function CongressRedirect() {
  redirect("/signals/government");
}
