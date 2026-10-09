import {
  collection,
  doc,
  setDoc,
  updateDoc,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  Department,
  RequestType,
  DcrRequest,
  IsoDocument,
  DocumentDistribution,
  DistributionMedium,
  DistributionStatus,
} from '../types/iso';
import {
  BLUEPRINT_CONSTRAINTS as C,
  sanitizeCodeOrId,
  clampString,
  ensureDepartment,
  ensureDocStatus,
  ensureRequestType,
  ensureDcrStatus,
  ensureChangeLogAction,
  ensureDistributionMedium,
  ensureDistributionStatus,
} from '../utils/validation';

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface CreateDcrInput {
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
  submitImmediatelyToQmg?: boolean;
  requesterName: string;
}

export async function createDcrRequestRecord(
  input: CreateDcrInput,
  existingDocs: IsoDocument[]
): Promise<string> {
  const dcrId = sanitizeCodeOrId(`dcr-${input.dcrNumber}-${Date.now().toString().slice(-5)}`, C.ID_MAX_LEN);
  const cleanDcrNumber = sanitizeCodeOrId(input.dcrNumber, C.DCR_NUMBER_MAX);
  const cleanDocCode = sanitizeCodeOrId(input.docCode, C.DOC_CODE_MAX);
  const reqDate = todayIsoDate();
  const reqYear = new Date().getFullYear();

  const initialStatus =
    input.isDraftCompleted && input.submitImmediatelyToQmg ? 'PENDING_QMG' : 'DRAFT';

  const payload = {
    ownerId: sanitizeCodeOrId(input.ownerId, C.ID_MAX_LEN),
    dcrNumber: cleanDcrNumber,
    requestType: ensureRequestType(input.requestType),
    docCode: cleanDocCode,
    docTitle: clampString(input.docTitle, C.TITLE_MIN, C.TITLE_MAX, 'Untitled ISO Document'),
    department: ensureDepartment(input.department),
    isoClause: clampString(input.isoClause, C.ISO_CLAUSE_MIN, C.ISO_CLAUSE_MAX, 'ISO 9001:2015 Clause 7.5'),
    currentRevision: clampString(input.currentRevision, C.REVISION_MIN, C.REVISION_MAX, 'None'),
    proposedRevision: clampString(input.proposedRevision, C.REVISION_MIN, C.REVISION_MAX, 'Rev 1.0'),
    justification: clampString(
      input.justification,
      C.JUSTIFICATION_MIN,
      C.JUSTIFICATION_MAX,
      'Required for ISO 9001 quality management system compliance.'
    ),
    draftContent: clampString(
      input.draftContent,
      C.DRAFT_CONTENT_MIN,
      C.DRAFT_CONTENT_MAX,
      'Controlled procedure scope, responsibilities, and normative compliance requirements.'
    ),
    isDraftCompleted: Boolean(input.isDraftCompleted),
    status: ensureDcrStatus(initialStatus),
    requesterName: clampString(input.requesterName, C.NAME_MIN, C.NAME_MAX, 'ISO Specialist'),
    qmgReviewerName: 'Pending QMG Assignment',
    qmgComments:
      initialStatus === 'PENDING_QMG'
        ? 'Submitted to Quality Management Group (QMG) for formal review.'
        : 'Draft stage — awaiting completion and QMG submission.',
    requestDate: clampString(reqDate, C.DATE_MIN, C.DATE_MAX, '2026-10-08'),
    requestYear: reqYear >= 1990 && reqYear <= 2100 ? reqYear : 2026,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, 'dcrRequests', dcrId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `dcrRequests/${dcrId}`);
  }

  // If this is a CHANGE or CANCEL request on an ACTIVE document, mark the document UNDER_REVISION
  if (input.requestType === 'CHANGE' || input.requestType === 'CANCEL') {
    const targetDoc = existingDocs.find(
      (d) => d.docCode.toUpperCase() === cleanDocCode.toUpperCase() && d.status === 'ACTIVE'
    );
    if (targetDoc) {
      try {
        await updateDoc(doc(db, 'documents', targetDoc.id), {
          status: 'UNDER_REVISION',
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `documents/${targetDoc.id}`);
      }
    }
  }

  return dcrId;
}

export interface UpdateDcrDraftInput {
  docCode: string;
  docTitle: string;
  department: Department;
  isoClause: string;
  currentRevision: string;
  proposedRevision: string;
  justification: string;
  draftContent: string;
  isDraftCompleted: boolean;
  submitToQmg?: boolean;
}

