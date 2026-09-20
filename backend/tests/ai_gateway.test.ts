import { buildServer } from '../src/index.js';
import { prisma } from '../src/core/prisma.js';

async function runAITests() {
  console.log('--- STARTING AGNOSTIC AI GATEWAY TESTS ---');
  const app = buildServer();
  await app.ready();

  try {
    // 1. Clean data in proper dependency order
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
    await prisma.activity.deleteMany();
    await prisma.lead.deleteMany();
    await prisma.account.deleteMany();
    await prisma.userRole.deleteMany();
    await prisma.user.deleteMany();
    await prisma.role.deleteMany();
    await prisma.organization.deleteMany();

    const org = await prisma.organization.create({
      data: { name: 'SODIC Real Estate', code: 'SODIC' },
    });

    const project = await prisma.project.create({
      data: { orgId: org.id, name: 'Villette', code: 'VIL-01' },
    });

    const building = await prisma.building.create({
      data: { projectId: project.id, name: 'Sky Condos', code: 'SC-1' },
    });

    const unit = await prisma.unit.create({
      data: {
        buildingId: building.id,
        unitNumber: 'SC-502',
        floorNumber: 5,
        unitType: 'DUPLEX',
        grossArea: 220,
        basePrice: 6000000,
        status: 'AVAILABLE',
      },
    });

    const lead = await prisma.lead.create({
      data: {
        orgId: org.id,
        fullName: 'Hesham Talaat',
        phone: '+201009988112',
        source: 'META_ADS',
        budget: 6500000,
        notes: 'Interested in duplex in Sky Condos',
        status: 'NEW',
      },
    });

    // TEST 1: Lead Intelligence & Scoring
    console.log('[TEST 1] Generating AI Lead Intelligence & Quality Scoring...');
    const intelRes = await app.inject({
      method: 'GET',
      url: '/api/v1/ai/leads/' + lead.id + '/intelligence',
      headers: { 'x-org-id': org.id },
    });
    if (intelRes.statusCode !== 200) throw new Error('AI Intelligence failed: ' + intelRes.body);
    const intel = JSON.parse(intelRes.body).intelligence;

    if (intel.score !== 'HOT') {
      throw new Error('Expected HOT score for high budget Meta lead, got: ' + intel.score);
    }
    if (intel.matchedUnits.length === 0) {
      throw new Error('Expected matched units for lead budget');
    }
    console.log('PASS: Lead Scored as ' + intel.score + ' with ' + intel.matchedUnits.length + ' matched unit(s)');
    console.log('PASS: Next Best Action -> ' + intel.nextBestAction);

    // TEST 2: Smart Sales Reply - Price & Installment Inquiry
    console.log('[TEST 2] Generating AI Smart Sales Reply for Pricing & Payment Question...');
    const replyRes = await app.inject({
      method: 'POST',
      url: '/api/v1/ai/leads/' + lead.id + '/suggest-reply',
      headers: { 'x-org-id': org.id },
      payload: { message: 'Can you send me the price and installment plan?' },
    });
    if (replyRes.statusCode !== 200) throw new Error('AI smart reply failed: ' + replyRes.body);
    const replyData = JSON.parse(replyRes.body);
    if (!replyData.suggestedReply.includes('installment')) {
      throw new Error('Suggested reply did not contain contextual installment details');
    }
    console.log('PASS: Contextual Smart Reply Generated: "' + replyData.suggestedReply.substring(0, 70) + '..."');

    // TEST 3: Smart Sales Reply - Location Inquiry
    console.log('[TEST 3] Generating AI Smart Sales Reply for Location Inquiry...');
    const locReplyRes = await app.inject({
      method: 'POST',
      url: '/api/v1/ai/leads/' + lead.id + '/suggest-reply',
      headers: { 'x-org-id': org.id },
      payload: { message: 'Where is the exact location?' },
    });
    if (locReplyRes.statusCode !== 200) throw new Error('Location reply failed');
    const locData = JSON.parse(locReplyRes.body);
    if (!locData.suggestedReply.includes('location')) {
      throw new Error('Location context missing from reply');
    }
    console.log('PASS: Location inquiry reply generated successfully');

    // TEST 4: Invalid Lead Error Handling
    console.log('[TEST 4] Testing AI error handling for non-existent lead...');
    const errRes = await app.inject({
      method: 'GET',
      url: '/api/v1/ai/leads/invalid-lead-id/intelligence',
      headers: { 'x-org-id': org.id },
    });
    if (errRes.statusCode !== 400) {
      throw new Error('Expected 400 for invalid lead ID');
    }
    console.log('PASS: Graceful error handling for missing lead profile');

    console.log('==============================================');
    console.log('🎉 ALL 4 AGNOSTIC AI GATEWAY TESTS PASSED!');
    console.log('==============================================');
  } catch (e) {
    console.error('TEST FAILED:', e);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    await app.close();
  }
}

runAITests();
