const { PrismaClient } = require("@prisma/client");

// Singleton, żeby uniknąć wyczerpania puli połączeń przy hot-reloadzie / wielu importach
const prisma = global.__prisma || new PrismaClient();
if (process.env.NODE_ENV !== "production") global.__prisma = prisma;

module.exports = prisma;
