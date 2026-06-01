-- AlterEnum: add cash event + forex conversion types
ALTER TYPE "CashTransactionType" ADD VALUE 'INTEREST';
ALTER TYPE "CashTransactionType" ADD VALUE 'FEE';
ALTER TYPE "CashTransactionType" ADD VALUE 'WITHHOLDING';
ALTER TYPE "CashTransactionType" ADD VALUE 'FX_IN';
ALTER TYPE "CashTransactionType" ADD VALUE 'FX_OUT';
