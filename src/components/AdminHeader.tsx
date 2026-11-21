import { PageHeader } from './admin/ui';

// Shared admin page header (new admin look). Kept for pages that still call it; see admin/ui PageHeader.
export default function AdminHeader({
  title,
  backHref,
  actions,
  sub,
}: {
  title: string;
  backHref?: string;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  sub?: React.ReactNode;
}) {
  return <PageHeader title={title} sub={sub} actions={actions} back={backHref && backHref !== '/' ? { href: backHref, label: 'Back' } : undefined} />;
}
