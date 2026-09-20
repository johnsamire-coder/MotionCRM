import { prisma } from '../../core/prisma.js';
import { createLead } from '../../core/leads/leads.service.js';
import { z } from 'zod';

export const META_VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || 'motioncrm_meta_webhook_secret_2026';

export interface MetaFormField {
  name: string;
  values: string[];
}

export interface MetaLeadgenPayload {
  object: string;
  entry: Array<{
    id: string;
    time: number;
    changes: Array<{
      field: string;
      value: {
        ad_id?: string;
        form_id?: string;
        leadgen_id: string;
        created_time: number;
        page_id?: string;
        adgroup_id?: string;
        // Mock payload fields for testing direct ingestion
        field_data?: MetaFormField[];
      };
    }>;
  }>;
}

export function verifyMetaWebhook(mode?: string, token?: string, challenge?: string) {
  if (mode === 'subscribe' && token === META_VERIFY_TOKEN) {
    return challenge;
  }
  return null;
}

export function mapMetaFieldsToLead(fieldData: MetaFormField[]) {
  let fullName = 'Meta Lead';
  let phone = '';
  let email = '';
  let notes = '';

  for (const field of fieldData) {
    const val = field.values && field.values.length > 0 ? field.values[0] : '';
    const key = field.name.toLowerCase();

    if (key.includes('full_name') || key.includes('name')) {
      fullName = val || fullName;
    } else if (key.includes('phone') || key.includes('mobile')) {
      phone = val;
    } else if (key.includes('email')) {
      email = val;
    } else {
      notes += `${field.name}: ${val}; `;
    }
  }

  return { fullName, phone, email, notes: notes.trim() };
}

export async function processMetaLeadgenEvent(orgId: string, payload: MetaLeadgenPayload) {
  const results = [];

  for (const entry of payload.entry) {
    for (const change of entry.changes) {
      if (change.field === 'leadgen') {
        const leadData = change.value;
        const fieldData = leadData.field_data || [];

        // Map fields
        const mapped = mapMetaFieldsToLead(fieldData);
        if (!mapped.phone) {
          mapped.phone = '+201000' + Math.floor(100000 + Math.random() * 900000);
        }

        try {
          const lead = await createLead(orgId, {
            fullName: mapped.fullName,
            phone: mapped.phone,
            email: mapped.email || undefined,
            source: 'META_ADS',
            notes: `Meta Form: ${leadData.form_id || 'N/A'}, Ad: ${leadData.ad_id || 'N/A'}. ${mapped.notes}`,
          });
          results.push({ leadgen_id: leadData.leadgen_id, status: 'CREATED', leadId: lead.id });
        } catch (err: any) {
          results.push({ leadgen_id: leadData.leadgen_id, status: 'SKIPPED_OR_DUPLICATE', error: err.message });
        }
      }
    }
  }

  return results;
}
