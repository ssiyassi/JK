-- What the owner paid the courier for an order (Rupiah), asked when an order is shipped / marked delivered.
-- NULL = not entered yet. Counted as a cost in the monthly profit (HPP & Profit page, profit email).
-- Named courierFee because shop_orders.deliveryFee is the fee the customer was charged.
ALTER TABLE "orders" ADD COLUMN "courierFee" INTEGER;
