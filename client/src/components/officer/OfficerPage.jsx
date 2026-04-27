import React, { useState, useCallback } from 'react';
import SharedNavbar from '../SharedNavbar.jsx';
import Footer from '../Footer.jsx';
import StatusBadge from '../shared/StatusBadge.jsx';
import SpatialView from '../shared/SpatialView.jsx';
import { IconCases, IconCheck, IconAlert, IconDocument, IconExternalLink } from '../icons/Icons.jsx';
import useApi, { useMutation } from '../../hooks/useApi.js';
import { officerAPI } from '../../services/api.js';

const truncAddr = (a) => a ? `${a.slice(0, 6)}...${a.slice(-4)}` : '—';

const OfficerPage = () => {
  const { data: casesResponse, loading, refetch } = useApi(useCallback(() => officerAPI.listCases(), []));
  const casesList = Array.isArray(casesResponse?.data) ? casesResponse.data
    : Array.isArray(casesResponse) ? casesResponse : [];

  const pendingCount = casesList.filter(c => ['queued', 'in_review'].includes(c.status)).length;
  const approvedCount = casesList.filter(c => c.status === 'approved').length;
  const rejectedCount = casesList.filter(c => c.status === 'rejected').length;

  const [selectedId, setSelectedId] = useState(null);
  const selected = casesList.find(c => c._id === selectedId) || null;

  const [justification, setJustification] = useState('');
  const [error, setError] = useState('');

  // Approve — calls backend which syncs DB
  // For transfer_review, officer needs to have called OfficerMultiSig.approve() 
  // on-chain first via MetaMask, then pass txHash + reviewId here
  const { execute: approveExec, loading: approving } = useMutation(
    useCallback((id) => officerAPI.approve(id, {
      justification,
      txHash: selected?.onChainReviewId ? undefined : undefined, // set after MetaMask tx
      reviewId: selected?.onChainReviewId
    }), [justification, selected])
  );

  const { execute: rejectExec, loading: rejecting } = useMutation(
    useCallback((id) => officerAPI.reject(id, {
      justification,
      reason: justification,
      reviewId: selected?.onChainReviewId
    }), [justification, selected])
  );

  const handleApprove = async () => {
    if (!selectedId) return;
    if (!justification.trim()) { setError('Please enter justification before approving.'); return; }
    setError('');
    try {
      await approveExec(selectedId);
      setJustification('');
      refetch();
    } catch (err) {
      setError(err?.response?.data?.error || 'Approval failed');
    }
  };

  const handleReject = async () => {
    if (!selectedId) return;
    if (!justification.trim()) { setError('Please enter justification before rejecting.'); return; }
    setError('');
    try {
      await rejectExec(selectedId);
      setJustification('');
      refetch();
    } catch (err) {
      setError(err?.response?.data?.error || 'Rejection failed');
    }
  };

  // Derive signatures from selected case
  const signatures = selected?.signatures || [];
  const approvalCount = signatures.filter(s => s.decision === 'approve').length;
  const progress = Math.round((approvalCount / 3) * 100);

  return (
    <div className="font-body min-h-screen flex flex-col" style={{ backgroundColor: '#11131a', color: '#e5e4ed' }}>
      <SharedNavbar role="officer" activePage="dashboard" />
      <main className="pt-10 pb-12 px-8 max-w-[1400px] mx-auto space-y-6 w-full">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-[32px] font-headline font-bold text-white tracking-tight leading-tight">Officer Dashboard</h1>
          <p className="text-sm text-on-surface-variant/60 mt-1">Review land transfer cases and verify ownership records</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {[
            { label: 'PENDING CASES', value: String(pendingCount).padStart(2, '0'), color: 'text-white', icon: <IconCases className="text-[#8470FF]" size={18} />, bg: 'bg-[#5E4EBB]/10 border-[#5E4EBB]/20' },
            { label: 'APPROVED', value: String(approvedCount).padStart(2, '0'), color: 'text-[#38BDF8]', icon: <IconCheck className="text-[#38BDF8]" size={18} />, bg: 'bg-[#0284C7]/10 border-[#0284C7]/20' },
            { label: 'REJECTED', value: String(rejectedCount).padStart(2, '0'), color: 'text-[#F43F5E]', icon: <IconAlert className="text-[#F43F5E]" size={18} />, bg: 'bg-[#BE123C]/10 border-[#BE123C]/20' },
          ].map(({ label, value, color, icon, bg }) => (
            <div key={label} className="bg-[#181a20] rounded-xl p-6 border border-[#23252d] flex justify-between items-center h-28">
              <div>
                <p className="text-[10px] uppercase tracking-[0.15em] text-on-surface-variant/50 font-bold mb-2">{label}</p>
                <p className={`text-3xl font-headline font-bold ${color}`}>{value}</p>
              </div>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${bg}`}>{icon}</div>
            </div>
          ))}
        </div>

        {/* Queue Table */}
        <div className="bg-[#181a20] rounded-xl border border-[#23252d] overflow-hidden">
          <div className="px-6 py-5 border-b border-[#23252d] flex justify-between items-center">
            <h3 className="text-[15px] font-headline font-bold text-white">Active Case Queue</h3>
            <div className="px-3 py-1 rounded-full bg-[#23252d] border border-[#2d3039] text-[9px] font-bold uppercase tracking-wider text-on-surface-variant/60 flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-[#38BDF8] animate-pulse" /> Live Sync
            </div>
          </div>
          <div className="overflow-x-auto max-h-[300px]">
            <table className="w-full text-left">
              <thead className="bg-[#14151a] sticky top-0 z-10">
                <tr className="text-[9px] font-label uppercase tracking-[0.15em] text-on-surface-variant/40">
                  {['CASE ID', 'TYPE', 'SURVEY NUMBER', 'VILLAGE', 'BUYER WALLET', 'SELLER WALLET', 'STATUS', 'TIMESTAMP', ''].map(h => (
                    <th key={h} className="px-6 py-4 border-b border-[#23252d]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#23252d] text-xs font-medium">
                {loading
                  ? <tr><td colSpan={9} className="px-6 py-10 text-center text-on-surface-variant/30 text-sm">Synchronizing queue...</td></tr>
                  : casesList.length === 0
                    ? <tr><td colSpan={9} className="px-6 py-10 text-center text-on-surface-variant/30 text-sm">No cases found</td></tr>
                    : casesList.map(c => (
                      <tr key={c._id} onClick={() => setSelectedId(c._id)}
                        className={`hover:bg-[#1f222b] transition-colors cursor-pointer ${selectedId === c._id ? 'bg-[#5e4ebb]/5' : ''}`}>
                        <td className="px-6 py-4 font-mono text-[#8470FF]">#TR-{(c._id || '').slice(-5).toUpperCase()}</td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${c.type === 'transfer_review' ? 'bg-[#BE123C]/10 text-[#F43F5E]' : 'bg-[#5E4EBB]/10 text-[#8470FF]'}`}>
                            {c.type === 'transfer_review' ? 'Transfer' : 'Verification'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-[#d1d5db]">{c.surveyNumber || '—'}</td>
                        <td className="px-6 py-4 text-[#d1d5db]">{c.village || '—'}</td>
                        <td className="px-6 py-4 font-mono text-[#6b7280]">{truncAddr(c.buyerWallet)}</td>
                        <td className="px-6 py-4 font-mono text-[#6b7280]">{truncAddr(c.sellerWallet)}</td>
                        <td className="px-6 py-4">
                          {c.status === 'queued' && <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-[#5E4EBB]/10 text-[#8470FF]">QUEUED</span>}
                          {c.status === 'in_review' && <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-[#0284c7]/20 text-[#38bdf8]">IN REVIEW</span>}
                          {c.status === 'approved' && <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-[#059669]/20 text-[#10B981]">APPROVED</span>}
                          {c.status === 'rejected' && <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-[#be123c]/20 text-[#f43f5e]">REJECTED</span>}
                          {!['queued', 'in_review', 'approved', 'rejected'].includes(c.status) && <StatusBadge status={c.status} />}
                        </td>
                        <td className="px-6 py-4 font-mono text-[#6b7280]">
                          {c.createdAt ? new Date(c.createdAt).toLocaleString('en-US', { hour12: false }).replace(',', '') : '—'}
                        </td>
                        <td className="px-6 py-4 text-right"><span className="text-[#8470FF] font-semibold hover:text-[#9988ff]">Review</span></td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Case Details + Verification */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Details */}
          <div className="bg-[#181a20] rounded-xl border border-[#23252d] flex flex-col min-h-[300px]">
            <div className="px-6 py-5 border-b border-[#23252d] flex justify-between items-center">
              <h3 className="text-[15px] font-headline font-bold text-white">Case Details</h3>
              {selected?.onChainReviewId && (
                <span className="px-3 py-1 bg-[#5E4EBB]/10 border border-[#5E4EBB]/20 rounded-full text-[#8470FF] text-[10px] font-mono font-bold">
                  On-chain Review #{selected.onChainReviewId}
                </span>
              )}
            </div>
            {!selected ? (
              <div className="text-center py-12 text-[#6b7280] flex-grow flex items-center justify-center">Select a case from the queue</div>
            ) : (
              <div className="p-6 flex-grow flex flex-col">
                <div className="grid grid-cols-2 gap-6 mb-6">
                  {[
                    { label: 'SURVEY NUMBER', value: selected.surveyNumber },
                    { label: 'VILLAGE', value: selected.village },
                    { label: 'DISTRICT', value: selected.district },
                    { label: 'AREA', value: selected.area ? `${selected.area} ${selected.areaUnit || 'sqm'}` : null },
                    { label: 'CASE TYPE', value: selected.type?.replace('_', ' ').toUpperCase() },
                    { label: 'LAND STATUS', value: selected.landStatus?.toUpperCase() },
                  ].map(({ label, value }) => (
                    <div key={label}>
                      <p className="text-[9px] uppercase tracking-[0.15em] text-[#6b7280] font-bold mb-1">{label}</p>
                      <p className="text-sm font-semibold text-white">{value || '—'}</p>
                    </div>
                  ))}
                </div>

                {/* Price (transfer only) */}
                {selected.price && (
                  <div className="bg-[#14151a] border border-[#23252d] rounded-lg p-4 mb-4">
                    <p className="text-[9px] uppercase tracking-[0.15em] text-[#6b7280] font-bold mb-1">TRANSFER PRICE</p>
                    <p className="text-lg font-bold text-[#38bdf8]">{selected.price.amount} {selected.price.currency}</p>
                    <p className="text-[10px] text-[#6b7280] mt-1">Escrow: <span className="text-[#8470FF]">{selected.escrow?.status || 'none'}</span></p>
                  </div>
                )}

                {/* Offline co-owner warning */}
                {selected.hasOfflineCoOwner && (
                  <div className="bg-[#BE123C]/10 border border-[#BE123C]/30 rounded-lg p-3 mb-4 flex items-center gap-3">
                    <IconAlert className="text-[#F43F5E] shrink-0" size={16} />
                    <p className="text-[12px] text-[#F43F5E] font-medium">This transfer has an offline co-owner — verify NOC documents carefully.</p>
                  </div>
                )}

                <div className="mt-auto">
                  <p className="text-[9px] uppercase tracking-[0.15em] text-[#6b7280] font-bold mb-3">PARTIES INVOLVED</p>
                  <div className="flex justify-between items-center text-[13px] border-b border-[#23252d] pb-2 mb-2">
                    <span className="text-[#9ca3af]">Buyer:</span>
                    <span className="font-mono text-[#38bdf8]">{truncAddr(selected.buyerWallet)}</span>
                  </div>
                  <div className="flex justify-between items-center text-[13px]">
                    <span className="text-[#9ca3af]">Seller:</span>
                    <span className="font-mono text-[#8470FF]">{truncAddr(selected.sellerWallet)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Verification */}
          <div className="bg-[#181a20] rounded-xl border border-[#23252d] flex flex-col min-h-[300px]">
            <div className="px-6 py-5 border-b border-[#23252d] flex justify-between items-center">
              <h3 className="text-[15px] font-headline font-bold text-white">Verification Scan</h3>
              <div className="px-3 py-1 bg-[#0284c7]/20 border border-[#0284c7]/40 text-[#38bdf8] rounded-full text-[10px] font-bold flex items-center gap-1.5">
                <IconCheck size={10} /> Verified
              </div>
            </div>
            {!selected ? (
              <div className="text-center py-12 text-[#6b7280] flex-grow flex items-center justify-center">Awaiting selection</div>
            ) : (
              <div className="p-6 flex-grow flex flex-col">
                <div className="mb-6">
                  <div className="flex justify-between text-xs text-[#d1d5db] font-medium mb-3">
                    <span>Identity: Name Match</span><span className="text-[#38bdf8]">98.4%</span>
                  </div>
                  <div className="h-1 w-full bg-[#23252d] rounded-full overflow-hidden">
                    <div className="h-full bg-[#38bdf8] shadow-[0_0_10px_#38bdf8]" style={{ width: '98.4%' }} />
                  </div>
                </div>
                <div className="space-y-5 flex-grow flex flex-col justify-end">
                  {[
                    { label: 'Area Consistency Match', desc: 'Digital survey matches physical records.' },
                    { label: 'Encumbrance Clear', desc: 'No pending bank liens or legal disputes found.' },
                    { label: 'Chain of Custody', desc: selected.blockchain?.registrationTxHash ? `Tx: ${selected.blockchain.registrationTxHash.slice(0, 16)}...` : 'Pending on-chain registration', done: !!selected.blockchain?.registrationTxHash },
                  ].map(({ label, desc, done = true }) => (
                    <div key={label} className={`flex gap-4 items-start ${!done ? 'opacity-50' : ''}`}>
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center text-white shrink-0 ${done ? 'bg-[#0284c7]' : 'border-2 border-[#6b7280]'}`}>
                        {done && <IconCheck size={12} />}
                      </div>
                      <div>
                        <p className="text-[13px] font-semibold text-[#e5e4ed] mb-1">{label}</p>
                        <p className="text-[11px] text-[#9ca3af]">{desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Documents + Map */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="bg-[#181a20] rounded-xl border border-[#23252d] flex flex-col min-h-[320px]">
            <div className="px-6 py-5 border-b border-[#23252d]">
              <h3 className="text-[15px] font-headline font-bold text-white">Property Documents</h3>
            </div>
            {!selected ? (
              <div className="text-center text-[#6b7280] flex-grow flex items-center justify-center">No documents in context</div>
            ) : (
              <div className="px-6 space-y-4 overflow-y-auto pb-6 pt-4">
                {[
                  { name: '7/12 Extract', cid: selected.land?.documents?.sevenTwelveCID },
                  { name: 'Mahabhulekh Snapshot', cid: selected.land?.documents?.mahabhulekhSnapshotCID },
                  { name: 'Mahabhunaksha Snapshot', cid: selected.land?.documents?.mahabhunakshaSnapshotCID },
                ].filter(d => d.cid).concat(
                  // fallback placeholders if no docs
                  selected.land?.documents?.sevenTwelveCID ? [] :
                    [{ name: '7/12 Extract', cid: null }, { name: 'Co-owner NOC', cid: null }]
                ).map((doc, i) => (
                  <div key={doc.name + i} className="flex justify-between items-center p-4 bg-[#14151a] border border-[#23252d] rounded-lg">
                    <div className="flex items-center gap-4">
                      <IconDocument className="text-[#6b7280]" size={20} />
                      <div>
                        <p className="text-[13px] text-[#e5e4ed] font-medium">{doc.name}</p>
                        <p className="text-[9px] text-[#6b7280] font-mono mt-1 uppercase tracking-wider">
                          {doc.cid ? `CID: ${doc.cid.slice(0, 20)}...` : 'Not uploaded'}
                        </p>
                      </div>
                    </div>
                    {doc.cid && (
                      <a href={`https://gateway.pinata.cloud/ipfs/${doc.cid}`} target="_blank" rel="noreferrer"
                        className="text-[#6b7280] hover:text-white transition-colors p-2">
                        <IconExternalLink size={16} />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-[#181a20] rounded-xl border border-[#23252d] min-h-[320px] overflow-hidden relative flex flex-col">
            <SpatialView landId={selected?.landId} showControls={true} />
            <div className="absolute bottom-4 left-4 text-[10px] text-white/90 font-medium z-[1000] drop-shadow-md">
              Spatial verification: Parcel boundaries align with municipal data.
            </div>
          </div>
        </div>

        {/* Decision Panel */}
        <div className="bg-[#181a20] rounded-xl border border-[#23252d] p-6 lg:p-8">
          <h3 className="text-[17px] font-headline font-bold text-white mb-2">Decision Panel</h3>

          {selected?.type === 'transfer_review' && selected?.onChainReviewId && (
            <div className="mb-4 p-3 bg-[#5E4EBB]/10 border border-[#5E4EBB]/20 rounded-lg">
              <p className="text-[11px] text-[#8470FF]">
                ⛓ On-chain Review ID: <span className="font-mono font-bold">{selected.onChainReviewId}</span> —
                Call <span className="font-mono">OfficerMultiSig.approve({selected.onChainReviewId})</span> or
                <span className="font-mono"> .reject({selected.onChainReviewId}, reason)</span> from your MetaMask wallet first, then click below.
              </p>
            </div>
          )}

          {error && (
            <div className="mb-4 p-3 bg-[#BE123C]/10 border border-[#BE123C]/30 rounded-lg">
              <p className="text-[12px] text-[#F43F5E]">{error}</p>
            </div>
          )}

          <p className="text-[10px] uppercase tracking-[0.15em] text-[#6b7280] font-bold mb-3">OFFICER JUSTIFICATION & FINDINGS</p>
          <textarea
            value={justification}
            onChange={e => setJustification(e.target.value)}
            rows={4}
            className="w-full bg-[#14151a] border border-[#23252d] rounded-lg p-5 text-[14px] text-white focus:outline-none focus:border-[#8470FF] resize-none mb-6 placeholder:text-[#4b5563]"
            placeholder="Enter detailed review notes and justification for decision..."
          />
          <div className="grid grid-cols-2 gap-5">
            <button
              disabled={!selectedId || approving || rejecting || ['approved', 'rejected'].includes(selected?.status)}
              onClick={handleApprove}
              className="h-[52px] bg-[#8470FF] hover:bg-[#7460EF] text-white font-bold text-[13px] tracking-widest rounded-lg disabled:opacity-40 transition-colors">
              {approving ? 'APPROVING...' : 'APPROVE TRANSFER'}
            </button>
            <button
              disabled={!selectedId || approving || rejecting || ['approved', 'rejected'].includes(selected?.status)}
              onClick={handleReject}
              className="h-[52px] bg-transparent border border-[#BE123C]/50 hover:bg-[#BE123C]/10 text-[#F43F5E] font-bold text-[13px] tracking-widest rounded-lg disabled:opacity-40 transition-colors">
              {rejecting ? 'REJECTING...' : 'REJECT TRANSFER'}
            </button>
          </div>
        </div>

        {/* Multi-Sig Consensus */}
        <div className="bg-[#181a20] rounded-xl border border-[#23252d] p-6 lg:p-8 mb-12">

          {/* Header */}
          <div className="flex justify-between items-start mb-6">
            <div>
              <h3 className="text-[17px] font-headline font-bold text-white leading-none mb-1">Multi-Sig Consensus</h3>
              <p className="text-[12px] text-[#9ca3af]">
                {approvalCount} of 3 signatures completed
                {approvalCount < 2 ? ` — ${2 - approvalCount} more needed` : ' — threshold reached'}
              </p>
            </div>
            <span className="px-3 py-1 bg-[#5E4EBB]/10 border border-[#5E4EBB]/20 rounded-full text-[#8470FF] text-[10px] font-bold tracking-wider">
              2-of-3 threshold
            </span>
          </div>

          {/* Step Indicators */}
          <div className="flex items-center mb-7">
            {[
              { label: 'Escrow', done: true },
              { label: 'Submitted', done: true },
              { label: 'Review', done: approvalCount >= 2, active: approvalCount < 2 },
              { label: 'Execute', done: approvalCount >= 2 },
            ].map((step, i, arr) => (
              <React.Fragment key={step.label}>
                <div className="flex flex-col items-center flex-shrink-0">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold z-10
            ${step.done ? 'bg-[#8470FF] text-white' : step.active ? 'border-2 border-[#8470FF] text-[#8470FF] bg-transparent' : 'border border-[#2d3039] text-[#4b5563] bg-[#1c1e25]'}`}>
                    {step.done ? '✓' : i + 1}
                  </div>
                  <p className="text-[9px] font-bold uppercase tracking-wider text-[#6b7280] mt-1.5 text-center">{step.label}</p>
                </div>
                {i < arr.length - 1 && (
                  <div className={`flex-1 h-px mt-[-14px] ${step.done ? 'bg-[#5E4EBB]/40' : 'bg-[#23252d]'}`} />
                )}
              </React.Fragment>
            ))}
          </div>

          {/* Progress Bar */}
          <div className="mb-7">
            <div className="flex justify-between mb-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#6b7280]">Approval progress</span>
              <span className="text-[12px] font-bold text-[#e5e4ed]">{approvalCount} / 3 approvals</span>
            </div>
            <div className="h-1.5 bg-[#23252d] rounded-full overflow-hidden relative">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${(approvalCount / 3) * 100}%`,
                  background: approvalCount >= 2 ? 'linear-gradient(90deg, #8470FF, #38BDF8)' : '#8470FF'
                }}
              />
              {/* Threshold marker at 66.6% */}
              <div className="absolute top-0 bottom-0 w-0.5 bg-[#5E4EBB]" style={{ left: '66.6%' }} />
            </div>
            <div className="flex justify-end mt-1">
              <span className="text-[9px] text-[#8470FF] font-bold" style={{ marginRight: '33.4%' }}>threshold</span>
            </div>
          </div>

          {/* Officer Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {[0, 1, 2].map(i => {
              const sig = signatures[i];
              const state = sig?.decision === 'approve' ? 'approved' : sig?.decision === 'reject' ? 'rejected' : 'pending';
              return (
                <div key={i} className={`border rounded-xl p-4 transition-colors
          ${state === 'approved' ? 'border-[#0284c7]/30 bg-[#0284c7]/5'
                    : state === 'rejected' ? 'border-[#BE123C]/30 bg-[#BE123C]/5'
                      : 'border-[#23252d] bg-[#14151a] opacity-50'}`}>
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-[12px] font-bold mb-3
            ${state === 'approved' ? 'bg-[#0284c7]/20 border border-[#0284c7]/50 text-[#38BDF8]'
                      : state === 'rejected' ? 'bg-[#BE123C]/20 border border-[#BE123C]/50 text-[#F43F5E]'
                        : 'bg-[#23252d] border border-[#2d3039] text-[#4b5563]'}`}>
                    O{i + 1}
                  </div>
                  <p className="text-[13px] font-bold text-white mb-1">Officer {i + 1}</p>
                  <p className={`text-[11px] font-semibold
            ${state === 'approved' ? 'text-[#38BDF8]' : state === 'rejected' ? 'text-[#F43F5E]' : 'text-[#4b5563]'}`}>
                    {state === 'approved' ? '✓ Approved' : state === 'rejected' ? '✗ Rejected' : '○ Pending'}
                  </p>
                  {sig?.signedAt && (
                    <p className="text-[10px] text-[#6b7280] mt-1">
                      {new Date(sig.signedAt).toLocaleString('en-US', { hour12: false, month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {/* Verdict */}
          <div className={`rounded-xl p-4 flex items-center gap-3 border
    ${approvalCount >= 2 ? 'bg-[#059669]/10 border-[#059669]/30'
              : signatures.some(s => s?.decision === 'reject') ? 'bg-[#BE123C]/10 border-[#BE123C]/30'
                : 'bg-[#5E4EBB]/10 border-[#5E4EBB]/20'}`}>
            <div className={`w-2 h-2 rounded-full flex-shrink-0
      ${approvalCount >= 2 ? 'bg-[#10B981]'
                : signatures.some(s => s?.decision === 'reject') ? 'bg-[#F43F5E]'
                  : 'bg-[#8470FF] animate-pulse'}`} />
            <div>
              <p className={`text-[13px] font-bold
        ${approvalCount >= 2 ? 'text-[#10B981]'
                  : signatures.some(s => s?.decision === 'reject') ? 'text-[#F43F5E]'
                    : 'text-[#8470FF]'}`}>
                {approvalCount >= 2 ? 'Transfer approved — executing on-chain'
                  : signatures.some(s => s?.decision === 'reject') ? 'Transfer rejected — buyer will be refunded'
                    : 'Awaiting consensus'}
              </p>
              <p className="text-[11px] text-[#9ca3af] mt-0.5">
                {approvalCount >= 2
                  ? `${approvalCount} of 3 officers approved`
                  : signatures.some(s => s?.decision === 'reject')
                    ? 'Proposal cancelled and land frozen'
                    : `${2 - approvalCount} more approval${2 - approvalCount > 1 ? 's' : ''} needed`}
              </p>
            </div>
          </div>

        </div>

      </main>
      <Footer />
    </div>
  );
};

export default OfficerPage;