import { redirect } from "next/navigation";

/**
 * The home page has one hand-picked section (F-06), so there is no list to
 * show — this address opens that section's page. Kept so old links and
 * bookmarks to /admin/home/sections still land somewhere useful.
 */
export default function HomeSectionsPage() {
  redirect("/admin/home/sections/custom");
}
