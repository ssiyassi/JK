import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // Create initial inventory
  await prisma.currentInventory.upsert({
    where: { id: 'current' },
    update: {},
    create: {
      id: 'current',
      babiManis: 46,
      babiAsin: 24,
      sapiManis: 46,
      sapiAsin: 30,
    },
  })

  // Create resellers
  const resellers = [
    { reseller: 'Alang', parentReseller: null },
    { reseller: 'Jacky', parentReseller: null },
    { reseller: 'Mami', parentReseller: null },
    { reseller: 'Veronica', parentReseller: null },
    { reseller: 'Naomy', parentReseller: 'Anna' },
    { reseller: 'Vivi', parentReseller: 'Linda' },
    { reseller: 'Yuliana', parentReseller: 'Susi' },
  ]

  for (const reseller of resellers) {
    try {
      await prisma.reseller.create({
        data: reseller,
      })
    } catch (error) {
      // Skip if already exists
      console.log(`Reseller ${reseller.reseller} already exists, skipping...`)
    }
  }

  // Create sample orders
  const orders = [
    {
      orderId: '83078434',
      date: new Date('2025-09-18'),
      customerName: 'Ayong',
      reseller: 'Mami',
      parentReseller: null,
      address: 'TA Residence Tower A',
      phoneNumber: 'N/A',
      babiManis: 0,
      babiAsin: 0,
      sapiManis: 1,
      sapiAsin: 1,
      isPaydayPromo: false,
      boxCounter: 2,
      orderStatus: 'ACTIVE' as const,
      paymentStatus: 'PAID' as const,
      deliveryStatus: 'DELIVERED' as const,
      deliveryDate: new Date('2025-09-14'),
    },
    {
      orderId: '82137459',
      date: new Date('2025-09-18'),
      customerName: 'Alang',
      reseller: 'Alang',
      parentReseller: null,
      address: 'Cluster Alexandrite selatan no.95 gading serpong',
      phoneNumber: '08161914399',
      babiManis: 6,
      babiAsin: 1,
      sapiManis: 1,
      sapiAsin: 0,
      isPaydayPromo: false,
      boxCounter: 8,
      orderStatus: 'ACTIVE' as const,
      paymentStatus: 'PAID' as const,
      deliveryStatus: 'DELIVERED' as const,
      deliveryDate: new Date('2025-09-14'),
    },
  ]

  for (const order of orders) {
    await prisma.order.upsert({
      where: { orderId: order.orderId },
      update: {},
      create: order,
    })
  }

  // Stock movement history will be created automatically when orders are processed
  // No need to create sample stock movements

  console.log('Database seeded successfully!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
