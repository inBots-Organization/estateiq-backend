const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.trainee.findFirst().then(t => {
  console.log(JSON.stringify(t, null, 2));
  p.$disconnect();
}).catch(e => {
  console.error(e);
  p.$disconnect();
});
