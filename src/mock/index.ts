import { makeEntryId, makeTemplateRowId } from '../domain'
import type {
  PicAssignment,
  ActivityDefinition,
  PartRecord,
  PartEvent,
  PartRelease,
  PartAck,
  VendorInfo,
  VendorVisit,
  ActivityEntry,
  MilestoneDef,
  ModelRecord,
  Section,
  TemplateRow
} from '../domain'
import { ALL_BLUEPRINTS } from './activityBlueprints'

/** Configurable milestone list. PP, MPP, Pilot, SOP are mandatory. */
export const SEED_MILESTONES: MilestoneDef[] = [
  { id: 'PP', label: 'PP', mandatory: true },
  { id: 'MPP', label: 'MPP', mandatory: true },
  { id: 'Pilot', label: 'Pilot', mandatory: true },
  { id: 'SOP', label: 'SOP', mandatory: true },
  { id: 'Jig', label: 'Jig', mandatory: false },
  { id: 'Kani', label: 'Kani', mandatory: false },
  { id: 'Weld', label: 'Weld', mandatory: false },
  { id: 'Engine', label: 'Engine', mandatory: false },
  { id: 'Assembly', label: 'Assembly', mandatory: false }
]

/** Configurable section list. */
export const SEED_SECTIONS: Section[] = ['NP1', 'NP2', 'NP3', 'NP4', 'NP5', 'NP6'].map((id) => ({ id, label: id }))

/**
 * Seed models. PP/MPP/Pilot/SOP are filled on every model (mandatory); the five
 * optional milestones (Jig, Kani, Weld, Engine, Assembly) are filled on some models
 * and left blank (key absent) on others so "Awaiting MRD" can be demonstrated.
 * Baleno is deliberately a late model so some of its NP1 instances are overdue.
 */
export const SEED_MODELS: ModelRecord[] = [
  { name: 'Swift', mrds: { PP: '2026-10-24', MPP: '2026-11-05', Pilot: '2026-11-25', SOP: '2026-12-15', Jig: '2026-10-30', Weld: '2026-11-10' } },
  { name: 'Brezza', mrds: { PP: '2026-10-26', MPP: '2026-11-08', Pilot: '2026-11-28', SOP: '2026-12-18', Engine: '2026-11-12', Assembly: '2026-11-20' } },
  { name: 'Baleno', mrds: { PP: '2026-10-12', MPP: '2026-10-16', Pilot: '2026-11-05', SOP: '2026-11-30' } },
  {
    name: 'Grand Vitara',
    mrds: { PP: '2026-11-02', MPP: '2026-11-16', Pilot: '2026-12-05', SOP: '2026-12-28', Jig: '2026-11-10', Kani: '2026-11-12', Weld: '2026-11-18', Engine: '2026-11-22', Assembly: '2026-12-01' }
  },
  { name: 'Fronx', mrds: { PP: '2026-10-22', MPP: '2026-11-04', Pilot: '2026-11-24', SOP: '2026-12-14', Jig: '2026-10-28' } },
  { name: 'Dzire', mrds: { PP: '2026-10-20', MPP: '2026-11-02', Pilot: '2026-11-22', SOP: '2026-12-12', Kani: '2026-11-05' } }
]

/** Template row ids for the six NP1 seed rows (see makeTemplateRowId). NP3..NP5 ids are built inline below. */
const TPL_PP_1 = makeTemplateRowId('NP1', 'pp-1', 'PP')
const TPL_PP_2 = makeTemplateRowId('NP1', 'pp-2', 'PP')
const TPL_PP_3 = makeTemplateRowId('NP1', 'pp-3', 'PP')
const TPL_PP_10 = makeTemplateRowId('NP1', 'pp-10', 'PP')
const TPL_MPP_1 = makeTemplateRowId('NP1', 'mpp-1', 'MPP')
const TPL_PILOT_15 = makeTemplateRowId('NP1', 'pilot-15', 'Pilot')
const TPL_PILOT_12 = makeTemplateRowId('NP1', 'pilot-12', 'SOP')

/**
 * Default milestone + offset window for an activity, derived from its id prefix.
 * PP activities run in the PP window, MPP in the MPP window, Pilot/SOP in the SOP window.
 * Offsets are calendar days from the milestone MRD.
 */
function defaultPlacement(activityId: string): { milestoneId: string; startOffset: number; endOffset: number } {
  if (activityId.startsWith('mpp-')) return { milestoneId: 'MPP', startOffset: -35, endOffset: -5 }
  if (activityId.startsWith('pilot-')) return { milestoneId: 'SOP', startOffset: -75, endOffset: -20 }
  return { milestoneId: 'PP', startOffset: -23, endOffset: 3 } // pp-*
}

/**
 * Hand-tuned NP1 rows for the activities that carry pre-seeded entries. Offsets were chosen so a
 * "typical" model (Swift) lands on believable planned dates. These override the default placement.
 */
const TUNED_NP1_ROWS: TemplateRow[] = [
  { id: TPL_PP_1, section: 'NP1', activityId: 'pp-1', milestoneId: 'PP', startOffset: -23, endOffset: -4 },
  { id: TPL_PP_2, section: 'NP1', activityId: 'pp-2', milestoneId: 'PP', startOffset: -23, endOffset: 1 },
  { id: TPL_PP_3, section: 'NP1', activityId: 'pp-3', milestoneId: 'PP', startOffset: -23, endOffset: 2 },
  { id: TPL_PP_10, section: 'NP1', activityId: 'pp-10', milestoneId: 'PP', startOffset: -23, endOffset: 7 },
  { id: TPL_MPP_1, section: 'NP1', activityId: 'mpp-1', milestoneId: 'MPP', startOffset: -35, endOffset: -8 },
  { id: TPL_PILOT_15, section: 'NP1', activityId: 'pilot-15', milestoneId: 'Pilot', startOffset: -55, endOffset: -5 },
  { id: TPL_PILOT_12, section: 'NP1', activityId: 'pilot-12', milestoneId: 'SOP', startOffset: -75, endOffset: -30 }
]

/**
 * NP1 template rows for EVERY activity blueprint, so all ~45 PP/MPP/Pilot activities appear in the
 * primary section. Tuned rows (above) are kept verbatim for the activities that carry seed entries;
 * all other blueprints get a default placement from their phase. NP3..NP5 additionally carry a few
 * Vendor-facing activities so the Vendor has work across sections and milestones.
 */
const TUNED_IDS = new Set(TUNED_NP1_ROWS.map((r) => r.activityId))

export const SEED_TEMPLATE_ROWS: TemplateRow[] = [
  ...TUNED_NP1_ROWS,
  // Every other blueprint gets a default NP1 row so it is visible in the app.
  ...ALL_BLUEPRINTS.filter((a) => !TUNED_IDS.has(a.id)).map((a) => {
    const p = defaultPlacement(a.id)
    return { id: makeTemplateRowId('NP1', a.id, p.milestoneId), section: 'NP1', activityId: a.id, ...p }
  }),
  // NP3..NP5: a few Vendor-facing activities, so the Vendor has work across sections and milestones
  ...(['NP3', 'NP4', 'NP5'] as const).flatMap((section) => [
    { id: makeTemplateRowId(section, 'pp-2', 'PP'), section, activityId: 'pp-2', milestoneId: 'PP', startOffset: -23, endOffset: 1 },
    { id: makeTemplateRowId(section, 'pp-3', 'PP'), section, activityId: 'pp-3', milestoneId: 'PP', startOffset: -23, endOffset: 2 },
    { id: makeTemplateRowId(section, 'pp-10', 'PP'), section, activityId: 'pp-10', milestoneId: 'PP', startOffset: -23, endOffset: 7 },
    { id: makeTemplateRowId(section, 'mpp-1', 'MPP'), section, activityId: 'mpp-1', milestoneId: 'MPP', startOffset: -35, endOffset: -8 },
    { id: makeTemplateRowId(section, 'pilot-12', 'SOP'), section, activityId: 'pilot-12', milestoneId: 'SOP', startOffset: -75, endOffset: -30 }
  ])
]

