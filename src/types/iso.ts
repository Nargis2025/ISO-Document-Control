import { Timestamp } from 'firebase/firestore';

export type Department =
  | 'Quality Assurance'
  | 'Engineering'
  | 'Manufacturing'
  | 'Regulatory Affairs'
  | 'Procurement'
  | 'Operations';

export const DEPARTMENTS: Department[] = [
  'Quality Assurance',
  'Engineering',
  'Manufacturing',
  'Regulatory Affairs',
  'Procurement',
  'Operations',
];

export type DocStatus = 'ACTIVE' | 'UNDER_REVISION' | 'CANCELLED';

export type RequestType = 'ADD' | 'CHANGE' | 'CANCEL';

export type DcrStatus = 'DRAFT' | 'PENDING_QMG' | 'APPROVED' | 'REJECTED';

export type ChangeLogAction = 'ADDED' | 'CHANGED' | 'CANCELLED' | 'RETURNED';

export type DistributionMedium = 'Electronic QMS' | 'Controlled Hardcopy';

export type DistributionStatus = 'DISTRIBUTED' | 'ACKNOWLEDGED' | 'RECALLED';

export interface IsoDocument {
  id: string;
  ownerId: string;
  docCode: string;
  title: string;
  department: Department;
  isoClause: string;
  revision: string;
  status: DocStatus;
  effectiveDate: string;
  authorName: string;
  approverName: string;
  summary: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface DcrRequest {
  id: string;
  ownerId: string;
  dcrNumber: string;
  requestType: RequestType;
  docCode: string;
  docTitle: string;
  department: Department;
  isoClause: string;
  currentRevision: string;
  proposedRevision: string;
  justification: string;
  draftContent: string;
  isDraftCompleted: boolean;
  status: DcrStatus;
  requesterName: string;
  qmgReviewerName: string;
  qmgComments: string;
  requestDate: string;
  requestYear: number;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface DocumentChangeLog {
  id: string;
  ownerId: string;
  dcrNumber: string;
  docCode: string;
  docTitle: string;
  actionType: ChangeLogAction;
  previousRevision: string;
  newRevision: string;
  department: Department;
  actorName: string;
  summary: string;
  effectiveDate: string;
  createdAt?: Timestamp | null;
}

export interface DocumentDistribution {
  id: string;
  ownerId: string;
  copyNumber: string;
  docCode: string;
  docTitle: string;
  revision: string;
  recipientDepartment: Department;
  holderRole: string;
  medium: DistributionMedium;
  distributionStatus: DistributionStatus;
  distributedDate: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export type SystemReportId =
  | 'DCR_BY_DATE'
  | 'CHANGE_LOG'
  | 'MASTER_LIST'
  | 'DISTRIBUTION'
  | 'DCR_BY_YEAR'
  | 'PENDING_APPROVAL';

export type SwitchboardNodeId =
  | 'REQUEST_ADD'
  | 'REQUEST_CHANGE'
  | 'REQUEST_CANCEL'
  | 'JUSTIFY_DRAFT'
  | 'DECISION_COMPLETED'
  | 'EDIT_ADD_REQUEST'
  | 'EDIT_CHANGE_CANCEL_REQUEST'
  | 'SEND_TO_QMG'
  | 'APPROVE_NEW_DOC'
  | 'APPROVE_CHANGES';
