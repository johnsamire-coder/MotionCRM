import { prisma } from '../../core/prisma.js';
import { z } from 'zod';

export const CreateContractSchema = z.object({
  accountId: z.string(),
  unitId: z.string(),
  salesRepId: z.string(),
  contractNumber: z.string().min(3),
  totalValue: z.number().positive(),
  downPayment: z.number().positive(),
  installmentCount: z.number().int().positive(),
  intervalMonths: z.number().int().positive().default(3), // Quarterly default
  commissionRate: z.number().min(0).max(100).default(2.5), // 2.5% default
});

export const RecordPaymentSchema = z.object({
  paymentNumber: z.string().min(3),
  contractId: z.string(),
  amount: z.number().positive(),
  paymentMethod: z.enum(['BANK_TRANSFER', 'CHEQUE', 'CASH', 'CARD']),
  referenceNo: z.string().optional(),
});

export async function createContractWithPaymentPlan(data: z.infer<typeof CreateContractSchema>) {
  return prisma.$transaction(async (tx) => {
    // 1. Validate Unit
    const unit = await tx.unit.findUnique({ where: { id: data.unitId } });
    if (!unit) throw new Error('Unit not found');
    if (unit.status !== 'RESERVED' && unit.status !== 'AVAILABLE') {
      throw new Error('Cannot contract unit with status: ' + unit.status);
    }

    // 2. Create Contract
    const contract = await tx.contract.create({
      data: {
        contractNumber: data.contractNumber,
        accountId: data.accountId,
        unitId: data.unitId,
        totalValue: data.totalValue,
        status: 'ACTIVE',
        signedAt: new Date(),
      },
    });

    // 3. Update Unit to CONTRACTED
    await tx.unit.update({
      where: { id: unit.id },
      data: { status: 'CONTRACTED' },
    });

    // 4. Generate Installment Schedule
    const remainingAmount = data.totalValue - data.downPayment;
    const installmentAmount = Math.round((remainingAmount / data.installmentCount) * 100) / 100;

    const paymentPlan = await tx.paymentPlan.create({
      data: {
        contractId: contract.id,
        totalAmount: data.totalValue,
        downPaymentAmount: data.downPayment,
        numberOfInstallments: data.installmentCount,
        status: 'ACTIVE',
      },
    });

    // Generate installments
    let currentDate = new Date();
    for (let i = 1; i <= data.installmentCount; i++) {
      currentDate.setMonth(currentDate.getMonth() + data.intervalMonths);
      await tx.installment.create({
        data: {
          paymentPlanId: paymentPlan.id,
          installmentNo: i,
          dueDate: new Date(currentDate),
          amount: installmentAmount,
          paidAmount: 0,
          status: 'PENDING',
        },
      });
    }

    // 5. Calculate & Record Commission
    const commissionAmount = (data.totalValue * data.commissionRate) / 100;
    await tx.commissionRecord.create({
      data: {
        contractId: contract.id,
        salesRepId: data.salesRepId,
        baseAmount: data.totalValue,
        ratePercentage: data.commissionRate,
        commissionAmount,
        status: 'CALCULATED',
      },
    });

    return tx.contract.findUnique({
      where: { id: contract.id },
      include: {
        paymentPlan: { include: { installments: true } },
        commissions: true,
        unit: true,
      },
    });
  });
}

export async function recordPaymentAndAllocate(data: z.infer<typeof RecordPaymentSchema>) {
  return prisma.$transaction(async (tx) => {
    const contract = await tx.contract.findUnique({
      where: { id: data.contractId },
      include: {
        paymentPlan: {
          include: {
            installments: {
              where: { status: { in: ['PENDING', 'PARTIALLY_PAID'] } },
              orderBy: { installmentNo: 'asc' },
            },
          },
        },
      },
    });

    if (!contract || !contract.paymentPlan) {
      throw new Error('Active contract or payment plan not found');
    }

    // 1. Create Payment Record
    const payment = await tx.payment.create({
      data: {
        paymentNumber: data.paymentNumber,
        amount: data.amount,
        paymentMethod: data.paymentMethod,
        referenceNo: data.referenceNo,
        status: 'CONFIRMED',
      },
    });

    // 2. Waterfall Allocation across pending installments
    let remainingToAllocate = data.amount;
    const allocations = [];

    for (const inst of contract.paymentPlan.installments) {
      if (remainingToAllocate <= 0) break;

      const unpaidForThisInst = inst.amount - inst.paidAmount;
      const allocateForThis = Math.min(remainingToAllocate, unpaidForThisInst);

      const allocation = await tx.paymentAllocation.create({
        data: {
          paymentId: payment.id,
          installmentId: inst.id,
          allocatedAmount: allocateForThis,
        },
      });
      allocations.push(allocation);

      const newPaidAmount = inst.paidAmount + allocateForThis;
      const newStatus = newPaidAmount >= inst.amount ? 'PAID' : 'PARTIALLY_PAID';

      await tx.installment.update({
        where: { id: inst.id },
        data: {
          paidAmount: newPaidAmount,
          status: newStatus,
        },
      });

      remainingToAllocate -= allocateForThis;
    }

    return { payment, allocations, remainingUnallocated: remainingToAllocate };
  });
}

export async function getContractDetails(contractId: string) {
  return prisma.contract.findUnique({
    where: { id: contractId },
    include: {
      account: true,
      unit: true,
      paymentPlan: {
        include: {
          installments: {
            include: { allocations: true },
            orderBy: { installmentNo: 'asc' },
          },
        },
      },
      commissions: { include: { salesRep: { select: { fullName: true, email: true } } } },
    },
  });
}
