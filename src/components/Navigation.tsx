'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  HomeIcon, 
  ClipboardDocumentListIcon, 
  PlusIcon,
  CubeIcon,
  AdjustmentsHorizontalIcon,
  PlusCircleIcon,
  ClockIcon,
  ChartBarIcon
} from '@heroicons/react/24/outline';

const navigation = [
  { name: 'Homepage', href: '/', icon: HomeIcon },
  { name: 'Order List', href: '/orders', icon: ClipboardDocumentListIcon },
  { name: 'Order Form', href: '/orders/new', icon: PlusIcon },
  { name: 'Inventory', href: '/inventory', icon: CubeIcon },
  { name: 'Stock Adjustment', href: '/inventory/adjustment', icon: AdjustmentsHorizontalIcon },
  { name: 'Add Production', href: '/inventory/production', icon: PlusCircleIcon },
  { name: 'Stock Movement', href: '/inventory/movement', icon: ClockIcon },
  { name: 'Reseller Sales', href: '/resellers', icon: ChartBarIcon },
];

export default function Navigation() {
  const pathname = usePathname();

  return (
    <nav className="bg-white shadow-sm border-b">
      <div className="container mx-auto px-4">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center">
            <h1 className="text-xl font-bold text-gray-900">Jentis Inventory</h1>
          </div>
          
          <div className="hidden md:flex space-x-8">
            {navigation.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  <item.icon className="h-4 w-4" />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden">
            <button
              type="button"
              className="text-gray-600 hover:text-gray-900 focus:outline-none focus:text-gray-900"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}

