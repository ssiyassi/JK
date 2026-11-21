import { PageHeader } from '@/components/admin/ui';

// Shown straight away when Reports is opened, while the report numbers are worked out on the server.
export default function ReportsLoading() {
  const block = 'animate-pulse rounded-[14px] bg-[#ebe8e3]';
  return (
    <div aria-busy="true">
      <PageHeader title="Reports" sub="How the ads and the website turned into money." />
      <div role="status" className="a-card mb-3 flex items-center gap-3 px-4 py-3.5">
        <span className="size-5 animate-spin rounded-full border-[2.5px] border-[#ebe8e3] border-t-[#9a3412]" />
        <div>
          <div className="font-semibold">Loading the report…</div>
          <div className="text-xs text-[#a1a1aa]">Counting ad spend, visits and orders. This can take a few seconds.</div>
        </div>
      </div>
      <div className="mb-3 grid grid-cols-2 gap-2.5 lg:grid-cols-4 lg:gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`${block} h-[74px]`} />
        ))}
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <div className={`${block} h-[220px]`} />
        <div className={`${block} h-[220px]`} />
      </div>
    </div>
  );
}
