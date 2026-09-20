import { prisma } from '../../../core/prisma.js';
import { z } from 'zod';

export const CreateProjectSchema = z.object({
  name: z.string().min(2),
  code: z.string().min(2).toUpperCase(),
  location: z.string().optional(),
  description: z.string().optional(),
});

export const CreateBuildingSchema = z.object({
  projectId: z.string(),
  name: z.string().min(1),
  code: z.string().min(1).toUpperCase(),
  totalFloors: z.number().int().positive().default(1),
});

export const CreateUnitSchema = z.object({
  buildingId: z.string(),
  unitNumber: z.string().min(1),
  floorNumber: z.number().int(),
  unitType: z.enum(['APARTMENT', 'VILLA', 'DUPLEX', 'PENTHOUSE', 'COMMERCIAL', 'OFFICE']),
  grossArea: z.number().positive(),
  netArea: z.number().positive().optional(),
  basePrice: z.number().positive(),
});

export const ReserveUnitSchema = z.object({
  accountId: z.string(),
  depositAmount: z.number().positive(),
  reservationNumber: z.string().min(3),
  expiresInDays: z.number().int().positive().default(7),
});

export async function createProject(orgId: string, data: z.infer<typeof CreateProjectSchema>) {
  return prisma.project.create({
    data: { orgId, name: data.name, code: data.code, location: data.location, description: data.description },
  });
}

export async function createBuilding(data: z.infer<typeof CreateBuildingSchema>) {
  return prisma.building.create({
    data: { projectId: data.projectId, name: data.name, code: data.code, totalFloors: data.totalFloors },
  });
}

export async function createUnit(data: z.infer<typeof CreateUnitSchema>) {
  return prisma.unit.create({
    data: {
      buildingId: data.buildingId,
      unitNumber: data.unitNumber,
      floorNumber: data.floorNumber,
      unitType: data.unitType,
      grossArea: data.grossArea,
      netArea: data.netArea,
      basePrice: data.basePrice,
      status: 'AVAILABLE',
      version: 1,
    },
  });
}

export async function reserveUnit(unitId: string, data: z.infer<typeof ReserveUnitSchema>) {
  return prisma.$transaction(async (tx) => {
    const unit = await tx.unit.findUnique({ where: { id: unitId } });
    if (!unit) throw new Error('Unit not found');

    if (unit.status !== 'AVAILABLE') {
      throw new Error('Anti-Double-Booking: Unit is not AVAILABLE for reservation. Current status: ' + unit.status);
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + data.expiresInDays);

    const reservation = await tx.reservation.create({
      data: {
        reservationNumber: data.reservationNumber,
        unitId: unit.id,
        accountId: data.accountId,
        depositAmount: data.depositAmount,
        expiresAt,
        status: 'ACTIVE',
      },
    });

    const updatedUnit = await tx.unit.update({
      where: { id: unit.id },
      data: {
        status: 'RESERVED',
        version: { increment: 1 },
      },
    });

    return { reservation, unit: updatedUnit };
  });
}

export async function getInventory(params?: { projectId?: string; status?: string }) {
  const where: any = {};
  if (params?.status) where.status = params.status;
  if (params?.projectId) where.building = { projectId: params.projectId };

  return prisma.unit.findMany({
    where,
    include: {
      building: {
        include: { project: true },
      },
      reservations: {
        where: { status: 'ACTIVE' },
        include: { account: true },
      },
    },
    orderBy: [{ building: { code: 'asc' } }, { unitNumber: 'asc' }],
  });
}