/**
 * Seed activity definitions — all PP, MPP and Pilot/SOP blueprints transcribed from the client PPT.
 * Defined via the compact DSL in ./activityBlueprints.
 */
export const SEED_ACTIVITIES: ActivityDefinition[] = ALL_BLUEPRINTS

/**
 * Mock Part List consisting of 25 part records across car models and vendors (simulated ENOVIA/SAP ingest).
 * Includes both "NewPart" and "ECN" case types. Parts are spread across sections NP1..NP6
 * (12 in NP1, including 3 from Minda Industries; 7 Minda parts in total), each with a PIC.
 * A part's dates come from its model's milestone MRD via the section's template rows.
 */
export const MOCK_PART_LIST: PartRecord[] = [
  { partNo: '31100-M74LD0', partName: 'Starter Motor Assembly', model: 'Swift', vendorCode: 'V01-MINDA', vendorName: 'Minda Industries', department: 'Electrical', section: 'NP1', pic: 'Rahul Verma', type: 'NewPart' },
  { partNo: '31100-M74LD1', partName: 'ECU Engine controller', model: 'Swift', vendorCode: 'V02-BOSCH', vendorName: 'Bosch India', department: 'A', section: 'NP1', pic: 'Rahul Verma', type: 'ECN' },
  { partNo: '31100-M74LD2', partName: 'Alternator High-Output', model: 'Swift', vendorCode: 'V01-MINDA', vendorName: 'Minda Industries', department: 'AR', section: 'NP1', pic: 'Rahul Verma', type: 'NewPart' },
  { partNo: '38100-M74W00', partName: 'Wiper Motor Assembly', model: 'Swift', vendorCode: 'V01-MINDA', vendorName: 'Minda Industries', department: 'Electrical', section: 'NP1', pic: 'Rahul Verma', type: 'NewPart' },
  { partNo: '39100-M74F00', partName: 'Main Fuse Box', model: 'Swift', vendorCode: 'V01-MINDA', vendorName: 'Minda Industries', department: 'Electrical', section: 'NP1', pic: 'Rahul Verma', type: 'NewPart' },
  { partNo: '31100-M74LD3', partName: 'Ignition Harness Swift', model: 'Swift', vendorCode: 'V02-BOSCH', vendorName: 'Bosch India', department: 'Electrical', section: 'NP2', pic: 'Suresh Nair', type: 'NewPart' },
  
  { partNo: '71811-M82P00', partName: 'Front Bumper Brezza', model: 'Brezza', vendorCode: 'V03-SUBROS', vendorName: 'Subros Limited', department: 'Body', section: 'NP1', pic: 'Anita Desai', type: 'NewPart' },
  { partNo: '71811-M82P01', partName: 'Bumper Upper Grill', model: 'Brezza', vendorCode: 'V03-SUBROS', vendorName: 'Subros Limited', department: 'Body', section: 'NP1', pic: 'Anita Desai', type: 'ECN' },
  { partNo: '95100-M82P10', partName: 'HVAC Unit Main blower', model: 'Brezza', vendorCode: 'V03-SUBROS', vendorName: 'Subros Limited', department: 'F', section: 'NP1', pic: 'Anita Desai', type: 'NewPart' },
  { partNo: '95100-M82P11', partName: 'Heater Core Assembly', model: 'Brezza', vendorCode: 'V04-SANDEN', vendorName: 'Sanden Vikas', department: 'Interior', section: 'NP2', pic: 'Suresh Nair', type: 'NewPart' },

  { partNo: '35120-M68P00', partName: 'Headlamp Assembly LH', model: 'Baleno', vendorCode: 'V04-SANDEN', vendorName: 'Sanden Vikas', department: 'Electrical', section: 'NP1', pic: 'Rahul Verma', type: 'NewPart' },
  { partNo: '35320-M68P00', partName: 'Headlamp Assembly RH', model: 'Baleno', vendorCode: 'V04-SANDEN', vendorName: 'Sanden Vikas', department: 'Electrical', section: 'NP1', pic: '', type: 'NewPart' },
  { partNo: '64111-M68P10', partName: 'Inner Side Sill Baleno', model: 'Baleno', vendorCode: 'V01-MINDA', vendorName: 'Minda Industries', department: 'Body', section: 'NP3', pic: 'Priya Menon', type: 'NewPart' },

  { partNo: '12100-M80T00', partName: 'Piston Pin Assembly', model: 'Grand Vitara', vendorCode: 'V05-DENSO', vendorName: 'Denso India', department: 'Engine', section: 'NP1', pic: 'Anita Desai', type: 'NewPart' },
  { partNo: '13100-M80T00', partName: 'Connecting Rod Forged', model: 'Grand Vitara', vendorCode: 'V05-DENSO', vendorName: 'Denso India', department: 'Engine', section: 'NP3', pic: 'Priya Menon', type: 'ECN' },
  { partNo: '95200-M80T10', partName: 'AC Compressor Assembly', model: 'Grand Vitara', vendorCode: 'V04-SANDEN', vendorName: 'Sanden Vikas', department: 'F', section: 'NP2', pic: 'Suresh Nair', type: 'NewPart' },
  { partNo: '41100-M80T20', partName: 'Strut Assembly Front LH', model: 'Grand Vitara', vendorCode: 'V06-ASAHI', vendorName: 'Asahi Glass', department: 'Chassis', section: 'NP3', pic: 'Priya Menon', type: 'NewPart' },

  { partNo: '48110-M55R00', partName: 'Steering Gear Box Assy', model: 'Fronx', vendorCode: 'V06-ASAHI', vendorName: 'Asahi Glass', department: 'Chassis', section: 'NP4', pic: 'Vikram Rao', type: 'NewPart' },
  { partNo: '84701-M55R10', partName: 'ORVM Outer Mirror LH', model: 'Fronx', vendorCode: 'V01-MINDA', vendorName: 'Minda Industries', department: 'Body', section: 'NP1', pic: '', type: 'NewPart' },
  { partNo: '84702-M55R10', partName: 'ORVM Outer Mirror RH', model: 'Fronx', vendorCode: 'V01-MINDA', vendorName: 'Minda Industries', department: 'Body', section: 'NP4', pic: 'Vikram Rao', type: 'NewPart' },
  { partNo: '65111-M55R20', partName: 'Sheet Metal Roof Panel', model: 'Fronx', vendorCode: 'V03-SUBROS', vendorName: 'Subros Limited', department: 'Body', section: 'NP4', pic: 'Vikram Rao', type: 'NewPart' },

  { partNo: '34100-M72V00', partName: 'Digital Speedometer', model: 'Dzire', vendorCode: 'V02-BOSCH', vendorName: 'Bosch India', department: 'A', section: 'NP1', pic: 'Anita Desai', type: 'NewPart' },
  { partNo: '51100-M72V10', partName: 'Brake Caliper Assy LH', model: 'Dzire', vendorCode: 'V05-DENSO', vendorName: 'Denso India', department: 'AR', section: 'NP1', pic: 'Rahul Verma', type: 'NewPart' },
  { partNo: '51200-M72V10', partName: 'Brake Caliper Assy RH', model: 'Dzire', vendorCode: 'V05-DENSO', vendorName: 'Denso India', department: 'AR', section: 'NP5', pic: 'Neha Kapoor', type: 'NewPart' },
  { partNo: '72111-M72V20', partName: 'Inner Door Panel Stamping', model: 'Dzire', vendorCode: 'V01-MINDA', vendorName: 'Minda Industries', department: 'Body', section: 'NP5', pic: 'Neha Kapoor', type: 'NewPart' },
  { partNo: '72121-M72V20', partName: 'Outer Door Skin Panel', model: 'Dzire', vendorCode: 'V01-MINDA', vendorName: 'Minda Industries', department: 'Body', section: 'NP5', pic: 'Neha Kapoor', type: 'ECN' },
  { partNo: '83701-M72V30', partName: 'Rear Windshield Glass', model: 'Dzire', vendorCode: 'V06-ASAHI', vendorName: 'Asahi Glass', department: 'G', section: 'NP6', pic: 'Arun Joshi', type: 'NewPart' }
]

