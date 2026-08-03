import type { Metadata } from "next";
import { AdminDashboard } from "../../../../library-registration/admin/AdminDashboard";
import "../../../../library-registration/admin/admin.css";

export const metadata: Metadata = {
  title: "管理者画面 | 未来戦略ライブラリ",
  description: "未来戦略ライブラリの認証付き管理者画面です。",
  robots: { index: false, follow: false }
};

export default function LibraryRegistrationAdminPage() {
  return <AdminDashboard />;
}
