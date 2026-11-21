-- Migration 0001: the existing Jentis Kitchen schema, reproduced exactly from prisma/dev.db
-- (tables, columns, defaults and unique indexes unchanged). No data changes.

CREATE TABLE "current_inventory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "babiManis" INTEGER NOT NULL,
    "babiAsin" INTEGER NOT NULL,
    "sapiManis" INTEGER NOT NULL,
    "sapiAsin" INTEGER NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "orders" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "customerName" TEXT NOT NULL,
    "reseller" TEXT NOT NULL,
    "parentReseller" TEXT,
    "address" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "babiManis" INTEGER NOT NULL,
    "babiAsin" INTEGER NOT NULL,
    "sapiManis" INTEGER NOT NULL,
    "sapiAsin" INTEGER NOT NULL,
    "isPaydayPromo" BOOLEAN NOT NULL DEFAULT false,
    "boxCounter" INTEGER NOT NULL,
    "orderStatus" TEXT NOT NULL DEFAULT 'ACTIVE',
    "paymentStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "deliveryStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "deliveryDate" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "resellers" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reseller" TEXT NOT NULL,
    "parentReseller" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "stock_movement_history" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL,
    "type" TEXT NOT NULL,
    "babiManisBeginning" INTEGER NOT NULL,
    "babiAsinBeginning" INTEGER NOT NULL,
    "sapiManisBeginning" INTEGER NOT NULL,
    "sapiAsinBeginning" INTEGER NOT NULL,
    "babiManisChanges" INTEGER NOT NULL,
    "babiAsinChanges" INTEGER NOT NULL,
    "sapiManisChanges" INTEGER NOT NULL,
    "sapiAsinChanges" INTEGER NOT NULL,
    "babiManisFinal" INTEGER NOT NULL,
    "babiAsinFinal" INTEGER NOT NULL,
    "sapiManisFinal" INTEGER NOT NULL,
    "sapiAsinFinal" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "orderId" TEXT
);

CREATE UNIQUE INDEX "orders_orderId_key" ON "orders"("orderId");

CREATE UNIQUE INDEX "resellers_reseller_parentReseller_key" ON "resellers"("reseller", "parentReseller");