/**
 * Pre-seeded Entries in varied states: Approved, Submitted, Sent back, Draft, Overdue.
 * These seed entries bring dashboards and tables to life.
 */
/**
 * Demo handover: SAP has no PIC for 84701-M55R10, so one PIC covered it from 1 Oct and another
 * took over from 14 Oct. 35320-M68P00 is deliberately left unassigned.
 */
export const SEED_PIC_ASSIGNMENTS: PicAssignment[] = [
  {
    id: 'pic-84701-M55R10-1',
    partNo: '84701-M55R10',
    pic: 'Karan Mehta',
    effectiveFrom: '2026-10-01',
    reason: 'SAP has no PIC for this part',
    assignedBy: 'SIC',
    assignedAt: '2026-10-01T09:00:00Z'
  },
  {
    id: 'pic-84701-M55R10-2',
    partNo: '84701-M55R10',
    pic: 'Deepa Nair',
    effectiveFrom: '2026-10-14',
    reason: 'Permanent PIC confirmed',
    assignedBy: 'SIC',
    assignedAt: '2026-10-13T16:00:00Z'
  }
]

/**
 * Vendor locations (simulated vendor master). Manpower planning groups vendors by location so a PIC
 * visiting one vendor can be prompted to cover other vendors in the same place. Minda and Denso share
 * Manesar; Bosch and Subros share Pune; Sanden and Asahi share Bawal.
 */
export const SEED_VENDOR_INFO: VendorInfo[] = [
  { vendorName: 'Minda Industries', location: 'Manesar' },
  { vendorName: 'Denso India', location: 'Manesar' },
  { vendorName: 'Bosch India', location: 'Pune' },
  { vendorName: 'Subros Limited', location: 'Pune' },
  { vendorName: 'Sanden Vikas', location: 'Bawal' },
  { vendorName: 'Asahi Glass', location: 'Bawal' }
]

/** A couple of seeded PIC visits so the planner is populated on first load. */
export const SEED_VENDOR_VISITS: VendorVisit[] = [
  { id: 'visit-1', pic: 'Rahul Verma', vendorName: 'Minda Industries', date: '2026-10-20', purpose: 'Drawing & SOR review for Swift parts', status: 'Planned', createdBy: 'SIC', createdAt: '2026-10-14T09:00:00Z' },
  { id: 'visit-2', pic: 'Anita Desai', vendorName: 'Subros Limited', date: '2026-10-22', purpose: 'Spec meeting follow-up (Brezza)', status: 'Planned', createdBy: 'SIC', createdAt: '2026-10-14T09:00:00Z' }
]

/** Part-identity audit events (manual creation / ECN transfer). Empty at start of the demo. */
export const SEED_PART_EVENTS: PartEvent[] = []

/**
 * PIC release decisions. Demo: most NP1 parts are already released to the vendor so the vendor queue is
 * populated, but 31100-M74LD2 is left UNRELEASED so you can see the PIC review-then-release flow.
 */
export const SEED_PART_RELEASES: PartRelease[] = [
  { id: 'rel-31100-M74LD0', partNo: '31100-M74LD0', released: true, by: 'Rahul Verma', byRole: 'PIC', at: '2026-10-04T10:00:00Z', comment: 'SAP details verified' },
  { id: 'rel-31100-M74LD1', partNo: '31100-M74LD1', released: true, by: 'Rahul Verma', byRole: 'PIC', at: '2026-10-11T09:30:00Z', comment: 'ECN details confirmed' },
  { id: 'rel-31100-M74LD3', partNo: '31100-M74LD3', released: true, by: 'Suresh Nair', byRole: 'PIC', at: '2026-10-06T11:00:00Z' },
  { id: 'rel-71811-M82P00', partNo: '71811-M82P00', released: true, by: 'Anita Desai', byRole: 'PIC', at: '2026-10-05T08:30:00Z' },
  { id: 'rel-71811-M82P01', partNo: '71811-M82P01', released: true, by: 'Anita Desai', byRole: 'PIC', at: '2026-10-07T08:30:00Z' },
  { id: 'rel-95100-M82P10', partNo: '95100-M82P10', released: true, by: 'Anita Desai', byRole: 'PIC', at: '2026-10-05T08:30:00Z' },
  // Handshake demo (Minda): the wiper motor was released today and awaits acknowledgement; the main fuse box was released and returned.
  { id: 'rel-38100-M74W00', partNo: '38100-M74W00', released: true, by: 'Rahul Verma', byRole: 'PIC', at: '2026-10-14T09:00:00Z', comment: 'SAP details verified' },
  { id: 'rel-39100-M74F00', partNo: '39100-M74F00', released: true, by: 'Rahul Verma', byRole: 'PIC', at: '2026-10-09T10:00:00Z' }
]
/**
 * Vendor responses to released parts. Parts without a response after their release are "awaiting acknowledgement"
 * (71811-M82P01 and 38100-M74W00 here). 39100-M74F00 was returned by the vendor, so it is back with the PIC.
 */
export const SEED_PART_ACKS: PartAck[] = [
  { id: 'ack-31100-M74LD0', partNo: '31100-M74LD0', status: 'Acknowledged', by: 'Minda Industries', byRole: 'Vendor', at: '2026-10-05T09:00:00Z' },
  { id: 'ack-31100-M74LD1', partNo: '31100-M74LD1', status: 'Acknowledged', by: 'Bosch India', byRole: 'Vendor', at: '2026-10-12T09:00:00Z' },
  { id: 'ack-31100-M74LD3', partNo: '31100-M74LD3', status: 'Acknowledged', by: 'Bosch India', byRole: 'Vendor', at: '2026-10-07T09:00:00Z' },
  { id: 'ack-71811-M82P00', partNo: '71811-M82P00', status: 'Acknowledged', by: 'Subros Limited', byRole: 'Vendor', at: '2026-10-06T09:00:00Z' },
  { id: 'ack-95100-M82P10', partNo: '95100-M82P10', status: 'Acknowledged', by: 'Subros Limited', byRole: 'Vendor', at: '2026-10-06T09:00:00Z' },
  { id: 'ack-39100-M74F00', partNo: '39100-M74F00', status: 'Returned', by: 'Minda Industries', byRole: 'Vendor', at: '2026-10-10T08:00:00Z', reason: 'Part is made at our Pune plant, please confirm the vendor code before release' }
]

