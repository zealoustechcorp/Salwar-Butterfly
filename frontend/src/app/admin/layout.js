import { AdminShell } from "@/components/admin/AdminShell";

export const metadata = {
  title: "Product Management — Salwar Butterfly Admin",
  description: "F-03 Product Management console for the Salwar Butterfly storefront.",
};

export default function AdminLayout({ children }) {
  return <AdminShell>{children}</AdminShell>;
}
