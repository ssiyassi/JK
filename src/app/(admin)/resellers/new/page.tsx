'use client';

import AddResellerForm from '@/components/AddResellerForm';
import AdminHeader from '@/components/AdminHeader';

export default function NewResellerPage() {
  return (
    <div className="">
      <AdminHeader backHref="/my-resellers" title="Add reseller" />

      {/* Main Content */}
      <div className="">
        {/* Reseller Form */}
        <AddResellerForm 
          isOpen={true}
          onClose={() => window.history.back()}
          onSuccess={() => window.location.href = '/orders'}
        />
      </div>
    </div>
  );
}