const RAW_SEED_ENTRIES: ActivityEntry[] = [
  // PP #1 (Drawing Availability)
  {
    id: makeEntryId(TPL_PP_1, '31100-M74LD0'),
    templateRowId: TPL_PP_1,
    activityId: 'pp-1',
    partNo: '31100-M74LD0',
    values: {
      drawing_availability: 'Available',
      part_classification: 'MSIL',
      target_date_msil: '2026-10-24'
    },
    fieldMeta: {
      drawing_availability: { value: 'Available', status: 'Approve' },
      part_classification: { value: 'MSIL', status: 'Approve' },
      target_date_msil: { value: '2026-10-24', status: 'Approve' }
    },
    validationState: 'Approved',
    currentStepIndex: 0,
    history: [
      { timestamp: '2026-10-05T09:00:00Z', persona: 'PIC', action: 'Approved', comment: 'Drawing is confirmed and verified in IBOM.' }
    ],
    updatedAt: '2026-10-05T09:00:00Z',
    updatedBy: 'PIC'
  },
  {
    id: makeEntryId(TPL_PP_1, '31100-M74LD1'),
    templateRowId: TPL_PP_1,
    activityId: 'pp-1',
    partNo: '31100-M74LD1',
    values: {
      drawing_availability: 'Not available',
      part_classification: 'Proprietary',
      target_date_proprietary: '2026-10-18',
      drawing_applicable: 'Applicable'
    },
    fieldMeta: {
      drawing_availability: { value: 'Not available', status: 'Pending' },
      part_classification: { value: 'Proprietary', status: 'Pending' },
      target_date_proprietary: { value: '2026-10-18', status: 'Pending' },
      drawing_applicable: { value: 'Applicable', status: 'Pending' }
    },
    validationState: 'Submitted',
    currentStepIndex: 0,
    history: [
      { timestamp: '2026-10-12T14:30:00Z', persona: 'PIC', action: 'Submitted', comment: 'Drawing is proprietary; target date negotiated with vendor.' }
    ],
    updatedAt: '2026-10-12T14:30:00Z',
    updatedBy: 'PIC'
  },
  {
    id: makeEntryId(TPL_PP_1, '71811-M82P00'),
    templateRowId: TPL_PP_1,
    activityId: 'pp-1',
    partNo: '71811-M82P00',
    values: {
      drawing_availability: 'Not available',
      part_classification: 'Proprietary'
    },
    fieldMeta: {
      drawing_availability: { value: 'Not available', status: 'Pending' },
      part_classification: { value: 'Proprietary', status: 'Pending' }
    },
    validationState: 'Draft',
    currentStepIndex: 0,
    history: [
      { timestamp: '2026-10-14T10:00:00Z', persona: 'PIC', action: 'Draft entry created' }
    ],
    updatedAt: '2026-10-14T10:00:00Z',
    updatedBy: 'PIC'
  },
  {
    // OVERDUE entry for PP #1: Baleno PP MRD is 2026-10-12, so the instance ends 2026-10-08 (Red at the 2026-10-15 baseline)
    id: makeEntryId(TPL_PP_1, '35120-M68P00'),
    templateRowId: TPL_PP_1,
    activityId: 'pp-1',
    partNo: '35120-M68P00',
    values: {},
    validationState: 'Draft',
    currentStepIndex: 0,
    history: [],
    updatedAt: '2026-10-01T08:00:00Z',
    updatedBy: 'PIC'
  },

  // PP #2 (Spec Meeting)
  {
    id: makeEntryId(TPL_PP_2, '71811-M82P00'),
    templateRowId: TPL_PP_2,
    activityId: 'pp-2',
    partNo: '71811-M82P00',
    values: {
      meeting_classification: 'Tech meeting',
      spec_meeting_status: 'Approved',
      applicable_parts_meeting: 'Set Parts Bumper Mapping',
      planned_start_system: '2026-09-26',
      planned_finish_system: '2026-10-11',
      planned_start_vendor: '2026-09-26',
      planned_finish_vendor: '2026-10-11',
      actual_start_vendor: '2026-09-20',
      actual_finish_vendor: '2026-10-02'
    },
    validationState: 'Approved',
    currentStepIndex: 1,
    history: [
      { timestamp: '2026-10-02T16:00:00Z', persona: 'Vendor', action: 'Submitted' },
      { timestamp: '2026-10-03T11:00:00Z', persona: 'PIC', action: 'Approved', comment: 'All spec points agreed and approved.' }
    ],
    updatedAt: '2026-10-03T11:00:00Z',
    updatedBy: 'PIC'
  },
  {
    id: makeEntryId(TPL_PP_2, '35320-M68P00'),
    templateRowId: TPL_PP_2,
    activityId: 'pp-2',
    partNo: '35320-M68P00',
    values: {
      meeting_classification: 'Process meeting',
      spec_meeting_status: 'Pending',
      applicable_parts_meeting: 'Baleno Headlamps',
      planned_start_system: '2026-09-12',
      planned_finish_system: '2026-09-27',
      planned_start_vendor: '2026-09-12',
      planned_finish_vendor: '2026-09-27',
      actual_start_vendor: '2026-09-16'
    },
    validationState: 'Submitted',
    currentStepIndex: 1,
    history: [
      { timestamp: '2026-10-13T10:20:00Z', persona: 'Vendor', action: 'Submitted', comment: 'Started meeting; finish date pending.' }
    ],
    updatedAt: '2026-10-13T10:20:00Z',
    updatedBy: 'Vendor'
  },
  {
    id: makeEntryId(TPL_PP_2, '31100-M74LD2'),
    templateRowId: TPL_PP_2,
    activityId: 'pp-2',
    partNo: '31100-M74LD2',
    values: {
      meeting_classification: 'Tech meeting',
      spec_meeting_status: 'Initiated'
    },
    validationState: 'Sent back',
    currentStepIndex: 0,
    history: [
      { timestamp: '2026-10-10T12:00:00Z', persona: 'Vendor', action: 'Submitted' },
      { timestamp: '2026-10-11T15:00:00Z', persona: 'PIC', action: 'Sent back', comment: 'Vendor must provide actual dates for spec meeting.' }
    ],
    updatedAt: '2026-10-11T15:00:00Z',
    updatedBy: 'PIC'
  },

  // PP #10 (Sheet Metal Accuracy)
  {
    id: makeEntryId(TPL_PP_10, '71811-M82P01'),
    templateRowId: TPL_PP_10,
    activityId: 'pp-10',
    partNo: '71811-M82P01',
    values: {
      applicable_parts: 'Y',
      applicable_parts_count: 1,
      inspection_completed: 'Y',
      accuracy_target: '100%',
      accuracy_achieved: 100,
      evidence_attachment: 'sheet_metal_report_v1.pdf'
    },
    validationState: 'Approved',
    currentStepIndex: 1,
    history: [
      { timestamp: '2026-10-08T15:30:00Z', persona: 'Vendor', action: 'Submitted' },
      { timestamp: '2026-10-09T10:00:00Z', persona: 'PIC', action: 'Approved', comment: '100% accuracy verified with the report.' }
    ],
    updatedAt: '2026-10-09T10:00:00Z',
    updatedBy: 'PIC'
  },
  {
    id: makeEntryId(TPL_PP_10, '84701-M55R10'),
    templateRowId: TPL_PP_10,
    activityId: 'pp-10',
    partNo: '84701-M55R10',
    values: {
      applicable_parts: 'Y',
      applicable_parts_count: 1,
      inspection_completed: 'Y',
      accuracy_target: '100%',
      accuracy_achieved: 85,
      not_achieved_reason: 'Mold misalignment',
      evidence_attachment: 'scan_report.pdf',
      target_date_accuracy: '2026-11-05',
      action_plan: 'Recalibrate tooling fixture',
      action_result: 'NG'
    },
    validationState: 'Sent back',
    currentStepIndex: 0,
    history: [
      { timestamp: '2026-10-12T17:00:00Z', persona: 'Vendor', action: 'Submitted' },
      { timestamp: '2026-10-13T09:15:00Z', persona: 'PIC', actorName: 'Karan Mehta', action: 'Sent back', comment: 'Please recheck action plan and coordinate with tooling supplier.' }
    ],
    updatedAt: '2026-10-13T09:15:00Z',
    updatedBy: 'PIC'
  },
  {
    id: makeEntryId(TPL_PP_10, '12100-M80T00'),
    templateRowId: TPL_PP_10,
    activityId: 'pp-10',
    partNo: '12100-M80T00',
    values: {
      applicable_parts: 'Y',
      applicable_parts_count: 1,
      inspection_completed: 'Y',
      accuracy_target: '100%',
      accuracy_achieved: 95,
      not_achieved_reason: 'Slight thickness variation',
      evidence_attachment: 'inspection_log.pdf',
      target_date_accuracy: '2026-10-25',
      action_plan: 'Deviation requested',
      action_result: 'Deviation',
      e_doc_number: 'ED-2026-8802',
      deviation_status: 'Pending'
    },
    deviations: [
      {
        id: 'dev-12100-M80T00-1',
        title: 'Piston pin accuracy 95% — request deviation to continue',
        description: 'Slight thickness variation on OD; 95% vs 100% target. Requesting deviation with 100% inspection containment until tooling is corrected.',
        edocNumber: 'ED-2026-8802',
        targetDate: '2026-10-25',
        flow: ['PIC', 'SIC', 'DPM'],
        currentStep: 1,
        status: 'In progress',
        raisedBy: 'Anita Desai',
        raisedByRole: 'PIC',
        raisedAt: '2026-10-14T12:00:00Z',
        history: [
          { at: '2026-10-14T12:00:00Z', by: 'Anita Desai', byRole: 'PIC', action: 'Raised', comment: 'Vendor containment with 100% inspection in place.' },
          { at: '2026-10-15T09:30:00Z', by: 'SIC', byRole: 'PIC', action: 'Approved at PIC', comment: 'Containment verified; forwarding to SIC.' }
        ]
      }
    ],
    validationState: 'Submitted',
    currentStepIndex: 1,
    history: [
      { timestamp: '2026-10-14T11:45:00Z', persona: 'Vendor', action: 'Submitted', comment: 'Requesting deviation clearance via E-Doc.' }
    ],
    updatedAt: '2026-10-14T11:45:00Z',
    updatedBy: 'Vendor'
  },

  // MPP #1 (OTOP Status)
  {
    id: makeEntryId(TPL_MPP_1, '34100-M72V00'),
    templateRowId: TPL_MPP_1,
    activityId: 'mpp-1',
    partNo: '34100-M72V00',
    values: {
      otop_target_date: '2026-10-23',
      actual_otop_date: '2026-10-05',
      otop_status: 'OTOP',
      otop_delay_cases: 0,
      actual_date_beyond_mrd: 'N'
    },
    validationState: 'Approved',
    currentStepIndex: 1,
    history: [
      { timestamp: '2026-10-05T14:00:00Z', persona: 'Vendor', action: 'Submitted' },
      { timestamp: '2026-10-06T10:00:00Z', persona: 'PIC', action: 'Approved', comment: 'OTOP completed ahead of schedule.' }
    ],
    updatedAt: '2026-10-06T10:00:00Z',
    updatedBy: 'PIC'
  },
  {
    id: makeEntryId(TPL_MPP_1, '31100-M74LD0'),
    templateRowId: TPL_MPP_1,
    activityId: 'mpp-1',
    partNo: '31100-M74LD0',
    values: {
      otop_target_date: '2026-10-26',
      otop_status: 'Non-OTOP',
      otop_delay_cases: 0,
      delay_reason: 'Supplier tool trial delayed'
    },
    validationState: 'Draft',
    currentStepIndex: 0,
    history: [
      { timestamp: '2026-10-14T15:20:00Z', persona: 'Vendor', action: 'Draft entry created' }
    ],
    updatedAt: '2026-10-14T15:20:00Z',
    updatedBy: 'Vendor'
  },
  {
    id: makeEntryId(TPL_MPP_1, '35120-M68P00'),
    templateRowId: TPL_MPP_1,
    activityId: 'mpp-1',
    partNo: '35120-M68P00',
    values: {
      otop_target_date: '2026-10-06',
      actual_otop_date: '2026-10-18',
      otop_status: 'OTOP',
      otop_delay_cases: 1,
      delay_reason: 'Material shortage',
      actual_date_beyond_mrd: 'Y',
      deviation_raised: 'Y',
      e_doc_number: 'ED-2026-9041',
      deviation_approval_status: 'Approved'
    },
    deviations: [
      {
        id: 'dev-35120-M68P00-1',
        title: 'OTOP achieved beyond MRD (material shortage)',
        description: 'Actual OTOP on 18 Oct vs MRD-driven target 06 Oct due to raw-material shortage. Deviation to accept the delayed OTOP with recovery plan.',
        edocNumber: 'ED-2026-9041',
        targetDate: '2026-10-18',
        flow: ['PIC', 'SIC', 'DPM'],
        currentStep: 2,
        status: 'Approved',
        raisedBy: 'Rahul Verma',
        raisedByRole: 'PIC',
        raisedAt: '2026-10-10T10:00:00Z',
        decidedAt: '2026-10-13T15:00:00Z',
        history: [
          { at: '2026-10-10T10:00:00Z', by: 'Rahul Verma', byRole: 'PIC', action: 'Raised', comment: 'Material shortage recovery plan attached.' },
          { at: '2026-10-11T11:00:00Z', by: 'SIC', byRole: 'PIC', action: 'Approved at PIC' },
          { at: '2026-10-12T14:00:00Z', by: 'DPM', byRole: 'PIC', action: 'Approved at SIC' },
          { at: '2026-10-13T15:00:00Z', by: 'DPM', byRole: 'DPM', action: 'Approved at DPM', comment: 'Recovery plan acceptable; deviation approved.' }
        ]
      }
    ],
    validationState: 'Submitted',
    currentStepIndex: 1,
    history: [
      { timestamp: '2026-10-14T16:40:00Z', persona: 'Vendor', action: 'Submitted' }
    ],
    updatedAt: '2026-10-14T16:40:00Z',
    updatedBy: 'Vendor'
  },

  // Pilot/SOP #12 (SOP Readiness)
  {
    id: makeEntryId(TPL_PILOT_12, '51100-M72V10'),
    templateRowId: TPL_PILOT_12,
    activityId: 'pilot-12',
    partNo: '51100-M72V10',
    values: {
      part_category: 'AR',
      mail_status: 'Reply received',
      ppvt: 'Closed',
      tool_readiness: 'Y',
      line_readiness: 'Completed',
      manpower_total: 15,
      manpower_trained_planned: 15,
      manpower_trained_actual: 15,
      tier2_parts: 'OK',
      tier2_capacity: 'OK',
      tier2_ifm: 'OK',
      ecn_implementation: 'Done',
      pre_ecn_disposal: 'Done',
      packing: 'Y',
      ifm_station: 'Y',
      spare_kit: 'Y',
      set_part_drawing: 'Y',
      are_you_ready_sheet: 'readiness_chk_v3.xlsx'
    },
    validationState: 'Approved',
    currentStepIndex: 1,
    history: [
      { timestamp: '2026-10-10T11:00:00Z', persona: 'Vendor', action: 'Submitted' },
      { timestamp: '2026-10-11T14:30:00Z', persona: 'PIC', action: 'Approved', comment: 'Ready for SOP. All checks pass.' }
    ],
    updatedAt: '2026-10-11T14:30:00Z',
    updatedBy: 'PIC'
  },
  {
    id: makeEntryId(TPL_PILOT_12, '95100-M82P10'),
    templateRowId: TPL_PILOT_12,
    activityId: 'pilot-12',
    partNo: '95100-M82P10',
    values: {
      part_category: 'F',
      mail_status: 'Reply received',
      ppvt: 'Pending',
      tool_readiness: 'Y',
      line_readiness: 'Completed',
      manpower_total: 10,
      manpower_trained_planned: 10,
      manpower_trained_actual: 8,
      tier2_parts: 'OK',
      tier2_capacity: 'OK',
      tier2_ifm: 'OK',
      ecn_implementation: 'Done',
      pre_ecn_disposal: 'Pending',
      packing: 'Y',
      ifm_station: 'Y',
      spare_kit: 'Y',
      set_part_drawing: 'Y',
      are_you_ready_sheet: 'brezza_ready.pdf',
      remarks: 'PPVT pending final run, pre-ECN parts disposal planned',
      target_date: '2026-10-25'
    },
    validationState: 'Submitted',
    currentStepIndex: 1,
    history: [
      { timestamp: '2026-10-14T14:50:00Z', persona: 'Vendor', action: 'Submitted', comment: 'Blower trial pending final validation' }
    ],
    updatedAt: '2026-10-14T14:50:00Z',
    updatedBy: 'Vendor'
  },

  // Pilot/SOP #15 (SMIR System)
  {
    id: makeEntryId(TPL_PILOT_15, '31100-M74LD2'),
    templateRowId: TPL_PILOT_15,
    activityId: 'pilot-15',
    partNo: '31100-M74LD2',
    values: {
      applicability_sap: 'Y',
      applicability_g: 'N',
      uploaded_in_sap_smir: 'Y'
    },
    validationState: 'Approved',
    currentStepIndex: 0,
    history: [
      { timestamp: '2026-10-09T09:30:00Z', persona: 'PIC', action: 'Approved', comment: 'SMIR system upload verified from SAP' }
    ],
    updatedAt: '2026-10-09T09:30:00Z',
    updatedBy: 'PIC'
  },
  {
    id: makeEntryId(TPL_PILOT_15, '84701-M55R10'),
    templateRowId: TPL_PILOT_15,
    activityId: 'pilot-15',
    partNo: '84701-M55R10',
    values: {
      applicability_sap: 'N',
      applicability_g: 'Y',
      uploaded_in_sap_smir: 'N'
    },
    validationState: 'Draft',
    currentStepIndex: 0,
    history: [
      { timestamp: '2026-10-11T13:00:00Z', persona: 'PIC', actorName: 'Karan Mehta', action: 'Draft entry created' },
      { timestamp: '2026-10-14T10:30:00Z', persona: 'PIC', actorName: 'Deepa Nair', action: 'Edited by PIC', comment: 'Took over from temporary PIC; SAP applicability to be confirmed.' }
    ],
    updatedAt: '2026-10-14T10:30:00Z',
    updatedBy: 'PIC'
  },
  // Not-applicable demo (activities with allowNotApplicable): marked by a PIC, one with a reason
  {
    id: makeEntryId(TPL_PP_10, '95100-M82P10'),
    templateRowId: TPL_PP_10,
    activityId: 'pp-10',
    partNo: '95100-M82P10',
    values: {},
    validationState: 'Draft',
    currentStepIndex: 0,
    notApplicable: { reason: 'Plastic assembly, no sheet metal content', by: 'Anita Desai', byRole: 'PIC', at: '2026-10-09T10:15:00Z' },
    history: [
      { timestamp: '2026-10-09T10:15:00Z', persona: 'PIC', actorName: 'Anita Desai', action: 'Marked Not applicable', comment: 'Plastic assembly, no sheet metal content' }
    ],
    updatedAt: '2026-10-09T10:15:00Z',
    updatedBy: 'PIC'
  },
  {
    id: makeEntryId(TPL_PP_10, '34100-M72V00'),
    templateRowId: TPL_PP_10,
    activityId: 'pp-10',
    partNo: '34100-M72V00',
    values: {},
    validationState: 'Draft',
    currentStepIndex: 0,
    notApplicable: { by: 'Anita Desai', byRole: 'PIC', at: '2026-10-09T10:16:00Z' },
    history: [
      { timestamp: '2026-10-09T10:16:00Z', persona: 'PIC', actorName: 'Anita Desai', action: 'Marked Not applicable' }
    ],
    updatedAt: '2026-10-09T10:16:00Z',
    updatedBy: 'PIC'
  },
  // Marked Not applicable by mistake, then reversed by the SIC (shows the reversal trail)
  {
    id: makeEntryId(TPL_PILOT_15, '35120-M68P00'),
    templateRowId: TPL_PILOT_15,
    activityId: 'pilot-15',
    partNo: '35120-M68P00',
    values: {},
    validationState: 'Draft',
    currentStepIndex: 0,
    history: [
      { timestamp: '2026-10-10T09:00:00Z', persona: 'PIC', actorName: 'Rahul Verma', action: 'Marked Not applicable', comment: 'Believed to be a G part' },
      { timestamp: '2026-10-12T11:30:00Z', persona: 'SIC', action: 'Marked applicable again', comment: 'Department is A, so SMIR upload applies' }
    ],
    updatedAt: '2026-10-12T11:30:00Z',
    updatedBy: 'SIC'
  },
  {
    id: makeEntryId(makeTemplateRowId('NP3', 'pp-2', 'PP'), '64111-M68P10'),
    templateRowId: makeTemplateRowId('NP3', 'pp-2', 'PP'),
    activityId: 'pp-2',
    partNo: '64111-M68P10',
    values: {
      meeting_classification: 'Tech meeting',
      spec_meeting_status: 'Initiated',
      planned_start_system: '2026-09-19',
      planned_finish_system: '2026-10-13',
      planned_start_vendor: '2026-09-19',
      actual_start_vendor: '2026-09-24'
    },
    validationState: 'Sent back',
    currentStepIndex: 0,
    history: [
      { timestamp: '2026-10-09T11:00:00Z', persona: 'Vendor', action: 'Submitted' },
      { timestamp: '2026-10-11T10:30:00Z', persona: 'PIC', actorName: 'Priya Menon', action: 'Sent back', comment: 'Planned finish and actual dates are missing.' }
    ],
    updatedAt: '2026-10-11T10:30:00Z',
    updatedBy: 'PIC'
  },
  {
    id: makeEntryId(makeTemplateRowId('NP4', 'pp-2', 'PP'), '84702-M55R10'),
    templateRowId: makeTemplateRowId('NP4', 'pp-2', 'PP'),
    activityId: 'pp-2',
    partNo: '84702-M55R10',
    values: {
      meeting_classification: 'Process meeting',
      planned_start_vendor: '2026-09-29'
    },
    validationState: 'Draft',
    currentStepIndex: 0,
    history: [
      { timestamp: '2026-10-13T09:40:00Z', persona: 'Vendor', action: 'Draft entry created' }
    ],
    updatedAt: '2026-10-13T09:40:00Z',
    updatedBy: 'Vendor'
  },
  {
    id: makeEntryId(makeTemplateRowId('NP5', 'pp-2', 'PP'), '72111-M72V20'),
    templateRowId: makeTemplateRowId('NP5', 'pp-2', 'PP'),
    activityId: 'pp-2',
    partNo: '72111-M72V20',
    values: {
      meeting_classification: 'Tech meeting',
      spec_meeting_status: 'Approved',
      planned_start_system: '2026-09-27',
      planned_finish_system: '2026-10-21',
      planned_start_vendor: '2026-09-27',
      planned_finish_vendor: '2026-10-21',
      actual_start_vendor: '2026-09-25',
      actual_finish_vendor: '2026-10-08'
    },
    validationState: 'Approved',
    currentStepIndex: 1,
    history: [
      { timestamp: '2026-10-08T15:00:00Z', persona: 'Vendor', action: 'Submitted' },
      { timestamp: '2026-10-09T10:00:00Z', persona: 'PIC', actorName: 'Neha Kapoor', action: 'Approved', comment: 'Spec points agreed.' }
    ],
    updatedAt: '2026-10-09T10:00:00Z',
    updatedBy: 'PIC'
  },
  {
    id: makeEntryId(makeTemplateRowId('NP5', 'pp-2', 'PP'), '72121-M72V20'),
    templateRowId: makeTemplateRowId('NP5', 'pp-2', 'PP'),
    activityId: 'pp-2',
    partNo: '72121-M72V20',
    values: {
      meeting_classification: 'Process meeting'
    },
    validationState: 'Draft',
    currentStepIndex: 0,
    history: [
      { timestamp: '2026-10-14T12:10:00Z', persona: 'Vendor', action: 'Draft entry created' }
    ],
    updatedAt: '2026-10-14T12:10:00Z',
    updatedBy: 'Vendor'
  },
  // PIC-entered work for the NP1 PIC (PP #1): two more drafts so "To enter" has volume
  {
    id: makeEntryId(TPL_PP_1, '51100-M72V10'),
    templateRowId: TPL_PP_1,
    activityId: 'pp-1',
    partNo: '51100-M72V10',
    values: { drawing_availability: 'Available' },
    validationState: 'Draft',
    currentStepIndex: 0,
    history: [
      { timestamp: '2026-10-13T10:00:00Z', persona: 'PIC', actorName: 'Rahul Verma', action: 'Draft entry created' }
    ],
    updatedAt: '2026-10-13T10:00:00Z',
    updatedBy: 'PIC'
  },
  {
    id: makeEntryId(TPL_PP_1, '34100-M72V00'),
    templateRowId: TPL_PP_1,
    activityId: 'pp-1',
    partNo: '34100-M72V00',
    values: { drawing_availability: 'Not available', part_classification: 'MSIL' },
    validationState: 'Draft',
    currentStepIndex: 0,
    history: [
      { timestamp: '2026-10-14T09:00:00Z', persona: 'PIC', actorName: 'Anita Desai', action: 'Draft entry created' }
    ],
    updatedAt: '2026-10-14T09:00:00Z',
    updatedBy: 'PIC'
  },
  {
    id: makeEntryId(makeTemplateRowId('NP1', 'pp-2', 'PP'), '84701-M55R10'),
    templateRowId: makeTemplateRowId('NP1', 'pp-2', 'PP'),
    activityId: 'pp-2',
    partNo: '84701-M55R10',
    values: {
      meeting_classification: 'Tech meeting',
      spec_meeting_status: 'Initiated',
      planned_start_system: '2026-09-29',
      planned_finish_system: '2026-10-23',
      planned_start_vendor: '2026-09-29',
      planned_finish_vendor: '2026-10-23',
      actual_start_vendor: '2026-10-01'
    },
    validationState: 'Submitted',
    currentStepIndex: 1,
    history: [
      { timestamp: '2026-10-14T13:20:00Z', persona: 'Vendor', action: 'Submitted', comment: 'Meeting started; finish date to follow.' }
    ],
    updatedAt: '2026-10-14T13:20:00Z',
    updatedBy: 'Vendor'
  },
  {
    id: makeEntryId(makeTemplateRowId('NP3', 'pp-10', 'PP'), '64111-M68P10'),
    templateRowId: makeTemplateRowId('NP3', 'pp-10', 'PP'),
    activityId: 'pp-10',
    partNo: '64111-M68P10',
    values: {
      applicable_parts: 'Y',
      applicable_parts_count: 1,
      inspection_completed: 'Y',
      accuracy_target: '100%'
    },
    validationState: 'Draft',
    currentStepIndex: 0,
    history: [
      { timestamp: '2026-10-12T16:00:00Z', persona: 'Vendor', action: 'Draft entry created' }
    ],
    updatedAt: '2026-10-12T16:00:00Z',
    updatedBy: 'Vendor'
  },
  {
    id: makeEntryId(makeTemplateRowId('NP4', 'pp-10', 'PP'), '84702-M55R10'),
    templateRowId: makeTemplateRowId('NP4', 'pp-10', 'PP'),
    activityId: 'pp-10',
    partNo: '84702-M55R10',
    values: {
      applicable_parts: 'Y',
      applicable_parts_count: 1,
      inspection_completed: 'Y',
      accuracy_target: '100%',
      accuracy_achieved: 100,
      evidence_attachment: 'orvm_rh_report.pdf'
    },
    validationState: 'Submitted',
    currentStepIndex: 1,
    history: [
      { timestamp: '2026-10-14T09:30:00Z', persona: 'Vendor', action: 'Submitted' }
    ],
    updatedAt: '2026-10-14T09:30:00Z',
    updatedBy: 'Vendor'
  },
  {
    id: makeEntryId(makeTemplateRowId('NP5', 'pp-10', 'PP'), '72111-M72V20'),
    templateRowId: makeTemplateRowId('NP5', 'pp-10', 'PP'),
    activityId: 'pp-10',
    partNo: '72111-M72V20',
    values: {
      applicable_parts: 'Y'
    },
    validationState: 'Draft',
    currentStepIndex: 0,
    history: [
      { timestamp: '2026-10-13T14:00:00Z', persona: 'Vendor', action: 'Draft entry created' }
    ],
    updatedAt: '2026-10-13T14:00:00Z',
    updatedBy: 'Vendor'
  },
  {
    id: makeEntryId(makeTemplateRowId('NP1', 'pp-10', 'PP'), '31100-M74LD2'),
    templateRowId: makeTemplateRowId('NP1', 'pp-10', 'PP'),
    activityId: 'pp-10',
    partNo: '31100-M74LD2',
    values: {
      applicable_parts: 'Y',
      applicable_parts_count: 1,
      inspection_completed: 'N',
      accuracy_target: '100%'
    },
    validationState: 'Draft',
    currentStepIndex: 0,
    history: [
      { timestamp: '2026-10-14T11:00:00Z', persona: 'Vendor', action: 'Draft entry created' }
    ],
    updatedAt: '2026-10-14T11:00:00Z',
    updatedBy: 'Vendor'
  },
  {
    id: makeEntryId(makeTemplateRowId('NP4', 'mpp-1', 'MPP'), '84702-M55R10'),
    templateRowId: makeTemplateRowId('NP4', 'mpp-1', 'MPP'),
    activityId: 'mpp-1',
    partNo: '84702-M55R10',
    values: {
      otop_target_date: '2026-10-25',
      actual_otop_date: '2026-10-24',
      otop_status: 'OTOP',
      otop_delay_cases: 0,
      actual_date_beyond_mrd: 'N'
    },
    validationState: 'Approved',
    currentStepIndex: 1,
    history: [
      { timestamp: '2026-10-10T10:00:00Z', persona: 'Vendor', action: 'Submitted' },
      { timestamp: '2026-10-10T16:00:00Z', persona: 'PIC', actorName: 'Vikram Rao', action: 'Approved', comment: 'OTOP achieved.' }
    ],
    updatedAt: '2026-10-10T16:00:00Z',
    updatedBy: 'PIC'
  },
  {
    id: makeEntryId(makeTemplateRowId('NP5', 'mpp-1', 'MPP'), '72111-M72V20'),
    templateRowId: makeTemplateRowId('NP5', 'mpp-1', 'MPP'),
    activityId: 'mpp-1',
    partNo: '72111-M72V20',
    values: {
      otop_target_date: '2026-10-23',
      actual_otop_date: '2026-10-27',
      otop_status: 'OTOP',
      otop_delay_cases: 1,
      actual_date_beyond_mrd: 'N'
    },
    validationState: 'Sent back',
    currentStepIndex: 0,
    history: [
      { timestamp: '2026-10-13T08:50:00Z', persona: 'Vendor', action: 'Submitted' },
      { timestamp: '2026-10-14T10:15:00Z', persona: 'PIC', actorName: 'Neha Kapoor', action: 'Sent back', comment: 'Delay reason is mandatory for a late OTOP.' }
    ],
    updatedAt: '2026-10-14T10:15:00Z',
    updatedBy: 'PIC'
  }
]

