import {
  DEPARTMENTS,
  Department,
  DocStatus,
  RequestType,
  DcrStatus,
  ChangeLogAction,
  DistributionMedium,
  DistributionStatus,
} from '../types/iso';

/**
 * Synchronized verbatim with firebase-blueprint.json and firestore.rules
 */
export const BLUEPRINT_CONSTRAINTS = {
  ID_PATTERN: /^[a-zA-Z0-9_\-]+$/,
  ID_MAX_LEN: 128,
  DOC_CODE_MIN: 2,
  DOC_CODE_MAX: 40,
  TITLE_MIN: 3,
  TITLE_MAX: 160,
  ISO_CLAUSE_MIN: 2,
  ISO_CLAUSE_MAX: 60,
  REVISION_MIN: 1,
  REVISION_MAX: 20,
  DATE_MIN: 10,
  DATE_MAX: 30,
  NAME_MIN: 1,
  NAME_MAX: 80,
  DOC_SUMMARY_MIN: 5,
  DOC_SUMMARY_MAX: 2000,
  DCR_NUMBER_MIN: 3,
  DCR_NUMBER_MAX: 40,
  JUSTIFICATION_MIN: 5,
  JUSTIFICATION_MAX: 1500,
  DRAFT_CONTENT_MIN: 5,
  DRAFT_CONTENT_MAX: 2500,
  QMG_COMMENTS_MIN: 1,
  QMG_COMMENTS_MAX: 1000,
  LOG_SUMMARY_MIN: 3,
  LOG_SUMMARY_MAX: 1000,
  COPY_NUMBER_MIN: 2,
  COPY_NUMBER_MAX: 30,
  HOLDER_ROLE_MIN: 2,
  HOLDER_ROLE_MAX: 80,
} as const;

export function sanitizeCodeOrId(raw: string, maxLen = 40): string {
  const cleaned = raw
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9_\-]/g, '')
    .slice(0, maxLen);
  return cleaned.length >= 2 ? cleaned : `ID-${Date.now()}`.slice(0, maxLen);
}

export function clampString(val: string, minLen: number, maxLen: number, fallback: string): string {
  const trimmed = (val || '').trim();
  if (trimmed.length < minLen) {
    return fallback.slice(0, maxLen);
  }
  return trimmed.slice(0, maxLen);
}

export function ensureDepartment(dept: string): Department {
  if (DEPARTMENTS.includes(dept as Department)) {
    return dept as Department;
  }
  return 'Quality Assurance';
}

export function ensureDocStatus(status: string): DocStatus {
  if (status === 'ACTIVE' || status === 'UNDER_REVISION' || status === 'CANCELLED') {
    return status;
  }
  return 'ACTIVE';
}

export function ensureRequestType(type: string): RequestType {
  if (type === 'ADD' || type === 'CHANGE' || type === 'CANCEL') {
    return type;
  }
  return 'ADD';
}

export function ensureDcrStatus(status: string): DcrStatus {
  if (
    status === 'DRAFT' ||
    status === 'PENDING_QMG' ||
    status === 'APPROVED' ||
    status === 'REJECTED'
  ) {
    return status;
  }
  return 'DRAFT';
}

export function ensureChangeLogAction(action: string): ChangeLogAction {
  if (
    action === 'ADDED' ||
    action === 'CHANGED' ||
    action === 'CANCELLED' ||
    action === 'RETURNED'
  ) {
    return action;
  }
  return 'ADDED';
}

export function ensureDistributionMedium(medium: string): DistributionMedium {
  if (medium === 'Electronic QMS' || medium === 'Controlled Hardcopy') {
    return medium;
  }
  return 'Electronic QMS';
}

export function ensureDistributionStatus(status: string): DistributionStatus {
  if (status === 'DISTRIBUTED' || status === 'ACKNOWLEDGED' || status === 'RECALLED') {
    return status;
  }
  return 'DISTRIBUTED';
}

export function incrementRevisionString(currentRev: string): string {
  const match = currentRev.match(/(\d+)\.(\d+)/);
  if (!match) return 'Rev 2.0';
  const major = parseInt(match[1], 10);
  return `Rev ${major + 1}.0`;
}

export function exportRowsToCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const escapeCell = (cell: string | number) => {
    const str = String(cell ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const csvLines = [
    headers.map(escapeCell).join(','),
    ...rows.map((r) => r.map(escapeCell).join(',')),
  ];
  const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
