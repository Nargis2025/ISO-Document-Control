import React, { useState, useMemo } from 'react';
import {
  Download,
  Printer,
  Search,
  CheckCircle2,
  Clock,
  XCircle,
  AlertTriangle,
  Plus,
  FileEdit,
  FileX2,
  Send,
  ClipboardCheck,
  Eye,
  Check,
  RotateCcw,
} from 'lucide-react';
import {
  DEPARTMENTS,
  Department,
  DcrRequest,
  IsoDocument,
  DocumentChangeLog,
  DocumentDistribution,
  DistributionMedium,
  SystemReportId,
  SwitchboardNodeId,
} from '../types/iso';
import { exportRowsToCsv } from '../utils/validation';
import {
  createControlledDistributionRecord,
  updateDistributionStatusRecord,
  sendCompletedDcrToQmg,
} from '../services/isoService';

interface SystemReportsPanelProps {
  activeReport: SystemReportId;
  userUid: string;
  dcrs: DcrRequest[];
  documents: IsoDocument[];
  changeLogs: DocumentChangeLog[];
  distributions: DocumentDistribution[];
  onSelectReport: (reportId: SystemReportId) => void;
  onOpenDcrWorkflow: (
    node: SwitchboardNodeId,
    dcr?: DcrRequest | null,
    doc?: IsoDocument | null
  ) => void;
  onSuccessMessage: (msg: string) => void;
}

