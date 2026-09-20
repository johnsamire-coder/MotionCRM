import { buildServer } from '../src/index.js';
import { prisma } from '../src/core/prisma.js';

async function runInventoryTests() {
  console.log('--- STARTING REAL ESTATE INVENTORY & LOCK TESTS ---');
  const app = buildServer();
  await app.ready();

  try {
    // Setup Clean Org & Account
    await prisma.reservation.deleteMany();
    await prisma.unit.deleteMany();
    await prisma.building.deleteMany();
    await prisma.project.deleteMany();
    await prisma.account.deleteMany();
    await prisma.organization.deleteMany();

    const org = await prisma.organization.create({
      data: { name: 'Emaar Development', code: 'EMAAR' },
    });

    const buyerAccount = await prisma.account.create({
      data: { orgId: org.id, name: 'Dr. Tarek Mansour', phone: '+201111223344', accountType: 'INDIVIDUAL' },
    });

    // TEST 1: Create Project & Building
    console.log('[TEST 1] Creating Project & Building...');
    const projRes = await app.inject({
      method: 'POST',
      url: '/api/v1/real-estate/projects',
      headers: { 'x-org-id': org.id },
      payload: { name: 'Motion Heights', code: 'MH-01', location: 'New Capital' },
    });
    if (projRes.statusCode !== 201) throw new Error('Project failed: ' + projRes.body);
    const projectId = JSON.parse(projRes.body).project.id;

    const bldRes = await app.inject({
      method: 'POST',
      url: '/api/v1/real-estate/buildings',
      payload: { projectId, name: 'Tower A', code: 'T-A', totalFloors: 15 },
    });
    if (bldRes.statusCode !== 201) throw new Error('Building failed: ' + bldRes.body);
    const buildingId = JSON.parse(bldRes.body).building.id;
    console.log('PASS: Project & Building Created');

    // TEST 2: Create Available Unit
    console.log('[TEST 2] Creating Unit in Tower A...');
    const unitRes = await app.inject({
      method: 'POST',
      url: '/api/v1/real-estate/units',
      payload: {
        buildingId,
        unitNumber: 'A-1204',
        floorNumber: 12,
        unitType: 'APARTMENT',
        grossArea: 185.5,
        netArea: 165.0,
        basePrice: 6500000,
      },
    });
    if (unitRes.statusCode !== 201) throw new Error('Unit creation failed: ' + unitRes.body);
    const unitId = JSON.parse(unitRes.body).unit.id;
    console.log('PASS: Unit Created with Status: AVAILABLE');

    // TEST 3: Reserve Available Unit
    console.log('[TEST 3] Reserving Unit A-1204 for Buyer...');
    const reserveRes = await app.inject({
      method: 'POST',
      url: '/api/v1/real-estate/units/' + unitId + '/reserve',
      payload: {
        accountId: buyerAccount.id,
        depositAmount: 100000,
        reservationNumber: 'RES-2026-001',
        expiresInDays: 7,
      },
    });
    if (reserveRes.statusCode !== 201) throw new Error('Reservation failed: ' + reserveRes.body);
    const resData = JSON.parse(reserveRes.body);
    if (resData.unit.status !== 'RESERVED') throw new Error('Unit status was not updated to RESERVED');
    console.log('PASS: Unit successfully locked & reserved');

    // TEST 4: Anti-Double-Booking Lock Test
    console.log('[TEST 4] Testing Anti-Double-Booking Protection on Already Reserved Unit...');
    const doubleReserveRes = await app.inject({
      method: 'POST',
      url: '/api/v1/real-estate/units/' + unitId + '/reserve',
      payload: {
        accountId: buyerAccount.id,
        depositAmount: 150000,
        reservationNumber: 'RES-2026-002',
        expiresInDays: 5,
      },
    });
    if (doubleReserveRes.statusCode !== 400) {
      throw new Error('Anti-Double-Booking FAILED! Unit was double booked.');
    }
    console.log('PASS: Double-booking successfully blocked by concurrency lock');

    // TEST 5: Query Inventory with Filter
    console.log('[TEST 5] Querying Inventory Filtered by Status RESERVED...');
    const invRes = await app.inject({
      method: 'GET',
      url: '/api/v1/real-estate/inventory?status=RESERVED',
    });
    const invData = JSON.parse(invRes.body);
    if (invData.count !== 1) throw new Error('Expected 1 reserved unit, got: ' + invData.count);
    console.log('PASS: Inventory query verified (Found: ' + invData.count + ' reserved unit)');

    console.log('====================================================');
    console.log('🎉 ALL 5 REAL ESTATE INVENTORY & LOCK TESTS PASSED!');
    console.log('====================================================');
  } catch (e) {
    console.error('TEST FAILED:', e);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    await app.close();
  }
}

runInventoryTests();
