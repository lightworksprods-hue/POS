const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const settings = await prisma.systemSetting.findMany();
  console.log('Settings:', settings);
  const user = await prisma.user.findFirst({ where: { role: 'customer' }});
  console.log('Sample customer:', user);
  const tenant = await prisma.tenant.findFirst();
  console.log('Sample tenant:', tenant);
}
main().finally(() => prisma.$disconnect());
