import React, { useState, useEffect } from 'react';
import {
  X,
  CheckCircle2,
  RotateCcw,
  XCircle,
  Send,
  FilePlus2,
  FileEdit,
  FileX2,
  AlertCircle,
} from 'lucide-react';
import {
  DEPARTMENTS,
  Department,
  DcrRequest,
  IsoDocument,
  DocumentDistribution,
  RequestType,
  SwitchboardNodeId,
} from '../types/iso';
import { incrementRevisionString } from '../utils/validation';
import {
  createDcrRequestRecord,
  updateDcrDraftRecord,
  sendCompletedDcrToQmg,
  executeQmgReviewDecision,
  QmgDecision,
} from '../services/isoService';

interface DcrModalProps {
  isOpen: boolean;
  activeNode: SwitchboardNodeId | null;
  initialSelectedDcr?: DcrRequest | null;
  preselectedDoc?: IsoDocument | null;
  userUid: string;
  userDisplayName: string;
  dcrs: DcrRequest[];
  documents: IsoDocument[];
  distributions: DocumentDistribution[];
  onClose: () => void;
  onSuccessMessage: (msg: string) => void;
}

export const DcrModal: React.FC<DcrModalProps> = ({
  isOpen,
  activeNode,
  initialSelectedDcr,
  preselectedDoc,
  userUid,
  userDisplayName,
  dcrs,
  documents,
  distributions,
  onClose,
  onSuccessMessage,
}) => {
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Selected DCR when in Edit / Send / QMG Review modes
  const [selectedDcrId, setSelectedDcrId] = useState<string>('');

  // Create / Edit Form fields
  const [requestType, setRequestType] = useState<RequestType>('ADD');
  const [dcrNumber, setDcrNumber] = useState<string>('');
  const [selectedDocCode, setSelectedDocCode] = useState<string>('');
  const [docCode, setDocCode] = useState<string>('');
  const [docTitle, setDocTitle] = useState<string>('');
  const [department, setDepartment] = useState<Department>('Quality Assurance');
  const [isoClause, setIsoClause] = useState<string>('ISO 9001:2015 Clause 7.5');
  const [currentRevision, setCurrentRevision] = useState<string>('None');
  const [proposedRevision, setProposedRevision] = useState<string>('Rev 1.0');
  const [justification, setJustification] = useState<string>('');
  const [draftContent, setDraftContent] = useState<string>('');
  const [isDraftCompleted, setIsDraftCompleted] = useState<boolean>(false);

  // QMG Review fields
  const [qmgReviewerName, setQmgReviewerName] = useState<string>(
    userDisplayName || 'QMG Lead Auditor'
  );
  const [qmgComments, setQmgComments] = useState<string>(
    'Verified compliance with ISO 9001:2015 Clause 7.5 requirements.'
  );

  const activeControllableDocs = documents.filter((d) => d.status !== 'CANCELLED');

  // Helper to generate next sequential DCR number
  const generateNextDcrNumber = () => {
    const year = new Date().getFullYear();
    const seq = String(dcrs.length + 1).padStart(3, '0');
    return `DCR-${year}-${seq}`;
  };

  // Determine filtered queue for workbench modes
  const getWorkbenchQueue = (): DcrRequest[] => {
    if (!activeNode) return [];
    switch (activeNode) {
      case 'JUSTIFY_DRAFT':
      case 'DECISION_COMPLETED':
        return dcrs.filter((d) => d.status === 'DRAFT');
      case 'EDIT_ADD_REQUEST':
        return dcrs.filter(
          (d) => d.status === 'DRAFT' && !d.isDraftCompleted && d.requestType === 'ADD'
        );
      case 'EDIT_CHANGE_CANCEL_REQUEST':
        return dcrs.filter(
          (d) =>
            d.status === 'DRAFT' &&
            !d.isDraftCompleted &&
            (d.requestType === 'CHANGE' || d.requestType === 'CANCEL')
        );
      case 'SEND_TO_QMG':
        return dcrs.filter((d) => d.status === 'DRAFT' && d.isDraftCompleted);
      case 'APPROVE_NEW_DOC':
        return dcrs.filter((d) => d.status === 'PENDING_QMG' && d.requestType === 'ADD');
      case 'APPROVE_CHANGES':
        return dcrs.filter(
          (d) =>
            d.status === 'PENDING_QMG' &&
            (d.requestType === 'CHANGE' || d.requestType === 'CANCEL')
        );
      default:
        return [];
    }
  };

  const queue = getWorkbenchQueue();

  useEffect(() => {
    if (!isOpen || !activeNode) return;
    setErrorMsg(null);

    if (
      activeNode === 'REQUEST_ADD' ||
      activeNode === 'REQUEST_CHANGE' ||
      activeNode === 'REQUEST_CANCEL'
    ) {
      const nextNum = generateNextDcrNumber();
      setDcrNumber(nextNum);
      const rType: RequestType =
        activeNode === 'REQUEST_ADD'
          ? 'ADD'
          : activeNode === 'REQUEST_CHANGE'
          ? 'CHANGE'
          : 'CANCEL';
      setRequestType(rType);

      if (rType === 'ADD') {
        setSelectedDocCode('');
        setDocCode(`SOP-QA-${String(documents.length + 10).padStart(3, '0')}`);
        setDocTitle('');
        setDepartment('Quality Assurance');
        setIsoClause('ISO 9001:2015 Clause 7.5');
        setCurrentRevision('None');
        setProposedRevision('Rev 1.0');
        setJustification('');
        setDraftContent('');
        setIsDraftCompleted(false);
      } else {
        const target = preselectedDoc || activeControllableDocs[0];
        if (target) {
          setSelectedDocCode(target.docCode);
          setDocCode(target.docCode);
          setDocTitle(target.title);
          setDepartment(target.department);
          setIsoClause(target.isoClause);
          setCurrentRevision(target.revision);
          setProposedRevision(
            rType === 'CHANGE' ? incrementRevisionString(target.revision) : 'Obsolete'
          );
          setJustification('');
          setDraftContent(
            rType === 'CHANGE'
              ? `${target.summary}\n\n[Proposed Revision Notes]: `
              : `Obsolete and withdraw all controlled copies of ${target.docCode} (${target.title}).`
          );
        }
        setIsDraftCompleted(false);
      }
      return;
    }

    // For Edit / Send / Review nodes, select initialSelectedDcr or first item in queue
    const targetDcr = initialSelectedDcr || queue[0] || null;
    if (targetDcr) {
      setSelectedDcrId(targetDcr.id);
      populateFromDcr(targetDcr);
    } else {
      setSelectedDcrId('');
    }
  }, [isOpen, activeNode, initialSelectedDcr, preselectedDoc]);

  const populateFromDcr = (dcr: DcrRequest) => {
    setRequestType(dcr.requestType);
    setDcrNumber(dcr.dcrNumber);
    setDocCode(dcr.docCode);
    setDocTitle(dcr.docTitle);
    setDepartment(dcr.department);
    setIsoClause(dcr.isoClause);
    setCurrentRevision(dcr.currentRevision);
    setProposedRevision(dcr.proposedRevision);
    setJustification(dcr.justification);
    setDraftContent(dcr.draftContent);
    setIsDraftCompleted(dcr.isDraftCompleted);
    setQmgReviewerName(userDisplayName || 'QMG Lead Auditor');
    setQmgComments(
      dcr.requestType === 'ADD'
        ? `Approved initial release (${dcr.proposedRevision}) of ${dcr.docCode} for inclusion in the Controlled Document Master List.`
        : dcr.requestType === 'CHANGE'
        ? `Approved revision update (${dcr.currentRevision} -> ${dcr.proposedRevision}) for ${dcr.docCode}.`
        : `Approved cancellation and controlled copy recall for ${dcr.docCode}.`
    );
  };

  if (!isOpen || !activeNode) return null;

  const isCreateMode =
    activeNode === 'REQUEST_ADD' ||
    activeNode === 'REQUEST_CHANGE' ||
    activeNode === 'REQUEST_CANCEL';

  const isQmgApprovalMode =
    activeNode === 'APPROVE_NEW_DOC' || activeNode === 'APPROVE_CHANGES';

  const isSendToQmgMode = activeNode === 'SEND_TO_QMG';

  const currentDcr = dcrs.find((d) => d.id === selectedDcrId) || null;

  const handleExistingDocChange = (code: string) => {
    setSelectedDocCode(code);
    const found = documents.find((d) => d.docCode === code);
    if (found) {
      setDocCode(found.docCode);
      setDocTitle(found.title);
      setDepartment(found.department);
      setIsoClause(found.isoClause);
      setCurrentRevision(found.revision);
      setProposedRevision(
        requestType === 'CHANGE' ? incrementRevisionString(found.revision) : 'Obsolete'
      );
      setDraftContent(
        requestType === 'CHANGE'
          ? `${found.summary}\n\n[Proposed Revision Redline]: `
          : `Cancel controlled document ${found.docCode} and recall distributed copies.`
      );
    }
  };

  const handleCreateSubmit = async (submitDirectlyToQmg: boolean) => {
    setErrorMsg(null);
    if (docCode.trim().length < 2) {
      setErrorMsg('Please provide a valid ISO Document Code (e.g., SOP-QA-015).');
      return;
    }
    if (docTitle.trim().length < 3) {
      setErrorMsg('Please provide a Document Title (at least 3 characters).');
      return;
    }
    if (justification.trim().length < 5) {
      setErrorMsg('Please provide a requirement justification (at least 5 characters).');
      return;
    }
    if (draftContent.trim().length < 5) {
      setErrorMsg('Please provide draft content or change details (at least 5 characters).');
      return;
    }

    setSubmitting(true);
    try {
      const finalCompleted = submitDirectlyToQmg ? true : isDraftCompleted;
      await createDcrRequestRecord(
        {
          ownerId: userUid,
          dcrNumber,
          requestType,
          docCode,
          docTitle,
          department,
          isoClause,
          currentRevision,
          proposedRevision,
          justification,
          draftContent,
          isDraftCompleted: finalCompleted,
          submitImmediatelyToQmg: submitDirectlyToQmg,
          requesterName: userDisplayName || 'ISO Quality Engineer',
        },
        documents
      );
      onSuccessMessage(
        submitDirectlyToQmg
          ? `${dcrNumber} (${docCode}) created and sent to QMG for review.`
          : `${dcrNumber} (${docCode}) saved to Draft workbench.`
      );
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save DCR request.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateDraft = async (sendToQmgNow: boolean) => {
    if (!currentDcr) return;
    setErrorMsg(null);
    if (justification.trim().length < 5 || draftContent.trim().length < 5) {
      setErrorMsg('Justification and Draft Content must each be at least 5 characters.');
      return;
    }
    setSubmitting(true);
    try {
      const nextCompleted = sendToQmgNow ? true : isDraftCompleted;
      await updateDcrDraftRecord(currentDcr, {
        docCode,
        docTitle,
        department,
        isoClause,
        currentRevision,
        proposedRevision,
        justification,
        draftContent,
        isDraftCompleted: nextCompleted,
        submitToQmg: sendToQmgNow,
      });
      onSuccessMessage(
        sendToQmgNow
          ? `${currentDcr.dcrNumber} marked Completed and transmitted to QMG for review.`
          : `${currentDcr.dcrNumber} draft updated (${nextCompleted ? 'Completed' : 'Incomplete'}).`
      );
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to update DCR draft.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickSendToQmg = async (dcr: DcrRequest) => {
    setErrorMsg(null);
    setSubmitting(true);
    try {
      await sendCompletedDcrToQmg(dcr);
      onSuccessMessage(`${dcr.dcrNumber} (${dcr.docCode}) transmitted to QMG Review Queue.`);
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to send DCR to QMG.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleQmgDecision = async (decision: QmgDecision) => {
    if (!currentDcr) return;
    setErrorMsg(null);
    setSubmitting(true);
    try {
      await executeQmgReviewDecision(
        currentDcr,
        decision,
        qmgReviewerName,
        qmgComments,
        documents,
        distributions
      );
      const actionLabel =
        decision === 'APPROVE'
          ? `Approved ${currentDcr.dcrNumber} and synchronized Document Master List & Change Log.`
          : decision === 'RETURN_TO_DRAFT'
          ? `Returned ${currentDcr.dcrNumber} to author Draft queue for further editing.`
          : `Rejected ${currentDcr.dcrNumber}.`;
      onSuccessMessage(actionLabel);
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to process QMG decision.');
    } finally {
      setSubmitting(false);
    }
  };

  const getModalHeading = () => {
    switch (activeNode) {
      case 'REQUEST_ADD':
        return 'Request to Add a New Controlled Document';
      case 'REQUEST_CHANGE':
        return 'Request to Change an Existing Document';
      case 'REQUEST_CANCEL':
        return 'Request to Cancel an Existing Document';
      case 'JUSTIFY_DRAFT':
        return 'Justify Requirement & Draft Document Workbench';
      case 'DECISION_COMPLETED':
        return 'Completion Gate ("Completed?") — Draft Inspection';
      case 'EDIT_ADD_REQUEST':
        return 'Edit Document Add Request (Incomplete Drafts)';
      case 'EDIT_CHANGE_CANCEL_REQUEST':
        return 'Edit Change / Cancellation Request (Incomplete Drafts)';
      case 'SEND_TO_QMG':
        return 'Send Completed DCRs to QMG for Review';
      case 'APPROVE_NEW_DOC':
        return 'QMG Review & Approve New Document';
      case 'APPROVE_CHANGES':
        return 'QMG Review & Approve Document Changes / Cancellations';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-3xl shadow-xl overflow-hidden my-8">
        {/* Modal Header */}
        <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div>
            <div className="text-xs font-mono text-slate-500">
              frmDocChangeSwitchboard · Workflow Action
            </div>
            <h2 className="text-lg font-bold text-slate-900">{getModalHeading()}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-200/60 transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 max-h-[80vh] overflow-y-auto space-y-5">
          {errorMsg && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-lg flex items-start gap-2.5 text-xs text-rose-800">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="break-all">{errorMsg}</div>
            </div>
          )}

          {/* MODE 1: CREATE NEW DCR (ADD / CHANGE / CANCEL) */}
          {isCreateMode && (
            <div className="space-y-4">
              {/* Request Type Summary Bar */}
              <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600">
                <div className="flex items-center gap-2 font-medium text-slate-900">
                  {requestType === 'ADD' && <FilePlus2 className="w-4 h-4 text-slate-700" />}
                  {requestType === 'CHANGE' && <FileEdit className="w-4 h-4 text-slate-700" />}
                  {requestType === 'CANCEL' && <FileX2 className="w-4 h-4 text-rose-700" />}
                  <span>
                    DCR Type:{' '}
                    {requestType === 'ADD'
                      ? 'Add New Controlled Document'
                      : requestType === 'CHANGE'
                      ? 'Revise Existing Controlled Document'
                      : 'Cancel & Obsolete Controlled Document'}
                  </span>
                </div>
                <span className="font-mono font-semibold text-slate-900 tabular-nums">
                  {dcrNumber}
                </span>
              </div>

              {/* Target Document Selector when CHANGE or CANCEL */}
              {(requestType === 'CHANGE' || requestType === 'CANCEL') && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Select Target Controlled Document from Master List
                  </label>
                  <select
                    value={selectedDocCode}
                    onChange={(e) => handleExistingDocChange(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-slate-900"
                  >
                    {activeControllableDocs.map((docItem) => (
                      <option key={docItem.id} value={docItem.docCode}>
                        {docItem.docCode} — {docItem.title} ({docItem.revision} ·{' '}
                        {docItem.department})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Document Code
                  </label>
                  <input
                    type="text"
                    value={docCode}
                    readOnly={requestType !== 'ADD'}
                    onChange={(e) => setDocCode(e.target.value)}
                    placeholder="e.g., SOP-QA-015"
                    className={`w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg ${
                      requestType !== 'ADD' ? 'bg-slate-100 text-slate-600' : 'bg-white'
                    }`}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Current Revision
                  </label>
                  <input
                    type="text"
                    value={currentRevision}
                    readOnly
                    className="w-full px-3 py-2 text-sm font-mono bg-slate-100 text-slate-600 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Proposed Revision
                  </label>
                  <input
                    type="text"
                    value={proposedRevision}
                    onChange={(e) => setProposedRevision(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Document Title
                  </label>
                  <input
                    type="text"
                    value={docTitle}
                    onChange={(e) => setDocTitle(e.target.value)}
                    placeholder="Enter controlled document title"
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Department
                    </label>
                    <select
                      value={department}
                      onChange={(e) => setDepartment(e.target.value as Department)}
                      className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                    >
                      {DEPARTMENTS.map((dept) => (
                        <option key={dept} value={dept}>
                          {dept}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      ISO Standard Clause
                    </label>
                    <input
                      type="text"
                      value={isoClause}
                      onChange={(e) => setIsoClause(e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Justify Requirement (Reason for Addition, Change, or Cancellation)
                </label>
                <textarea
                  rows={3}
                  value={justification}
                  onChange={(e) => setJustification(e.target.value)}
                  placeholder="State the regulatory, operational, or audit nonconformity reason requiring this DCR..."
                  className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {requestType === 'ADD'
                    ? 'Draft New Document Normative Content & Scope'
                    : requestType === 'CHANGE'
                    ? 'Proposed Redline Changes & Updated Procedure Clauses'
                    : 'Cancellation & Controlled Copy Withdrawal Disposition'}
                </label>
                <textarea
                  rows={4}
                  value={draftContent}
                  onChange={(e) => setDraftContent(e.target.value)}
                  placeholder="Enter the drafted clauses, redline modifications, or copy recall instructions..."
                  className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                />
              </div>

              {/* Decision Diamond Gate Checkbox: Completed? */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between gap-4">
                <div>
                  <div className="text-xs font-semibold text-slate-900">
                    Flowchart Decision Gate: Completed?
                  </div>
                  <div className="text-xs text-slate-500">
                    Mark &ldquo;Yes&rdquo; if justification and draft are complete and ready for
                    QMG review. Leave unchecked (&ldquo;No&rdquo;) to keep in the Edit Request
                    queue.
                  </div>
                </div>
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-900 cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={isDraftCompleted}
                    onChange={(e) => setIsDraftCompleted(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-slate-900"
                  />
                  <span>{isDraftCompleted ? 'Yes (Completed)' : 'No (Incomplete)'}</span>
                </label>
              </div>

              {/* Action Footer */}
              <div className="flex flex-wrap items-center justify-end gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap shrink-0"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => handleCreateSubmit(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-900 bg-slate-100 border border-slate-300 rounded-lg hover:bg-slate-200 cursor-pointer whitespace-nowrap shrink-0"
                >
                  Save to Draft Stage
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => handleCreateSubmit(true)}
                  className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Complete &amp; Send to QMG</span>
                </button>
              </div>
            </div>
          )}

          {/* MODE 2: WORKBENCH / EDIT / SEND TO QMG / QMG APPROVAL */}
          {!isCreateMode && (
            <div className="space-y-5">
              {/* Queue Selector Strip */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Select DCR Record in This Workflow Stage ({queue.length} available)
                </label>
                {queue.length === 0 ? (
                  <div className="p-6 bg-slate-50 border border-slate-200 rounded-lg text-center space-y-2">
                    <div className="text-sm font-semibold text-slate-800">
                      No DCR records currently waiting at this workflow node
                    </div>
                    <p className="text-xs text-slate-500 max-w-md mx-auto">
                      All items at this step have already been processed. You can initiate a new
                      request from the top row of the Document Management Switchboard.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {queue.map((item) => {
                      const active = item.id === selectedDcrId;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            setSelectedDcrId(item.id);
                            populateFromDcr(item);
                          }}
                          className={`p-3 rounded-lg border text-left transition-colors cursor-pointer ${
                            active
                              ? 'bg-slate-900 text-white border-slate-900'
                              : 'bg-white text-slate-900 border-slate-200 hover:border-slate-400'
                          }`}
                        >
                          <div className="flex items-center justify-between text-xs font-mono tabular-nums">
                            <span className="font-semibold">{item.dcrNumber}</span>
                            <span className={active ? 'text-slate-300' : 'text-slate-500'}>
                              {item.requestType} · {item.docCode}
                            </span>
                          </div>
                          <div className="text-xs font-medium truncate mt-1">{item.docTitle}</div>
                          <div
                            className={`text-[11px] mt-1 ${
                              active ? 'text-slate-300' : 'text-slate-500'
                            }`}
                          >
                            {item.department} · Completed: {item.isDraftCompleted ? 'Yes' : 'No'}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Active DCR Editor or QMG Review Form */}
              {currentDcr && (
                <div className="pt-4 border-t border-slate-200 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600">
                    <div>
                      <span className="font-mono font-semibold text-slate-900">
                        {currentDcr.dcrNumber}
                      </span>
                      <span className="mx-2" aria-hidden="true">
                        ·
                      </span>
                      <span>Type: {currentDcr.requestType}</span>
                      <span className="mx-2" aria-hidden="true">
                        ·
                      </span>
                      <span>Initiator: {currentDcr.requesterName}</span>
                    </div>
                    <div className="font-mono tabular-nums">
                      {currentDcr.currentRevision} → {currentDcr.proposedRevision}
                    </div>
                  </div>

                  {/* If in SEND_TO_QMG mode, show summary and prominent Send button */}
                  {isSendToQmgMode && (
                    <div className="space-y-4">
                      <div className="p-4 bg-white border border-slate-200 rounded-lg space-y-2 text-xs">
                        <div className="font-semibold text-slate-900 text-sm">
                          {currentDcr.docCode} — {currentDcr.docTitle}
                        </div>
                        <div className="text-slate-600">
                          <span className="font-semibold text-slate-800">Justification: </span>
                          {currentDcr.justification}
                        </div>
                        <div className="text-slate-600">
                          <span className="font-semibold text-slate-800">Draft Summary: </span>
                          {currentDcr.draftContent}
                        </div>
                      </div>
                      <div className="flex items-center justify-end gap-3">
                        <button
                          type="button"
                          onClick={onClose}
                          className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
                        >
                          Close
                        </button>
                        <button
                          type="button"
                          disabled={submitting}
                          onClick={() => handleQuickSendToQmg(currentDcr)}
                          className="px-5 py-2.5 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 flex items-center gap-2 cursor-pointer"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>Send {currentDcr.dcrNumber} to QMG for Review</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* If in Edit / Justify / Completed Gate mode */}
                  {!isSendToQmgMode && !isQmgApprovalMode && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1">
                            Document Code
                          </label>
                          <input
                            type="text"
                            value={docCode}
                            onChange={(e) => setDocCode(e.target.value)}
                            className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1">
                            Proposed Revision
                          </label>
                          <input
                            type="text"
                            value={proposedRevision}
                            onChange={(e) => setProposedRevision(e.target.value)}
                            className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1">
                            ISO Clause
                          </label>
                          <input
                            type="text"
                            value={isoClause}
                            onChange={(e) => setIsoClause(e.target.value)}
                            className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Document Title
                        </label>
                        <input
                          type="text"
                          value={docTitle}
                          onChange={(e) => setDocTitle(e.target.value)}
                          className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Requirement Justification
                        </label>
                        <textarea
                          rows={3}
                          value={justification}
                          onChange={(e) => setJustification(e.target.value)}
                          className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Draft Content / Redline Specification
                        </label>
                        <textarea
                          rows={4}
                          value={draftContent}
                          onChange={(e) => setDraftContent(e.target.value)}
                          className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                        />
                      </div>

                      <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between gap-4">
                        <div>
                          <div className="text-xs font-semibold text-slate-900">
                            Flowchart Decision Diamond: Completed?
                          </div>
                          <div className="text-xs text-slate-500">
                            Check &ldquo;Yes&rdquo; once the justification and draft are complete.
                          </div>
                        </div>
                        <label className="flex items-center gap-2 text-xs font-semibold text-slate-900 cursor-pointer shrink-0">
                          <input
                            type="checkbox"
                            checked={isDraftCompleted}
                            onChange={(e) => setIsDraftCompleted(e.target.checked)}
                            className="w-4 h-4 rounded border-slate-300"
                          />
                          <span>{isDraftCompleted ? 'Yes (Completed)' : 'No (Incomplete)'}</span>
                        </label>
                      </div>

                      <div className="flex flex-wrap items-center justify-end gap-3 pt-3 border-t border-slate-200">
                        <button
                          type="button"
                          onClick={onClose}
                          className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={submitting}
                          onClick={() => handleUpdateDraft(false)}
                          className="px-4 py-2 text-xs font-semibold text-slate-900 bg-slate-100 border border-slate-300 rounded-lg hover:bg-slate-200 cursor-pointer"
                        >
                          Save Draft Changes
                        </button>
                        <button
                          type="button"
                          disabled={submitting}
                          onClick={() => handleUpdateDraft(true)}
                          className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 flex items-center gap-1.5 cursor-pointer"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>Mark Completed &amp; Send to QMG</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* If in QMG Review & Approval Mode */}
                  {isQmgApprovalMode && (
                    <div className="space-y-4">
                      <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-2.5 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-sm text-slate-900">
                            {currentDcr.docCode} — {currentDcr.docTitle}
                          </span>
                          <span className="font-mono text-slate-600">
                            {currentDcr.isoClause}
                          </span>
                        </div>
                        <div className="text-slate-700">
                          <span className="font-semibold text-slate-900">Justification: </span>
                          {currentDcr.justification}
                        </div>
                        <div className="text-slate-700">
                          <span className="font-semibold text-slate-900">
                            Draft / Change Specification:{' '}
                          </span>
                          {currentDcr.draftContent}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1">
                            QMG Approver / Auditor Name
                          </label>
                          <input
                            type="text"
                            value={qmgReviewerName}
                            onChange={(e) => setQmgReviewerName(e.target.value)}
                            className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1">
                            Target Master List Action on Approval
                          </label>
                          <div className="px-3 py-2 text-xs font-mono bg-slate-100 border border-slate-300 rounded-lg text-slate-700">
                            {currentDcr.requestType === 'ADD'
                              ? `Publish ${currentDcr.docCode} (${currentDcr.proposedRevision}) as ACTIVE`
                              : currentDcr.requestType === 'CHANGE'
                              ? `Update ${currentDcr.docCode} to ${currentDcr.proposedRevision}`
                              : `Mark ${currentDcr.docCode} CANCELLED & Recall Copies`}
                          </div>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          QMG Review Comments &amp; Audit Sign-Off Note
                        </label>
                        <textarea
                          rows={3}
                          value={qmgComments}
                          onChange={(e) => setQmgComments(e.target.value)}
                          className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                        />
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-200">
                        <button
                          type="button"
                          disabled={submitting}
                          onClick={() => handleQmgDecision('REJECT')}
                          className="px-3.5 py-2 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg hover:bg-rose-100 flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Reject DCR</span>
                        </button>

                        <div className="flex flex-wrap items-center gap-2.5">
                          <button
                            type="button"
                            disabled={submitting}
                            onClick={() => handleQmgDecision('RETURN_TO_DRAFT')}
                            className="px-4 py-2 text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>Return to Edit Request (No)</span>
                          </button>

                          <button
                            type="button"
                            disabled={submitting}
                            onClick={() => handleQmgDecision('APPROVE')}
                            className="px-5 py-2 text-xs font-semibold text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            <span>
                              {currentDcr.requestType === 'ADD'
                                ? 'Approve & Publish New Document'
                                : 'Approve Changes & Update Master List'}
                            </span>
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
