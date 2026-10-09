import React, { useState, useEffect, useRef } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  User,
} from 'firebase/auth';
import {
  collection,
  query,
  where,
  onSnapshot,
} from 'firebase/firestore';
import {
  ShieldCheck,
  FilePlus2,
  CheckCircle2,
  AlertCircle,
  Database,
  ArrowRight,
  LogOut,
  Layers,
} from 'lucide-react';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
} from './firebase';
import {
  IsoDocument,
  DcrRequest,
  DocumentChangeLog,
  DocumentDistribution,
  SystemReportId,
  SwitchboardNodeId,
} from './types/iso';
import { seedInitialIsoComplianceData } from './services/isoService';
import { SwitchboardFlowchart } from './components/SwitchboardFlowchart';
import { DcrModal } from './components/DcrModal';
import { SystemReportsPanel } from './components/SystemReportsPanel';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Firestore Live Collections
  const [documents, setDocuments] = useState<IsoDocument[]>([]);
  const [dcrs, setDcrs] = useState<DcrRequest[]>([]);
  const [changeLogs, setChangeLogs] = useState<DocumentChangeLog[]>([]);
  const [distributions, setDistributions] = useState<DocumentDistribution[]>([]);
  const [dataLoaded, setDataLoaded] = useState<boolean>(false);
  const [seeding, setSeeding] = useState<boolean>(false);
  const hasAutoSeededRef = useRef<boolean>(false);

  // Switchboard Navigation & View State
  const [workspaceView, setWorkspaceView] = useState<'doc_switchboard' | 'main_switchboard'>(
    'doc_switchboard'
  );
  const [visualMode, setVisualMode] = useState<'modern' | 'classic'>('modern');
  const [activeReport, setActiveReport] = useState<SystemReportId>('MASTER_LIST');

  // Workflow Modal State
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [activeNode, setActiveNode] = useState<SwitchboardNodeId | null>(null);
  const [selectedDcrForModal, setSelectedDcrForModal] = useState<DcrRequest | null>(null);
  const [preselectedDocForModal, setPreselectedDocForModal] = useState<IsoDocument | null>(null);

  // Quit Application Confirmation Modal
  const [quitModalOpen, setQuitModalOpen] = useState<boolean>(false);

  // Toast / Status Banner
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const reportsSectionRef = useRef<HTMLDivElement | null>(null);

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    window.setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 4500);
  };

  // 1. Track Firebase Auth state
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthReady(true);
      if (!currentUser) {
        setDocuments([]);
        setDcrs([]);
        setChangeLogs([]);
        setDistributions([]);
        setDataLoaded(false);
        hasAutoSeededRef.current = false;
      }
    });
    return () => unsub();
  }, []);

  // 2. Attach real-time Firestore listeners when authenticated
  useEffect(() => {
    if (!authReady || !user) return;

    const docsQuery = query(collection(db, 'documents'), where('ownerId', '==', user.uid));
    const dcrsQuery = query(collection(db, 'dcrRequests'), where('ownerId', '==', user.uid));
    const logsQuery = query(collection(db, 'changeLogs'), where('ownerId', '==', user.uid));
    const distQuery = query(collection(db, 'distributions'), where('ownerId', '==', user.uid));

    let docsReady = false;
    let dcrsReady = false;

    const unsubDocs = onSnapshot(
      docsQuery,
      (snap) => {
        const list: IsoDocument[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<IsoDocument, 'id'>),
        }));
        setDocuments(list);
        docsReady = true;
        if (docsReady && dcrsReady) setDataLoaded(true);
      },
      (err) => handleFirestoreError(err, OperationType.GET, 'documents')
    );

    const unsubDcrs = onSnapshot(
      dcrsQuery,
      (snap) => {
        const list: DcrRequest[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<DcrRequest, 'id'>),
        }));
        setDcrs(list);
        dcrsReady = true;
        if (docsReady && dcrsReady) setDataLoaded(true);
      },
      (err) => handleFirestoreError(err, OperationType.GET, 'dcrRequests')
    );

    const unsubLogs = onSnapshot(
      logsQuery,
      (snap) => {
        const list: DocumentChangeLog[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<DocumentChangeLog, 'id'>),
        }));
        setChangeLogs(list);
      },
      (err) => handleFirestoreError(err, OperationType.GET, 'changeLogs')
    );

    const unsubDist = onSnapshot(
      distQuery,
      (snap) => {
        const list: DocumentDistribution[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<DocumentDistribution, 'id'>),
        }));
        setDistributions(list);
      },
      (err) => handleFirestoreError(err, OperationType.GET, 'distributions')
    );

    return () => {
      unsubDocs();
      unsubDcrs();
      unsubLogs();
      unsubDist();
    };
  }, [authReady, user]);

  // 3. Auto-seed initial ISO 9001 workspace if empty on first login
  useEffect(() => {
    if (
      authReady &&
      user &&
      dataLoaded &&
      documents.length === 0 &&
      dcrs.length === 0 &&
      !hasAutoSeededRef.current &&
      !seeding
    ) {
      hasAutoSeededRef.current = true;
      setSeeding(true);
      seedInitialIsoComplianceData(user.uid, user.displayName || 'ISO Quality Lead')
        .then(() => {
          triggerToast('Initialized ISO 9001 Document Master List, DCR workflow queue, and Audit Logs.');
        })
        .catch((err) => {
          console.error('Error seeding initial ISO data:', err);
        })
        .finally(() => {
          setSeeding(false);
        });
    }
  }, [authReady, user, dataLoaded, documents.length, dcrs.length, seeding]);

  const handleGoogleSignIn = async () => {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Google Sign-In failed.');
    }
  };

  const handleSignOut = async () => {
    setQuitModalOpen(false);
    await signOut(auth);
  };

  const handleOpenWorkflowNode = (
    nodeId: SwitchboardNodeId,
    dcr: DcrRequest | null = null,
    docItem: IsoDocument | null = null
  ) => {
    setActiveNode(nodeId);
    setSelectedDcrForModal(dcr);
    setPreselectedDocForModal(docItem);
    setModalOpen(true);
  };

  const handleSelectReport = (reportId: SystemReportId) => {
    setActiveReport(reportId);
    setWorkspaceView('doc_switchboard');
    setTimeout(() => {
      reportsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
  };

  // KPI Metrics for Executive Strip
  const activeDocsCount = documents.filter((d) => d.status === 'ACTIVE').length;
  const underRevisionCount = documents.filter((d) => d.status === 'UNDER_REVISION').length;
  const pendingQmgCount = dcrs.filter((d) => d.status === 'PENDING_QMG').length;
  const draftDcrsCount = dcrs.filter((d) => d.status === 'DRAFT').length;
  const acknowledgedCopiesCount = distributions.filter(
    (d) => d.distributionStatus === 'ACKNOWLEDGED'
  ).length;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* TOP BAR CONTRACT: 3 Zones separated by gap-8 */}
      <header className="flex items-center justify-between gap-8 px-6 py-4 bg-white border-b border-slate-200 sticky top-0 z-30 no-print">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#switchboard"
          onClick={(e) => {
            e.preventDefault();
            setWorkspaceView('doc_switchboard');
          }}
          className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
        >
          Veritas ISO 9001
        </a>

        {/* Zone 2: 5 clean single-line text navigation links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
          <a
            href="#switchboard"
            onClick={(e) => {
              e.preventDefault();
              setWorkspaceView('doc_switchboard');
            }}
            className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            Switchboard
          </a>
          <a
            href="#master-list"
            onClick={(e) => {
              e.preventDefault();
              handleSelectReport('MASTER_LIST');
            }}
            className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            Master List
          </a>
          <a
            href="#pending-approval"
            onClick={(e) => {
              e.preventDefault();
              handleSelectReport('PENDING_APPROVAL');
            }}
            className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            Pending QMG
          </a>
          <a
            href="#change-log"
            onClick={(e) => {
              e.preventDefault();
              handleSelectReport('CHANGE_LOG');
            }}
            className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            Change Log
          </a>
          <a
            href="#distribution"
            onClick={(e) => {
              e.preventDefault();
              handleSelectReport('DISTRIBUTION');
            }}
            className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            Distribution
          </a>
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center gap-3 shrink-0">
          {user ? (
            <button
              type="button"
              onClick={() => handleOpenWorkflowNode('REQUEST_ADD')}
              className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              New DCR Request
            </button>
          ) : (
            <button
              type="button"
              onClick={handleGoogleSignIn}
              className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              Sign In with Google
            </button>
          )}
        </div>
      </header>

      {/* Main Content Container */}
      <main className="flex-1 w-full max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
        {/* Feedback Toast */}
        {toastMessage && (
          <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center justify-between gap-3 text-xs text-emerald-900 no-print">
            <div className="flex items-center gap-2 font-medium">
              <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
              <span>{toastMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setToastMessage(null)}
              className="text-emerald-700 hover:text-emerald-950 font-semibold cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Auth Error Notice */}
        {authError && (
          <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-lg flex items-center gap-2.5 text-xs text-rose-800">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{authError}</span>
          </div>
        )}

        {/* STATE 1: Auth Loading */}
        {!authReady && (
          <div className="bg-white border border-slate-200 rounded-xl p-12 text-center space-y-3">
            <div className="text-sm font-semibold text-slate-800">
              Initializing ISO 9001 Document Control Switchboard...
            </div>
            <p className="text-xs text-slate-500">
              Verifying Quality Management Group (QMG) workspace connection.
            </p>
          </div>
        )}

        {/* STATE 2: Unauthenticated Sign-In Gate */}
        {authReady && !user && (
          <div className="bg-white border border-slate-200 rounded-xl p-8 sm:p-12 space-y-8">
            <div className="max-w-2xl space-y-4">
              <div className="text-xs font-mono text-slate-500">
                ISO 9001:2015 Clause 7.5 · Controlled Document &amp; Audit Switchboard
              </div>
              <h1
                className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight"
                style={{ textWrap: 'balance' }}
              >
                Document Management &amp; QMG Compliance Switchboard
              </h1>
              <p className="text-base text-slate-600 leading-relaxed">
                Manage the complete ISO document lifecycle through the interactive{' '}
                <span className="font-mono text-slate-800">frmDocChangeSwitchboard</span> workflow:
                initiate additions, revisions, or cancellations, pass the completion gate, route to
                the Quality Management Group (QMG) for sign-off, and generate audit-ready system
                reports.
              </p>
              <div className="pt-2 flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  className="px-6 py-3 text-sm font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors inline-flex items-center gap-2 cursor-pointer"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>Sign In with Google to Open Switchboard</span>
                </button>
              </div>
            </div>

            {/* Workflow Preview Strip */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-6 border-t border-slate-200">
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5">
                <div className="text-xs font-mono text-slate-500">01. INITIATE DCR</div>
                <div className="text-sm font-semibold text-slate-900">
                  Add, Change, or Cancel
                </div>
                <p className="text-xs text-slate-600">
                  Submit structured requests linked directly to the Controlled Document Master List.
                </p>
              </div>
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5">
                <div className="text-xs font-mono text-slate-500">02. COMPLETION GATE</div>
                <div className="text-sm font-semibold text-slate-900">
                  Justify &amp; Draft Check
                </div>
                <p className="text-xs text-slate-600">
                  Incomplete requests route to dedicated Edit Add or Edit Change/Cancellation queues.
                </p>
              </div>
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5">
                <div className="text-xs font-mono text-slate-500">03. QMG REVIEW</div>
                <div className="text-sm font-semibold text-slate-900">
                  Approve or Return Draft
                </div>
                <p className="text-xs text-slate-600">
                  QMG approval automatically increments revisions, recalls obsolete copies, and logs
                  audit trails.
                </p>
              </div>
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5">
                <div className="text-xs font-mono text-slate-500">04. SYSTEM REPORTS</div>
                <div className="text-sm font-semibold text-slate-900">
                  6 Live ISO Audit Registers
                </div>
                <p className="text-xs text-slate-600">
                  DCR by Date, Change Log, Master List, Distribution Matrix, Annual Summary, and
                  Pending Queue.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* STATE 3: Authenticated Workspace */}
        {authReady && user && (
          <>
            {/* Workspace Context Subbar + Live KPI Strip */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 no-print">
              <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                  <span className="font-semibold text-slate-900">
                    Auditor: {user.displayName || user.email}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>QMG Compliance Authority</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono">ISO 9001:2015</span>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  {documents.length === 0 && !seeding && (
                    <button
                      type="button"
                      onClick={() => {
                        setSeeding(true);
                        seedInitialIsoComplianceData(
                          user.uid,
                          user.displayName || 'ISO Quality Lead'
                        ).finally(() => setSeeding(false));
                      }}
                      className="px-3 py-1.5 text-xs font-semibold text-slate-800 bg-slate-100 border border-slate-300 rounded-lg hover:bg-slate-200 inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Database className="w-3.5 h-3.5" />
                      <span>Load Sample ISO 9001 Records</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      setWorkspaceView(
                        workspaceView === 'doc_switchboard'
                          ? 'main_switchboard'
                          : 'doc_switchboard'
                      )
                    }
                    className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>
                      {workspaceView === 'doc_switchboard'
                        ? 'Main QMS Switchboard'
                        : 'Open frmDocChangeSwitchboard'}
                    </span>
                  </button>
                </div>
              </div>

              {/* 5-Column Tabular KPI Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 pt-4">
                <div>
                  <div className="text-xs text-slate-500">Active Controlled Docs</div>
                  <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-0.5">
                    {activeDocsCount}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Docs Under Revision</div>
                  <div className="text-2xl font-bold font-mono tabular-nums text-amber-700 mt-0.5">
                    {underRevisionCount}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">DCRs Pending QMG</div>
                  <div className="text-2xl font-bold font-mono tabular-nums text-emerald-700 mt-0.5">
                    {pendingQmgCount}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">DCRs in Draft Stage</div>
                  <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-0.5">
                    {draftDcrsCount}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Acknowledged Copies</div>
                  <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-0.5">
                    {acknowledgedCopiesCount}/{distributions.length}
                  </div>
                </div>
              </div>
            </div>

            {/* VIEW A: MAIN EXECUTIVE QMS SWITCHBOARD (Reached via "Return to Main Switchboard") */}
            {workspaceView === 'main_switchboard' && (
              <section className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-200">
                  <div>
                    <div className="text-xs font-mono text-slate-500">
                      frmMainSwitchboard · Executive Quality Management System Hub
                    </div>
                    <h1 className="text-2xl font-bold text-slate-900 mt-0.5">
                      Main QMS Switchboard
                    </h1>
                  </div>
                  <button
                    type="button"
                    onClick={() => setWorkspaceView('doc_switchboard')}
                    className="px-4 py-2.5 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 inline-flex items-center gap-2 cursor-pointer self-start"
                  >
                    <span>Open Document Management Switchboard</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  <div className="p-5 bg-slate-50 border border-slate-200 rounded-lg flex flex-col justify-between space-y-4">
                    <div className="space-y-1.5">
                      <div className="text-xs font-mono text-slate-500">
                        MODULE 01 · CLAUSE 7.5
                      </div>
                      <h2 className="text-base font-bold text-slate-900">
                        Document Management (frmDocChangeSwitchboard)
                      </h2>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        Interactive flowchart for adding, revising, and cancelling controlled ISO
                        documents, completing draft gates, and executing QMG reviews.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setWorkspaceView('doc_switchboard')}
                      className="w-full px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 cursor-pointer"
                    >
                      Launch Document Switchboard
                    </button>
                  </div>

                  <div className="p-5 bg-slate-50 border border-slate-200 rounded-lg flex flex-col justify-between space-y-4">
                    <div className="space-y-1.5">
                      <div className="text-xs font-mono text-slate-500">
                        MODULE 02 · QMG APPROVAL QUEUE
                      </div>
                      <h2 className="text-base font-bold text-slate-900">
                        Quality Management Group Sign-Off ({pendingQmgCount} Pending)
                      </h2>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        Inspect pending Document Change Requests awaiting QMG review and publish
                        approved revisions directly to the Master List.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSelectReport('PENDING_APPROVAL')}
                      className="w-full px-4 py-2 text-xs font-semibold text-slate-900 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 cursor-pointer"
                    >
                      Open Pending QMG Queue
                    </button>
                  </div>

                  <div className="p-5 bg-slate-50 border border-slate-200 rounded-lg flex flex-col justify-between space-y-4">
                    <div className="space-y-1.5">
                      <div className="text-xs font-mono text-slate-500">
                        MODULE 03 · AUDIT TRAIL &amp; DISTRIBUTION
                      </div>
                      <h2 className="text-base font-bold text-slate-900">
                        Controlled Copy Distribution &amp; Change Log
                      </h2>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        Verify controlled document holders across departments, issue new controlled
                        copies, and export chronological ISO audit logs.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSelectReport('DISTRIBUTION')}
                      className="w-full px-4 py-2 text-xs font-semibold text-slate-900 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 cursor-pointer"
                    >
                      Open Distribution Matrix
                    </button>
                  </div>
                </div>
              </section>
            )}

            {/* VIEW B: INTERACTIVE DOCUMENT MANAGEMENT SWITCHBOARD (frmDocChangeSwitchboard) */}
            {workspaceView === 'doc_switchboard' && (
              <div className="no-print">
                <SwitchboardFlowchart
                  dcrs={dcrs}
                  documents={documents}
                  activeReport={activeReport}
                  visualMode={visualMode}
                  onSelectVisualMode={setVisualMode}
                  onTriggerNode={(nodeId) => handleOpenWorkflowNode(nodeId)}
                  onSelectReport={handleSelectReport}
                  onReturnToMainSwitchboard={() => setWorkspaceView('main_switchboard')}
                  onQuitApplication={() => setQuitModalOpen(true)}
                />
              </div>
            )}

            {/* LIVE SYSTEM REPORTS REGISTER */}
            <div ref={reportsSectionRef}>
              <SystemReportsPanel
                activeReport={activeReport}
                userUid={user.uid}
                dcrs={dcrs}
                documents={documents}
                changeLogs={changeLogs}
                distributions={distributions}
                onSelectReport={setActiveReport}
                onOpenDcrWorkflow={handleOpenWorkflowNode}
                onSuccessMessage={triggerToast}
              />
            </div>
          </>
        )}
      </main>

      {/* Workflow Action Modal (Handles all 10 flowchart nodes) */}
      {user && (
        <DcrModal
          isOpen={modalOpen}
          activeNode={activeNode}
          initialSelectedDcr={selectedDcrForModal}
          preselectedDoc={preselectedDocForModal}
          userUid={user.uid}
          userDisplayName={user.displayName || user.email || 'ISO Specialist'}
          dcrs={dcrs}
          documents={documents}
          distributions={distributions}
          onClose={() => {
            setModalOpen(false);
            setSelectedDcrForModal(null);
            setPreselectedDocForModal(null);
          }}
          onSuccessMessage={triggerToast}
        />
      )}

      {/* Quit Application Confirmation Modal */}
      {quitModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="text-base font-bold text-slate-900">
              Quit ISO Document Management Application?
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              All Document Change Requests, Master List updates, and Change Log entries are safely
              persisted in Firestore. Do you want to sign out of your current session?
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setQuitModalOpen(false)}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
              >
                Stay in Switchboard
              </button>
              <button
                type="button"
                onClick={handleSignOut}
                className="px-4 py-2 text-xs font-semibold text-white bg-rose-700 rounded-lg hover:bg-rose-800 inline-flex items-center gap-1.5 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out &amp; Quit</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clean Quiet Footer */}
      <footer className="mt-auto border-t border-slate-200 bg-white py-4 px-6 text-xs text-slate-500 no-print">
        <div className="max-w-[1280px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div>Veritas ISO 9001 Document Control &amp; Compliance System</div>
          <div>Clause 7.5 Documented Information · QMG Audit Register</div>
        </div>
      </footer>
    </div>
  );
}
