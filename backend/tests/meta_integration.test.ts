import { buildServer } from '../src/index.js';
import { prisma } from '../src/core/prisma.js';

async function runMetaTests() {
  console.log('--- STARTING META ADS GATEWAY INTEGRATION TESTS ---');
  const app = buildServer();
  await app.ready();

  try {
    // 1. Clean data in proper foreign-key dependency order
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
      data: { name: 'Palm Hills Real Estate', code: 'PHRE' },
    });

    // TEST 1: Meta Webhook Verification Handshake (Valid Token)
    console.log('[TEST 1] Testing Meta Webhook Verification Handshake...');
    const verifyRes = await app.inject({
      method: 'GET',
      url: '/api/v1/integrations/meta/webhook?hub.mode=subscribe&hub.verify_token=motioncrm_meta_webhook_secret_2026&hub.challenge=CHALLENGE_ACCEPTED_9981',
    });
    if (verifyRes.statusCode !== 200 || verifyRes.body !== 'CHALLENGE_ACCEPTED_9981') {
      throw new Error('Meta Webhook Handshake Failed! Response: ' + verifyRes.body);
    }
    console.log('PASS: Meta Webhook Verified successfully with Challenge Return');

    // TEST 2: Meta Webhook Verification (Invalid Token Rejection)
    console.log('[TEST 2] Testing Meta Webhook Invalid Token Rejection...');
    const invalidRes = await app.inject({
      method: 'GET',
      url: '/api/v1/integrations/meta/webhook?hub.mode=subscribe&hub.verify_token=WRONG_TOKEN&hub.challenge=FAIL',
    });
    if (invalidRes.statusCode !== 403) {
      throw new Error('Expected 403 Forbidden for invalid token, got: ' + invalidRes.statusCode);
    }
    console.log('PASS: Invalid token correctly rejected with 403 Forbidden');

    // TEST 3: Process Incoming Meta Lead Event
    console.log('[TEST 3] Ingesting Live Meta Leadgen Event...');
    const metaPayload = {
      object: 'page',
      entry: [
        {
          id: 'PAGE_123456',
          time: 1711000000,
          changes: [
            {
              field: 'leadgen',
              value: {
                ad_id: 'AD_CAMPAIGN_SUMMER_VILLAS',
                form_id: 'FORM_NEW_ZAYED_VILLAS',
                leadgen_id: 'LEAD_META_99881',
                created_time: 1711000000,
                field_data: [
                  { name: 'full_name', values: ['Youssef El-Gendy'] },
                  { name: 'phone_number', values: ['+201099887755'] },
                  { name: 'email', values: ['youssef.gendy@client.test'] },
                  { name: 'preferred_unit', values: ['Standalone Villa'] },
                ],
              },
            },
          ],
        },
      ],
    };

    const leadgenRes = await app.inject({
      method: 'POST',
      url: '/api/v1/integrations/meta/webhook',
      headers: { 'x-org-id': org.id },
      payload: metaPayload,
    });
    if (leadgenRes.statusCode !== 200) throw new Error('Meta Leadgen processing failed: ' + leadgenRes.body);
    console.log('PASS: Meta Leadgen Event ingested and processed successfully');

    // TEST 4: Verify Ingested Lead in Database
    console.log('[TEST 4] Verifying Lead in Database with Source META_ADS & Attribution...');
    const dbLead = await prisma.lead.findFirst({
      where: { orgId: org.id, phone: '+201099887755' },
    });
    if (!dbLead) throw new Error('Lead was not found in database!');
    if (dbLead.source !== 'META_ADS') throw new Error('Lead source mismatch: ' + dbLead.source);
    if (!dbLead.notes || !dbLead.notes.includes('FORM_NEW_ZAYED_VILLAS')) {
      throw new Error('Campaign attribution missing in notes');
    }
    console.log('PASS: Lead verified in CRM (Name: ' + dbLead.fullName + ', Source: ' + dbLead.source + ')');

    // TEST 5: Duplicate Meta Lead Deduplication Handling
    console.log('[TEST 5] Sending Duplicate Meta Lead and verifying deduplication protection...');
    const duplicateRes = await app.inject({
      method: 'POST',
      url: '/api/v1/integrations/meta/webhook',
      headers: { 'x-org-id': org.id },
      payload: metaPayload,
    });
    const dupResult = JSON.parse(duplicateRes.body).result[0];
    if (dupResult.status !== 'SKIPPED_OR_DUPLICATE') {
      throw new Error('Duplicate Meta lead was not caught by deduplication engine');
    }
    console.log('PASS: Duplicate Meta Lead correctly intercepted & logged');

    console.log('====================================================');
    console.log('🎉 ALL 5 META ADS INTEGRATION GATEWAY TESTS PASSED!');
    console.log('====================================================');
  } catch (e) {
    console.error('TEST FAILED:', e);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    await app.close();
  }
}

runMetaTests();