export async function updateDcrDraftRecord(
  dcr: DcrRequest,
  updates: UpdateDcrDraftInput
): Promise<void> {
  const nextStatus = updates.submitToQmg && updates.isDraftCompleted ? 'PENDING_QMG' : 'DRAFT';
  const nextQmgComments =
    nextStatus === 'PENDING_QMG'
      ? 'Completed requirement justification & draft; transmitted to QMG for review.'
      : updates.isDraftCompleted
      ? 'Draft marked Completed — ready to send to QMG for review.'
      : 'Draft updated; still requires completion before QMG review.';

  const payload = {
    docCode: sanitizeCodeOrId(updates.docCode, C.DOC_CODE_MAX),
    docTitle: clampString(updates.docTitle, C.TITLE_MIN, C.TITLE_MAX, dcr.docTitle),
    department: ensureDepartment(updates.department),
    isoClause: clampString(updates.isoClause, C.ISO_CLAUSE_MIN, C.ISO_CLAUSE_MAX, dcr.isoClause),
    currentRevision: clampString(
      updates.currentRevision,
      C.REVISION_MIN,
      C.REVISION_MAX,
      dcr.currentRevision
    ),
    proposedRevision: clampString(
      updates.proposedRevision,
      C.REVISION_MIN,
      C.REVISION_MAX,
      dcr.proposedRevision
    ),
    justification: clampString(
      updates.justification,
      C.JUSTIFICATION_MIN,
      C.JUSTIFICATION_MAX,
      dcr.justification
    ),
    draftContent: clampString(
      updates.draftContent,
      C.DRAFT_CONTENT_MIN,
      C.DRAFT_CONTENT_MAX,
      dcr.draftContent
    ),
    isDraftCompleted: Boolean(updates.isDraftCompleted),
    status: ensureDcrStatus(nextStatus),
    qmgReviewerName: clampString(dcr.qmgReviewerName, C.NAME_MIN, C.NAME_MAX, 'Pending QMG'),
    qmgComments: clampString(nextQmgComments, C.QMG_COMMENTS_MIN, C.QMG_COMMENTS_MAX, 'Updated'),
    updatedAt: serverTimestamp(),
  };

  try {
    await updateDoc(doc(db, 'dcrRequests', dcr.id), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `dcrRequests/${dcr.id}`);
  }
}

export async function sendCompletedDcrToQmg(dcr: DcrRequest): Promise<void> {
  const payload = {
    docCode: dcr.docCode,
    docTitle: dcr.docTitle,
    department: dcr.department,
    isoClause: dcr.isoClause,
    currentRevision: dcr.currentRevision,
    proposedRevision: dcr.proposedRevision,
    justification: dcr.justification,
    draftContent: dcr.draftContent,
    isDraftCompleted: true,
    status: ensureDcrStatus('PENDING_QMG'),
    qmgReviewerName: 'QMG Review Board',
    qmgComments: 'Sent to QMG for formal ISO 9001 review and sign-off.',
    updatedAt: serverTimestamp(),
  };

  try {
    await updateDoc(doc(db, 'dcrRequests', dcr.id), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `dcrRequests/${dcr.id}`);
  }
}

export type QmgDecision = 'APPROVE' | 'RETURN_TO_DRAFT' | 'REJECT';

