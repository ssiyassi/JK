import Link from 'next/link';
import { PageHeader, STOCK_TABS, Tabs } from '@/components/admin/ui';
import { RecipeForm } from '@/components/HppForms';
import { listIngredients, loadRecipes } from '@/lib/core/costs';
import { getDB } from '@/lib/server';
import HppLockScreen from '@/components/HppLockScreen';
import { maskedEmail } from '@/lib/core/hpp-lock';
import { hppUnlocked } from '@/lib/hpp-lock-server';

export const dynamic = 'force-dynamic';

// The secret recipes: stored only in the database (never in the code or the logs), visible only behind the admin login.
export default async function RecipesPage() {
  if (!(await hppUnlocked())) {
    return (
      <>
        <PageHeader title="Recipes" sub="Secret recipes share the lock with the cost per box." back={{ href: '/inventory/hpp', label: 'Cost & recipes' }} />
        <Tabs items={STOCK_TABS} active="/inventory/hpp" />
        <HppLockScreen email={maskedEmail()} />
      </>
    );
  }
  const db = getDB();
  const [ingredients, recipes] = await Promise.all([listIngredients(db), loadRecipes(db)]);
  const names = Object.keys(recipes).sort();
  const card = 'a-card p-4 lg:p-[18px]';
  return (
    <>
      <PageHeader title="Recipes" sub="Amounts per 1 kg of meat. Secret: only visible here, behind the admin login and the lock." back={{ href: '/inventory/hpp', label: 'Cost & recipes' }} />
      <Tabs items={STOCK_TABS} active="/inventory/hpp" />
      <div className="mb-4 flex gap-2">
        <Link href="/inventory/hpp" className="a-chip">Cost / box &amp; profit</Link>
        <span className="a-chip a-chip-on">Recipes</span>
      </div>
      <div className="grid gap-[18px] lg:grid-cols-2">
        {names.length === 0 && <div className={card}><p className="text-gray-600">No recipes yet.</p></div>}
        {names.map((r) => (
          <div key={r} className={card}>
            <RecipeForm recipe={r} ingredients={ingredients} amounts={recipes[r]} />
          </div>
        ))}
        <div className={card}>
          <RecipeForm recipe="" ingredients={ingredients} amounts={{}} isNew />
        </div>
      </div>
    </>
  );
}
