import React from 'react';
import {
  FilePlus2,
  FileEdit,
  FileX2,
  FileText,
  Send,
  CheckCircle2,
  ClipboardCheck,
  CalendarRange,
  History,
  BookOpen,
  Share2,
  BarChart3,
  Clock,
  LayoutGrid,
  LogOut,
  ArrowRight,
} from 'lucide-react';
import { DcrRequest, IsoDocument, SwitchboardNodeId, SystemReportId } from '../types/iso';

interface SwitchboardFlowchartProps {
  dcrs: DcrRequest[];
  documents: IsoDocument[];
  activeReport: SystemReportId;
  visualMode: 'modern' | 'classic';
  onSelectVisualMode: (mode: 'modern' | 'classic') => void;
  onTriggerNode: (nodeId: SwitchboardNodeId) => void;
  onSelectReport: (reportId: SystemReportId) => void;
  onReturnToMainSwitchboard: () => void;
  onQuitApplication: () => void;
}

export const SwitchboardFlowchart: React.FC<SwitchboardFlowchartProps> = ({
  dcrs,
  documents,
  activeReport,
  visualMode,
  onSelectVisualMode,
  onTriggerNode,
  onSelectReport,
  onReturnToMainSwitchboard,
  onQuitApplication,
}) => {
  // Live workflow stage counts derived from Firestore
  const allDrafts = dcrs.filter((d) => d.status === 'DRAFT');
  const incompleteAddDrafts = allDrafts.filter(
    (d) => !d.isDraftCompleted && d.requestType === 'ADD'
  );
  const incompleteChangeCancelDrafts = allDrafts.filter(
    (d) => !d.isDraftCompleted && (d.requestType === 'CHANGE' || d.requestType === 'CANCEL')
  );
  const completedDraftsReadyForQmg = allDrafts.filter((d) => d.isDraftCompleted);
  const pendingQmgNewDocs = dcrs.filter(
    (d) => d.status === 'PENDING_QMG' && d.requestType === 'ADD'
  );
  const pendingQmgChanges = dcrs.filter(
    (d) =>
      d.status === 'PENDING_QMG' && (d.requestType === 'CHANGE' || d.requestType === 'CANCEL')
  );
  const totalPendingQmg = pendingQmgNewDocs.length + pendingQmgChanges.length;
  const activeDocumentsCount = documents.filter((d) => d.status === 'ACTIVE').length;

  const isClassic = visualMode === 'classic';

  const systemReportItems: {
    id: SystemReportId;
    label: string;
    metric: string;
    icon: React.ReactNode;
  }[] = [
    {
      id: 'DCR_BY_DATE',
      label: 'DCR by date',
      metric: `${dcrs.length} total`,
      icon: <CalendarRange className="w-4 h-4 text-slate-500 shrink-0" />,
    },
    {
      id: 'CHANGE_LOG',
      label: 'Document Change Log',
      metric: 'Audit trail',
      icon: <History className="w-4 h-4 text-slate-500 shrink-0" />,
    },
    {
      id: 'MASTER_LIST',
      label: 'Document Master List',
      metric: `${activeDocumentsCount} active`,
      icon: <BookOpen className="w-4 h-4 text-slate-500 shrink-0" />,
    },
    {
      id: 'DISTRIBUTION',
      label: 'Document Distribution',
      metric: 'Copy matrix',
      icon: <Share2 className="w-4 h-4 text-slate-500 shrink-0" />,
    },
    {
      id: 'DCR_BY_YEAR',
      label: 'Summary of DCR by year',
      metric: 'Annual pivot',
      icon: <BarChart3 className="w-4 h-4 text-slate-500 shrink-0" />,
    },
    {
      id: 'PENDING_APPROVAL',
      label: 'List of DCRs pending approval',
      metric: `${totalPendingQmg} awaiting QMG`,
      icon: <Clock className="w-4 h-4 text-amber-600 shrink-0" />,
    },
  ];

  return (
    <section
      aria-label="Document Management Switchboard"
      className={
        isClassic
          ? 'bg-[#EBE9E4] border-2 border-t-white border-l-white border-r-stone-500 border-b-stone-500 p-5 sm:p-7 shadow-sm'
          : 'bg-white border border-slate-200 rounded-xl p-5 sm:p-8'
      }
    >
      {/* Switchboard Title Bar & Mode Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-200">
        <div className="flex items-center gap-4">
          {/* Classic stacked ISO manuals emblem inspired by frmDocChangeSwitchboard */}
          <div
            className={
              isClassic
                ? 'w-14 h-14 bg-[#DFDDD6] border border-stone-400 flex items-center justify-center shrink-0'
                : 'w-12 h-12 bg-slate-100 border border-slate-200 rounded-lg flex items-center justify-center shrink-0'
            }
            aria-hidden="true"
          >
            <svg viewBox="0 0 64 64" className="w-9 h-9">
              {/* Bottom book (blue) */}
              <path
                d="M10 44 L36 52 L54 44 L28 36 Z"
                fill="#3b82f6"
                stroke="#1e293b"
                strokeWidth="2"
              />
              <path
                d="M10 44 L10 50 L36 58 L54 50 L54 44"
                fill="#bfdbfe"
                stroke="#1e293b"
                strokeWidth="2"
              />
              {/* Middle book (amber/gold) */}
              <path
                d="M12 32 L38 40 L52 32 L26 24 Z"
                fill="#d97706"
                stroke="#1e293b"
                strokeWidth="2"
              />
              <path
                d="M12 32 L12 38 L38 46 L52 38 L52 32"
                fill="#fef3c7"
                stroke="#1e293b"
                strokeWidth="2"
              />
              {/* Top book (crimson ISO manual with ribbon) */}
              <path
                d="M14 20 L38 28 L52 20 L28 12 Z"
                fill="#dc2626"
                stroke="#1e293b"
                strokeWidth="2"
              />
              <path
                d="M14 20 L14 26 L38 34 L52 26 L52 20"
                fill="#fee2e2"
                stroke="#1e293b"
                strokeWidth="2"
              />
              <path d="M40 27 L40 39 L43 37 L46 39 L46 25" fill="#ef4444" stroke="#1e293b" strokeWidth="1.5" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-500 font-mono">
              <span>frmDocChangeSwitchboard</span>
              <span aria-hidden="true">·</span>
              <span>ISO 9001:2015 Clause 7.5</span>
            </div>
            <h1
              className={
                isClassic
                  ? 'text-2xl sm:text-3xl font-serif italic font-semibold text-slate-900 tracking-tight mt-0.5'
                  : 'text-xl sm:text-2xl font-bold text-slate-900 tracking-tight mt-0.5'
              }
            >
              Document Management
            </h1>
          </div>
        </div>

        {/* Interactive Workspace Style Selector */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <div className="flex items-center gap-1 p-1 bg-slate-100 border border-slate-200 rounded-lg">
            <button
              type="button"
              onClick={() => onSelectVisualMode('modern')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                visualMode === 'modern'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Modern ISO Blueprint
            </button>
            <button
              type="button"
              onClick={() => onSelectVisualMode('classic')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                visualMode === 'classic'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Classic Switchboard
            </button>
          </div>
        </div>
      </div>

      {/* DATA ENTRY FLOWCHART FRAME */}
      <div className="mt-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-slate-700">
            Data Entry — Interactive Compliance Workflow
          </span>
          <span className="text-xs text-slate-500">
            Click any workflow stage below to initiate or process records
          </span>
        </div>

        <div
          className={
            isClassic
              ? 'border-2 border-t-stone-500 border-l-stone-500 border-r-white border-b-white bg-[#EBE9E4] p-4 sm:p-6'
              : 'border border-slate-200 bg-slate-50/70 rounded-lg p-4 sm:p-7'
          }
        >
          {/* ROW 1: 3 Request Initiation Nodes */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-8 items-stretch">
            {/* Node 1: Request to add a new document */}
            <button
              type="button"
              onClick={() => onTriggerNode('REQUEST_ADD')}
              className={
                isClassic
                  ? 'group relative text-center px-4 py-3.5 bg-[#E4E2DC] border-2 border-t-white border-l-white border-r-stone-600 border-b-stone-600 active:border-t-stone-600 active:border-l-stone-600 hover:bg-[#ECEAE4] transition-colors cursor-pointer'
                  : 'group relative text-left px-4 py-3.5 bg-white border border-slate-300 hover:border-slate-900 rounded-lg shadow-2xs transition-colors cursor-pointer flex flex-col justify-between'
              }
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-xs font-mono text-slate-500 tabular-nums">STEP 1A · ADD</span>
                <FilePlus2 className="w-4 h-4 text-slate-700 group-hover:text-slate-900 shrink-0" />
              </div>
              <div className="text-sm font-semibold text-slate-900 leading-snug">
                Request to add a new document
              </div>
              <div className="mt-2 text-xs text-slate-500 flex items-center justify-between">
                <span>Initiate new SOP / WI</span>
                <ArrowRight className="w-3.5 h-3.5 opacity-60 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </button>

            {/* Node 2: Request to change an existing document */}
            <button
              type="button"
              onClick={() => onTriggerNode('REQUEST_CHANGE')}
              className={
                isClassic
                  ? 'group relative text-center px-4 py-3.5 bg-[#E4E2DC] border-2 border-t-white border-l-white border-r-stone-600 border-b-stone-600 active:border-t-stone-600 active:border-l-stone-600 hover:bg-[#ECEAE4] transition-colors cursor-pointer'
                  : 'group relative text-left px-4 py-3.5 bg-white border border-slate-300 hover:border-slate-900 rounded-lg shadow-2xs transition-colors cursor-pointer flex flex-col justify-between'
              }
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-xs font-mono text-slate-500 tabular-nums">
                  STEP 1B · CHANGE
                </span>
                <FileEdit className="w-4 h-4 text-slate-700 group-hover:text-slate-900 shrink-0" />
              </div>
              <div className="text-sm font-semibold text-slate-900 leading-snug">
                Request to change an existing document
              </div>
              <div className="mt-2 text-xs text-slate-500 flex items-center justify-between">
                <span>Revise controlled doc</span>
                <ArrowRight className="w-3.5 h-3.5 opacity-60 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </button>

            {/* Node 3: Request to cancel an existing document */}
            <button
              type="button"
              onClick={() => onTriggerNode('REQUEST_CANCEL')}
              className={
                isClassic
                  ? 'group relative text-center px-4 py-3.5 bg-[#E4E2DC] border-2 border-t-white border-l-white border-r-stone-600 border-b-stone-600 active:border-t-stone-600 active:border-l-stone-600 hover:bg-[#ECEAE4] transition-colors cursor-pointer'
                  : 'group relative text-left px-4 py-3.5 bg-white border border-slate-300 hover:border-slate-900 rounded-lg shadow-2xs transition-colors cursor-pointer flex flex-col justify-between'
              }
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-xs font-mono text-slate-500 tabular-nums">
                  STEP 1C · CANCEL
                </span>
                <FileX2 className="w-4 h-4 text-slate-700 group-hover:text-slate-900 shrink-0" />
              </div>
              <div className="text-sm font-semibold text-slate-900 leading-snug">
                Request to cancel an existing document
              </div>
              <div className="mt-2 text-xs text-slate-500 flex items-center justify-between">
                <span>Obsolete &amp; recall copies</span>
                <ArrowRight className="w-3.5 h-3.5 opacity-60 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </button>
          </div>

          {/* Orthogonal Connector Lines from 3 Request Buttons into "Justify requirement, draft new document" */}
          <div className="hidden md:grid grid-cols-3 items-center h-10 relative">
            {/* Left vertical drop + horizontal arm */}
            <div className="h-full flex justify-center relative">
              <div className="w-px h-6 bg-slate-800" />
              <div className="absolute top-6 left-1/2 right-0 h-px bg-slate-800" />
            </div>
            {/* Center vertical drop with arrow down */}
            <div className="h-full flex flex-col items-center justify-between relative">
              <div className="absolute top-6 left-0 right-0 h-px bg-slate-800" />
              <div className="w-px h-full bg-slate-800" />
              <div className="w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[7px] border-t-slate-800" />
            </div>
            {/* Right vertical drop + horizontal arm */}
            <div className="h-full flex justify-center relative">
              <div className="w-px h-6 bg-slate-800" />
              <div className="absolute top-6 left-0 right-1/2 h-px bg-slate-800" />
            </div>
          </div>

          {/* Mobile arrow spacer */}
          <div className="flex md:hidden justify-center py-2">
            <div className="w-px h-5 bg-slate-400" />
          </div>

          {/* ROW 2: Justify requirement, draft new document */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-8 items-center">
            <div className="hidden md:block" />
            <button
              type="button"
              onClick={() => onTriggerNode('JUSTIFY_DRAFT')}
              className="group w-full px-4 py-3.5 bg-white border-2 border-slate-800 hover:bg-slate-900 hover:text-white transition-colors cursor-pointer text-center"
            >
              <div className="flex items-center justify-center gap-2 text-xs font-mono text-slate-500 group-hover:text-slate-300 tabular-nums mb-1">
                <FileText className="w-3.5 h-3.5" />
                <span>STAGE 2 · {allDrafts.length} ACTIVE DRAFTS</span>
              </div>
              <div className="text-sm font-semibold leading-snug">
                Justify requirement, draft new document
              </div>
            </button>
            <div className="hidden md:block" />
          </div>

          {/* Connector Down to Completed? Diamond */}
          <div className="flex flex-col items-center h-7 justify-between">
            <div className="w-px h-full bg-slate-800" />
            <div className="w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[7px] border-t-slate-800" />
          </div>

          {/* ROW 3: Edit Document Add Request <-- No -- [Completed?] -- No --> Edit Change / Cancellation Request */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 items-center">
            {/* Left Node: Edit Document Add Request */}
            <button
              type="button"
              onClick={() => onTriggerNode('EDIT_ADD_REQUEST')}
              className={
                isClassic
                  ? 'group px-4 py-3.5 bg-[#E4E2DC] border-2 border-t-white border-l-white border-r-stone-600 border-b-stone-600 hover:bg-[#ECEAE4] transition-colors cursor-pointer text-center'
                  : 'group px-4 py-3.5 bg-white border border-slate-300 hover:border-slate-900 rounded-lg shadow-2xs transition-colors cursor-pointer text-left'
              }
            >
              <div className="flex items-center justify-between text-xs font-mono text-slate-500 tabular-nums mb-1">
                <span>INCOMPLETE ADD</span>
                <span className="font-semibold text-amber-700">
                  {incompleteAddDrafts.length} open
                </span>
              </div>
              <div className="text-sm font-semibold text-slate-900 leading-snug">
                Edit Document Add Request
              </div>
              <div className="mt-1 text-xs text-slate-500">
                Complete draft &amp; justification
              </div>
            </button>

            {/* Center Node: Decision Diamond "Completed?" with Left/Right "No" Arrows */}
            <div className="flex items-center justify-center relative py-2">
              {/* Left "No" Horizontal Arrow */}
              <div className="hidden md:flex items-center flex-1 mr-1">
                <div className="w-0 h-0 border-t-[5px] border-t-transparent border-b-[5px] border-b-transparent border-r-[7px] border-r-slate-800" />
                <div className="h-px flex-1 bg-slate-800 relative">
                  <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-xs font-semibold text-slate-700">
                    No
                  </span>
                </div>
              </div>

              {/* Diamond SVG + Interactive Button */}
              <button
                type="button"
                onClick={() => onTriggerNode('DECISION_COMPLETED')}
                className="group relative w-44 h-22 flex items-center justify-center cursor-pointer focus:outline-none"
                title="Inspect all Drafts by Completion Gate status"
              >
                <svg
                  viewBox="0 0 180 90"
                  className="absolute inset-0 w-full h-full drop-shadow-2xs"
                >
                  <polygon
                    points="90,4 176,45 90,86 4,45"
                    className="fill-white stroke-slate-900 stroke-2 group-hover:fill-slate-900 transition-colors"
                  />
                </svg>
                <div className="relative z-10 text-center px-4">
                  <div className="text-xs sm:text-sm font-semibold text-slate-900 group-hover:text-white transition-colors">
                    Completed?
                  </div>
                  <div className="text-[11px] font-mono text-slate-500 group-hover:text-slate-300 tabular-nums">
                    {completedDraftsReadyForQmg.length} Yes ·{' '}
                    {incompleteAddDrafts.length + incompleteChangeCancelDrafts.length} No
                  </div>
                </div>
              </button>

              {/* Right "No" Horizontal Arrow */}
              <div className="hidden md:flex items-center flex-1 ml-1">
                <div className="h-px flex-1 bg-slate-800 relative">
                  <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-xs font-semibold text-slate-700">
                    No
                  </span>
                </div>
                <div className="w-0 h-0 border-t-[5px] border-t-transparent border-b-[5px] border-b-transparent border-l-[7px] border-l-slate-800" />
              </div>
            </div>

            {/* Right Node: Edit Change / Cancellation Request */}
            <button
              type="button"
              onClick={() => onTriggerNode('EDIT_CHANGE_CANCEL_REQUEST')}
              className={
                isClassic
                  ? 'group px-4 py-3.5 bg-[#E4E2DC] border-2 border-t-white border-l-white border-r-stone-600 border-b-stone-600 hover:bg-[#ECEAE4] transition-colors cursor-pointer text-center'
                  : 'group px-4 py-3.5 bg-white border border-slate-300 hover:border-slate-900 rounded-lg shadow-2xs transition-colors cursor-pointer text-left'
              }
            >
              <div className="flex items-center justify-between text-xs font-mono text-slate-500 tabular-nums mb-1">
                <span>INCOMPLETE CHG/CAN</span>
                <span className="font-semibold text-amber-700">
                  {incompleteChangeCancelDrafts.length} open
                </span>
              </div>
              <div className="text-sm font-semibold text-slate-900 leading-snug">
                Edit Change / Cancellation Request
              </div>
              <div className="mt-1 text-xs text-slate-500">
                Complete redline or obsolescence note
              </div>
            </button>
          </div>

          {/* Connector Lines from Left Edit, Center ("Yes"), and Right Edit into "Send to QMG for review" */}
          <div className="hidden md:grid grid-cols-3 items-center h-11 relative">
            {/* Left vertical line down and right */}
            <div className="h-full flex justify-center relative">
              <div className="w-px h-8 bg-slate-800" />
              <div className="absolute top-8 left-1/2 right-0 h-px bg-slate-800" />
            </div>
            {/* Center "Yes" vertical arrow down */}
            <div className="h-full flex flex-col items-center justify-between relative">
              <span className="absolute top-1 right-1/2 mr-3 text-xs font-semibold text-slate-700">
                Yes
              </span>
              <div className="w-px h-full bg-slate-800" />
              <div className="w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[7px] border-t-slate-800" />
            </div>
            {/* Right vertical line down and left */}
            <div className="h-full flex justify-center relative">
              <div className="w-px h-8 bg-slate-800" />
              <div className="absolute top-8 left-0 right-1/2 h-px bg-slate-800" />
            </div>
          </div>

          {/* Mobile arrow spacer */}
          <div className="flex md:hidden justify-center py-2">
            <div className="w-px h-5 bg-slate-400" />
          </div>

          {/* ROW 4: Send to QMG for review */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-8 items-center">
            <div className="hidden md:block" />
            <button
              type="button"
              onClick={() => onTriggerNode('SEND_TO_QMG')}
              className="group w-full px-4 py-3.5 bg-white border-2 border-slate-800 hover:bg-slate-900 hover:text-white transition-colors cursor-pointer text-center relative"
            >
              <div className="flex items-center justify-center gap-2 text-xs font-mono text-slate-500 group-hover:text-slate-300 tabular-nums mb-1">
                <Send className="w-3.5 h-3.5" />
                <span>STAGE 3 · {completedDraftsReadyForQmg.length} READY TO TRANSMIT</span>
              </div>
              <div className="text-sm font-semibold leading-snug">
                Send to QMG for review
              </div>
            </button>
            <div className="hidden md:block" />
          </div>

          {/* Connector Fork from "Send to QMG for review" down to the 2 Final Approval Buttons */}
          <div className="hidden md:grid grid-cols-3 items-center h-10 relative">
            {/* Left branch down with arrowhead */}
            <div className="h-full flex flex-col items-center justify-end relative">
              <div className="absolute top-4 left-1/2 right-0 h-px bg-slate-800" />
              <div className="w-px h-6 bg-slate-800" />
              <div className="w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[7px] border-t-slate-800" />
            </div>
            {/* Center stem down to horizontal split */}
            <div className="h-full flex flex-col items-center relative">
              <div className="w-px h-4 bg-slate-800" />
              <div className="w-full h-px bg-slate-800" />
            </div>
            {/* Right branch down with arrowhead */}
            <div className="h-full flex flex-col items-center justify-end relative">
              <div className="absolute top-4 left-0 right-1/2 h-px bg-slate-800" />
              <div className="w-px h-6 bg-slate-800" />
              <div className="w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[7px] border-t-slate-800" />
            </div>
          </div>

          {/* Mobile arrow spacer */}
          <div className="flex md:hidden justify-center py-2">
            <div className="w-px h-5 bg-slate-400" />
          </div>

          {/* ROW 5: Review and Approve new document | Review and Approve changes */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-8 items-stretch">
            {/* Left Approval Node */}
            <button
              type="button"
              onClick={() => onTriggerNode('APPROVE_NEW_DOC')}
              className={
                isClassic
                  ? 'group px-4 py-3.5 bg-[#E4E2DC] border-2 border-t-white border-l-white border-r-stone-600 border-b-stone-600 hover:bg-[#ECEAE4] transition-colors cursor-pointer text-center'
                  : 'group px-4 py-3.5 bg-white border border-slate-300 hover:border-slate-900 rounded-lg shadow-2xs transition-colors cursor-pointer text-left'
              }
            >
              <div className="flex items-center justify-between text-xs font-mono text-slate-500 tabular-nums mb-1">
                <span>QMG GATE · NEW DOCS</span>
                <span className="font-semibold text-emerald-700">
                  {pendingQmgNewDocs.length} pending
                </span>
              </div>
              <div className="text-sm font-semibold text-slate-900 leading-snug flex items-center justify-between gap-2">
                <span>Review and Approve new document</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
              </div>
              <div className="mt-1 text-xs text-slate-500">
                Publishes Rev 1.0 to Master List
              </div>
            </button>

            <div className="hidden md:flex items-center justify-center text-xs text-slate-400 font-mono">
              QMG SIGN-OFF AUTHORITY
            </div>

            {/* Right Approval Node */}
            <button
              type="button"
              onClick={() => onTriggerNode('APPROVE_CHANGES')}
              className={
                isClassic
                  ? 'group px-4 py-3.5 bg-[#E4E2DC] border-2 border-t-white border-l-white border-r-stone-600 border-b-stone-600 hover:bg-[#ECEAE4] transition-colors cursor-pointer text-center'
                  : 'group px-4 py-3.5 bg-white border border-slate-300 hover:border-slate-900 rounded-lg shadow-2xs transition-colors cursor-pointer text-left'
              }
            >
              <div className="flex items-center justify-between text-xs font-mono text-slate-500 tabular-nums mb-1">
                <span>QMG GATE · REVISIONS</span>
                <span className="font-semibold text-emerald-700">
                  {pendingQmgChanges.length} pending
                </span>
              </div>
              <div className="text-sm font-semibold text-slate-900 leading-snug flex items-center justify-between gap-2">
                <span>Review and Approve changes</span>
                <ClipboardCheck className="w-4 h-4 text-emerald-700 shrink-0" />
              </div>
              <div className="mt-1 text-xs text-slate-500">
                Updates revision or recalls obsolete doc
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* SWITCHBOARD ACTION ROW: Return to Main Switchboard | Quit Application */}
      <div className="mt-5 flex flex-wrap items-center justify-center gap-4">
        <button
          type="button"
          onClick={onReturnToMainSwitchboard}
          className={
            isClassic
              ? 'px-6 py-2.5 bg-[#E4E2DC] border-2 border-t-white border-l-white border-r-stone-600 border-b-stone-600 font-serif italic text-base text-slate-900 hover:bg-[#ECEAE4] cursor-pointer whitespace-nowrap shrink-0'
              : 'px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-900 border border-slate-300 rounded-lg text-xs font-semibold transition-colors flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0'
          }
        >
          {!isClassic && <LayoutGrid className="w-4 h-4 text-slate-600" />}
          <span>Return to Main Switchboard</span>
        </button>

        <button
          type="button"
          onClick={onQuitApplication}
          className={
            isClassic
              ? 'px-6 py-2.5 bg-[#E4E2DC] border-2 border-t-white border-l-white border-r-stone-600 border-b-stone-600 font-serif italic text-base text-slate-900 hover:bg-[#ECEAE4] cursor-pointer whitespace-nowrap shrink-0'
              : 'px-5 py-2.5 bg-white hover:bg-rose-50 text-slate-700 hover:text-rose-700 border border-slate-300 hover:border-rose-300 rounded-lg text-xs font-semibold transition-colors flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0'
          }
        >
          {!isClassic && <LogOut className="w-4 h-4" />}
          <span>Quit Application</span>
        </button>
      </div>

      {/* SYSTEM REPORTS PANEL (6-Button Grid matching bottom of frmDocChangeSwitchboard) */}
      <div className="mt-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-slate-700">System reports</span>
          <span className="text-xs text-slate-500">
            Select any report below to inspect live ISO 9001 register tables &amp; export CSV
          </span>
        </div>

        <div
          className={
            isClassic
              ? 'border-2 border-t-stone-500 border-l-stone-500 border-r-white border-b-white bg-[#EBE9E4] p-4'
              : 'border border-slate-200 bg-slate-50/70 rounded-lg p-4'
          }
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {systemReportItems.map((item) => {
              const isSelected = activeReport === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectReport(item.id)}
                  className={
                    isClassic
                      ? `px-4 py-3 text-center border-2 transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-white border-t-stone-600 border-l-stone-600 border-r-white border-b-white font-semibold'
                            : 'bg-[#E4E2DC] border-t-white border-l-white border-r-stone-600 border-b-stone-600 hover:bg-[#ECEAE4]'
                        }`
                      : `px-4 py-3 rounded-lg border text-left transition-colors cursor-pointer flex items-center justify-between gap-3 ${
                          isSelected
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-white text-slate-900 border-slate-300 hover:border-slate-900'
                        }`
                  }
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {!isClassic && (
                      <span className={isSelected ? 'text-slate-300' : 'text-slate-500'}>
                        {item.icon}
                      </span>
                    )}
                    <span className="text-xs sm:text-sm font-medium truncate">{item.label}</span>
                  </div>
                  <span
                    className={`text-xs font-mono tabular-nums whitespace-nowrap shrink-0 ${
                      isSelected && !isClassic ? 'text-slate-300' : 'text-slate-500'
                    }`}
                  >
                    {item.metric}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
};
