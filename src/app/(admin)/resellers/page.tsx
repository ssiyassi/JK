'use client';

import { useState, useEffect } from 'react';
import { Card, Icon, Kpi, PageHeader } from '@/components/admin/ui';
import { roundBoxes } from '@/lib/core/products';

interface SalesData {
  independentResellers: Array<{
    reseller: string;
    parentReseller: string | null;
    weeklySales: number;
    rewardSales: number;
  }>;
  parentResellers: Array<{
    parentReseller: string;
    weeklySales: number;
    rewardSales: number;
    children: Array<{
      reseller: string;
      parentReseller: string;
      weeklySales: number;
      rewardSales: number;
    }>;
  }>;
  weekRange: {
    start: string;
    end: string;
  };
  rewardPeriod: string;
}

export default function ResellerSalesPage() {
  const [salesData, setSalesData] = useState<SalesData>({
    independentResellers: [],
    parentResellers: [],
    weekRange: { start: '', end: '' },
    rewardPeriod: 'September & October'
  });
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [loading, setLoading] = useState(false);

  const fetchSalesData = async (date: string) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/reseller-sales?date=${date}`, {
        cache: 'no-store'
      });
      if (!response.ok) {
        throw new Error('Failed to fetch reseller sales');
      }
      const data = await response.json();
      setSalesData(data);
    } catch (error) {
      console.error('Error fetching reseller sales:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSalesData(selectedDate);
  }, [selectedDate]);

  const handleDateChange = (date: string) => {
    setSelectedDate(date);
  };
  const dmy = (iso: string) => (iso ? new Date(iso).toLocaleDateString('en-GB', { timeZone: 'Asia/Jakarta', day: '2-digit', month: '2-digit', year: 'numeric' }) : '…');
  const weekTotal = roundBoxes(salesData.independentResellers.reduce((n, r) => n + r.weeklySales, 0) + salesData.parentResellers.reduce((n, p) => n + p.weeklySales, 0));
  const rewardTotal = roundBoxes(salesData.independentResellers.reduce((n, r) => n + r.rewardSales, 0) + salesData.parentResellers.reduce((n, p) => n + p.rewardSales, 0));
  const count = salesData.independentResellers.length + salesData.parentResellers.reduce((n, p) => n + p.children.length, 0);
  const shiftWeek = (days: number) => {
    const d = new Date(`${selectedDate}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    handleDateChange(d.toISOString().slice(0, 10));
  };
  const row = (name: string, week: number, reward: number, sub?: string, child = false) => (
    <div key={name} className={`flex items-center gap-3 px-3.5 py-2.5 ${child ? 'pl-8 lg:pl-9' : ''}`}>
      <div className="min-w-0 flex-1">
        <div className={child ? 'text-sm text-[#52525b]' : 'font-semibold'}>{child ? `↳ ${name}` : name}</div>
        {sub && <div className="text-xs text-[#a1a1aa]">{sub}</div>}
      </div>
      <div className="w-16 text-right">
        <div className={`tabular-nums ${child ? '' : 'text-base font-bold'}`}>{roundBoxes(week)}</div>
        <div className="text-[10.5px] text-[#a1a1aa]">this week</div>
      </div>
      <div className="w-20 text-right">
        <div className="tabular-nums text-[#52525b]">{roundBoxes(reward)}</div>
        <div className="text-[10.5px] text-[#a1a1aa]">{salesData.rewardPeriod}</div>
      </div>
    </div>
  );

  return (
    <>
      <PageHeader
        title="Reseller sales"
        sub="Boxes delivered per reseller, Sunday 12:00 to Sunday 12:00 (WIB)."
        actions={
          <a href={`/api/reseller-sales/export?date=${selectedDate}`} download="reseller-sales.csv" className="a-btn">
            <Icon name="doc" className="size-4" />
            Export
          </a>
        }
      />
      <div className="mb-3.5 flex items-center gap-2">
        <button type="button" onClick={() => shiftWeek(-7)} disabled={loading} className="a-chip" aria-label="Previous week"><Icon name="left" className="size-4" /></button>
        <label className="a-chip a-chip-on relative flex-1 justify-center lg:flex-none">
          <Icon name="cal" className="size-4" />
          {dmy(salesData.weekRange.start)} – {dmy(salesData.weekRange.end)}
          <input type="date" value={selectedDate} onChange={(e) => handleDateChange(e.target.value)} disabled={loading} aria-label="Pick a day in the week" className="absolute inset-0 opacity-0" />
        </label>
        <button type="button" onClick={() => shiftWeek(7)} disabled={loading} className="a-chip" aria-label="Next week"><Icon name="right" className="size-4" /></button>
        {loading && <span className="text-sm text-[#a1a1aa]">Loading…</span>}
      </div>

      <div className="mb-[18px] grid grid-cols-2 gap-2.5 lg:grid-cols-3 lg:gap-3.5">
        <Kpi label="Boxes this week" value={weekTotal} />
        <Kpi label={`${salesData.rewardPeriod} boxes`} value={rewardTotal} />
        <div className="col-span-2 lg:col-span-1"><Kpi label="Resellers" value={count} note={`${salesData.parentResellers.length} teams · ${salesData.independentResellers.length} independent`} /></div>
      </div>

      <div className="grid gap-[18px] lg:grid-cols-2 lg:items-start">
        <Card title="Teams" right={<span className="text-xs font-normal text-[#a1a1aa]">parent + their resellers</span>}>
          {salesData.parentResellers.length === 0 && <p className="p-5 text-[#a1a1aa]">No teams this week.</p>}
          {salesData.parentResellers.length > 0 && <div className="flex flex-col gap-2 p-3">{salesData.parentResellers.map((p) => (
            <div key={p.parentReseller} className="rounded-xl border border-[#ebe8e3] bg-white">
              {row(p.parentReseller, p.weeklySales, p.rewardSales, `${p.children.length} reseller${p.children.length !== 1 ? 's' : ''} in the team`)}
              {p.children.map((c) => row(c.reseller, c.weeklySales, c.rewardSales, undefined, true))}
            </div>
          ))}</div>}
        </Card>
        <Card title="Independent resellers" right={<span className="text-xs font-normal text-[#a1a1aa]">{salesData.independentResellers.length} resellers</span>}>
          {salesData.independentResellers.length === 0 && <p className="p-5 text-[#a1a1aa]">None this week.</p>}
          {salesData.independentResellers.length > 0 && <div className="flex flex-col gap-2 p-3">{[...salesData.independentResellers].sort((a, b) => b.weeklySales - a.weeklySales).map((r) => <div key={r.reseller} className="rounded-xl border border-[#ebe8e3] bg-white">{row(r.reseller, r.weeklySales, r.rewardSales)}</div>)}</div>}
        </Card>
      </div>
    </>
  );
}
