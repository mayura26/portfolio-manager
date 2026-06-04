import { redirect } from "next/navigation";

// Merged into the unified "Smart Money" hub.
export default function InsidersRedirect() {
  redirect("/signals/insiders");
}
