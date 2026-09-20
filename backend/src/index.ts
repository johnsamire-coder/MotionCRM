import Fastify from 'fastify';
import cors from '@fastify/cors';
import { RegisterOrgSchema, LoginSchema, registerOrganization, loginUser } from './core/auth/auth.service.js';
import { CreateLeadSchema, createLead, getLeads } from './core/leads/leads.service.js';
import {
  CreateProjectSchema,
  CreateBuildingSchema,
  CreateUnitSchema,
  ReserveUnitSchema,
  createProject,
  createBuilding,
  createUnit,
  reserveUnit,
  getInventory,
} from './verticals/real-estate/units/units.service.js';
import {
  CreateContractSchema,
  RecordPaymentSchema,
  createContractWithPaymentPlan,
  recordPaymentAndAllocate,
  getContractDetails,
} from './commercial/contracts/contracts.service.js';
import {
  verifyMetaWebhook,
  processMetaLeadgenEvent,
  MetaLeadgenPayload,
} from './integrations/meta/meta.service.js';
import {
  generateLeadIntelligence,
  generateSmartReply,
} from './integrations/ai-gateway/ai.service.js';

export function buildServer() {
  const app = Fastify({ logger: false });
  app.register(cors, { origin: true });

  app.get('/health', async () => ({
    status: 'OK',
    service: 'MotionCRM Enterprise Engine',
    timestamp: new Date().toISOString(),
  }));

  // Auth
  app.post('/api/v1/auth/register-org', async (req, reply) => {
    try {
      const parsed = RegisterOrgSchema.parse(req.body);
      const result = await registerOrganization(parsed);
      return reply.code(201).send({ success: true, data: result });
    } catch (err: any) {
      return reply.code(400).send({ success: false, error: err.message });
    }
  });

  app.post('/api/v1/auth/login', async (req, reply) => {
    try {
      const parsed = LoginSchema.parse(req.body);
      const user = await loginUser(parsed);
      return reply.send({ success: true, user });
    } catch (err: any) {
      return reply.code(401).send({ success: false, error: err.message });
    }
  });

  // Leads
  app.post('/api/v1/leads', async (req, reply) => {
    try {
      const orgId = req.headers['x-org-id'] as string;
      if (!orgId) return reply.code(400).send({ success: false, error: 'Header x-org-id is required' });
      const parsed = CreateLeadSchema.parse(req.body);
      const lead = await createLead(orgId, parsed);
      return reply.code(201).send({ success: true, lead });
    } catch (err: any) {
      return reply.code(400).send({ success: false, error: err.message });
    }
  });

  app.get('/api/v1/leads', async (req, reply) => {
    try {
      const orgId = req.headers['x-org-id'] as string;
      if (!orgId) return reply.code(400).send({ success: false, error: 'Header x-org-id is required' });
      const leads = await getLeads(orgId, req.query as any);
      return reply.send({ success: true, count: leads.length, leads });
    } catch (err: any) {
      return reply.code(400).send({ success: false, error: err.message });
    }
  });

  // Real Estate Inventory
  app.post('/api/v1/real-estate/projects', async (req, reply) => {
    try {
      const orgId = req.headers['x-org-id'] as string;
      if (!orgId) return reply.code(400).send({ success: false, error: 'Header x-org-id is required' });
      const parsed = CreateProjectSchema.parse(req.body);
      const project = await createProject(orgId, parsed);
      return reply.code(201).send({ success: true, project });
    } catch (err: any) {
      return reply.code(400).send({ success: false, error: err.message });
    }
  });

  app.post('/api/v1/real-estate/buildings', async (req, reply) => {
    try {
      const parsed = CreateBuildingSchema.parse(req.body);
      const building = await createBuilding(parsed);
      return reply.code(201).send({ success: true, building });
    } catch (err: any) {
      return reply.code(400).send({ success: false, error: err.message });
    }
  });

  app.post('/api/v1/real-estate/units', async (req, reply) => {
    try {
      const parsed = CreateUnitSchema.parse(req.body);
      const unit = await createUnit(parsed);
      return reply.code(201).send({ success: true, unit });
    } catch (err: any) {
      return reply.code(400).send({ success: false, error: err.message });
    }
  });

  app.post('/api/v1/real-estate/units/:unitId/reserve', async (req, reply) => {
    try {
      const { unitId } = req.params as { unitId: string };
      const parsed = ReserveUnitSchema.parse(req.body);
      const result = await reserveUnit(unitId, parsed);
      return reply.code(201).send({ success: true, ...result });
    } catch (err: any) {
      return reply.code(400).send({ success: false, error: err.message });
    }
  });

  app.get('/api/v1/real-estate/inventory', async (req, reply) => {
    try {
      const units = await getInventory(req.query as any);
      return reply.send({ success: true, count: units.length, inventory: units });
    } catch (err: any) {
      return reply.code(400).send({ success: false, error: err.message });
    }
  });

  // Commercial & Financial Engine
  app.post('/api/v1/commercial/contracts', async (req, reply) => {
    try {
      const parsed = CreateContractSchema.parse(req.body);
      const contract = await createContractWithPaymentPlan(parsed);
      return reply.code(201).send({ success: true, contract });
    } catch (err: any) {
      return reply.code(400).send({ success: false, error: err.message });
    }
  });

  app.post('/api/v1/commercial/payments', async (req, reply) => {
    try {
      const parsed = RecordPaymentSchema.parse(req.body);
      const result = await recordPaymentAndAllocate(parsed);
      return reply.code(201).send({ success: true, ...result });
    } catch (err: any) {
      return reply.code(400).send({ success: false, error: err.message });
    }
  });

  app.get('/api/v1/commercial/contracts/:contractId', async (req, reply) => {
    try {
      const { contractId } = req.params as { contractId: string };
      const details = await getContractDetails(contractId);
      return reply.send({ success: true, contract: details });
    } catch (err: any) {
      return reply.code(400).send({ success: false, error: err.message });
    }
  });

  // Meta Integration Gateway
  app.get('/api/v1/integrations/meta/webhook', async (req, reply) => {
    const query = req.query as { 'hub.mode'?: string; 'hub.verify_token'?: string; 'hub.challenge'?: string };
    const challenge = verifyMetaWebhook(query['hub.mode'], query['hub.verify_token'], query['hub.challenge']);
    if (challenge) return reply.code(200).send(challenge);
    return reply.code(403).send({ error: 'Verification failed: invalid token' });
  });

  app.post('/api/v1/integrations/meta/webhook', async (req, reply) => {
    try {
      const orgId = req.headers['x-org-id'] as string;
      if (!orgId) return reply.code(400).send({ error: 'Header x-org-id is required' });
      const payload = req.body as MetaLeadgenPayload;
      const result = await processMetaLeadgenEvent(orgId, payload);
      return reply.send({ success: true, result });
    } catch (err: any) {
      return reply.code(500).send({ error: err.message });
    }
  });

  // Agnostic AI Gateway Routes
  app.get('/api/v1/ai/leads/:leadId/intelligence', async (req, reply) => {
    try {
      const orgId = req.headers['x-org-id'] as string;
      if (!orgId) return reply.code(400).send({ success: false, error: 'Header x-org-id is required' });
      const { leadId } = req.params as { leadId: string };
      const intelligence = await generateLeadIntelligence(orgId, leadId);
      return reply.send({ success: true, intelligence });
    } catch (err: any) {
      return reply.code(400).send({ success: false, error: err.message });
    }
  });

  app.post('/api/v1/ai/leads/:leadId/suggest-reply', async (req, reply) => {
    try {
      const orgId = req.headers['x-org-id'] as string;
      if (!orgId) return reply.code(400).send({ success: false, error: 'Header x-org-id is required' });
      const { leadId } = req.params as { leadId: string };
      const { message } = (req.body as { message?: string }) || {};
      const result = await generateSmartReply(orgId, leadId, message || '');
      return reply.send({ success: true, ...result });
    } catch (err: any) {
      return reply.code(400).send({ success: false, error: err.message });
    }
  });

  return app;
}

if (process.env.NODE_ENV !== 'test') {
  const server = buildServer();
  const PORT = Number(process.env.PORT) || 4000;
  server.listen({ port: PORT, host: '0.0.0.0' }, (err, address) => {
    if (err) {
      console.error(err);
      process.exit(1);
    }
    console.log(`🚀 MotionCRM API listening on ${address}`);
  });
}
