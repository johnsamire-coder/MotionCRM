import Fastify from 'fastify';
import cors from '@fastify/cors';
import { RegisterOrgSchema, LoginSchema, registerOrganization, loginUser } from './core/auth/auth.service.js';
import { CreateLeadSchema, createLead, getLeads } from './core/leads/leads.service.js';
import { prisma } from './core/prisma.js';

export function buildServer() {
  const app = Fastify({ logger: false });

  app.register(cors, { origin: true });

  // Health Check
  app.get('/health', async () => {
    return { status: 'OK', service: 'MotionCRM Core Engine', timestamp: new Date().toISOString() };
  });

  // IAM & Auth Routes
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

  // Core CRM Leads Routes
  app.post('/api/v1/leads', async (req, reply) => {
    try {
      const orgId = req.headers['x-org-id'] as string;
      if (!orgId) {
        return reply.code(400).send({ success: false, error: 'Header x-org-id is required' });
      }

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
      if (!orgId) {
        return reply.code(400).send({ success: false, error: 'Header x-org-id is required' });
      }

      const query = req.query as any;
      const leads = await getLeads(orgId, query);
      return reply.send({ success: true, count: leads.length, leads });
    } catch (err: any) {
      return reply.code(400).send({ success: false, error: err.message });
    }
  });

  return app;
}

// Start standalone if executed directly
if (process.env.NODE_ENV !== 'test') {
  const server = buildServer();
  const PORT = Number(process.env.PORT) || 4000;
  server.listen({ port: PORT, host: '0.0.0.0' }, (err, address) => {
    if (err) {
      console.error(err);
      process.exit(1);
    }
    console.log(`🚀 MotionCRM Core API listening on ${address}`);
  });
}