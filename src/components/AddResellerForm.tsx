'use client';

import { useState } from 'react';
import { Card, Message } from './admin/ui';

interface AddResellerFormProps {
  isOpen: boolean;
  onClose?: () => void;
  onSuccess: () => void;
}

export default function AddResellerForm({ isOpen, onClose, onSuccess }: AddResellerFormProps) {
  const [formData, setFormData] = useState({
    resellerName: '',
    parentReseller: '',
    phone: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    // Clear message when user makes changes
    if (message) setMessage(null);
  };

  const isFormValid = formData.resellerName.trim() !== '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!isFormValid) {
      setMessage({ type: 'error', text: 'Reseller name is required' });
      return;
    }

    setIsSubmitting(true);
    setMessage(null);

    try {
      const response = await fetch('/api/resellers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          reseller: formData.resellerName.trim(),
          parentReseller: formData.parentReseller.trim() || null,
          phone: formData.phone.trim() || null,
        }),
      });

      const result = await response.json();

      if (response.ok) {
        setMessage({ type: 'success', text: `Reseller "${formData.resellerName}" added successfully!` });
        
        // Reset form
        setFormData({
          resellerName: '',
          parentReseller: '',
          phone: '',
        });

        // Redirect after 2 seconds
        setTimeout(() => {
          onSuccess();
        }, 2000);
        
      } else {
        setMessage({ type: 'error', text: result.error || 'Failed to add reseller. Please try again.' });
      }
      
    } catch (error) {
      console.error('Submission error:', error);
      setMessage({ type: 'error', text: 'An unexpected error occurred. Please try again.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // If used as modal and not open, don't render
  if (!isOpen) return null;

  return (
    <form onSubmit={handleSubmit} className="mx-auto flex max-w-xl flex-col gap-3 pb-24 lg:pb-0">
      <Card title="Reseller">
        <div className="flex flex-col gap-3 p-4 lg:p-[18px]">
          <div>
            <label htmlFor="resellerName" className="a-label">Reseller name *</label>
            <input id="resellerName" value={formData.resellerName} onChange={(e) => handleInputChange('resellerName', e.target.value)} placeholder="Name as it shows on orders" className="a-input" required />
          </div>
          <div>
            <label htmlFor="parentReseller" className="a-label">Parent reseller</label>
            <input id="parentReseller" value={formData.parentReseller} onChange={(e) => handleInputChange('parentReseller', e.target.value)} placeholder="Leave empty if independent" className="a-input" />
            <p className="a-hint">Only if this reseller sells under a team leader.</p>
          </div>
          <div>
            <label htmlFor="phone" className="a-label">WhatsApp number</label>
            <input id="phone" type="tel" inputMode="tel" value={formData.phone} onChange={(e) => handleInputChange('phone', e.target.value)} placeholder="e.g. 081234567890" className="a-input" />
          </div>
        </div>
      </Card>
      <Message message={message && { ok: message.type === 'success', text: message.text }} />
      <button type="submit" disabled={!isFormValid || isSubmitting} className="a-btn a-btn-lg a-btn-pri hidden disabled:opacity-40 lg:inline-flex">
        {isSubmitting ? 'Adding reseller…' : 'Add reseller'}
      </button>
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#ebe8e3] bg-white px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-3 lg:hidden">
        <button type="submit" disabled={!isFormValid || isSubmitting} className="a-btn a-btn-lg a-btn-pri w-full disabled:opacity-40">
          {isSubmitting ? 'Adding reseller…' : 'Add reseller'}
        </button>
      </div>
    </form>
  );
}