# MOTIONCRM — ARCHITECTURAL BLUEPRINT SPECIFICATION

## 1. THREE-TIER DOMAIN ARCHITECTURE

### LAYER 1: CORE CRM ENGINE
Independent of industry vertical. Handles relationship management:
- **IAM & Multi-Tenancy:** Users, Roles (RBAC), Permissions, Teams, Organizations.
- **Entity Identity:** Persons, Accounts (B2B/B2C).
- **Inbound Engine:** Leads, Qualification Stages, Lead Scoring, Source Tracking.
- **Activity & Timeline:** Calls, Meetings, Tasks, Notes, Audit Trail.

### LAYER 2: COMMERCIAL & FINANCIAL ENGINE
Generic transactional engine for commercial operations:
- **Products & Pricebooks:** SKU/Item catalog, tier pricing, discounts.
- **Quotations & Proposals:** Deal builder, terms, approvals.
- **Contracts & Orders:** Legally binding agreements, execution status.
- **Payment Engine:**
  - Payment Plans (Down payment, Milestones, Periodic installments).
  - Installment Schedule Generator.
  - Payment Allocation (Splitting a transaction across pending installments).
- **Rule-Based Commission Engine:**
  - Calculations based on project, unit, target, sales rep.
  - Split commissions & Broker/External commissions.
  - Lifecycle: Calculated -> Eligible -> Earned -> Approved -> Payable -> Paid -> Clawback.

### LAYER 3: REAL ESTATE VERTICAL (FIRST VERTICAL MODULE)
Domain-specific logic for property development and brokerage:
- **Inventory Hierarchy:** Projects -> Phases -> Buildings / Clusters -> Floors -> Units.
- **Unit Lifecycle & Status Matrix:**
  - Available -> On Hold (Time-locked) -> Reserved -> Contracted -> Sold -> Cancelled -> Blocked.
  - Anti-Double-Booking Locking Mechanism (ACID transactional lock).
- **Reservation Lifecycle:** EOI (Expression of Interest) -> Down Payment -> KYC -> Contract Generation.
- **Handover Module:** Snagging/Inspection lists, Key handover, Clearance certificates.

---

## 2. INTEGRATION & INTELLIGENCE LAYERS

### LAYER 4: INTEGRATIONS
- **Meta Integration:** Webhook receiver -> OAuth -> Form Retrieval -> Field Mapping -> Deduplication -> Assignment.
- **Communications Gateway:** WhatsApp, SMS, Email adapters.

### LAYER 5: AI GATEWAY (AGNOSTIC)
- **Architecture:** Provider abstraction (OpenAI, Anthropic, Local models).
- **Capabilities:** Customer summary, Lead qualification assistant, Action suggestions.
