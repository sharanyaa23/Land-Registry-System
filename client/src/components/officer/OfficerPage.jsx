import React, { useState, useCallback } from 'react';
import SharedNavbar from '../SharedNavbar.jsx';
import Footer from '../Footer.jsx';
import StatusBadge from '../shared/StatusBadge.jsx';
import SpatialView from '../shared/SpatialView.jsx';
import { IconCases, IconCheck, IconAlert, IconDocument, IconExternalLink, IconTransfer } from '../icons/Icons.jsx';
import useApi, { useMutation } from '../../hooks/useApi.js';
import { officerAPI } from '../../services/api.js';

const truncAddr = (a) => a ? `${a.slice(0, 6)}...${a.slice(-4)}` : '\u2014';

const OfficerPage = () => {
  const { data: cases, loading, refetch } = useApi(useCallback(() => officerAPI.listCases(), []));
  const casesList = Array.isArray(cases?.data) ? cases.data : Array.isArray(cases) ? cases : [];

  const pendingCount = casesList.filter(c => ['queued', 'in_review', 'under_review'].includes(c.status)).length;
  const approvedCount = casesList.filter(c => c.status === 'approved').length;
  const rejectedCount = casesList.filter(c => c.status === 'rejected').length;

  const [selectedId, setSelectedId] = useState(null);
  const selected = casesList.find(c => c._id === selectedId) || null;

  const [justification, setJustification] = useState('');
  const { execute: approve, loading: approving } = useMutation(useCallback((id) => officerAPI.approve(id, { justification }), [justification]));
  const { execute: reject, loading: rejecting } = useMutation(useCallback((id) => officerAPI.reject(id, { justification }), [justification]));

  const handleApprove = async () => { if (!selectedId) return; try { await approve(selectedId); setJustification(''); setSelectedId(null); refetch(); } catch {} };
  const handleReject = async () => { if (!selectedId) return; try { await reject(selectedId); setJustification(''); setSelectedId(null); refetch(); } catch {} };

  const getConfidenceColor = (score) => {
    if (score >= 80) return { text: '#b1a1ff', label: 'HIGH' }; // text-primary
    if (score >= 60) return { text: '#1fc0fe', label: 'MEDIUM' }; // text-secondary
    return { text: '#ff6e84', label: 'LOW' }; // text-error
  };

  const getEscalationLabel = (reason) => {
    const map = {
      ocr_low_confidence: 'OCR Low Confidence',
      ocr_missing_fields: 'OCR Missing Fields',
      manual_request: 'Manual Request',
      dispute: 'Ownership Dispute',
      flagged: 'Flagged for Review'
    };
    return map[reason] || reason || 'Unknown';
  };

  return (
    <div className="font-body min-h-screen flex flex-col bg-surface text-on-surface" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(116,117,125,0.04) 1px, transparent 0)', backgroundSize: '80px 80px' }}>
      <SharedNavbar role="officer" activePage="dashboard" />
      
      <main className="pt-24 pb-32 px-8 max-w-7xl mx-auto w-full flex-grow flex flex-col gap-24">

        {/* Header */}
        <section>
          <div className="inline-flex items-center gap-2 text-primary text-sm font-label uppercase tracking-widest mb-4 font-medium">
            <IconCases size={16} /> Government Officer Panel
          </div>
          <h1 className="text-6xl font-headline font-medium tracking-tight text-on-surface mb-6">Verification Dashboard</h1>
          <p className="text-lg text-on-surface-variant max-w-2xl leading-relaxed">
            Review land documents escalated from automated OCR verification. Make the final decision to pass or reject land for blockchain registration.
          </p>
        </section>

        {/* Stats Section - Clean Typography, No Cards */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-12 border-y border-outline-variant/30 py-16">
          <div className="flex flex-col gap-2">
            <p className="text-sm uppercase tracking-widest text-outline font-label">Pending Review</p>
            <p className="text-6xl font-headline font-medium text-on-surface">{String(pendingCount).padStart(2, '0')}</p>
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-sm uppercase tracking-widest text-outline font-label">Approved</p>
            <p className="text-6xl font-headline font-medium text-primary">{String(approvedCount).padStart(2, '0')}</p>
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-sm uppercase tracking-widest text-outline font-label">Rejected</p>
            <p className="text-6xl font-headline font-medium text-error">{String(rejectedCount).padStart(2, '0')}</p>
          </div>
        </section>

        {/* Verification Flow Diagram */}
        <section>
          <p className="text-sm uppercase tracking-widest text-outline font-label mb-10">Dual Verification Flow</p>
          <div className="flex items-center justify-between w-full max-w-4xl">
            {[
              { step: '1', label: 'Seller Uploads 7/12', active: true },
              { step: '2', label: 'Tesseract OCR Scan', active: true },
              { step: '3', label: 'Confidence Check', active: true },
              { step: '4', label: 'Officer Review', active: true },
              { step: '5', label: 'Decision', active: true },
            ].map((s, i) => (
              <React.Fragment key={s.step}>
                <div className="flex flex-col items-center gap-4 relative z-10 w-32">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-medium bg-surface border-2 ${i === 3 ? 'border-primary text-primary shadow-[0_0_15px_rgba(177,161,255,0.2)]' : 'border-outline-variant text-on-surface-variant'}`}>
                    {s.step}
                  </div>
                  <p className="text-sm text-center text-on-surface-variant font-medium">{s.label}</p>
                </div>
                {i < 4 && (
                  <div className="flex-1 h-px bg-outline-variant/50 relative -top-6 -mx-8 z-0"></div>
                )}
              </React.Fragment>
            ))}
          </div>
          <div className="mt-8 flex items-center gap-3 text-sm text-outline">
            <span className="w-2 h-2 rounded-full bg-primary" /> <span className="font-medium text-on-surface-variant">Confidence ≥ 60%: Auto-pass</span>
            <span className="mx-2 opacity-50">|</span>
            <span className="w-2 h-2 rounded-full bg-error" /> <span className="font-medium text-on-surface-variant">Confidence &lt; 60%: Escalated for manual review</span>
          </div>
        </section>

        {/* Cases Queue Table */}
        <section>
          <div className="flex justify-between items-end mb-8">
            <h2 className="text-3xl font-headline font-medium text-on-surface">Escalated Verification Queue</h2>
            <div className="flex items-center gap-2 text-sm font-medium text-primary">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse shadow-[0_0_10px_rgba(177,161,255,0.6)]" /> Live updates
            </div>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-outline-variant text-sm uppercase tracking-widest text-outline font-label">
                  <th className="py-4 px-2 font-normal">Case ID</th>
                  <th className="py-4 px-2 font-normal">Type</th>
                  <th className="py-4 px-2 font-normal">Escalation Reason</th>
                  <th className="py-4 px-2 font-normal">Confidence</th>
                  <th className="py-4 px-2 font-normal">Survey No</th>
                  <th className="py-4 px-2 font-normal">Status</th>
                  <th className="py-4 px-2 font-normal text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/30 text-base">
                {loading ? <tr><td colSpan={7} className="py-12 text-center text-outline">Synchronizing queue...</td></tr>
                : casesList.length === 0 ? <tr><td colSpan={7} className="py-12 text-center text-outline">No cases in queue</td></tr>
                : casesList.map(c => {
                  const conf = c.ocrData?.confidence ?? null;
                  const confColor = conf !== null ? getConfidenceColor(conf) : null;
                  return (
                    <tr key={c._id} onClick={() => setSelectedId(c._id)} className={`group transition-colors cursor-pointer ${selectedId === c._id ? 'bg-primary/5' : 'hover:bg-surface-container-high/50'}`}>
                      <td className="py-5 px-2 font-mono text-on-surface">#CR-{(c._id || '').slice(-5).toUpperCase()}</td>
                      <td className="py-5 px-2 capitalize text-on-surface-variant">{(c.type || '').replace(/_/g, ' ')}</td>
                      <td className="py-5 px-2 text-on-surface-variant">{getEscalationLabel(c.escalationReason)}</td>
                      <td className="py-5 px-2">
                        {conf !== null ? (
                          <span className="font-mono font-medium" style={{ color: confColor.text }}>{conf}%</span>
                        ) : <span className="text-outline">N/A</span>}
                      </td>
                      <td className="py-5 px-2 text-on-surface-variant">{c.ocrData?.surveyNumber || c.land?.location?.surveyNumber || '\u2014'}</td>
                      <td className="py-5 px-2">
                        {c.status === 'queued' ? <span className="text-[#facc15] font-medium">QUEUED</span> :
                         c.status === 'in_review' ? <span className="text-secondary font-medium">IN REVIEW</span> :
                         <StatusBadge status={c.status} />}
                      </td>
                      <td className="py-5 px-2 text-right">
                        <span className="text-primary font-medium opacity-0 group-hover:opacity-100 transition-opacity">Review →</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* Selected Case details */}
        <section className={`transition-opacity duration-500 ${selected ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
          <h2 className="text-3xl font-headline font-medium text-on-surface mb-12 border-b border-outline-variant/30 pb-4">
            {selected ? `Case Review: #CR-${(selected._id || '').slice(-5).toUpperCase()}` : 'Select a case to review'}
          </h2>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 mb-16">
            
            {/* Left Col: Case details & comparison */}
            <div className="space-y-12">
              
              {/* Metadata */}
              <div className="grid grid-cols-2 gap-y-8 gap-x-4">
                <div>
                  <p className="text-xs uppercase tracking-widest text-outline font-label mb-2">Case Type</p>
                  <p className="text-lg text-on-surface capitalize">{(selected?.type || '').replace(/_/g, ' ')}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-widest text-outline font-label mb-2">Escalation Reason</p>
                  <p className="text-lg text-[#facc15] font-medium">{selected ? getEscalationLabel(selected.escalationReason) : '\u2014'}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-widest text-outline font-label mb-2">Seller / Owner</p>
                  <p className="text-lg text-on-surface">{selected?.sellerData?.ownerName || selected?.land?.owner?.profile?.fullName || '\u2014'}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-widest text-outline font-label mb-2">Owner Wallet</p>
                  <p className="text-lg font-mono text-on-surface-variant">{truncAddr(selected?.land?.owner?.walletAddress)}</p>
                </div>
              </div>

              {/* Data Comparison */}
              <div>
                <p className="text-xs uppercase tracking-widest text-outline font-label mb-6">Data Comparison (OCR vs Seller)</p>
                <div className="space-y-0 border-y border-outline-variant/30">
                  {['district', 'taluka', 'village', 'surveyNumber', 'area'].map((key) => {
                    const ocrVal = selected?.ocrData?.[key] || '—';
                    const sellerVal = selected?.sellerData?.[key] || selected?.land?.location?.[key] || selected?.land?.area?.value || '—';
                    const match = String(ocrVal).toLowerCase().trim() === String(sellerVal).toLowerCase().trim();
                    
                    return (
                      <div key={key} className="grid grid-cols-12 py-4 border-b border-outline-variant/30 last:border-b-0 items-center">
                        <div className="col-span-3 text-sm text-outline capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</div>
                        <div className="col-span-4 font-mono text-sm text-on-surface-variant pr-4"><span className="text-xs text-outline mr-2">OCR:</span>{ocrVal}</div>
                        <div className="col-span-4 font-mono text-sm text-on-surface"><span className="text-xs text-outline mr-2">User:</span>{sellerVal}</div>
                        <div className="col-span-1 text-right">
                          {match ? <IconCheck size={18} className="text-primary inline-block" /> : <IconAlert size={18} className="text-error inline-block" />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Raw OCR Text */}
              {selected?.ocrData?.rawText && (
                <div>
                  <p className="text-xs uppercase tracking-widest text-outline font-label mb-4">Raw OCR Output</p>
                  <pre className="p-6 bg-surface-container-high text-on-surface-variant text-xs font-mono rounded-xl max-h-48 overflow-y-auto whitespace-pre-wrap border border-outline-variant/30">
                    {selected.ocrData.rawText}
                  </pre>
                </div>
              )}
            </div>

            {/* Right Col: Map & Docs */}
            <div className="space-y-12">
              <div>
                <p className="text-xs uppercase tracking-widest text-outline font-label mb-4">Spatial Boundary</p>
                <div className="h-80 bg-surface-container-high rounded-xl overflow-hidden border border-outline-variant/30">
                  <SpatialView landId={selected?.land?._id || selected?.land} showControls={true} />
                </div>
              </div>

              <div>
                <p className="text-xs uppercase tracking-widest text-outline font-label mb-4">Attached Documents</p>
                <div className="space-y-3">
                  {['7/12 Extract (Uploaded)', 'OCR Scan Result', 'Land Record Snapshot'].map(docName => (
                    <div key={docName} className="flex justify-between items-center py-3 border-b border-outline-variant/30 last:border-0">
                      <div className="flex items-center gap-3">
                        <IconDocument className="text-outline" size={18} />
                        <p className="text-sm text-on-surface">{docName}</p>
                      </div>
                      <button className="text-outline hover:text-primary transition-colors"><IconExternalLink size={16} /></button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

          </div>

          {/* Decision Actions - Fortify Style */}
          <div className="bg-surface-container-high p-12 rounded-2xl border border-outline-variant/30">
            <h3 className="text-2xl font-headline font-medium text-on-surface mb-6">Officer Justification</h3>
            
            <textarea
              value={justification}
              onChange={e => setJustification(e.target.value)}
              rows={4}
              disabled={!selected}
              className="w-full bg-surface-container-highest border border-outline-variant/50 rounded-xl p-6 text-lg text-on-surface focus:outline-none focus:border-primary resize-none mb-8 placeholder:text-outline"
              placeholder="Enter detailed review notes. Compare OCR data with seller data and note any discrepancies..."
            />
            
            <div className="flex gap-4">
              <button 
                disabled={!selectedId || approving || rejecting || !justification.trim()} 
                onClick={handleApprove}
                className="flex-1 h-[60px] rounded-full bg-primary text-on-primary-fixed hover:bg-primary-dim group transition-all duration-300 disabled:opacity-50 disabled:hover:bg-primary flex items-center justify-between px-6"
              >
                <span className="font-medium text-lg ml-4">{approving ? 'Approving...' : 'Approve Verification'}</span>
                <div className="w-10 h-10 bg-black/20 rounded-full flex items-center justify-center group-hover:bg-on-surface group-hover:-rotate-45 transition-all duration-300">
                  <IconCheck size={18} className="text-white group-hover:text-black" />
                </div>
              </button>
              
              <button 
                disabled={!selectedId || approving || rejecting || !justification.trim()} 
                onClick={handleReject}
                className="flex-1 h-[60px] rounded-full bg-transparent border border-outline-variant text-on-surface hover:bg-error/10 hover:text-error hover:border-error/30 transition-all duration-300 disabled:opacity-50 flex items-center justify-center gap-3"
              >
                <IconAlert size={20} />
                <span className="font-medium text-lg">{rejecting ? 'Rejecting...' : 'Reject Application'}</span>
              </button>
            </div>
          </div>
        </section>

      </main>
      <Footer />
    </div>
  );
};

export default OfficerPage;
