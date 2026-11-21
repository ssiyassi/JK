import { getDB } from '@/lib/server';
import { VOUCHER_RULES } from '@/lib/shop/catalog';
import { fullAddress, listCustomerOrders } from '@/lib/shop/orders';
import { activeGateway, availableWallets, currentCustomer, currentOwner, newCityDelivery, placesKey } from '@/lib/shop/server';
import { isDeliveryCity } from '@/lib/shop/delivery-cities';
import { displayPhone } from '@/lib/shop/util';
import { listCustomerCampaignVouchers } from '@/lib/shop/campaigns';
import { listCustomerVouchers } from '@/lib/shop/vouchers';
import { deliverySchedule } from '@/lib/shop/days-off';
import CheckoutForm, { type AddressDefaults } from '../_components/CheckoutForm';

export const dynamic = 'force-dynamic';

export default async function CheckoutPage() {
  const db = getDB();
  // Admin mode ("Buat pesanan untuk pelanggan"): always the guest form, never the account the owner may be signed in to.
  const owner = await currentOwner();
  const customer = owner ? null : await currentCustomer();
  const onlineMethods = activeGateway(customer?.email)?.methodsText ?? null;
  const wallets = availableWallets(customer?.email);

  // The Google address search for the pin is offered only when its key is set.
  const addressSearch = Boolean(placesKey());
  const cityChoice = newCityDelivery();
  const now = Date.now();
  const { closedDays, full: deliveryFull } = await deliverySchedule(db, now);
  if (!customer) {
    return <CheckoutForm ownerMode={Boolean(owner)} signedIn={false} vouchers={[]} defaults={null} onlineMethods={onlineMethods} wallets={wallets} addressSearch={addressSearch} closedDays={closedDays} deliveryFull={deliveryFull} cityChoice={cityChoice} />;
  }

  const [vouchers, blastVouchers, orders] = await Promise.all([
    listCustomerVouchers(db, customer.id, now),
    listCustomerCampaignVouchers(db, customer, now),
    listCustomerOrders(db, customer.id),
  ]);
  // Pre-fill the address from the customer's most recent order.
  const last = orders[0];
  // A city from the dropdown stays in its own field; anything else stays merged into the address.
  const lastCity = cityChoice && last && isDeliveryCity(last.city) ? last.city : '';
  const defaults: AddressDefaults = last
    ? {
        recipientName: last.recipientName,
        recipientPhone: displayPhone(last.recipientPhone),
        // One address field at checkout: older orders' kelurahan / kecamatan / kota are merged into it.
        street: fullAddress(lastCity ? { ...last, city: '' } : last),
        city: lastCity,
        notes: last.notes ?? '',
        latitude: last.latitude,
        longitude: last.longitude,
      }
    : {
        recipientName: customer.name,
        recipientPhone: displayPhone(customer.phone),
        street: '',
        notes: '',
        latitude: null,
        longitude: null,
      };

  return (
    <CheckoutForm
      signedIn
      closedDays={closedDays}
      deliveryFull={deliveryFull}
      cityChoice={cityChoice}
      onlineMethods={onlineMethods}
      wallets={wallets}
      addressSearch={addressSearch}
      defaults={defaults}
      vouchers={[
        ...blastVouchers
          .filter((v) => v.status === 'AVAILABLE')
          .map((v) => ({ code: v.code, label: v.label, percent: v.percent, fixedAmount: v.fixedAmount, capAmount: v.capAmount, minOrder: v.minOrder, expiresAt: v.expiresAt })),
        ...vouchers
          .filter((v) => v.status === 'AVAILABLE')
          .map((v) => ({ code: v.code, label: VOUCHER_RULES[v.kind].label, percent: v.percent, fixedAmount: null, capAmount: v.capAmount, minOrder: 0, expiresAt: v.expiresAt })),
      ]}
    />
  );
}
