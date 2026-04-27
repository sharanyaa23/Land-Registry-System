import React, { useState, useCallback, useMemo } from 'react';
import SharedNavbar from '../SharedNavbar.jsx';
import Footer from '../Footer.jsx';
import StatusBadge from '../shared/StatusBadge.jsx';
import { IconCheck, IconAlert, IconDocument } from '../icons/Icons.jsx';
import useApi, { useMutation } from '../../hooks/useApi.js';
import { officerAPI } from '../../services/api.js';

const truncAddr = (a) => a ? `${a.slice(0, 6)}...${a.slice(-4)}` : '—';

const typeBadge = (t) => {
  if (t === 'transfer_review') return (
    <span className="px-2 py-0.5 bg-[#BE123C]/10 text-[#F43F5E] text-[10px] uppercase font-bold tracking-wider rounded">Transfer</span>
  );
  return (
    <span className="px-2 py-0.5 bg-[#5E4EBB]/10 text-[#8470FF] text-[10px] uppercase font-bold tracking-wider rounded">Verification</span>
  );
};

const StatusPill = ({ status }) => {
  if (['queued', 'pending', 'in_review', 'under_review'].includes(status))
    return <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-[#0284c7]/20 text-[#38bdf8]">UNDER REVIEW</span>;
  if (status === 'approved')
    return <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-[#059669]/20 text-[#10B981]">APPROVED</span>;
  if (status === 'rejected')
    return <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-[#be123c]/20 text-[#F43F5E]">REJECTED</span>;
  return <StatusBadge status={status} />;
};

const CasesPage = () => {
  const [filter, setFilter] = useState('all');
  const { data: casesResponse, loading, refetch } = useApi(useCallback(() => officerAPI.listCases(), []));
  const casesList = useMemo(() => {
    const raw = casesResponse?.data || casesResponse;
    return Array.isArray(raw) ? raw : [];
  }, [casesResponse]);

  const filtered = useMemo(() => casesList.filter(c => {
    if (filter === 'pending')  return ['queued', 'in_review', 'under_review'].includes(c.status);
    if (filter === 'approved') return c.status === 'approved';
    if (filter === 'rejected') return c.status === 'rejected';
    return true;
  }), [casesList, filter]);

  const totalCount    = casesList.length;
  const underReview   = casesList.filter(c => ['queued', 'in_review'].includes(c.status)).length;
  const approvedCount = casesList.filter(c => c.status === 'approved').length;
  const rejectedCount = casesList.filter(c => c.status === 'rejected').length;

  const [selectedId, setSelectedId] = useState(null);
  const selected = useMemo(() => casesList.find(c => c._id === selectedId) || null, [selectedId, casesList]);

  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const { execute: approveExec, loading: approving } = useMutation(
    useCallback((id) => officerAPI.approve(id, {
      justification: notes,
      reviewId: selected?.onChainReviewId
    }), [notes, selected])
  );

  const { execute: rejectExec, loading: rejecting } = useMutation(
    useCallback((id) => officerAPI.reject(id, {
      justification: notes,
      reason: notes,
      reviewId: selected?.onChainReviewId
    }), [notes, selected])
  );

  const handleApprove = async () => {
    if (!selectedId) return;
    if (!notes.trim()) { setError('Please enter justification before approving.'); return; }
    setError('');
    try { await approveExec(selectedId); setNotes(''); refetch(); }
    catch (err) { setError(err?.response?.data?.error || 'Approval failed'); }
  };

  const handleReject = async () => {
    if (!selectedId) return;
    if (!notes.trim()) { setError('Please enter justification before rejecting.'); return; }
    setError('');
    try { await rejectExec(selectedId); setNotes(''); refetch(); }
    catch (err) { setError(err?.response?.data?.error || 'Rejection failed'); }
  };

  return (
    <div className="font-body min-h-screen flex flex-col" style={{ backgroundColor: '#11131a', color: '#e5e4ed' }}>
      <SharedNavbar role="officer" activePage="/cases" />
      <main className="pt-10 pb-12 px-8 max-w-[1400px] mx-auto space-y-6 w-full flex-grow">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-[32px] font-headline font-bold text-white tracking-tight leading-tight">Land Registry Cases</h1>
          <p className="text-sm text-on-surface-variant/60 mt-1">Review and manage all land registration cases</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
          {[
            { label: 'TOTAL CASES',   value: totalCount,    color: 'text-white',     icon: <IconDocument className="text-[#8470FF]" size={18} />, bg: 'bg-[#5E4EBB]/10 border-[#5E4EBB]/20' },
            { label: 'UNDER REVIEW',  value: String(underReview).padStart(2,'0'),   color: 'text-[#38BDF8]', icon: <span className="text-[#38BDF8] text-xl font-bold">~</span>,             bg: 'bg-[#0284C7]/10 border-[#0284C7]/20' },
            { label: 'APPROVED',      value: String(approvedCount).padStart(2,'0'), color: 'text-[#10B981]', icon: <IconCheck className="text-[#10B981]" size={18} />,                      bg: 'bg-[#059669]/10 border-[#059669]/20' },
            { label: 'REJECTED',      value: String(rejectedCount).padStart(2,'0'), color: 'text-[#F43F5E]', icon: <IconAlert className="text-[#F43F5E]" size={18} />,                      bg: 'bg-[#BE123C]/10 border-[#BE123C]/20' },
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

        {/* Case Registry Table */}
        <div className="bg-[#181a20] rounded-xl border border-[#23252d] overflow-hidden">
          <div className="px-6 py-5 border-b border-[#23252d] flex justify-between items-center">
            <h3 className="text-[15px] font-headline font-bold text-white">Case Registry</h3>
            <div className="flex gap-2">
              {[
                { key: 'all',      label: 'All Cases' },
                { key: 'pending',  label: 'Pending'   },
                { key: 'approved', label: 'Approved'  },
                { key: 'rejected', label: 'Rejected'  },
              ].map(({ key, label }) => (
                <button key={key} onClick={() => setFilter(key)}
                  className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-colors ${filter === key ? 'bg-[#5e4ebb]/20 text-[#8470FF]' : 'text-on-surface-variant/50 hover:bg-[#23252d] hover:text-on-surface-variant'}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto max-h-[350px]">
            <table className="w-full text-left">
              <thead className="bg-[#14151a] sticky top-0 z-10">
                <tr className="text-[9px] font-label uppercase tracking-[0.15em] text-on-surface-variant/50">
                  {['CASE ID', 'SURVEY NO.', 'VILLAGE', 'APPLICANT', 'TYPE', 'STATUS', 'SUBMITTED', 'UPDATED', ''].map(h => (
                    <th key={h} className="px-6 py-4 border-b border-[#23252d]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#23252d] text-[13px]">
                {loading
                  ? <tr><td colSpan={9} className="px-6 py-10 text-center text-on-surface-variant/30">Loading...</td></tr>
                  : filtered.length === 0
                  ? <tr><td colSpan={9} className="px-6 py-10 text-center text-on-surface-variant/30">No cases found</td></tr>
                  : filtered.map(c => (
                    <tr key={c._id} onClick={() => setSelectedId(c._id)}
                      className={`hover:bg-[#1f222b] transition-colors cursor-pointer ${selectedId === c._id ? 'bg-[#5e4ebb]/5' : ''}`}>
                      <td className="px-6 py-4 font-mono text-[#8470FF]">REG-{(c._id || '').slice(-6).toUpperCase()}</td>
                      <td className="px-6 py-4 text-[#d1d5db]">{c.surveyNumber || '—'}</td>
                      <td className="px-6 py-4 text-[#d1d5db]">{c.village || '—'}</td>
                      <td className="px-6 py-4 font-mono text-[#6b7280]">{truncAddr(c.sellerWallet || c.buyerWallet)}</td>
                      <td className="px-6 py-4">{typeBadge(c.type)}</td>
                      <td className="px-6 py-4"><StatusPill status={c.status} /></td>
                      <td className="px-6 py-4 font-mono text-[#6b7280]">{c.createdAt ? new Date(c.createdAt).toLocaleDateString() : '—'}</td>
                      <td className="px-6 py-4 font-mono text-[#6b7280]">{c.updatedAt ? new Date(c.updatedAt).toLocaleDateString() : '—'}</td>
                      <td className="px-6 py-4 text-right">
                        <span className="text-[#8470FF] font-semibold hover:text-[#9988ff]">
                          {['approved','rejected'].includes(c.status) ? 'View' : 'Review'}
                        </span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Details + Review */}
        <div key={selectedId} className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-12">

          {/* Case Information */}
          <div className="bg-[#181a20] rounded-xl border border-[#23252d] p-6 lg:p-8 flex flex-col min-h-[420px]">
            <div className="flex justify-between items-start mb-6">
              <h3 className="text-[17px] font-headline font-bold text-white">Case Information</h3>
              {selected && (
                <div className="px-3 py-1 bg-[#23252d] border border-[#2d3039] rounded-full text-[#38bdf8] text-[10px] font-bold font-mono tracking-wider">
                  REG-{(selected._id || '').slice(-6).toUpperCase()}
                </div>
              )}
            </div>

            {!selected ? (
              <div className="text-center text-[#6b7280] flex-grow flex items-center justify-center">
                Select a case from the registry table
              </div>
            ) : (
              <div className="space-y-4 flex-grow flex flex-col">
                {[
                  { label: 'Survey Number',  value: selected.surveyNumber },
                  { label: 'Village',        value: selected.village },
                  { label: 'District',       value: selected.district },
                  { label: 'Area',           value: selected.area ? `${selected.area} ${selected.areaUnit || 'sqm'}` : null },
                  { label: 'Land Status',    value: selected.landStatus },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between items-center border-b border-[#23252d] pb-3">
                    <span className="text-[13px] text-[#9ca3af]">{label}</span>
                    <span className="text-[14px] font-medium text-white">{value || '—'}</span>
                  </div>
                ))}

                <div className="flex justify-between items-center border-b border-[#23252d] pb-3">
                  <span className="text-[13px] text-[#9ca3af]">Case Type</span>
                  <span>{typeBadge(selected.type)}</span>
                </div>

                {/* Transfer price */}
                {selected.price && (
                  <div className="flex justify-between items-center border-b border-[#23252d] pb-3">
                    <span className="text-[13px] text-[#9ca3af]">Transfer Price</span>
                    <span className="text-[14px] font-bold text-[#38bdf8]">{selected.price.amount} {selected.price.currency}</span>
                  </div>
                )}

                <div className="flex justify-between items-center border-b border-[#23252d] pb-3">
                  <span className="text-[13px] text-[#9ca3af]">Seller Wallet</span>
                  <span className="text-[13px] font-mono text-[#8470FF]">{truncAddr(selected.sellerWallet)}</span>
                </div>

                {selected.buyerWallet && (
                  <div className="flex justify-between items-center border-b border-[#23252d] pb-3">
                    <span className="text-[13px] text-[#9ca3af]">Buyer Wallet</span>
                    <span className="text-[13px] font-mono text-[#38bdf8]">{truncAddr(selected.buyerWallet)}</span>
                  </div>
                )}

                <div className="flex justify-between items-center">
                  <span className="text-[13px] text-[#9ca3af]">Submission Date</span>
                  <span className="text-[14px] font-medium text-white">
                    {selected.createdAt ? new Date(selected.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '—'}
                  </span>
                </div>

                {/* Offline co-owner warning */}
                {selected.hasOfflineCoOwner && (
                  <div className="mt-2 bg-[#BE123C]/10 border border-[#BE123C]/30 rounded-lg p-3 flex items-center gap-3">
                    <IconAlert className="text-[#F43F5E] shrink-0" size={14} />
                    <p className="text-[11px] text-[#F43F5E]">Offline co-owner — verify NOC documents carefully.</p>
                  </div>
                )}

                {/* On-chain review ID */}
                {selected.onChainReviewId && (
                  <div className="mt-2 bg-[#5E4EBB]/10 border border-[#5E4EBB]/20 rounded-lg p-3">
                    <p className="text-[11px] text-[#8470FF]">
                      ⛓ On-chain Review ID: <span className="font-mono font-bold">{selected.onChainReviewId}</span>
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Review Actions */}
          <div className="bg-[#181a20] rounded-xl border border-[#23252d] p-6 lg:p-8 flex flex-col min-h-[420px]">
            <h3 className="text-[17px] font-headline font-bold text-white mb-6">Review Actions</h3>

            {error && (
              <div className="mb-4 p-3 bg-[#BE123C]/10 border border-[#BE123C]/30 rounded-lg">
                <p className="text-[12px] text-[#F43F5E]">{error}</p>
              </div>
            )}

            {selected && ['approved','rejected'].includes(selected.status) && (
              <div className="mb-4 p-3 bg-[#23252d] border border-[#2d3039] rounded-lg">
                <p className="text-[12px] text-[#9ca3af]">
                  This case is already <span className={`font-bold ${selected.status === 'approved' ? 'text-[#10B981]' : 'text-[#F43F5E]'}`}>{selected.status}</span>.
                  {selected.findings && ` Findings: ${selected.findings}`}
                </p>
              </div>
            )}

            <p className="text-[10px] uppercase tracking-[0.15em] text-[#6b7280] font-bold mb-3">REVIEW NOTES</p>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Enter detailed review notes and justification..."
              disabled={!selected || ['approved','rejected'].includes(selected?.status)}
              className="w-full bg-[#14151a] border border-[#23252d] rounded-lg p-5 text-[14px] text-white focus:outline-none focus:border-[#059669] resize-none flex-grow mb-6 placeholder:text-[#4b5563] disabled:opacity-40"
            />

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <button
                  disabled={!selectedId || approving || rejecting || ['approved','rejected'].includes(selected?.status)}
                  onClick={handleApprove}
                  className="h-[52px] bg-transparent border border-[#10B981]/50 hover:bg-[#10B981]/10 text-[#10B981] font-bold text-[13px] tracking-widest rounded-lg disabled:opacity-40 transition-colors">
                  {approving ? 'APPROVING...' : 'APPROVE CASE'}
                </button>
                <button
                  disabled={!selectedId || approving || rejecting || ['approved','rejected'].includes(selected?.status)}
                  onClick={handleReject}
                  className="h-[52px] bg-transparent border border-[#F43F5E]/50 hover:bg-[#F43F5E]/10 text-[#F43F5E] font-bold text-[13px] tracking-widest rounded-lg disabled:opacity-40 transition-colors">
                  {rejecting ? 'REJECTING...' : 'REJECT CASE'}
                </button>
              </div>
            </div>
          </div>
        </div>

      </main>
      <Footer />
    </div>
  );
};

export default CasesPage;