export const SystemReportsPanel: React.FC<SystemReportsPanelProps> = ({
  activeReport,
  userUid,
  dcrs,
  documents,
  changeLogs,
  distributions,
  onSelectReport,
  onOpenDcrWorkflow,
  onSuccessMessage,
}) => {
  // Shared search & filter state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [dateFrom, setDateFrom] = useState<string>('2024-01-01');
  const [dateTo, setDateTo] = useState<string>('2026-12-31');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [deptFilter, setDeptFilter] = useState<string>('ALL');
  const [inspectedDoc, setInspectedDoc] = useState<IsoDocument | null>(null);

  // Issue Controlled Copy state (for Document Distribution report)
  const [showIssueCopyForm, setShowIssueCopyForm] = useState<boolean>(false);
  const [newCopyDocCode, setNewCopyDocCode] = useState<string>(
    documents.find((d) => d.status === 'ACTIVE')?.docCode || 'QM-ISO-001'
  );
  const [newCopyDept, setNewCopyDept] = useState<Department>('Quality Assurance');
  const [newCopyHolder, setNewCopyHolder] = useState<string>('Quality Audit Lead');
  const [newCopyMedium, setNewCopyMedium] = useState<DistributionMedium>('Electronic QMS');
  const [busyActionId, setBusyActionId] = useState<string | null>(null);

  // 1. Filtered DCRs for "DCR by date"
  const filteredDcrsByDate = useMemo(() => {
    return dcrs
      .filter((d) => {
        if (dateFrom && d.requestDate < dateFrom) return false;
        if (dateTo && d.requestDate > dateTo) return false;
        if (typeFilter !== 'ALL' && d.requestType !== typeFilter) return false;
        if (statusFilter !== 'ALL' && d.status !== statusFilter) return false;
        if (deptFilter !== 'ALL' && d.department !== deptFilter) return false;
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          return (
            d.dcrNumber.toLowerCase().includes(q) ||
            d.docCode.toLowerCase().includes(q) ||
            d.docTitle.toLowerCase().includes(q) ||
            d.requesterName.toLowerCase().includes(q)
          );
        }
        return true;
      })
      .sort((a, b) => b.requestDate.localeCompare(a.requestDate));
  }, [dcrs, dateFrom, dateTo, typeFilter, statusFilter, deptFilter, searchQuery]);

  // 2. Filtered Change Logs for "Document Change Log"
  const filteredChangeLogs = useMemo(() => {
    return changeLogs
      .filter((l) => {
        if (typeFilter !== 'ALL' && l.actionType !== typeFilter) return false;
        if (deptFilter !== 'ALL' && l.department !== deptFilter) return false;
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          return (
            l.dcrNumber.toLowerCase().includes(q) ||
            l.docCode.toLowerCase().includes(q) ||
            l.docTitle.toLowerCase().includes(q) ||
            l.summary.toLowerCase().includes(q)
          );
        }
        return true;
      })
      .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate));
  }, [changeLogs, typeFilter, deptFilter, searchQuery]);

  // 3. Filtered Documents for "Document Master List"
  const filteredMasterDocs = useMemo(() => {
    return documents
      .filter((docItem) => {
        if (statusFilter !== 'ALL' && docItem.status !== statusFilter) return false;
        if (deptFilter !== 'ALL' && docItem.department !== deptFilter) return false;
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          return (
            docItem.docCode.toLowerCase().includes(q) ||
            docItem.title.toLowerCase().includes(q) ||
            docItem.isoClause.toLowerCase().includes(q) ||
            docItem.authorName.toLowerCase().includes(q)
          );
        }
        return true;
      })
      .sort((a, b) => a.docCode.localeCompare(b.docCode));
  }, [documents, statusFilter, deptFilter, searchQuery]);

  // 4. Filtered Distributions for "Document Distribution"
  const filteredDistributions = useMemo(() => {
    return distributions
      .filter((dist) => {
        if (deptFilter !== 'ALL' && dist.recipientDepartment !== deptFilter) return false;
        if (statusFilter !== 'ALL' && dist.distributionStatus !== statusFilter) return false;
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          return (
            dist.copyNumber.toLowerCase().includes(q) ||
            dist.docCode.toLowerCase().includes(q) ||
            dist.docTitle.toLowerCase().includes(q) ||
            dist.holderRole.toLowerCase().includes(q)
          );
        }
        return true;
      })
      .sort((a, b) => a.copyNumber.localeCompare(b.copyNumber));
  }, [distributions, deptFilter, statusFilter, searchQuery]);

  // 5. Annual DCR Pivot for "Summary of DCR by year"
  const yearlySummaryRows = useMemo(() => {
    const map = new Map<
      number,
      {
        year: number;
        total: number;
        addCount: number;
        changeCount: number;
        cancelCount: number;
        approvedCount: number;
        pendingQmgCount: number;
        draftCount: number;
        rejectedCount: number;
      }
    >();

    for (const d of dcrs) {
      const y = d.requestYear || Number(d.requestDate.slice(0, 4)) || 2026;
      if (!map.has(y)) {
        map.set(y, {
          year: y,
          total: 0,
          addCount: 0,
          changeCount: 0,
          cancelCount: 0,
          approvedCount: 0,
          pendingQmgCount: 0,
          draftCount: 0,
          rejectedCount: 0,
        });
      }
      const row = map.get(y)!;
      row.total += 1;
      if (d.requestType === 'ADD') row.addCount += 1;
      if (d.requestType === 'CHANGE') row.changeCount += 1;
      if (d.requestType === 'CANCEL') row.cancelCount += 1;
      if (d.status === 'APPROVED') row.approvedCount += 1;
      if (d.status === 'PENDING_QMG') row.pendingQmgCount += 1;
      if (d.status === 'DRAFT') row.draftCount += 1;
      if (d.status === 'REJECTED') row.rejectedCount += 1;
    }

    return Array.from(map.values()).sort((a, b) => b.year - a.year);
  }, [dcrs]);

  // 6. Pending DCRs for "List of DCRs pending approval"
  const pendingApprovalDcrs = useMemo(() => {
    return dcrs
      .filter((d) => d.status === 'PENDING_QMG' || d.status === 'DRAFT')
      .sort((a, b) => {
        if (a.status === 'PENDING_QMG' && b.status !== 'PENDING_QMG') return -1;
        if (a.status !== 'PENDING_QMG' && b.status === 'PENDING_QMG') return 1;
        return b.requestDate.localeCompare(a.requestDate);
      });
  }, [dcrs]);

  const reportTabs: { id: SystemReportId; label: string }[] = [
    { id: 'DCR_BY_DATE', label: 'DCR by date' },
    { id: 'CHANGE_LOG', label: 'Document Change Log' },
    { id: 'MASTER_LIST', label: 'Document Master List' },
    { id: 'DISTRIBUTION', label: 'Document Distribution' },
    { id: 'DCR_BY_YEAR', label: 'Summary of DCR by year' },
    { id: 'PENDING_APPROVAL', label: 'List of DCRs pending approval' },
  ];

  const handleExportCurrentReportCsv = () => {
    if (activeReport === 'DCR_BY_DATE') {
      exportRowsToCsv(
        `ISO_DCR_By_Date_${dateFrom}_to_${dateTo}.csv`,
        [
          'DCR Number',
          'Request Date',
          'Type',
          'Document Code',
          'Document Title',
          'Department',
          'ISO Clause',
          'Current Rev',
          'Proposed Rev',
          'Completed Gate',
          'Status',
          'Requester',
          'QMG Reviewer',
        ],
        filteredDcrsByDate.map((d) => [
          d.dcrNumber,
          d.requestDate,
          d.requestType,
          d.docCode,
          d.docTitle,
          d.department,
          d.isoClause,
          d.currentRevision,
          d.proposedRevision,
          d.isDraftCompleted ? 'Yes' : 'No',
          d.status,
          d.requesterName,
          d.qmgReviewerName,
        ])
      );
    } else if (activeReport === 'CHANGE_LOG') {
      exportRowsToCsv(
        'ISO_Document_Change_Log.csv',
        [
          'Effective Date',
          'DCR Number',
          'Action Type',
          'Document Code',
          'Document Title',
          'Previous Rev',
          'New Rev',
          'Department',
          'QMG Actor',
          'Summary',
        ],
        filteredChangeLogs.map((l) => [
          l.effectiveDate,
          l.dcrNumber,
          l.actionType,
          l.docCode,
          l.docTitle,
          l.previousRevision,
          l.newRevision,
          l.department,
          l.actorName,
          l.summary,
        ])
      );
    } else if (activeReport === 'MASTER_LIST') {
      exportRowsToCsv(
        'ISO_Document_Master_List.csv',
        [
          'Document Code',
          'Title',
          'Revision',
          'Status',
          'Effective Date',
          'Department',
          'ISO Clause',
          'Author',
          'Approver',
        ],
        filteredMasterDocs.map((d) => [
          d.docCode,
          d.title,
          d.revision,
          d.status,
          d.effectiveDate,
          d.department,
          d.isoClause,
          d.authorName,
          d.approverName,
        ])
      );
    } else if (activeReport === 'DISTRIBUTION') {
      exportRowsToCsv(
        'ISO_Document_Distribution_Matrix.csv',
        [
          'Copy Number',
          'Document Code',
          'Document Title',
          'Revision',
          'Recipient Department',
          'Holder Role',
          'Medium',
          'Status',
          'Distributed Date',
        ],
        filteredDistributions.map((dist) => [
          dist.copyNumber,
          dist.docCode,
          dist.docTitle,
          dist.revision,
          dist.recipientDepartment,
          dist.holderRole,
          dist.medium,
          dist.distributionStatus,
          dist.distributedDate,
        ])
      );
    } else if (activeReport === 'DCR_BY_YEAR') {
      exportRowsToCsv(
        'ISO_Summary_DCR_By_Year.csv',
        [
          'Year',
          'Total DCRs',
          'Add Requests',
          'Change Requests',
          'Cancel Requests',
          'Approved',
          'Pending QMG',
          'In Draft',
        ],
        yearlySummaryRows.map((r) => [
          r.year,
          r.total,
          r.addCount,
          r.changeCount,
          r.cancelCount,
          r.approvedCount,
          r.pendingQmgCount,
          r.draftCount,
        ])
      );
    } else {
      exportRowsToCsv(
        'ISO_DCRs_Pending_Approval.csv',
        [
          'DCR Number',
          'Request Date',
          'Type',
          'Document Code',
          'Title',
          'Department',
          'Proposed Rev',
          'Completed Gate',
          'Status',
          'Requester',
        ],
        pendingApprovalDcrs.map((d) => [
          d.dcrNumber,
          d.requestDate,
          d.requestType,
          d.docCode,
          d.docTitle,
          d.department,
          d.proposedRevision,
          d.isDraftCompleted ? 'Yes' : 'No',
          d.status,
          d.requesterName,
        ])
      );
    }
  };

  const handleIssueControlledCopy = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetDoc = documents.find((d) => d.docCode === newCopyDocCode);
    if (!targetDoc) return;
    const nextCopyNum = `CC-${newCopyDept.slice(0, 3).toUpperCase()}-${String(
      distributions.length + 1
    ).padStart(2, '0')}`;

    setBusyActionId('issue-copy');
    try {
      await createControlledDistributionRecord({
        ownerId: userUid,
        copyNumber: nextCopyNum,
        docCode: targetDoc.docCode,
        docTitle: targetDoc.title,
        revision: targetDoc.revision,
        recipientDepartment: newCopyDept,
        holderRole: newCopyHolder,
        medium: newCopyMedium,
      });
      setShowIssueCopyForm(false);
      onSuccessMessage(`Issued Controlled Copy ${nextCopyNum} for ${targetDoc.docCode}.`);
    } finally {
      setBusyActionId(null);
    }
  };

  const handleToggleDistributionStatus = async (
    dist: DocumentDistribution,
    nextStatus: 'ACKNOWLEDGED' | 'RECALLED'
  ) => {
    setBusyActionId(dist.id);
    try {
      await updateDistributionStatusRecord(dist, nextStatus);
      onSuccessMessage(
        nextStatus === 'ACKNOWLEDGED'
          ? `Copy ${dist.copyNumber} acknowledged by ${dist.holderRole}.`
          : `Copy ${dist.copyNumber} recalled and marked obsolete.`
      );
    } finally {
      setBusyActionId(null);
    }
  };

  const handleDirectSendToQmg = async (dcr: DcrRequest) => {
    setBusyActionId(dcr.id);
    try {
      await sendCompletedDcrToQmg(dcr);
      onSuccessMessage(`${dcr.dcrNumber} transmitted to QMG for review.`);
    } finally {
      setBusyActionId(null);
    }
  };

  const renderStatusText = (status: string) => {
    if (status === 'APPROVED' || status === 'ACTIVE' || status === 'ACKNOWLEDGED') {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 whitespace-nowrap">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          <span>{status}</span>
        </span>
      );
    }
    if (
      status === 'PENDING_QMG' ||
      status === 'UNDER_REVISION' ||
      status === 'DISTRIBUTED'
    ) {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 whitespace-nowrap">
          <Clock className="w-3.5 h-3.5 shrink-0" />
          <span>{status === 'PENDING_QMG' ? 'PENDING QMG' : status.replace('_', ' ')}</span>
        </span>
      );
    }
    if (status === 'DRAFT') {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 whitespace-nowrap">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span>DRAFT</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-rose-700 whitespace-nowrap">
        <XCircle className="w-3.5 h-3.5 shrink-0" />
        <span>{status}</span>
      </span>
    );
  };

  return (
    <section
      aria-label="ISO System Reports Register"
      className="bg-white border border-slate-200 rounded-xl p-5 sm:p-8 space-y-6"
    >
      {/* Top Report Selector & Export Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-slate-200">
        <div>
          <div className="text-xs font-mono text-slate-500">
            ISO 9001:2015 Compliance Register · Live System Reports
          </div>
          <h2 className="text-xl font-bold text-slate-900 mt-0.5">
            {reportTabs.find((t) => t.id === activeReport)?.label}
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 no-print">
          <button
            type="button"
            onClick={handleExportCurrentReportCsv}
            className="px-3.5 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download CSV</span>
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="px-3.5 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print Audit Report</span>
          </button>
        </div>
      </div>

      {/* Interactive Report Tab Switcher */}
      <div className="flex items-center gap-1 p-1 bg-slate-100 border border-slate-200 rounded-lg overflow-x-auto no-print">
        {reportTabs.map((tab) => {
          const active = activeReport === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setTypeFilter('ALL');
                setStatusFilter('ALL');
                onSelectReport(tab.id);
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                active
                  ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Filter Bar (Shown on tabular reports) */}
      {activeReport !== 'DCR_BY_YEAR' && (
        <div className="flex flex-wrap items-center gap-3 pt-1 no-print">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter by Document Code, DCR #, title, or person..."
              className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-slate-900"
            />
          </div>

          {activeReport === 'DCR_BY_DATE' && (
            <>
              <div className="flex items-center gap-1.5 text-xs text-slate-600">
                <span>From</span>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="px-2.5 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded-lg"
                />
                <span>To</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="px-2.5 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded-lg"
                />
              </div>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg"
              >
                <option value="ALL">All Types (Add/Change/Cancel)</option>
                <option value="ADD">Add Document</option>
                <option value="CHANGE">Change Document</option>
                <option value="CANCEL">Cancel Document</option>
              </select>
            </>
          )}

          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            className="px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg"
          >
            <option value="ALL">All Departments</option>
            {DEPARTMENTS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>

          {activeReport === 'MASTER_LIST' && (
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg"
            >
              <option value="ALL">All Document Statuses</option>
              <option value="ACTIVE">Active Controlled</option>
              <option value="UNDER_REVISION">Under Revision</option>
              <option value="CANCELLED">Cancelled / Obsolete</option>
            </select>
          )}
        </div>
      )}

      {/* REPORT 1: DCR BY DATE */}
      {activeReport === 'DCR_BY_DATE' && (
        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600">
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">DCR #</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">Document</th>
                <th className="py-3 px-4">Department</th>
                <th className="py-3 px-4">Rev Transition</th>
                <th className="py-3 px-4">Completed?</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right no-print">Workflow Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs">
              {filteredDcrsByDate.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-500">
                    No Document Change Requests match the selected date range and filters.
                  </td>
                </tr>
              ) : (
                filteredDcrsByDate.map((dcr) => (
                  <tr key={dcr.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 font-mono tabular-nums text-slate-600 whitespace-nowrap">
                      {dcr.requestDate}
                    </td>
                    <td className="py-3 px-4 font-mono font-semibold text-slate-900 whitespace-nowrap">
                      {dcr.dcrNumber}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-700 whitespace-nowrap">
                      {dcr.requestType}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-mono font-semibold text-slate-900">{dcr.docCode}</div>
                      <div className="text-slate-600 truncate max-w-xs">{dcr.docTitle}</div>
                    </td>
                    <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                      {dcr.department}
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums text-slate-700 whitespace-nowrap">
                      {dcr.currentRevision} → {dcr.proposedRevision}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-700 whitespace-nowrap">
                      {dcr.isDraftCompleted ? 'Yes' : 'No'}
                    </td>
                    <td className="py-3 px-4">{renderStatusText(dcr.status)}</td>
                    <td className="py-3 px-4 text-right whitespace-nowrap no-print">
                      {dcr.status === 'DRAFT' && !dcr.isDraftCompleted && (
                        <button
                          type="button"
                          onClick={() =>
                            onOpenDcrWorkflow(
                              dcr.requestType === 'ADD'
                                ? 'EDIT_ADD_REQUEST'
                                : 'EDIT_CHANGE_CANCEL_REQUEST',
                              dcr
                            )
                          }
                          className="px-2.5 py-1 text-xs font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-md cursor-pointer"
                        >
                          Edit Request
                        </button>
                      )}
                      {dcr.status === 'DRAFT' && dcr.isDraftCompleted && (
                        <button
                          type="button"
                          disabled={busyActionId === dcr.id}
                          onClick={() => handleDirectSendToQmg(dcr)}
                          className="px-2.5 py-1 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-md inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Send className="w-3 h-3" />
                          <span>Send to QMG</span>
                        </button>
                      )}
                      {dcr.status === 'PENDING_QMG' && (
                        <button
                          type="button"
                          onClick={() =>
                            onOpenDcrWorkflow(
                              dcr.requestType === 'ADD' ? 'APPROVE_NEW_DOC' : 'APPROVE_CHANGES',
                              dcr
                            )
                          }
                          className="px-2.5 py-1 text-xs font-medium text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-md inline-flex items-center gap-1 cursor-pointer"
                        >
                          <ClipboardCheck className="w-3 h-3" />
                          <span>QMG Review</span>
                        </button>
                      )}
                      {(dcr.status === 'APPROVED' || dcr.status === 'REJECTED') && (
                        <span className="text-slate-400 font-mono text-[11px]">Closed</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* REPORT 2: DOCUMENT CHANGE LOG */}
      {activeReport === 'CHANGE_LOG' && (
        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600">
                <th className="py-3 px-4">Effective Date</th>
                <th className="py-3 px-4">DCR #</th>
                <th className="py-3 px-4">Action</th>
                <th className="py-3 px-4">Document Code &amp; Title</th>
                <th className="py-3 px-4">Revision Change</th>
                <th className="py-3 px-4">Department</th>
                <th className="py-3 px-4">QMG Approver / Actor</th>
                <th className="py-3 px-4">Audit Trail Summary</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs">
              {filteredChangeLogs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500">
                    No Document Change Log entries match your filter criteria.
                  </td>
                </tr>
              ) : (
                filteredChangeLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 font-mono tabular-nums text-slate-600 whitespace-nowrap">
                      {log.effectiveDate}
                    </td>
                    <td className="py-3 px-4 font-mono font-semibold text-slate-900 whitespace-nowrap">
                      {log.dcrNumber}
                    </td>
                    <td className="py-3 px-4 font-mono font-medium text-slate-800 whitespace-nowrap">
                      {log.actionType}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-mono font-semibold text-slate-900">{log.docCode}</div>
                      <div className="text-slate-600 truncate max-w-xs">{log.docTitle}</div>
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums text-slate-700 whitespace-nowrap">
                      {log.previousRevision} → {log.newRevision}
                    </td>
                    <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                      {log.department}
                    </td>
                    <td className="py-3 px-4 text-slate-700 whitespace-nowrap">{log.actorName}</td>
                    <td className="py-3 px-4 text-slate-600 max-w-md">{log.summary}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* REPORT 3: DOCUMENT MASTER LIST */}
      {activeReport === 'MASTER_LIST' && (
        <div className="space-y-4">
          {inspectedDoc && (
            <div className="p-5 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-xs font-mono text-slate-500">
                    {inspectedDoc.docCode} · {inspectedDoc.isoClause} · {inspectedDoc.department}
                  </div>
                  <h3 className="text-base font-bold text-slate-900 mt-0.5">
                    {inspectedDoc.title} ({inspectedDoc.revision})
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setInspectedDoc(null)}
                  className="text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  Close Reader
                </button>
              </div>
              <p className="text-xs text-slate-700 leading-relaxed">{inspectedDoc.summary}</p>
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200 text-xs text-slate-500">
                <div>
                  Author: {inspectedDoc.authorName} · Approved by: {inspectedDoc.approverName} ·
                  Effective: <span className="font-mono">{inspectedDoc.effectiveDate}</span>
                </div>
                {inspectedDoc.status !== 'CANCELLED' && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onOpenDcrWorkflow('REQUEST_CHANGE', null, inspectedDoc)}
                      className="px-3 py-1.5 text-xs font-semibold text-slate-900 bg-white border border-slate-300 rounded-md hover:bg-slate-100 cursor-pointer"
                    >
                      Request Revision
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenDcrWorkflow('REQUEST_CANCEL', null, inspectedDoc)}
                      className="px-3 py-1.5 text-xs font-semibold text-rose-700 bg-white border border-rose-200 rounded-md hover:bg-rose-50 cursor-pointer"
                    >
                      Request Cancellation
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600">
                  <th className="py-3 px-4">Doc Code</th>
                  <th className="py-3 px-4">Controlled Document Title</th>
                  <th className="py-3 px-4">Rev</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Effective Date</th>
                  <th className="py-3 px-4">Department &amp; Clause</th>
                  <th className="py-3 px-4">QMG Approver</th>
                  <th className="py-3 px-4 text-right no-print">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {filteredMasterDocs.map((docItem) => (
                  <tr key={docItem.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 font-mono font-semibold text-slate-900 whitespace-nowrap">
                      {docItem.docCode}
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-900">{docItem.title}</td>
                    <td className="py-3 px-4 font-mono tabular-nums text-slate-700 whitespace-nowrap">
                      {docItem.revision}
                    </td>
                    <td className="py-3 px-4">{renderStatusText(docItem.status)}</td>
                    <td className="py-3 px-4 font-mono tabular-nums text-slate-600 whitespace-nowrap">
                      {docItem.effectiveDate}
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      <div>{docItem.department}</div>
                      <div className="text-[11px] font-mono text-slate-500">
                        {docItem.isoClause}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                      {docItem.approverName}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap no-print">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setInspectedDoc(docItem)}
                          className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Eye className="w-3 h-3" />
                          <span>Inspect</span>
                        </button>
                        {docItem.status !== 'CANCELLED' && (
                          <>
                            <button
                              type="button"
                              onClick={() => onOpenDcrWorkflow('REQUEST_CHANGE', null, docItem)}
                              className="px-2.5 py-1 text-xs font-medium text-slate-800 bg-slate-100 border border-slate-300 rounded-md hover:bg-slate-200 inline-flex items-center gap-1 cursor-pointer"
                              title="Request to change this document"
                            >
                              <FileEdit className="w-3 h-3" />
                              <span>Change</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => onOpenDcrWorkflow('REQUEST_CANCEL', null, docItem)}
                              className="px-2.5 py-1 text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded-md hover:bg-rose-100 inline-flex items-center gap-1 cursor-pointer"
                              title="Request to cancel this document"
                            >
                              <FileX2 className="w-3 h-3" />
                              <span>Cancel</span>
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* REPORT 4: DOCUMENT DISTRIBUTION */}
      {activeReport === 'DISTRIBUTION' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between no-print">
            <span className="text-xs text-slate-500">
              Tracks controlled copy holders across departments per ISO 9001 Clause 7.5.3.1
            </span>
            <button
              type="button"
              onClick={() => setShowIssueCopyForm(!showIssueCopyForm)}
              className="px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Issue Controlled Copy</span>
            </button>
          </div>

          {showIssueCopyForm && (
            <form
              onSubmit={handleIssueControlledCopy}
              className="p-4 bg-slate-50 border border-slate-200 rounded-lg grid grid-cols-1 sm:grid-cols-5 gap-3 items-end no-print"
            >
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Controlled Document
                </label>
                <select
                  value={newCopyDocCode}
                  onChange={(e) => setNewCopyDocCode(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg"
                >
                  {documents
                    .filter((d) => d.status !== 'CANCELLED')
                    .map((d) => (
                      <option key={d.id} value={d.docCode}>
                        {d.docCode} ({d.revision})
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Recipient Department
                </label>
                <select
                  value={newCopyDept}
                  onChange={(e) => setNewCopyDept(e.target.value as Department)}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg"
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
                  Copy Holder Role
                </label>
                <input
                  type="text"
                  value={newCopyHolder}
                  onChange={(e) => setNewCopyHolder(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Distribution Medium
                </label>
                <select
                  value={newCopyMedium}
                  onChange={(e) => setNewCopyMedium(e.target.value as DistributionMedium)}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg"
                >
                  <option value="Electronic QMS">Electronic QMS</option>
                  <option value="Controlled Hardcopy">Controlled Hardcopy</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={busyActionId === 'issue-copy'}
                  className="w-full px-3 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 cursor-pointer"
                >
                  Issue Copy
                </button>
              </div>
            </form>
          )}

          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600">
                  <th className="py-3 px-4">Copy #</th>
                  <th className="py-3 px-4">Document Code &amp; Title</th>
                  <th className="py-3 px-4">Revision</th>
                  <th className="py-3 px-4">Recipient Department</th>
                  <th className="py-3 px-4">Controlled Copy Holder</th>
                  <th className="py-3 px-4">Medium</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4 text-right no-print">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {filteredDistributions.map((dist) => (
                  <tr key={dist.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 font-mono font-semibold text-slate-900 whitespace-nowrap">
                      {dist.copyNumber}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-mono font-semibold text-slate-900">{dist.docCode}</div>
                      <div className="text-slate-600 truncate max-w-xs">{dist.docTitle}</div>
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums text-slate-700 whitespace-nowrap">
                      {dist.revision}
                    </td>
                    <td className="py-3 px-4 text-slate-700 whitespace-nowrap">
                      {dist.recipientDepartment}
                    </td>
                    <td className="py-3 px-4 text-slate-700 whitespace-nowrap">
                      {dist.holderRole}
                    </td>
                    <td className="py-3 px-4 text-slate-600 whitespace-nowrap">{dist.medium}</td>
                    <td className="py-3 px-4">{renderStatusText(dist.distributionStatus)}</td>
                    <td className="py-3 px-4 font-mono tabular-nums text-slate-600 whitespace-nowrap">
                      {dist.distributedDate}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap no-print">
                      {dist.distributionStatus === 'DISTRIBUTED' && (
                        <button
                          type="button"
                          disabled={busyActionId === dist.id}
                          onClick={() => handleToggleDistributionStatus(dist, 'ACKNOWLEDGED')}
                          className="px-2.5 py-1 text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-md hover:bg-emerald-100 inline-flex items-center gap-1 mr-1.5 cursor-pointer"
                        >
                          <Check className="w-3 h-3" />
                          <span>Acknowledge</span>
                        </button>
                      )}
                      {dist.distributionStatus !== 'RECALLED' ? (
                        <button
                          type="button"
                          disabled={busyActionId === dist.id}
                          onClick={() => handleToggleDistributionStatus(dist, 'RECALLED')}
                          className="px-2.5 py-1 text-xs font-medium text-rose-700 bg-white border border-rose-200 rounded-md hover:bg-rose-50 inline-flex items-center gap-1 cursor-pointer"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Recall</span>
                        </button>
                      ) : (
                        <span className="font-mono text-[11px] text-slate-400">Withdrawn</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* REPORT 5: SUMMARY OF DCR BY YEAR */}
      {activeReport === 'DCR_BY_YEAR' && (
        <div className="space-y-6">
          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600">
                  <th className="py-3 px-4">Calendar Year</th>
                  <th className="py-3 px-4 text-right">Total DCRs</th>
                  <th className="py-3 px-4 text-right">Add Document</th>
                  <th className="py-3 px-4 text-right">Change Document</th>
                  <th className="py-3 px-4 text-right">Cancel Document</th>
                  <th className="py-3 px-4 text-right">Approved</th>
                  <th className="py-3 px-4 text-right">Pending QMG</th>
                  <th className="py-3 px-4 text-right">In Draft</th>
                  <th className="py-3 px-4 text-right">Approval Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs font-mono tabular-nums">
                {yearlySummaryRows.map((row) => {
                  const rate =
                    row.total > 0 ? Math.round((row.approvedCount / row.total) * 100) : 0;
                  return (
                    <tr key={row.year} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4 font-bold text-slate-900">{row.year}</td>
                      <td className="py-3.5 px-4 text-right font-semibold text-slate-900">
                        {row.total}
                      </td>
                      <td className="py-3.5 px-4 text-right text-slate-700">{row.addCount}</td>
                      <td className="py-3.5 px-4 text-right text-slate-700">{row.changeCount}</td>
                      <td className="py-3.5 px-4 text-right text-slate-700">{row.cancelCount}</td>
                      <td className="py-3.5 px-4 text-right text-emerald-700 font-semibold">
                        {row.approvedCount}
                      </td>
                      <td className="py-3.5 px-4 text-right text-amber-700">
                        {row.pendingQmgCount}
                      </td>
                      <td className="py-3.5 px-4 text-right text-slate-600">{row.draftCount}</td>
                      <td className="py-3.5 px-4 text-right font-semibold text-slate-900">
                        {rate}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* REPORT 6: LIST OF DCRS PENDING APPROVAL */}
      {activeReport === 'PENDING_APPROVAL' && (
        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600">
                <th className="py-3 px-4">DCR #</th>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Request Type</th>
                <th className="py-3 px-4">Target Document</th>
                <th className="py-3 px-4">Department</th>
                <th className="py-3 px-4">Justification</th>
                <th className="py-3 px-4">Workflow Stage</th>
                <th className="py-3 px-4 text-right no-print">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs">
              {pendingApprovalDcrs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500">
                    All Document Change Requests have been approved and closed. Zero pending items.
                  </td>
                </tr>
              ) : (
                pendingApprovalDcrs.map((dcr) => (
                  <tr key={dcr.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 font-mono font-semibold text-slate-900 whitespace-nowrap">
                      {dcr.dcrNumber}
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums text-slate-600 whitespace-nowrap">
                      {dcr.requestDate}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-700 whitespace-nowrap">
                      {dcr.requestType}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-mono font-semibold text-slate-900">
                        {dcr.docCode} ({dcr.currentRevision} → {dcr.proposedRevision})
                      </div>
                      <div className="text-slate-600 truncate max-w-xs">{dcr.docTitle}</div>
                    </td>
                    <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                      {dcr.department}
                    </td>
                    <td className="py-3 px-4 text-slate-600 max-w-sm truncate">
                      {dcr.justification}
                    </td>
                    <td className="py-3 px-4">{renderStatusText(dcr.status)}</td>
                    <td className="py-3 px-4 text-right whitespace-nowrap no-print">
                      {dcr.status === 'PENDING_QMG' ? (
                        <button
                          type="button"
                          onClick={() =>
                            onOpenDcrWorkflow(
                              dcr.requestType === 'ADD' ? 'APPROVE_NEW_DOC' : 'APPROVE_CHANGES',
                              dcr
                            )
                          }
                          className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-md inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <ClipboardCheck className="w-3.5 h-3.5" />
                          <span>Review &amp; Approve</span>
                        </button>
                      ) : dcr.isDraftCompleted ? (
                        <button
                          type="button"
                          onClick={() => handleDirectSendToQmg(dcr)}
                          className="px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>Send to QMG</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            onOpenDcrWorkflow(
                              dcr.requestType === 'ADD'
                                ? 'EDIT_ADD_REQUEST'
                                : 'EDIT_CHANGE_CANCEL_REQUEST',
                              dcr
                            )
                          }
                          className="px-3 py-1.5 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-md cursor-pointer"
                        >
                          Complete Draft
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};
