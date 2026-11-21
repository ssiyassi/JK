-- Migration 0013 (additive only): the owner can deactivate a customer account from the admin.
-- NULL = active. A deactivated customer cannot sign in or reset the password and gets no monthly voucher;
-- their orders and vouchers are kept.
ALTER TABLE "shop_customers" ADD COLUMN "disabledAt" INTEGER;