/**
 * Simulates a delay using Promises.
 */
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Mock Service Fetchers:
 * Simulates calling external integrations with a 500ms network delay.
 * Includes a 15% probability of a simulated "Integration not available" state.
 */
export async function fetchFromEnovia(partNo: string): Promise<{ success: boolean; data?: any; error?: string }> {
  await delay(500)
  if (Math.random() < 0.15) {
    return { success: false, error: 'ENOVIA integration service is currently not available.' }
  }

  // Find part to return appropriate mock attributes
  const part = MOCK_PART_LIST.find((p) => p.partNo === partNo)
  if (!part) {
    return { success: false, error: `Part ${partNo} not found in ENOVIA database.` }
  }

  // Return realistic attributes
  return {
    success: true,
    data: {
      drawingNo: `DRW-${part.partNo}-REV01`,
      cadModelAvailable: true,
      lastUpdated: new Date().toISOString(),
      meetingClassification: part.partNo.endsWith('0') ? 'Tech meeting' : 'Process meeting'
    }
  }
}

export async function fetchFromSap(partNo: string): Promise<{ success: boolean; data?: any; error?: string }> {
  await delay(500)
  if (Math.random() < 0.15) {
    return { success: false, error: 'SAP network socket timed out.' }
  }

  const part = MOCK_PART_LIST.find((p) => p.partNo === partNo)
  if (!part) {
    return { success: false, error: `Part ${partNo} not found in SAP inventory.` }
  }

  return {
    success: true,
    data: {
      specMeetingStatus: part.partNo.endsWith('0') ? 'Approved' : 'Pending',
      partCategory: ['A', 'AR', 'F'].includes(part.department) ? part.department : 'G',
      uploadedInSmir: part.partNo.endsWith('2') || part.partNo.endsWith('0'),
      sapPostingDate: '2026-10-02'
    }
  }
}

