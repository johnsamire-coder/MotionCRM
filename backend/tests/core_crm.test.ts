import { buildServer } from '../src/index.js';
import { prisma } from '../src/core/prisma.js';

async function runTests() {
  console.log('--- STARTING CORE CRM AUTOMATED TESTS ---');
  const app = buildServer();
  await app.ready();
  let orgId = '';

  try {
    await prisma.lead.deleteMany();
    await prisma.userRole.deleteMany();
    await prisma.user.deleteMany();
    await prisma.role.deleteMany();
    await prisma.organization.deleteMany();

    console.log('[TEST 1] Checking API Health Endpoint...');
    const healthRes = await app.inject({ method: 'GET', url: '/health' });
    if (healthRes.statusCode !== 200) throw new Error('Health check failed');
    console.log('PASS: Health Check OK');

    console.log('[TEST 2] Registering Organization & Admin...');
    const regRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register-org',
      payload: {
        orgName: 'Motion Real Estate Group',
        orgCode: 'MREG',
        adminFullName: 'Ahmed CRM Admin',
        adminEmail: 'admin@motioncrm.test',
        adminPassword: 'Password123!',
        phone: '+201000000001',
      },
    });
    if (regRes.statusCode !== 201) throw new Error('Org register failed: ' + regRes.body);
    orgId = JSON.parse(regRes.body).data.organization.id;
    console.log('PASS: Org created with ID: ' + orgId);

    console.log('[TEST 3] Logging in with Admin Credentials...');
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'admin@motioncrm.test', password: 'Password123!' },
    });
    if (loginRes.statusCode !== 200) throw new Error('Login failed');
    console.log('PASS: Login successful');

    console.log('[TEST 4] Creating a new Real Estate Lead...');
    const leadRes = await app.inject({
      method: 'POST',
      url: '/api/v1/leads',
      headers: { 'x-org-id': orgId },
      payload: {
        fullName: 'Omar Tarek',
        phone: '+201234567890',
        email: 'omar@client.test',
        source: 'META_ADS',
        budget: 5000000,
        notes: 'Interested in 3-bedroom apartment with installment plan',
      },
    });
    if (leadRes.statusCode !== 201) throw new Error('Lead creation failed: ' + leadRes.body);
    console.log('PASS: Lead created successfully');

    console.log('[TEST 5] Testing Duplicate Lead Prevention Rule...');
    const dupRes = await app.inject({
      method: 'POST',
      url: '/api/v1/leads',
      headers: { 'x-org-id': orgId },
      payload: { fullName: 'Omar Duplicate', phone: '+201234567890' },
    });
    if (dupRes.statusCode !== 400) throw new Error('Duplicate lead was not rejected');
    console.log('PASS: Duplicate correctly prevented');

    console.log('[TEST 6] Querying Leads List for Organization...');
    const listRes = await app.inject({
      method: 'GET',
      url: '/api/v1/leads',
      headers: { 'x-org-id': orgId },
    });
    const listData = JSON.parse(listRes.body);
    if (listData.count !== 1) throw new Error('Expected 1 lead, got: ' + listData.count);
    console.log('PASS: Lead query returned ' + listData.count + ' lead(s)');

    console.log('========================================');
    console.log('ALL 6 CORE CRM INTEGRATION TESTS PASSED!');
    console.log('========================================');
  } catch (e) {
    console.error('TEST FAILED:', e);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    await app.close();
  }
}
runTests();