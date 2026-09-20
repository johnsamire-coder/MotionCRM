import { prisma } from '../prisma.js';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

export const RegisterOrgSchema = z.object({
  orgName: z.string().min(2),
  orgCode: z.string().min(2).toUpperCase(),
  adminFullName: z.string().min(2),
  adminEmail: z.string().email(),
  adminPassword: z.string().min(6),
  phone: z.string().optional(),
});

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function registerOrganization(data: z.infer<typeof RegisterOrgSchema>) {
  const existingOrg = await prisma.organization.findUnique({
    where: { code: data.orgCode },
  });
  if (existingOrg) {
    throw new Error('Organization code already exists');
  }

  const existingUser = await prisma.user.findUnique({
    where: { email: data.adminEmail },
  });
  if (existingUser) {
    throw new Error('Email already registered');
  }

  const passwordHash = await bcrypt.hash(data.adminPassword, 10);

  const org = await prisma.organization.create({
    data: {
      name: data.orgName,
      code: data.orgCode,
      users: {
        create: {
          email: data.adminEmail,
          passwordHash,
          fullName: data.adminFullName,
          phone: data.phone,
        },
      },
      roles: {
        create: {
          name: 'ADMIN',
          description: 'Full System Administrator',
        },
      },
    },
    include: {
      users: true,
      roles: true,
    },
  });

  const adminUser = org.users[0];
  const adminRole = org.roles[0];

  await prisma.userRole.create({
    data: {
      userId: adminUser.id,
      roleId: adminRole.id,
    },
  });

  return {
    organization: { id: org.id, name: org.name, code: org.code },
    user: { id: adminUser.id, email: adminUser.email, fullName: adminUser.fullName },
  };
}

export async function loginUser(data: z.infer<typeof LoginSchema>) {
  const user = await prisma.user.findUnique({
    where: { email: data.email },
    include: { organization: true, userRoles: { include: { role: true } } },
  });

  if (!user || !user.isActive) {
    throw new Error('Invalid credentials or inactive account');
  }

  const isMatch = await bcrypt.compare(data.password, user.passwordHash);
  if (!isMatch) {
    throw new Error('Invalid credentials');
  }

  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    orgId: user.orgId,
    orgName: user.organization.name,
    roles: user.userRoles.map((ur) => ur.role.name),
  };
}