export async function executeQmgReviewDecision(
  dcr: DcrRequest,
  decision: QmgDecision,
  reviewerName: string,
  comments: string,
  existingDocs: IsoDocument[],
  existingDistributions: DocumentDistribution[]
): Promise<void> {
  const cleanReviewer = clampString(reviewerName, C.NAME_MIN, C.NAME_MAX, 'QMG Lead Auditor');
  const cleanComments = clampString(
    comments,
    C.QMG_COMMENTS_MIN,
    C.QMG_COMMENTS_MAX,
    decision === 'APPROVE'
      ? 'Verified compliance with ISO 9001:2015 Clause 7.5. Approved for controlled release.'
      : decision === 'RETURN_TO_DRAFT'
      ? 'Returned to author for additional justification and clause alignment.'
      : 'Rejected by QMG Review Board.'
  );
  const effDate = todayIsoDate();

  // 1. Update the DCR status first
  const dcrNextStatus =
    decision === 'APPROVE' ? 'APPROVED' : decision === 'RETURN_TO_DRAFT' ? 'DRAFT' : 'REJECTED';
  const dcrNextCompleted = decision === 'RETURN_TO_DRAFT' ? false : true;

  try {
    await updateDoc(doc(db, 'dcrRequests', dcr.id), {
      isDraftCompleted: dcrNextCompleted,
      status: ensureDcrStatus(dcrNextStatus),
      qmgReviewerName: cleanReviewer,
      qmgComments: cleanComments,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `dcrRequests/${dcr.id}`);
  }

  // 2. If Returned to Draft, log the return in ChangeLog
  if (decision === 'RETURN_TO_DRAFT') {
    const logId = sanitizeCodeOrId(`log-${dcr.dcrNumber}-ret-${Date.now().toString().slice(-4)}`, C.ID_MAX_LEN);
    try {
      await setDoc(doc(db, 'changeLogs', logId), {
        ownerId: dcr.ownerId,
        dcrNumber: dcr.dcrNumber,
        docCode: dcr.docCode,
        docTitle: dcr.docTitle,
        actionType: ensureChangeLogAction('RETURNED'),
        previousRevision: dcr.currentRevision,
        newRevision: dcr.proposedRevision,
        department: ensureDepartment(dcr.department),
        actorName: cleanReviewer,
        summary: clampString(
          `Returned to author for revision: ${cleanComments}`,
          C.LOG_SUMMARY_MIN,
          C.LOG_SUMMARY_MAX,
          'Returned to draft by QMG.'
        ),
        effectiveDate: effDate,
        createdAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `changeLogs/${logId}`);
    }
    return;
  }

  // 3. If Rejected, restore target document to ACTIVE if it was UNDER_REVISION
  if (decision === 'REJECT') {
    const targetDoc = existingDocs.find(
      (docItem) => docItem.docCode.toUpperCase() === dcr.docCode.toUpperCase()
    );
    if (targetDoc && targetDoc.status === 'UNDER_REVISION') {
      try {
        await updateDoc(doc(db, 'documents', targetDoc.id), {
          status: ensureDocStatus('ACTIVE'),
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `documents/${targetDoc.id}`);
      }
    }
    return;
  }

  // 4. Decision === 'APPROVE': Synchronize Document Master List, Change Log, and Distribution Matrix
  const targetDoc = existingDocs.find(
    (docItem) => docItem.docCode.toUpperCase() === dcr.docCode.toUpperCase()
  );

  if (dcr.requestType === 'ADD') {
    const newDocId = targetDoc
      ? targetDoc.id
      : sanitizeCodeOrId(`doc-${dcr.docCode}-${Date.now().toString().slice(-4)}`, C.ID_MAX_LEN);

    const docPayload = {
      ownerId: dcr.ownerId,
      docCode: dcr.docCode,
      title: dcr.docTitle,
      department: ensureDepartment(dcr.department),
      isoClause: dcr.isoClause,
      revision: dcr.proposedRevision,
      status: ensureDocStatus('ACTIVE'),
      effectiveDate: effDate,
      authorName: dcr.requesterName,
      approverName: cleanReviewer,
      summary: clampString(
        dcr.draftContent,
        C.DOC_SUMMARY_MIN,
        C.DOC_SUMMARY_MAX,
        dcr.justification
      ),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    try {
      await setDoc(doc(db, 'documents', newDocId), docPayload);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `documents/${newDocId}`);
    }

    // Create default controlled distribution entry for the owning department
    const distId = sanitizeCodeOrId(`dist-${dcr.docCode}-01-${Date.now().toString().slice(-4)}`, C.ID_MAX_LEN);
    const copyNum = sanitizeCodeOrId(`CC-${dcr.docCode}-01`, C.COPY_NUMBER_MAX);
    try {
      await setDoc(doc(db, 'distributions', distId), {
        ownerId: dcr.ownerId,
        copyNumber: copyNum,
        docCode: dcr.docCode,
        docTitle: dcr.docTitle,
        revision: dcr.proposedRevision,
        recipientDepartment: ensureDepartment(dcr.department),
        holderRole: `${dcr.department} Lead`,
        medium: ensureDistributionMedium('Electronic QMS'),
        distributionStatus: ensureDistributionStatus('DISTRIBUTED'),
        distributedDate: effDate,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `distributions/${distId}`);
    }
  } else if (dcr.requestType === 'CHANGE') {
    if (targetDoc) {
      try {
        await updateDoc(doc(db, 'documents', targetDoc.id), {
          title: dcr.docTitle,
          department: ensureDepartment(dcr.department),
          isoClause: dcr.isoClause,
          revision: dcr.proposedRevision,
          status: ensureDocStatus('ACTIVE'),
          effectiveDate: effDate,
          authorName: dcr.requesterName,
          approverName: cleanReviewer,
          summary: clampString(
            dcr.draftContent,
            C.DOC_SUMMARY_MIN,
            C.DOC_SUMMARY_MAX,
            targetDoc.summary
          ),
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `documents/${targetDoc.id}`);
      }
    }

    // Update active distribution copies to the new revision
    const matchingDists = existingDistributions.filter(
      (dist) =>
        dist.docCode.toUpperCase() === dcr.docCode.toUpperCase() &&
        dist.distributionStatus !== 'RECALLED'
    );
    for (const dist of matchingDists) {
      try {
        await updateDoc(doc(db, 'distributions', dist.id), {
          docTitle: dcr.docTitle,
          revision: dcr.proposedRevision,
          distributionStatus: ensureDistributionStatus('DISTRIBUTED'),
          distributedDate: effDate,
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `distributions/${dist.id}`);
      }
    }
  } else if (dcr.requestType === 'CANCEL') {
    if (targetDoc) {
      try {
        await updateDoc(doc(db, 'documents', targetDoc.id), {
          status: ensureDocStatus('CANCELLED'),
          revision: 'Obsolete',
          effectiveDate: effDate,
          approverName: cleanReviewer,
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `documents/${targetDoc.id}`);
      }
    }

    // Recall all distributed copies of the cancelled document
    const matchingDists = existingDistributions.filter(
      (dist) =>
        dist.docCode.toUpperCase() === dcr.docCode.toUpperCase() &&
        dist.distributionStatus !== 'RECALLED'
    );
    for (const dist of matchingDists) {
      try {
        await updateDoc(doc(db, 'distributions', dist.id), {
          distributionStatus: ensureDistributionStatus('RECALLED'),
          distributedDate: effDate,
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `distributions/${dist.id}`);
      }
    }
  }

  // Append immutable entry to Document Change Log
  const logAction =
    dcr.requestType === 'ADD'
      ? 'ADDED'
      : dcr.requestType === 'CHANGE'
      ? 'CHANGED'
      : 'CANCELLED';
  const logId = sanitizeCodeOrId(`log-${dcr.dcrNumber}-${Date.now().toString().slice(-4)}`, C.ID_MAX_LEN);

  try {
    await setDoc(doc(db, 'changeLogs', logId), {
      ownerId: dcr.ownerId,
      dcrNumber: dcr.dcrNumber,
      docCode: dcr.docCode,
      docTitle: dcr.docTitle,
      actionType: ensureChangeLogAction(logAction),
      previousRevision: dcr.currentRevision,
      newRevision: dcr.proposedRevision,
      department: ensureDepartment(dcr.department),
      actorName: cleanReviewer,
      summary: clampString(
        `${dcr.justification} — QMG Sign-off: ${cleanComments}`,
        C.LOG_SUMMARY_MIN,
        C.LOG_SUMMARY_MAX,
        cleanComments
      ),
      effectiveDate: effDate,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `changeLogs/${logId}`);
  }
}

export async function createControlledDistributionRecord(input: {
  ownerId: string;
  copyNumber: string;
  docCode: string;
  docTitle: string;
  revision: string;
  recipientDepartment: Department;
  holderRole: string;
  medium: DistributionMedium;
}): Promise<void> {
  const distId = sanitizeCodeOrId(
    `dist-${input.copyNumber}-${Date.now().toString().slice(-4)}`,
    C.ID_MAX_LEN
  );
  const effDate = todayIsoDate();

  try {
    await setDoc(doc(db, 'distributions', distId), {
      ownerId: sanitizeCodeOrId(input.ownerId, C.ID_MAX_LEN),
      copyNumber: sanitizeCodeOrId(input.copyNumber, C.COPY_NUMBER_MAX),
      docCode: sanitizeCodeOrId(input.docCode, C.DOC_CODE_MAX),
      docTitle: clampString(input.docTitle, C.TITLE_MIN, C.TITLE_MAX, 'Controlled Document'),
      revision: clampString(input.revision, C.REVISION_MIN, C.REVISION_MAX, 'Rev 1.0'),
      recipientDepartment: ensureDepartment(input.recipientDepartment),
      holderRole: clampString(input.holderRole, C.HOLDER_ROLE_MIN, C.HOLDER_ROLE_MAX, 'Department Lead'),
      medium: ensureDistributionMedium(input.medium),
      distributionStatus: ensureDistributionStatus('DISTRIBUTED'),
      distributedDate: effDate,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `distributions/${distId}`);
  }
}

export async function updateDistributionStatusRecord(
  dist: DocumentDistribution,
  nextStatus: DistributionStatus
): Promise<void> {
  try {
    await updateDoc(doc(db, 'distributions', dist.id), {
      distributionStatus: ensureDistributionStatus(nextStatus),
      distributedDate: todayIsoDate(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `distributions/${dist.id}`);
  }
}

export async function seedInitialIsoComplianceData(
  ownerId: string,
  userDisplayName: string
): Promise<void> {
  const cleanOwnerId = sanitizeCodeOrId(ownerId, C.ID_MAX_LEN);
  const author = clampString(userDisplayName || 'ISO Quality Lead', C.NAME_MIN, C.NAME_MAX, 'ISO Quality Lead');
  const batch = writeBatch(db);

  // 1. Seed Controlled Document Master List (6 documents)
  const initialDocs = [
    {
      id: 'doc-QM-ISO-001',
      docCode: 'QM-ISO-001',
      title: 'Quality Management System Manual (ISO 9001:2015)',
      department: 'Quality Assurance',
      isoClause: 'ISO 9001:2015 Clause 4.4',
      revision: 'Rev 4.0',
      status: 'ACTIVE',
      effectiveDate: '2026-01-15',
      authorName: author,
      approverName: 'Dr. Elena Rostova (QMG Chair)',
      summary:
        'Defines the overarching Quality Management System scope, process interactions, quality policy, and regulatory compliance architecture across all facilities.',
    },
    {
      id: 'doc-SOP-QA-001',
      docCode: 'SOP-QA-001',
      title: 'Control of Documented Information & DCR Procedure',
      department: 'Quality Assurance',
      isoClause: 'ISO 9001:2015 Clause 7.5',
      revision: 'Rev 3.0',
      status: 'UNDER_REVISION',
      effectiveDate: '2025-11-10',
      authorName: 'Marcus Vance',
      approverName: 'Dr. Elena Rostova (QMG Chair)',
      summary:
        'Establishes the standard procedure for initiating, justifying, drafting, reviewing, approving, distributing, and archiving controlled ISO documents via frmDocChangeSwitchboard.',
    },
    {
      id: 'doc-SOP-ENG-004',
      docCode: 'SOP-ENG-004',
      title: 'Design Verification & Engineering Change Control',
      department: 'Engineering',
      isoClause: 'ISO 9001:2015 Clause 8.3',
      revision: 'Rev 2.0',
      status: 'ACTIVE',
      effectiveDate: '2026-02-20',
      authorName: 'Hannah Lin',
      approverName: 'Dr. Elena Rostova (QMG Chair)',
      summary:
        'Governs engineering design stages, tolerance verification reviews, prototype validation gates, and mandatory design transfer sign-offs.',
    },
    {
      id: 'doc-WI-MFG-012',
      docCode: 'WI-MFG-012',
      title: 'Cleanroom Assembly & Calibration Work Instruction',
      department: 'Manufacturing',
      isoClause: 'ISO 9001:2015 Clause 7.1.5',
      revision: 'Rev 5.0',
      status: 'UNDER_REVISION',
      effectiveDate: '2025-08-04',
      authorName: 'David K. Miller',
      approverName: 'Marcus Vance (QMG Auditor)',
      summary:
        'Step-by-step operator instructions for particulate monitoring, torque transducer verification, and batch traveler traceability on Line B.',
    },
    {
      id: 'doc-SOP-PRO-003',
      docCode: 'SOP-PRO-003',
      title: 'Supplier Qualification & Incoming Material Audit',
      department: 'Procurement',
      isoClause: 'ISO 9001:2015 Clause 8.4',
      revision: 'Rev 2.0',
      status: 'ACTIVE',
      effectiveDate: '2026-04-12',
      authorName: 'Clara Mensah',
      approverName: 'Dr. Elena Rostova (QMG Chair)',
      summary:
        'Defines Approved Vendor List (AVL) qualification criteria, SCAR escalation thresholds, and incoming lot AQL sampling plans.',
    },
    {
      id: 'doc-WI-OPS-002',
      docCode: 'WI-OPS-002',
      title: 'Legacy Paper Traveler Archival Procedure',
      department: 'Operations',
      isoClause: 'ISO 9001:2015 Clause 7.5.3',
      revision: 'Obsolete',
      status: 'CANCELLED',
      effectiveDate: '2025-06-30',
      authorName: 'Robert Chen',
      approverName: 'Dr. Elena Rostova (QMG Chair)',
      summary:
        'Superseded by electronic batch record digitization under SOP-QA-001. All physical paper traveler binders have been recalled.',
    },
  ] as const;

  for (const d of initialDocs) {
    batch.set(doc(db, 'documents', d.id), {
      ownerId: cleanOwnerId,
      docCode: d.docCode,
      title: d.title,
      department: d.department,
      isoClause: d.isoClause,
      revision: d.revision,
      status: d.status,
      effectiveDate: d.effectiveDate,
      authorName: d.authorName,
      approverName: d.approverName,
      summary: d.summary,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  // 2. Seed Document Change Requests (DCRs) covering every node in frmDocChangeSwitchboard
  const initialDcrs = [
    // Node: Edit Document Add Request (DRAFT, isDraftCompleted: false, ADD)
    {
      id: 'dcr-DCR-2026-009',
      dcrNumber: 'DCR-2026-009',
      requestType: 'ADD',
      docCode: 'SOP-REG-011',
      docTitle: 'Post-Market Surveillance & Vigilance Reporting',
      department: 'Regulatory Affairs',
      isoClause: 'ISO 9001:2015 Clause 9.1.2',
      currentRevision: 'None',
      proposedRevision: 'Rev 1.0',
      justification:
        'New regulatory requirement to formalize field feedback aggregation and incident escalation timelines.',
      draftContent:
        'Section 1: Scope. Section 2: Adverse Feedback Triage within 24 hours. [Pending Section 3 escalation matrix table]',
      isDraftCompleted: false,
      status: 'DRAFT',
      requesterName: author,
      qmgReviewerName: 'Pending QMG Assignment',
      qmgComments: 'Draft incomplete — awaiting Section 3 escalation matrix before QMG review.',
      requestDate: '2026-10-02',
      requestYear: 2026,
    },
    // Node: Edit Change / Cancellation Request (DRAFT, isDraftCompleted: false, CHANGE)
    {
      id: 'dcr-DCR-2026-010',
      dcrNumber: 'DCR-2026-010',
      requestType: 'CHANGE',
      docCode: 'SOP-ENG-004',
      docTitle: 'Design Verification & Engineering Change Control',
      department: 'Engineering',
      isoClause: 'ISO 9001:2015 Clause 8.3',
      currentRevision: 'Rev 2.0',
      proposedRevision: 'Rev 3.0',
      justification:
        'Incorporate automated finite-element simulation sign-off checklist prior to tooling release.',
      draftContent:
        'Redline update to Section 4.2: Added mandatory CAE simulation report attachment and thermal tolerance verification.',
      isDraftCompleted: false,
      status: 'DRAFT',
      requesterName: 'Hannah Lin',
      qmgReviewerName: 'Pending QMG Assignment',
      qmgComments: 'Author verifying tolerance parameters with Manufacturing Engineering.',
      requestDate: '2026-10-04',
      requestYear: 2026,
    },
    // Node: Send to QMG for review (DRAFT, isDraftCompleted: true)
    {
      id: 'dcr-DCR-2026-008',
      dcrNumber: 'DCR-2026-008',
      requestType: 'ADD',
      docCode: 'WI-QA-019',
      docTitle: 'Coordinate Measuring Machine (CMM) Annual Gage R&R Protocol',
      department: 'Quality Assurance',
      isoClause: 'ISO 9001:2015 Clause 7.1.5.2',
      currentRevision: 'None',
      proposedRevision: 'Rev 1.0',
      justification:
        'External ISO surveillance audit recommended a dedicated work instruction for 3-operator 10-part Gage R&R studies.',
      draftContent:
        'Complete protocol specifying fixture setup, ANOVA %GRR acceptance thresholds (<10% nominal, 10-30% conditional), and calibration sticker issuance.',
      isDraftCompleted: true,
      status: 'DRAFT',
      requesterName: author,
      qmgReviewerName: 'Pending QMG Submission',
      qmgComments: 'Completed? = Yes. Ready to transmit to QMG for review.',
      requestDate: '2026-09-29',
      requestYear: 2026,
    },
    // Node: Review and Approve new document (PENDING_QMG, ADD)
    {
      id: 'dcr-DCR-2026-006',
      dcrNumber: 'DCR-2026-006',
      requestType: 'ADD',
      docCode: 'SOP-QA-014',
      docTitle: 'Internal Audit Schedule & Nonconformity CAPA Workflow',
      department: 'Quality Assurance',
      isoClause: 'ISO 9001:2015 Clause 9.2 & 10.2',
      currentRevision: 'None',
      proposedRevision: 'Rev 1.0',
      justification:
        'Standardizes root-cause analysis (5-Why / Ishikawa) and 30-day CAPA effectiveness verification across all departments.',
      draftContent:
        'Defines annual internal audit risk matrix, auditor independence rules, major/minor nonconformity grading, and CAPA closure verification.',
      isDraftCompleted: true,
      status: 'PENDING_QMG',
      requesterName: 'Marcus Vance',
      qmgReviewerName: 'QMG Review Board',
      qmgComments: 'Submitted to QMG — awaiting final approval to publish new controlled document.',
      requestDate: '2026-09-24',
      requestYear: 2026,
    },
    // Node: Review and Approve changes (PENDING_QMG, CHANGE)
    {
      id: 'dcr-DCR-2026-007',
      dcrNumber: 'DCR-2026-007',
      requestType: 'CHANGE',
      docCode: 'SOP-QA-001',
      docTitle: 'Control of Documented Information & DCR Procedure',
      department: 'Quality Assurance',
      isoClause: 'ISO 9001:2015 Clause 7.5',
      currentRevision: 'Rev 3.0',
      proposedRevision: 'Rev 4.0',
      justification:
        'Transitioned QMG approval workflow from legacy desktop database to digital ISO Switchboard with cryptographic audit logging.',
      draftContent:
        'Updated Section 5.1 through 5.4 to reflect electronic QMG review queue, automated Document Master List revision increment, and instant distribution recall.',
      isDraftCompleted: true,
      status: 'PENDING_QMG',
      requesterName: author,
      qmgReviewerName: 'Dr. Elena Rostova (QMG Chair)',
      qmgComments: 'Under QMG review for Rev 4.0 release.',
      requestDate: '2026-09-26',
      requestYear: 2026,
    },
    // Node: Review and Approve changes (PENDING_QMG, CANCEL)
    {
      id: 'dcr-DCR-2026-005',
      dcrNumber: 'DCR-2026-005',
      requestType: 'CANCEL',
      docCode: 'WI-MFG-012',
      docTitle: 'Cleanroom Assembly & Calibration Work Instruction',
      department: 'Manufacturing',
      isoClause: 'ISO 9001:2015 Clause 7.1.5',
      currentRevision: 'Rev 5.0',
      proposedRevision: 'Obsolete',
      justification:
        'Line B manual torque stations have been decommissioned and replaced by automated closed-loop robotic cells covered under WI-MFG-020.',
      draftContent:
        'Requesting full cancellation and withdrawal of all hardcopy controlled binders on Manufacturing Floor B.',
      isDraftCompleted: true,
      status: 'PENDING_QMG',
      requesterName: 'David K. Miller',
      qmgReviewerName: 'QMG Review Board',
      qmgComments: 'Pending QMG confirmation of Line B decommissioning sign-off.',
      requestDate: '2026-09-18',
      requestYear: 2026,
    },
    // Historical Approved DCRs (2026, 2025, 2024) for System Reports
    {
      id: 'dcr-DCR-2026-002',
      dcrNumber: 'DCR-2026-002',
      requestType: 'CHANGE',
      docCode: 'SOP-PRO-003',
      docTitle: 'Supplier Qualification & Incoming Material Audit',
      department: 'Procurement',
      isoClause: 'ISO 9001:2015 Clause 8.4',
      currentRevision: 'Rev 1.0',
      proposedRevision: 'Rev 2.0',
      justification: 'Added ISO 14001 environmental compliance screening for Tier-1 raw material suppliers.',
      draftContent: 'Updated Section 3.4 Supplier Audit Scorecard and SCAR response window (14 business days).',
      isDraftCompleted: true,
      status: 'APPROVED',
      requesterName: 'Clara Mensah',
      qmgReviewerName: 'Dr. Elena Rostova (QMG Chair)',
      qmgComments: 'Approved and published to Document Master List as Rev 2.0.',
      requestDate: '2026-04-10',
      requestYear: 2026,
    },
    {
      id: 'dcr-DCR-2026-001',
      dcrNumber: 'DCR-2026-001',
      requestType: 'CHANGE',
      docCode: 'QM-ISO-001',
      docTitle: 'Quality Management System Manual (ISO 9001:2015)',
      department: 'Quality Assurance',
      isoClause: 'ISO 9001:2015 Clause 4.4',
      currentRevision: 'Rev 3.0',
      proposedRevision: 'Rev 4.0',
      justification: 'Annual QMS Management Review update incorporating climate risk consideration amendment.',
      draftContent: 'Added Clause 4.1 & 4.2 climate action and supply chain resilience context evaluation.',
      isDraftCompleted: true,
      status: 'APPROVED',
      requesterName: author,
      qmgReviewerName: 'Dr. Elena Rostova (QMG Chair)',
      qmgComments: 'Unanimously approved by QMG Committee.',
      requestDate: '2026-01-14',
      requestYear: 2026,
    },
    {
      id: 'dcr-DCR-2025-018',
      dcrNumber: 'DCR-2025-018',
      requestType: 'CANCEL',
      docCode: 'WI-OPS-002',
      docTitle: 'Legacy Paper Traveler Archival Procedure',
      department: 'Operations',
      isoClause: 'ISO 9001:2015 Clause 7.5.3',
      currentRevision: 'Rev 2.0',
      proposedRevision: 'Obsolete',
      justification: 'Replaced by 100% digital MES batch records; physical traveler archival is obsolete.',
      draftContent: 'Cancelled WI-OPS-002 and recalled Controlled Copy CC-OPS-02.',
      isDraftCompleted: true,
      status: 'APPROVED',
      requesterName: 'Robert Chen',
      qmgReviewerName: 'Dr. Elena Rostova (QMG Chair)',
      qmgComments: 'Approved obsolescence and copy withdrawal.',
      requestDate: '2025-06-28',
      requestYear: 2025,
    },
    {
      id: 'dcr-DCR-2025-011',
      dcrNumber: 'DCR-2025-011',
      requestType: 'ADD',
      docCode: 'SOP-ENG-004',
      docTitle: 'Design Verification & Engineering Change Control',
      department: 'Engineering',
      isoClause: 'ISO 9001:2015 Clause 8.3',
      currentRevision: 'None',
      proposedRevision: 'Rev 1.0',
      justification: 'Initial release of structured engineering phase-gate verification SOP.',
      draftContent: 'Established Phase 1-4 engineering verification and DHF documentation rules.',
      isDraftCompleted: true,
      status: 'APPROVED',
      requesterName: 'Hannah Lin',
      qmgReviewerName: 'Marcus Vance (QMG Auditor)',
      qmgComments: 'Approved for controlled distribution.',
      requestDate: '2025-03-12',
      requestYear: 2025,
    },
    {
      id: 'dcr-DCR-2024-007',
      dcrNumber: 'DCR-2024-007',
      requestType: 'ADD',
      docCode: 'SOP-QA-001',
      docTitle: 'Control of Documented Information & DCR Procedure',
      department: 'Quality Assurance',
      isoClause: 'ISO 9001:2015 Clause 7.5',
      currentRevision: 'None',
      proposedRevision: 'Rev 1.0',
      justification: 'Core ISO 9001 Clause 7.5 documented information control procedure.',
      draftContent: 'Baseline procedure defining document numbering, DCR justification, and QMG sign-off.',
      isDraftCompleted: true,
      status: 'APPROVED',
      requesterName: 'Marcus Vance',
      qmgReviewerName: 'Dr. Elena Rostova (QMG Chair)',
      qmgComments: 'Baseline ISO 9001 certification approval.',
      requestDate: '2024-05-19',
      requestYear: 2024,
    },
  ] as const;

  for (const r of initialDcrs) {
    batch.set(doc(db, 'dcrRequests', r.id), {
      ownerId: cleanOwnerId,
      dcrNumber: r.dcrNumber,
      requestType: r.requestType,
      docCode: r.docCode,
      docTitle: r.docTitle,
      department: r.department,
      isoClause: r.isoClause,
      currentRevision: r.currentRevision,
      proposedRevision: r.proposedRevision,
      justification: r.justification,
      draftContent: r.draftContent,
      isDraftCompleted: r.isDraftCompleted,
      status: r.status,
      requesterName: r.requesterName,
      qmgReviewerName: r.qmgReviewerName,
      qmgComments: r.qmgComments,
      requestDate: r.requestDate,
      requestYear: r.requestYear,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  // 3. Seed Document Change Log (Immutable audit history)
  const initialLogs = [
    {
      id: 'log-DCR-2026-002',
      dcrNumber: 'DCR-2026-002',
      docCode: 'SOP-PRO-003',
      docTitle: 'Supplier Qualification & Incoming Material Audit',
      actionType: 'CHANGED',
      previousRevision: 'Rev 1.0',
      newRevision: 'Rev 2.0',
      department: 'Procurement',
      actorName: 'Dr. Elena Rostova (QMG Chair)',
      summary: 'Approved Rev 2.0 adding ISO 14001 supplier screening and 14-day SCAR response window.',
      effectiveDate: '2026-04-12',
    },
    {
      id: 'log-DCR-2026-001',
      dcrNumber: 'DCR-2026-001',
      docCode: 'QM-ISO-001',
      docTitle: 'Quality Management System Manual (ISO 9001:2015)',
      actionType: 'CHANGED',
      previousRevision: 'Rev 3.0',
      newRevision: 'Rev 4.0',
      department: 'Quality Assurance',
      actorName: 'Dr. Elena Rostova (QMG Chair)',
      summary: 'Approved Rev 4.0 incorporating ISO 9001 climate risk context amendment under Clauses 4.1 & 4.2.',
      effectiveDate: '2026-01-15',
    },
    {
      id: 'log-DCR-2025-018',
      dcrNumber: 'DCR-2025-018',
      docCode: 'WI-OPS-002',
      docTitle: 'Legacy Paper Traveler Archival Procedure',
      actionType: 'CANCELLED',
      previousRevision: 'Rev 2.0',
      newRevision: 'Obsolete',
      department: 'Operations',
      actorName: 'Dr. Elena Rostova (QMG Chair)',
      summary: 'Cancelled legacy paper traveler procedure following electronic batch record cutover.',
      effectiveDate: '2025-06-30',
    },
    {
      id: 'log-DCR-2025-011',
      dcrNumber: 'DCR-2025-011',
      docCode: 'SOP-ENG-004',
      docTitle: 'Design Verification & Engineering Change Control',
      actionType: 'ADDED',
      previousRevision: 'None',
      newRevision: 'Rev 1.0',
      department: 'Engineering',
      actorName: 'Marcus Vance (QMG Auditor)',
      summary: 'Initial controlled release of Design Verification & Engineering Change Control SOP.',
      effectiveDate: '2025-03-15',
    },
  ] as const;

  for (const l of initialLogs) {
    batch.set(doc(db, 'changeLogs', l.id), {
      ownerId: cleanOwnerId,
      dcrNumber: l.dcrNumber,
      docCode: l.docCode,
      docTitle: l.docTitle,
      actionType: l.actionType,
      previousRevision: l.previousRevision,
      newRevision: l.newRevision,
      department: l.department,
      actorName: l.actorName,
      summary: l.summary,
      effectiveDate: l.effectiveDate,
      createdAt: serverTimestamp(),
    });
  }

  // 4. Seed Controlled Document Distribution Matrix
  const initialDists = [
    {
      id: 'dist-CC-QA-01',
      copyNumber: 'CC-QA-01',
      docCode: 'QM-ISO-001',
      docTitle: 'Quality Management System Manual (ISO 9001:2015)',
      revision: 'Rev 4.0',
      recipientDepartment: 'Quality Assurance',
      holderRole: 'Quality Assurance Director',
      medium: 'Electronic QMS',
      distributionStatus: 'ACKNOWLEDGED',
      distributedDate: '2026-01-15',
    },
    {
      id: 'dist-CC-MFG-01',
      copyNumber: 'CC-MFG-01',
      docCode: 'QM-ISO-001',
      docTitle: 'Quality Management System Manual (ISO 9001:2015)',
      revision: 'Rev 4.0',
      recipientDepartment: 'Manufacturing',
      holderRole: 'Plant Operations Manager',
      medium: 'Controlled Hardcopy',
      distributionStatus: 'ACKNOWLEDGED',
      distributedDate: '2026-01-16',
    },
    {
      id: 'dist-CC-QA-02',
      copyNumber: 'CC-QA-02',
      docCode: 'SOP-QA-001',
      docTitle: 'Control of Documented Information & DCR Procedure',
      revision: 'Rev 3.0',
      recipientDepartment: 'Quality Assurance',
      holderRole: 'Document Control Coordinator',
      medium: 'Electronic QMS',
      distributionStatus: 'ACKNOWLEDGED',
      distributedDate: '2025-11-10',
    },
    {
      id: 'dist-CC-ENG-01',
      copyNumber: 'CC-ENG-01',
      docCode: 'SOP-ENG-004',
      docTitle: 'Design Verification & Engineering Change Control',
      revision: 'Rev 2.0',
      recipientDepartment: 'Engineering',
      holderRole: 'Principal R&D Lead',
      medium: 'Electronic QMS',
      distributionStatus: 'ACKNOWLEDGED',
      distributedDate: '2026-02-20',
    },
    {
      id: 'dist-CC-MFG-04',
      copyNumber: 'CC-MFG-04',
      docCode: 'WI-MFG-012',
      docTitle: 'Cleanroom Assembly & Calibration Work Instruction',
      revision: 'Rev 5.0',
      recipientDepartment: 'Manufacturing',
      holderRole: 'Cleanroom Line B Supervisor',
      medium: 'Controlled Hardcopy',
      distributionStatus: 'DISTRIBUTED',
      distributedDate: '2025-08-04',
    },
    {
      id: 'dist-CC-PRO-01',
      copyNumber: 'CC-PRO-01',
      docCode: 'SOP-PRO-003',
      docTitle: 'Supplier Qualification & Incoming Material Audit',
      revision: 'Rev 2.0',
      recipientDepartment: 'Procurement',
      holderRole: 'Supplier Quality Engineer',
      medium: 'Electronic QMS',
      distributionStatus: 'DISTRIBUTED',
      distributedDate: '2026-04-12',
    },
    {
      id: 'dist-CC-OPS-02',
      copyNumber: 'CC-OPS-02',
      docCode: 'WI-OPS-002',
      docTitle: 'Legacy Paper Traveler Archival Procedure',
      revision: 'Rev 2.0',
      recipientDepartment: 'Operations',
      holderRole: 'Document Archive Clerk',
      medium: 'Controlled Hardcopy',
      distributionStatus: 'RECALLED',
      distributedDate: '2025-06-30',
    },
  ] as const;

  for (const dist of initialDists) {
    batch.set(doc(db, 'distributions', dist.id), {
      ownerId: cleanOwnerId,
      copyNumber: dist.copyNumber,
      docCode: dist.docCode,
      docTitle: dist.docTitle,
      revision: dist.revision,
      recipientDepartment: dist.recipientDepartment,
      holderRole: dist.holderRole,
      medium: dist.medium,
      distributionStatus: dist.distributionStatus,
      distributedDate: dist.distributedDate,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'batchSeedInitialIsoData');
  }
}
