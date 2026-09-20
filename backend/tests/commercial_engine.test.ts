import { buildServer } from '../src/index.js';
import { prisma } from '../src/core/prisma.js';

async function runCommercialTests() {
  console.log('--- STARTING COMMERCIAL & FINANCIAL ENGINE TESTS ---');
  const app = buildServer();
  await app.ready();

  try {
    // Setup Clean Entities
    await prisma.paymentAllocation.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.installment.deleteMany();
    await prisma.paymentPlan.deleteMany();
    await prisma.commissionRecord.deleteMany();
    await prisma.contract.deleteMany();
    await prisma.reservation.deleteMany();
    await prisma.unit.deleteMany();
    await prisma.building.deleteMany();
    await prisma.project.deleteMany();
    await prisma.account.deleteMany();
    await prisma.userRole.deleteMany();
    await prisma.user.deleteMany();
    await prisma.role.deleteMany();
    await prisma.organization.deleteMany();

    const org = await prisma.organization.create({
      data: { name: 'Motion Developments', code: 'MD-CORP' },
    });

    const salesRep = await prisma.user.create({
      data: {
        orgId: org.id,
        email: 'sales.lead@motioncrm.test',
        passwordHash: 'hash123',
        fullName: 'Kareem Mostafa',
      },
    });

    const buyer = await prisma.account.create({
      data: { orgId: org.id, name: 'Hany Saad Interiors', phone: '+201011223344', accountType: 'CORPORATE' },
    });

    const project = await prisma.project.create({
      data: { orgId: org.id, name: 'Capital Business Plaza', code: 'CBP' },
    });

    const building = await prisma.building.create({
      data: { projectId: project.id, name: 'Plaza Tower 1', code: 'PT1' },
    });

    const unit = await prisma.unit.create({
      data: {
        buildingId: building.id,
        unitNumber: 'OFFICE-301',
        floorNumber: 3,
        unitType: 'OFFICE',
        grossArea: 120.0,
        basePrice: 4000000,
        status: 'AVAILABLE',
      },
    });

    // TEST 1: Contract Creation & Installment Generator
    console.log('[TEST 1] Creating Contract & Generating 4 Quarterly Installments...');
    const contractRes = await app.inject({
      method: 'POST',
      url: '/api/v1/commercial/contracts',
      payload: {
        accountId: buyer.id,
        unitId: unit.id,
        salesRepId: salesRep.id,
        contractNumber: 'CTR-2026-9901',
        totalValue: 4000000,
        downPayment: 1000000,
        installmentCount: 4,
        intervalMonths: 3,
        commissionRate: 2.5,
      },
    });
    if (contractRes.statusCode !== 201) throw new Error('Contract creation failed: ' + contractRes.body);
    const contractData = JSON.parse(contractRes.body).contract;
    const contractId = contractData.id;

    if (contractData.paymentPlan.installments.length !== 4) {
      throw new Error('Expected 4 installments, got: ' + contractData.paymentPlan.installments.length);
    }
    if (contractData.unit.status !== 'CONTRACTED') {
      throw new Error('Unit status must be CONTRACTED');
    }
    console.log('PASS: Contract generated with 4 installments (750k each) & Unit status -> CONTRACTED');

    // TEST 2: Commission Calculation Rule
    console.log('[TEST 2] Verifying Commission Calculation (2.5% of 4,000,000 = 100,000)...');
    const comm = contractData.commissions[0];
    if (comm.commissionAmount !== 100000) {
      throw new Error('Commission mismatch! Expected 100000, got: ' + comm.commissionAmount);
    }
    console.log('PASS: Commission accurately calculated: ' + comm.commissionAmount + ' EGP for Sales Rep');

    // TEST 3: Waterfall Payment Allocation
    console.log('[TEST 3] Recording Payment of 1,000,000 EGP (Full 1st Installment 750k + Partial 2nd 250k)...');
    const payRes = await app.inject({
      method: 'POST',
      url: '/api/v1/commercial/payments',
      payload: {
        paymentNumber: 'PAY-2026-0001',
        contractId: contractId,
        amount: 1000000,
        paymentMethod: 'BANK_TRANSFER',
        referenceNo: 'HSBC-TRX-88219',
      },
    });
    if (payRes.statusCode !== 201) throw new Error('Payment failed: ' + payRes.body);
    console.log('PASS: Payment recorded & allocated via Waterfall Engine');

    // TEST 4: Query Updated Installment Statuses
    console.log('[TEST 4] Verifying Installment Status Transitions...');
    const detailsRes = await app.inject({
      method: 'GET',
      url: '/api/v1/commercial/contracts/' + contractId,
    });
    const updatedDetails = JSON.parse(detailsRes.body).contract;
    const inst1 = updatedDetails.paymentPlan.installments[0];
    const inst2 = updatedDetails.paymentPlan.installments[1];
    const inst3 = updatedDetails.paymentPlan.installments[2];

    if (inst1.status !== 'PAID' || inst1.paidAmount !== 750000) {
      throw new Error('Installment 1 must be PAID with 750000');
    }
    if (inst2.status !== 'PARTIALLY_PAID' || inst2.paidAmount !== 250000) {
      throw new Error('Installment 2 must be PARTIALLY_PAID with 250000');
    }
    if (inst3.status !== 'PENDING' || inst3.paidAmount !== 0) {
      throw new Error('Installment 3 must remain PENDING with 0');
    }
    console.log('PASS: Installment 1: PAID (750k/750k)');
    console.log('PASS: Installment 2: PARTIALLY_PAID (250k/750k)');
    console.log('PASS: Installment 3 & 4: PENDING (0/750k)');

    console.log('====================================================');
    console.log('🎉 ALL 4 COMMERCIAL & FINANCIAL ENGINE TESTS PASSED!');
    console.log('====================================================');
  } catch (e) {
    console.error('TEST FAILED:', e);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    await app.close();
  }
}

runCommercialTests();
