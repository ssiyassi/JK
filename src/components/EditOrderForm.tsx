'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useIdempotencyKey } from '@/lib/client/useIdempotencyKey';
import type { StockProduct } from '@/lib/core/products';
import ResellerOrderFields from './ResellerOrderFields';

interface Order {
  id: string;
  orderId: string;
  customerName: string;
  reseller: string;
  parentReseller?: string;
  address: string;
  phoneNumber: string;
  quantities: Record<string, number>;
  isPaydayPromo: boolean;
  boxCounter: number;
  orderStatus: string;
  paymentStatus: string;
  deliveryStatus: string;
  deliveryDate?: string;
  date: string;
  fromWebsite?: boolean;
}


interface EditOrderFormProps {
  order: Order;
  products: StockProduct[];
}

export default function EditOrderForm({ order, products }: EditOrderFormProps) {
  const router = useRouter();
  const [formData, setFormData] = useState({
    reseller: order.reseller,
    parentReseller: order.parentReseller || '',
    recipientName: order.customerName,
    phone: order.phoneNumber,
    address: order.address,
    deliveryDate: order.deliveryDate ? new Date(order.deliveryDate).toISOString().split('T')[0] : '',
    promo: order.isPaydayPromo ? 'Payday Promo' : 'None',
    free: order.paymentStatus === 'FREE',
    quantities: Object.fromEntries(products.map((p) => [p.key, order.quantities[p.key] ?? 0])) as Record<string, number>,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submissionKey = useIdempotencyKey();
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);


  const handleInputChange = (field: string, value: string | number | boolean | Record<string, number>) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    if (message) setMessage(null);
  };

  // Check if all mandatory fields are filled
  const isFormValid = formData.reseller.trim() !== '' && 
                     formData.recipientName.trim() !== '' && 
                     formData.phone.trim() !== '' && 
                     formData.address.trim() !== '' && 
                     formData.deliveryDate.trim() !== '' && 
                     (formData.free || formData.promo.trim() !== '');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!isFormValid) {
      setMessage({ type: 'error', text: 'Please fill in all mandatory fields' });
      return;
    }

    setIsSubmitting(true);
    setMessage(null);

    try {
      const response = await fetch(`/api/orders/${order.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': submissionKey.current(),
        },
        body: JSON.stringify({
          customerName: formData.recipientName.trim(),
          reseller: formData.reseller.trim(),
          parentReseller: formData.parentReseller.trim() || null,
          address: formData.address.trim(),
          phoneNumber: formData.phone.trim(),
          isPaydayPromo: !formData.free && formData.promo === 'Payday Promo',
          ...(order.fromWebsite ? {} : { isFree: formData.free }),
          deliveryDate: formData.deliveryDate || null,
          quantities: formData.quantities,
        }),
      });

      const result = await response.json();

      if (response.ok) {
        submissionKey.reset();
        setMessage({ type: 'success', text: 'Order updated successfully! Inventory has been adjusted.' });
        
        // Redirect after 3 seconds
        setTimeout(() => {
          router.push('/orders');
        }, 3000);
        
      } else {
        setMessage({ type: 'error', text: result.error || 'Failed to update order. Please try again.' });
      }
      
    } catch (error) {
      console.error('Submission error:', error);
      setMessage({ type: 'error', text: 'An unexpected error occurred. Please try again.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <ResellerOrderFields
        resellerField={
          <input id="reseller" value={formData.reseller} readOnly disabled className="a-input bg-[#f6f5f2] text-[#a1a1aa]" />
        }
        values={formData}
        onChange={(field, value) => handleInputChange(field, value)}
        products={products}
        showFree={!order.fromWebsite}
        message={message && { ok: message.type === 'success', text: message.text }}
        submitLabel={isSubmitting ? 'Updating order…' : 'Update order'}
        canSubmit={isFormValid && !isSubmitting}
        resellerFilled={formData.reseller.trim() !== ''}
      />
    </form>
  );
}