export async function fetchFromEdoc(docNo: string): Promise<{ success: boolean; data?: any; error?: string }> {
  await delay(500)
  if (Math.random() < 0.15) {
    return { success: false, error: 'E-Doc repository is undergoing scheduled maintenance.' }
  }

  if (!docNo || docNo.trim() === '') {
    return { success: false, error: 'E-Doc tracking number cannot be empty.' }
  }

  // Generate plausible deviation info
  const idHash = docNo.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  const statusOptions = ['Accept', 'Pending', 'Reject'] as const
  const finalStatus = statusOptions[idHash % 3]

  return {
    success: true,
    data: {
      eDocNumber: docNo,
      deviationStatus: finalStatus,
      raisedBy: 'PIC-AUTO',
      approvalDate: finalStatus === 'Accept' ? '2026-10-14' : null,
      notes: 'Automated lookup successful from E-Doc.'
    }
  }
}

export async function fetchFromRegApp(partNo: string): Promise<{ success: boolean; data?: any; error?: string }> {
  await delay(500)
  if (Math.random() < 0.15) {
    return { success: false, error: 'Regulatory App API endpoint is offline.' }
  }

  const part = MOCK_PART_LIST.find((p) => p.partNo === partNo)
  if (!part) {
    return { success: false, error: `Part ${partNo} not found in Regulatory register.` }
  }

  return {
    success: true,
    data: {
      certNo: `REG-CERT-${part.partNo}-2026`,
      status: 'Approved',
      validUntil: '2029-12-31',
      homologationRequired: true
    }
  }
}

/**
 * Seed entries, pruned to the current activity definitions. The blueprints are generated from the client's
 * field-validation spreadsheet and can change; any seeded value (or field meta) whose key no longer exists on
 * the entry's activity is dropped so stale keys never linger. Entry shells, states and history are kept so the
 * demo still shows Approved / Submitted / Sent back / Draft rows.
 */
function pruneEntryValues(entries: ActivityEntry[], defs: ActivityDefinition[]): ActivityEntry[] {
  const keysByActivity = new Map(defs.map((a) => [a.id, new Set(a.fields.map((f) => f.key))]))
  return entries.map((e) => {
    const keys = keysByActivity.get(e.activityId)
    if (!keys) return e
    const values = Object.fromEntries(Object.entries(e.values).filter(([k]) => keys.has(k)))
    const fieldMeta = e.fieldMeta ? Object.fromEntries(Object.entries(e.fieldMeta).filter(([k]) => keys.has(k))) : undefined
    return { ...e, values, ...(fieldMeta ? { fieldMeta } : {}) }
  })
}

export const SEED_ENTRIES: ActivityEntry[] = pruneEntryValues(RAW_SEED_ENTRIES, ALL_BLUEPRINTS)
