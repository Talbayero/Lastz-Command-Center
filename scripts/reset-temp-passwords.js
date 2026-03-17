require("dotenv").config();

const { PrismaClient } = require("@prisma/client");
const { randomBytes, scryptSync } = require("crypto");

const prisma = new PrismaClient();

async function main() {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync("123456789", salt, 64).toString("hex");
  const passwordHash = `${salt}:${hash}`;

  const result = await prisma.user.updateMany({
    data: {
      passwordHash,
      mustChangePassword: true,
    },
  });

  console.log(JSON.stringify(result));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
