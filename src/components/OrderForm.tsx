'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import ResellerAutocomplete from './ResellerAutocomplete';
import { useIdempotencyKey } from '@/lib/client/useIdempotencyKey';
import type { StockProduct } from '@/lib/core/products';
import ResellerOrderFields from './ResellerOrderFields';

interface OrderFormProps {
  searchParams?: { [key: string]: string | string[] | undefined };
  products: StockProduct[];
}

export default function OrderForm({ searchParams: _searchParams, products }: OrderFormProps) {
  const searchParamsHook = useSearchParams();
  
  // Initialize form data with URL parameters
  const getInitialFormData = () => {
    const params = {
      reseller: searchParamsHook.get('reseller') || '',
      parentReseller: searchParamsHook.get('parentReseller') || '',
      recipientName: searchParamsHook.get('recipientName') || '',
      phone: searchParamsHook.get('phone') || '',
      address: searchParamsHook.get('address') || '',
      deliveryDate: searchParamsHook.get('deliveryDate') || '',
      promo: searchParamsHook.get('promo') || '',
      free: searchParamsHook.get('free') === '1',
      // Duplicated orders pass each product's quantity as q_<product key>
      quantities: Object.fromEntries(products.map((p) => [p.key, parseInt(searchParamsHook.get(`q_${p.key}`) || '0') || 0])) as Record<string, number>,
    };
    
    return params;
  };

  const [formData, setFormData] = useState(getInitialFormData);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submissionKey = useIdempotencyKey();
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  // Handle URL parameters for duplication
  useEffect(() => {
    const params = getInitialFormData();
    
    // Only update if there are actual parameters
    if (params.reseller || params.recipientName || params.phone || params.address) {
      setFormData(params);
    }
  }, [searchParamsHook]);

  const handleResellerSelect = (reseller: string, parentReseller: string | null) => {
    setFormData(prev => ({
      ...prev,
      reseller,
      parentReseller: parentReseller || ''
    }));
    // Clear message when user makes changes
    if (message) setMessage(null);
  };

  const handleInputChange = (field: string, value: string | number | boolean | Record<string, number>) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    // Clear message when user makes changes
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
      const orderData = {
        reseller: formData.reseller,
        parentReseller: formData.parentReseller || null,
        recipientName: formData.recipientName,
        phone: formData.phone,
        address: formData.address,
        deliveryDate: formData.deliveryDate,
        promo: formData.free ? 'None' : formData.promo,
        isFree: formData.free,
        quantities: formData.quantities,
      };

      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': submissionKey.current(),
        },
        body: JSON.stringify(orderData),
      });

      const result = await response.json();

      if (response.ok) {
        submissionKey.reset();
        setMessage({ type: 'success', text: `Order created successfully! Order ID: ${result.orderId}` });
        
        // Reset form
        setFormData({
          reseller: '',
          parentReseller: '',
          recipientName: '',
          phone: '',
          address: '',
          deliveryDate: '',
          promo: '',
          free: false,
          quantities: Object.fromEntries(products.map((p) => [p.key, 0])),
        });

        // Redirect to order list page after 2 seconds
        setTimeout(() => {
          window.location.href = '/orders';
        }, 2000);
        
      } else {
        setMessage({ type: 'error', text: result.error || 'Failed to create order. Please try again.' });
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
          <ResellerAutocomplete
              value={formData.reseller}
              onChange={(value) => handleInputChange('reseller', value)}
              onResellerSelect={handleResellerSelect}
            />
        }
        values={formData}
        onChange={(field, value) => handleInputChange(field, value)}
        products={products}
        
        message={message && { ok: message.type === 'success', text: message.text }}
        submitLabel={isSubmitting ? 'Creating order…' : 'Create order'}
        canSubmit={isFormValid && !isSubmitting}
        resellerFilled={formData.reseller.trim() !== ''}
      />
    </form>
  );
}
