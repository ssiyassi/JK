import { PageHeader } from './admin/ui';

/** Page header for the admin pages that manage jentiskitchen.id. */
export default function WebsiteHeader({ title, sub, actions }: { title: string; sub?: React.ReactNode; actions?: React.ReactNode }) {
  return <PageHeader title={title} sub={sub} actions={actions} />;
}
