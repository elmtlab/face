import { redirect } from "next/navigation";

/**
 * /project — Redirects to /product-manager.
 *
 * The dual Product Manager / Project Manager toggle has been replaced
 * with separate pages at /product-manager and /project-manager.
 */
export default function ProjectPage() {
  redirect("/product-manager");
}
