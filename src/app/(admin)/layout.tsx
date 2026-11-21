import AdminSidebar from '@/components/AdminSidebar';
import BusyOverlay from '@/components/admin/BusyOverlay';

// Every admin page gets the menu (sidebar + top bar on desktop, bottom tab bar on a phone).
// The online shop (src/app/shop) has its own layout and never shows it.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="a-app">
      <AdminSidebar />
      <BusyOverlay />
      <main className="px-4 pb-28 pt-1 lg:ml-[248px] lg:px-7 lg:pb-10 lg:pt-6">{children}</main>
    </div>
  );
}
