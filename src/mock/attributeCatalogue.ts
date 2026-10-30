import type { AttributeCatalogueEntry } from '../domain'

/**
 * Mock attribute catalogue for fetched fields.
 * Each system (ENOVIA, SAP, E-Doc, Regulatory App) exposes a set of
 * fetchable attributes. The builder's Fields step lets the user pick
 * a system + attribute from this list when source is 'enovia'|'sap'|'edoc'|'regapp'.
 */
export const ATTRIBUTE_CATALOGUE: AttributeCatalogueEntry[] = [
  // ENOVIA
  { system: 'enovia', key: 'enovia_drawing_no',         label: 'Drawing Number',             type: 'text'    },
  { system: 'enovia', key: 'enovia_drawing_rev',        label: 'Drawing Revision',           type: 'text'    },
  { system: 'enovia', key: 'enovia_classification',     label: 'Part Classification',        type: 'dropdown'},
  { system: 'enovia', key: 'enovia_material',           label: 'Material Specification',     type: 'text'    },
  { system: 'enovia', key: 'enovia_weight',             label: 'Part Weight (kg)',           type: 'number'  },
  { system: 'enovia', key: 'enovia_release_date',       label: 'Drawing Release Date',       type: 'date'    },
  { system: 'enovia', key: 'enovia_spec_ref',           label: 'Spec Reference',             type: 'text'    },

  // SAP
  { system: 'sap',    key: 'sap_part_category',        label: 'Part Category (A/AR/F/etc.)', type: 'text'    },
  { system: 'sap',    key: 'sap_smir_upload_date',     label: 'SMIR Upload Date',           type: 'date'    },
  { system: 'sap',    key: 'sap_spec_meeting_date',    label: 'Spec Meeting Date',          type: 'date'    },
  { system: 'sap',    key: 'sap_plant_code',           label: 'Plant Code',                 type: 'text'    },
  { system: 'sap',    key: 'sap_storage_location',     label: 'Storage Location',           type: 'text'    },
  { system: 'sap',    key: 'sap_cost_center',          label: 'Cost Center',                type: 'text'    },

  // E-Doc
  { system: 'edoc',   key: 'edoc_doc_no',              label: 'E-Doc Number',               type: 'text'    },
  { system: 'edoc',   key: 'edoc_deviation_status',    label: 'Deviation Status',           type: 'dropdown'},
  { system: 'edoc',   key: 'edoc_approval_date',       label: 'Deviation Approval Date',    type: 'date'    },
  { system: 'edoc',   key: 'edoc_closure_date',        label: 'E-Doc Closure Date',         type: 'date'    },
  { system: 'edoc',   key: 'edoc_approver',            label: 'Approver Name',              type: 'text'    },

  // Regulatory App
  { system: 'regapp', key: 'reg_cert_status',          label: 'Certification Status',       type: 'dropdown'},
  { system: 'regapp', key: 'reg_cert_no',              label: 'Certificate Number',         type: 'text'    },
  { system: 'regapp', key: 'reg_expiry_date',          label: 'Certificate Expiry Date',    type: 'date'    },
  { system: 'regapp', key: 'reg_authority',            label: 'Regulatory Authority',       type: 'text'    },
  { system: 'regapp', key: 'reg_compliance_flag',      label: 'Compliance Flag (Y/N)',      type: 'yesNo'   },
]
