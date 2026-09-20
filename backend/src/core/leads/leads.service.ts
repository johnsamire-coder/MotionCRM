import { prisma } from '../prisma.js';
import { z } from 'zod';

export const CreateLeadSchema = z.object({
  fullName: z.string().min(2, 'Name is required'),
  phone: z.string().min(8, 'Valid phone number is required'),
  email: z.string().email().optional(),
  source: z.string().default('MANUAL'),
  budget: z.number().positive().optional(),
  notes: z.string().optional(),
  assignedToId: z.string().optional(),
});

export async function createLead(orgId: string, data: z.infer<typeof CreateLeadSchema>) {
  const existingLead = await prisma.lead.findFirst({
    where: { orgId, phone: data.phone },
  });
  if (existingLead) {
    throw new Error('Lead with phone ' + data.phone + ' already exists in this organization');
  }
  return prisma.lead.create({
    data: {
      orgId,
      fullName: data.fullName,
      phone: data.phone,
      email: data.email,
      source: data.source,
      budget: data.budget,
      notes: data.notes,
      assignedToId: data.assignedToId,
      status: 'NEW',
    },
    include: {
      assignedSales: { select: { id: true, fullName: true, email: true } },
    },
  });
}

export async function getLeads(orgId: string, filters?: { status?: string; search?: string }) {
  const where: any = { orgId };
  if (filters?.status) where.status = filters.status;
  if (filters?.search) {
    where.OR = [
      { fullName: { contains: filters.search } },
      { phone: { contains: filters.search } },
    ];
  }
  return prisma.lead.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: { assignedSales: { select: { id: true, fullName: true } } },
  });
}