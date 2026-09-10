import { redirect } from "next/navigation";

/**
 * The Home Page group has no landing screen of its own.
 *
 * It exists as a route so the sidebar entry above the group can be a
 * prefix — `/admin/home` lights the pill and titles the header for every
 * screen underneath it, which a parent pointing straight at one child
 * would not do for the others.
 *
 * The carousel is what it opens on: it is the first fold of the page
 * these screens edit, and the one the shop changes most.
 */
export default function AdminHomePage() {
  redirect("/admin/home/carousel");
}
