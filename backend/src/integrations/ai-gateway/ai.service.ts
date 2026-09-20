import { prisma } from '../../core/prisma.js';
import { z } from 'zod';

export interface AILeadInsight {
  leadId: string;
  leadName: string;
  score: 'HOT' | 'WARM' | 'COLD';
  scoreReason: string;
  matchedUnits: Array<{
    unitNumber: string;
    buildingName: string;
    unitType: string;
    price: number;
    priceFormatted: string;
  }>;
  nextBestAction: string;
  suggestedSalesPitch: string;
}

export async function generateLeadIntelligence(orgId: string, leadId: string): Promise<AILeadInsight> {
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, orgId },
  });

  if (!lead) {
    throw new Error('Lead not found in this organization');
  }

  // 1. Context Gathering: Find available units matching lead budget
  const availableUnits = await prisma.unit.findMany({
    where: {
      status: 'AVAILABLE',
      building: { project: { orgId } },
    },
    include: {
      building: { include: { project: true } },
    },
    take: 3,
  });

  // 2. Budget matching
  const leadBudget = lead.budget || 0;
  const matched = availableUnits.filter((u) => {
    if (!leadBudget) return true;
    return u.basePrice <= leadBudget * 1.25; // 25% tolerance
  });

  // 3. Lead Scoring Logic
  let score: 'HOT' | 'WARM' | 'COLD' = 'WARM';
  let scoreReason = 'Engaged with reasonable budget match';

  if (lead.budget && lead.budget >= 5000000 && lead.source === 'META_ADS') {
    score = 'HOT';
    scoreReason = 'High purchasing power from targeted campaign with instant response';
  } else if (!lead.budget && !lead.notes) {
    score = 'COLD';
    scoreReason = 'Incomplete profile requiring qualification call';
  }

  // 4. Next Best Action & Pitch
  const primaryUnit = matched.length > 0 ? matched[0] : availableUnits[0];
  let nextBestAction = 'Schedule qualification discovery call';
  let pitch = `Hello ${lead.fullName}, thank you for your interest in Motion developments.`;

  if (primaryUnit) {
    nextBestAction = `Offer private viewing / presentation for ${primaryUnit.unitNumber} (${primaryUnit.building.name})`;
    pitch = `Dear ${lead.fullName}, based on your preference, we have reserved priority allocation for Unit ${primaryUnit.unitNumber} in ${primaryUnit.building.name} (${primaryUnit.unitType}) starting from ${primaryUnit.basePrice.toLocaleString()} EGP with flexible payment plans.`;
  }

  return {
    leadId: lead.id,
    leadName: lead.fullName,
    score,
    scoreReason,
    matchedUnits: matched.map((u) => ({
      unitNumber: u.unitNumber,
      buildingName: u.building.name,
      unitType: u.unitType,
      price: u.basePrice,
      priceFormatted: u.basePrice.toLocaleString() + ' EGP',
    })),
    nextBestAction,
    suggestedSalesPitch: pitch,
  };
}

export async function generateSmartReply(orgId: string, leadId: string, incomingMessage: string) {
  const insight = await generateLeadIntelligence(orgId, leadId);

  let reply = `Hi ${insight.leadName}, regarding your inquiry: "${incomingMessage}". `;

  if (incomingMessage.toLowerCase().includes('price') || incomingMessage.toLowerCase().includes('installment') || incomingMessage.toLowerCase().includes('سعر')) {
    reply += `Our units in ${insight.matchedUnits[0]?.buildingName || 'the project'} offer flexible installment schedules over up to 7 years with a 10% down payment. Would you like me to share the detailed payment breakdown?`;
  } else if (incomingMessage.toLowerCase().includes('location') || incomingMessage.toLowerCase().includes('موقع')) {
    reply += `The project is situated in a prime strategic location with direct access to major axes. I can send you the exact master plan and location pin on WhatsApp.`;
  } else {
    reply += insight.suggestedSalesPitch;
  }

  return {
    leadId,
    incomingMessage,
    leadScore: insight.score,
    suggestedReply: reply,
    nextBestAction: insight.nextBestAction,
  };
}
