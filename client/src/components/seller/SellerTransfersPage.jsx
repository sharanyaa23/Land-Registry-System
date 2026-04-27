import React, { useState, useCallback } from 'react';
import SharedNavbar from '../SharedNavbar.jsx';
import Footer from '../Footer.jsx';
import PageHeader from '../shared/PageHeader.jsx';
import StatCard from '../shared/StatCard.jsx';
import StatusBadge from '../shared/StatusBadge.jsx';
import { IconTransfer, IconCheck, IconEscrow, IconShield } from '../icons/Icons.jsx';
import useApi, { useMutation } from '../../hooks/useApi.js';
import { transferAPI } from '../../services/api.js';

const BG = {
  backgroundColor: '#0c0e14',
  backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(116,117,125,0.04) 1px, transparent 0)',
  backgroundSize: '32px 32px',
  color: '#e5e4ed'
};

const formatPrice = (price) => {
  if (!price?.amount) return '—';
  if (price.currency === 'INR') {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency', currency: 'INR', maximumFractionDigits: 0
    }).format(price.amount);
  }
  return `${price.amount} ${price.currency}`;
};

const truncAddr = (a) => a ? `${a.slice(0, 6)}...${a.slice(-4)}` : '—';

const ACTIVE_STATUSES = ['offer_sent', 'coowner_consent_pending', 'officer_review', 'escrow_locked', 'approved'];

const progressBarClass = (pct) => {
  if (pct === 100) return 'bg-emerald-700/70';
  if (pct > 50)   return 'bg-on-surface-variant/40';
  return 'bg-on-surface-variant/20';
};

// Flow steps for progress tracker
const FLOW_STEPS = [
  { key: 'offer_sent',     label: 'Offer Received' },
  { key: 'offer_accepted', label: 'Accepted' },
  { key: 'escrow_locked',  label: 'Funds Locked' },
  { key: 'officer_review', label: 'Under Review' },
  { key: 'completed',      label: 'Completed' },
];

const STATUS_STEP_INDEX = {
  offer_sent:               0,
  coowner_consent_pending:  1,
  offer_accepted:           1,
  escrow_locked:            2,
  officer_review:           3,
  approved:                 3,
  completed:                4,
  rejected:                 -1,
  cancelled:                -1,
};

const SellerTransfersPage = () => {
  const [nocLoading, setNocLoading]     = useState(null);
  const [nocError, setNocError]         = useState(null);
  const [actionLoading, setActionLoading] = useState(null);
  const [actionError, setActionError]   = useState(null);

  const { data: transfers, loading, refetch } = useApi(useCallback(() => transferAPI.getMyTransfers(), []));
  const { data: incomingRaw, refetch: refetchIncoming } = useApi(useCallback(() => transferAPI.getIncomingOffers(), []));
  const { data: coownerRaw, refetch: refetchCoowner }   = useApi(useCallback(() => transferAPI.getCoownerPending(), []));

  const transfersList   = Array.isArray(transfers) ? transfers : (transfers?.transfers || []);
  const incomingOffers  = Array.isArray(incomingRaw) ? incomingRaw : (incomingRaw?.transfers || []);
  const coownerTransfers    = coownerRaw?.transfers || [];
  const allCoownerTransfers = coownerRaw?.allCoownerTransfers || [];

  const { execute: acceptOffer, loading: accepting } = useMutation(useCallback((id) => transferAPI.accept(id), []));
  const { execute: rejectOffer, loading: rejecting } = useMutation(useCallback((id) => transferAPI.reject(id), []));

  // CO-OWNER CONSENT
  const handleConsent = async (transferId, approve, coOwnerId) => {
    setNocLoading(`${transferId}-${approve}`);
    setNocError(null);
    try {
      await transferAPI.coownerConsent(transferId, {
        coOwnerId,
        approve,
        signature: approve ? 'NOC_SIGNED' : undefined
      });
      await refetchCoowner();
      await refetch();
    } catch (err) {
      setNocError(err.response?.data?.error || 'Action failed');
    } finally {
      setNocLoading(null);
    }
  };

// SUBMIT TO OFFICERS (no private key needed for local testing)
const handleSubmitToOfficers = async (transfer) => {
  setActionLoading(`submit-${transfer._id}`);
  setActionError(null);
  try {
    await transferAPI.submitToOfficers(transfer._id, {});
    await refetch();
  } catch (err) {
    setActionError(err.response?.data?.error || 'Submit failed');
  } finally {
    setActionLoading(null);
  }
};

// OFFICER DECISION (no private key needed for local testing)
const handleOfficerDecision = async (transfer, approve) => {
  const reason = approve ? null : prompt('Enter rejection reason:');
  if (!approve && !reason) return;

  setActionLoading(`officer-${transfer._id}`);
  setActionError(null);
  try {
    await transferAPI.officerDecision(transfer._id, { approve, reason });
    await refetch();
  } catch (err) {
    setActionError(err.response?.data?.error || 'Decision failed');
  } finally {
    setActionLoading(null);
  }
};

  const allRelevantTransfers = [
    ...transfersList,
    ...allCoownerTransfers.filter(ct =>
      !transfersList.some(t => t._id?.toString() === ct._id?.toString())
    )
  ];

  const activeCount    = allRelevantTransfers.filter(t => ACTIVE_STATUSES.includes(t.status)).length;
  const completedCount = allRelevantTransfers.filter(t => t.status === 'completed').length;
  const escrowCount    = allRelevantTransfers.filter(t => t.status === 'escrow_locked').length;

  return (
    <div className="text-on-surface flex flex-col min-h-screen" style={BG}>
      <SharedNavbar role="seller" activePage="/seller/transfers" />
      <main className="flex-grow w-full max-w-7xl mx-auto px-8 py-10 space-y-8">
        <PageHeader title="Transfer Management" subtitle="Track and manage all land transfer transactions." icon={IconTransfer} />

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Active Transfers" value={loading ? '...' : String(activeCount).padStart(2,'0')} icon={IconTransfer} iconColor="primary" />
          <StatCard label="Completed"        value={loading ? '...' : String(completedCount).padStart(2,'0')} icon={IconCheck} iconColor="secondary" />
          <StatCard label="In Escrow"        value={loading ? '...' : String(escrowCount).padStart(2,'0')} icon={IconEscrow} iconColor="tertiary-container" />
          <StatCard label="Total"            value={loading ? '...' : String(allRelevantTransfers.length).padStart(2,'0')} icon={IconTransfer} iconColor="on-surface-variant" />
        </div>

        {/* Global error */}
        {(actionError || nocError) && (
          <div className="p-3 bg-error/10 border border-error/20 rounded-lg text-error text-xs flex justify-between">
            <span>{actionError || nocError}</span>
            <button onClick={() => { setActionError(null); setNocError(null); }} className="underline opacity-60">Dismiss</button>
          </div>
        )}

        {/* NOC Requests */}
        {coownerTransfers.length > 0 && (
          <div className="bg-surface-container rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-outline-variant/10 flex items-center gap-2">
              <div>
                <h3 className="text-sm font-headline font-bold">NOC Requests</h3>
                <p className="text-[10px] text-on-surface-variant/50 mt-0.5">Your consent is required for these transfers</p>
              </div>
              <span className="ml-auto text-[10px] font-mono px-2 py-0.5 rounded-full bg-error/10 text-error animate-pulse">
                {coownerTransfers.length} pending
              </span>
            </div>

            <div className="divide-y divide-outline-variant/5">
              {coownerTransfers.map(t => {
                const myConsent    = t.myConsent;
                const isPending    = myConsent?.status === 'pending';
                const isApproved   = myConsent?.status === 'approved';
                const approvedCount = t.coOwnerConsents?.filter(c => c.status === 'approved').length || 0;
                const total        = t.coOwnerConsents?.length || 0;

                return (
                  <div key={t._id} className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                        <IconShield className="text-primary" size={15} />
                      </div>
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold">Survey {t.land?.location?.surveyNumber || '—'}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant/50 border border-outline-variant/10">
                            {t.land?.location?.village || '—'}
                          </span>
                        </div>
                        <p className="text-[10px] text-on-surface-variant/40">
                          Buyer: <span className="font-mono">{t.buyer?.walletAddress ? truncAddr(t.buyer.walletAddress) : t.buyer?.profile?.fullName || '—'}</span>
                          &nbsp;·&nbsp;<span className="font-medium">{formatPrice(t.price)}</span>
                          &nbsp;·&nbsp;Consents: <span className="text-on-surface-variant/60 font-bold">{approvedCount}/{total}</span>
                        </p>
                        {t.coOwnerConsents?.length > 0 && (
                          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                            {t.coOwnerConsents.map((c, i) => (
                              <span key={i} className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                                c.status === 'approved' ? 'bg-emerald-900/40 text-emerald-400/80' :
                                c.status === 'rejected' ? 'bg-error/15 text-error' :
                                'bg-surface-container-high text-on-surface-variant/40'
                              }`}>Co-owner {i + 1}: {c.status}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      {!isPending ? (
                        <span className={`text-[10px] font-bold px-3 py-1.5 rounded-full ${
                          isApproved ? 'bg-emerald-900/40 text-emerald-400/80' : 'bg-error/15 text-error'
                        }`}>
                          {isApproved ? '✓ You Approved' : '✕ You Rejected'}
                        </span>
                      ) : (
                        <>
                          <button
                            onClick={() => handleConsent(t._id, true, t.myConsent?.coOwner?._id)}
                            disabled={nocLoading === `${t._id}-true`}
                            className="px-4 py-1.5 bg-emerald-900/30 text-emerald-400/80 text-[10px] font-bold rounded-lg hover:bg-emerald-900/50 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                          >
                            <IconCheck size={10} /> Approve NOC
                          </button>
                          <button
                            onClick={() => handleConsent(t._id, false, t.myConsent?.coOwner?._id)}
                            disabled={nocLoading === `${t._id}-false`}
                            className="px-4 py-1.5 bg-surface-container-high text-on-surface text-[10px] font-bold rounded-lg hover:bg-error/10 hover:text-error transition-colors disabled:opacity-50"
                          >
                            Reject
                          </button>
                        </>
                      )}
                      <StatusBadge status={t.status} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* All co-owner transfers */}
        {allCoownerTransfers.length > 0 && (
          <div className="bg-surface-container rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-outline-variant/10 flex items-center">
              <h3 className="text-sm font-headline font-bold">Lands You're Part Of</h3>
              <span className="ml-auto text-[10px] font-mono px-2 py-0.5 rounded-full bg-on-surface-variant/10 text-on-surface-variant/50">
                {allCoownerTransfers.length} total
              </span>
            </div>
            <div className="divide-y divide-outline-variant/5">
              {allCoownerTransfers.map(t => {
                const myConsent     = t.myConsent;
                const approvedCount = t.coOwnerConsents?.filter(c => c.status === 'approved').length || 0;
                const total         = t.coOwnerConsents?.length || 0;
                const progressPct   = total > 0 ? Math.round((approvedCount / total) * 100) : 0;

                return (
                  <div key={t._id} className="p-5 space-y-3">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                      <div className="flex items-center gap-4">
                        <div className="w-9 h-9 rounded-xl bg-on-surface-variant/8 flex items-center justify-center shrink-0">
                          <IconShield className="text-on-surface-variant/50" size={15} />
                        </div>
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-mono text-on-surface-variant/30">#{(t._id || '').slice(-6).toUpperCase()}</span>
                            <span className="text-xs font-bold">Survey {t.land?.location?.surveyNumber || '—'}</span>
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant/50 border border-outline-variant/10">
                              {t.land?.location?.village || '—'}
                            </span>
                          </div>
                          <p className="text-[10px] text-on-surface-variant/40">
                            Buyer: <span className="font-mono">{truncAddr(t.buyer?.walletAddress)}</span>
                            &nbsp;·&nbsp;<span className="font-medium">{formatPrice(t.price)}</span>
                            &nbsp;·&nbsp;Consents: <span className="text-on-surface-variant/60 font-bold">{approvedCount}/{total}</span>
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className={`text-[10px] font-bold px-3 py-1.5 rounded-full ${
                          myConsent?.status === 'approved' ? 'bg-emerald-900/40 text-emerald-400/80' :
                          myConsent?.status === 'rejected' ? 'bg-error/15 text-error' :
                          'bg-surface-container-high text-on-surface-variant/40'
                        }`}>
                          {myConsent?.status === 'approved' ? '✓ You Approved' :
                           myConsent?.status === 'rejected' ? '✕ You Rejected' : '⏳ Your Consent Pending'}
                        </span>
                        <StatusBadge status={t.status} />
                      </div>
                    </div>
                    <div className="pl-13">
                      <div className="flex justify-between text-[10px] text-on-surface-variant/40 mb-1">
                        <span>Consent Progress</span>
                        <span className={progressPct === 100 ? 'text-emerald-400/70 font-bold' : 'text-on-surface-variant/40'}>{progressPct}%</span>
                      </div>
                      <div className="h-1.5 w-full bg-surface-container-high rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all duration-500 ${progressBarClass(progressPct)}`} style={{ width: `${progressPct}%` }} />
                      </div>
                    </div>
                    {t.coOwnerConsents?.length > 0 && (
                      <div className="flex items-center gap-2 flex-wrap pl-13">
                        {t.coOwnerConsents.map((c, i) => (
                          <span key={i} className={`text-[9px] font-bold px-2 py-1 rounded-full border ${
                            c.status === 'approved' ? 'bg-emerald-900/30 text-emerald-400/70 border-emerald-800/30' :
                            c.status === 'rejected' ? 'bg-error/10 text-error border-error/20' :
                            'bg-surface-container-high text-on-surface-variant/40 border-outline-variant/10'
                          }`}>
                            Co-owner {i + 1}: {c.status}
                            {c.signedAt ? ` · ${new Date(c.signedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Incoming Offers */}
        <div className="bg-surface-container rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-outline-variant/10 flex items-center gap-2">
            <IconTransfer className="text-on-surface-variant" size={14} />
            <h3 className="text-sm font-headline font-bold">Incoming Offers</h3>
            {incomingOffers.length > 0 && (
              <span className="ml-auto text-[10px] font-mono px-2 py-0.5 rounded-full bg-on-surface-variant/10 text-on-surface-variant/50">
                {incomingOffers.length} pending
              </span>
            )}
          </div>

          {incomingOffers.length === 0 ? (
            <p className="px-5 py-8 text-center text-on-surface-variant/40 text-xs">No pending offers</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-surface-container-low/50">
                  <tr className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant/50">
                    <th className="px-5 py-3">Survey No.</th>
                    <th className="px-5 py-3">Village</th>
                    <th className="px-5 py-3">Buyer</th>
                    <th className="px-5 py-3">Price</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">Date</th>
                    <th className="px-5 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/5 text-xs">
                  {incomingOffers.map(o => (
                    <tr key={o._id} className="hover:bg-surface-container-high/30 transition-colors">
                      <td className="px-5 py-3 font-mono text-on-surface-variant/50">{o.land?.location?.surveyNumber || '—'}</td>
                      <td className="px-5 py-3 text-on-surface-variant/70">{o.land?.location?.village || '—'}</td>
                      <td className="px-5 py-3 font-mono text-on-surface-variant/50">
                        {o.buyer?.walletAddress ? truncAddr(o.buyer.walletAddress) : o.buyer?.profile?.fullName || '—'}
                      </td>
                      <td className="px-5 py-3 font-bold">{formatPrice(o.price)}</td>
                      <td className="px-5 py-3"><StatusBadge status={o.status} /></td>
                      <td className="px-5 py-3 font-mono text-on-surface-variant/50">
                        {o.createdAt ? new Date(o.createdAt).toLocaleDateString('en-IN') : '—'}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-2">
                          {o.status === 'offer_sent' && (
                            <>
                              <button
                                onClick={() => acceptOffer(o._id).then(() => { refetch(); refetchIncoming(); })}
                                disabled={accepting}
                                className="px-3 py-1.5 bg-emerald-900/30 text-emerald-400/80 text-[10px] font-bold rounded-md hover:bg-emerald-900/50 transition-colors disabled:opacity-50"
                              >Accept</button>
                              <button
                                onClick={() => rejectOffer(o._id).then(() => { refetch(); refetchIncoming(); })}
                                disabled={rejecting}
                                className="px-3 py-1.5 bg-surface-container-highest text-on-surface text-[10px] font-bold rounded-md hover:bg-error/10 hover:text-error transition-colors disabled:opacity-50"
                              >Reject</button>
                            </>
                          )}
                          {o.status !== 'offer_sent' && (
                            <StatusBadge status={o.status} />
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Active Seller Transfers — pipeline cards */}
        {transfersList.filter(t => ['escrow_locked', 'officer_review'].includes(t.status)).length > 0 && (
          <div className="bg-surface-container rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-outline-variant/10 flex items-center gap-2">
              <IconEscrow className="text-on-surface-variant" size={14} />
              <h3 className="text-sm font-headline font-bold">Transfer Pipeline</h3>
              <span className="ml-auto text-[10px] font-mono px-2 py-0.5 rounded-full bg-on-surface-variant/10 text-on-surface-variant/50">
                {transfersList.filter(t => ['escrow_locked', 'officer_review'].includes(t.status)).length} in progress
              </span>
            </div>
            <div className="divide-y divide-outline-variant/5">
              {transfersList
                .filter(t => ['escrow_locked', 'officer_review'].includes(t.status))
                .map(t => (
                  <SellerPipelineCard
                    key={t._id}
                    transfer={t}
                    onSubmitToOfficers={() => handleSubmitToOfficers(t)}
                    onOfficerApprove={() => handleOfficerDecision(t, true)}
                    onOfficerReject={() => handleOfficerDecision(t, false)}
                    actionLoading={actionLoading}
                  />
                ))}
            </div>
          </div>
        )}

        {/* Co-owner Consent Tracking */}
        <div className="bg-surface-container rounded-xl overflow-hidden">
          <div className="px-6 py-5 border-b border-outline-variant/10 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-on-surface-variant/8 flex items-center justify-center">
              <IconCheck className="text-on-surface-variant/50" size={16} />
            </div>
            <div>
              <h3 className="text-sm font-headline font-bold">Co-owner Consent Tracking</h3>
              <p className="text-[10px] text-on-surface-variant/50 mt-0.5">
                {transfersList.filter(t => t.coOwnerConsents?.length > 0).length} active transfers requiring consent
              </p>
            </div>
          </div>

          {transfersList.filter(t => t.coOwnerConsents?.length > 0).length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-on-surface-variant/30">
              <IconCheck size={40} className="mb-3 opacity-20" />
              <p className="text-sm">No co-owner consents required</p>
              <p className="text-[10px] mt-1">Transfers with co-owners will appear here</p>
            </div>
          ) : (
            <div className="p-6 space-y-8">
              {transfersList
                .filter(t => t.coOwnerConsents?.length > 0)
                .map(t => {
                  const approvedCount = t.coOwnerConsents.filter(c => c.status === 'approved').length;
                  const total = t.coOwnerConsents.length;
                  const progressPct = Math.round((approvedCount / total) * 100);

                  return (
                    <div key={t._id} className="bg-surface-container-high/40 rounded-2xl border border-outline-variant/10 overflow-hidden">
                      <div className="px-6 py-4 flex items-center justify-between border-b border-outline-variant/10 bg-surface-container-high/60">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-mono text-on-surface-variant/30">#{(t._id || '').slice(-6).toUpperCase()}</span>
                            <span className="text-xs font-bold">Survey {t.land?.location?.surveyNumber || '—'}</span>
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant/50 border border-outline-variant/10">
                              {t.land?.location?.village || '—'}
                            </span>
                          </div>
                          <p className="text-[10px] text-on-surface-variant/40 font-mono">
                            Buyer: {t.buyer?.walletAddress ? truncAddr(t.buyer.walletAddress) : t.buyer?.profile?.fullName || '—'}
                            &nbsp;·&nbsp;{formatPrice(t.price)}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <p className="text-[10px] text-on-surface-variant/40">Consents</p>
                            <p className="text-sm font-bold font-mono">
                              <span className="text-on-surface-variant/70">{approvedCount}</span>
                              <span className="text-on-surface-variant/30">/{total}</span>
                            </p>
                          </div>
                          <StatusBadge status={t.status} />
                        </div>
                      </div>

                      <div className="px-6 pt-4 pb-2">
                        <div className="flex justify-between text-[10px] text-on-surface-variant/40 mb-1.5">
                          <span>Approval Progress</span>
                          <span className={progressPct === 100 ? 'text-emerald-400/70 font-bold' : 'text-on-surface-variant/40'}>{progressPct}%</span>
                        </div>
                        <div className="h-2 w-full bg-surface-container rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all duration-500 ${progressBarClass(progressPct)}`} style={{ width: `${progressPct}%` }} />
                        </div>
                      </div>

                      <div className="px-6 py-5">
                        <div className="relative">
                          <div className="absolute left-[15px] top-0 bottom-0 w-px bg-outline-variant/20" />
                          <div className="space-y-0">
                            {t.coOwnerConsents.map((c, i) => {
                              const isApproved = c.status === 'approved';
                              const isRejected = c.status === 'rejected';
                              const isPending  = c.status === 'pending';
                              const isLast     = i === t.coOwnerConsents.length - 1;

                              return (
                                <div key={i} className={`relative flex gap-5 ${!isLast ? 'pb-6' : ''}`}>
                                  <div className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center shrink-0 border-2 transition-all ${
                                    isApproved ? 'bg-emerald-900/30 border-emerald-700/50 text-emerald-400/70'
                                    : isRejected ? 'bg-error/15 border-error text-error'
                                    : 'bg-surface-container border-outline-variant/30 text-on-surface-variant/30'
                                  }`}>
                                    {isApproved ? (
                                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                                        <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                      </svg>
                                    ) : isRejected ? (
                                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                                        <path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                                      </svg>
                                    ) : (
                                      <div className="w-2 h-2 rounded-full bg-on-surface-variant/20" />
                                    )}
                                  </div>

                                  <div className={`flex-1 min-w-0 p-4 rounded-xl border transition-all ${
                                    isApproved ? 'bg-emerald-900/10 border-emerald-800/20'
                                    : isRejected ? 'bg-error/5 border-error/15'
                                    : 'bg-surface-container border-outline-variant/10'
                                  }`}>
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="space-y-1 min-w-0">
                                        <p className="text-xs font-bold truncate">
                                          {c.coOwner?.fullName || (c.coOwner?.walletAddress ? truncAddr(c.coOwner.walletAddress) : `Co-owner ${i + 1}`)}
                                        </p>
                                        {c.coOwner?.walletAddress && (
                                          <p className="text-[10px] font-mono text-on-surface-variant/40">{truncAddr(c.coOwner.walletAddress)}</p>
                                        )}
                                        {c.signedAt && (
                                          <p className="text-[10px] text-on-surface-variant/40">
                                            Signed {new Date(c.signedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                          </p>
                                        )}
                                        {isPending && <p className="text-[10px] text-on-surface-variant/30 animate-pulse">Awaiting signature...</p>}
                                      </div>
                                      <span className={`shrink-0 text-[10px] font-bold px-2.5 py-1 rounded-full ${
                                        isApproved ? 'bg-emerald-900/30 text-emerald-400/70'
                                        : isRejected ? 'bg-error/15 text-error'
                                        : 'bg-surface-container-high text-on-surface-variant/40'
                                      }`}>
                                        {isApproved ? 'Approved' : isRejected ? 'Rejected' : 'Pending'}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
};

/** Pipeline card for escrow_locked and officer_review transfers */
const SellerPipelineCard = ({ transfer: t, onSubmitToOfficers, onOfficerApprove, onOfficerReject, actionLoading }) => {
  const stepIdx = STATUS_STEP_INDEX[t.status] ?? 0;

  return (
    <div className="p-5 space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-mono text-on-surface-variant/30">#{(t._id || '').slice(-6).toUpperCase()}</span>
          <span className="text-xs font-bold">Survey {t.land?.location?.surveyNumber || '—'}</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant/50 border border-outline-variant/10">
            {t.land?.location?.village || '—'}
          </span>
          <span className="text-xs font-bold text-on-surface-variant/70">{formatPrice(t.price)}</span>
        </div>
        <StatusBadge status={t.status} />
      </div>

      {/* Progress stepper */}
      <div className="flex items-center gap-0">
        {FLOW_STEPS.map((step, i) => (
          <React.Fragment key={step.key}>
            <div className="flex flex-col items-center gap-1 min-w-0">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold border ${
                i < stepIdx  ? 'bg-emerald-900/40 border-emerald-700/50 text-emerald-400/80' :
                i === stepIdx ? 'bg-primary/10 border-primary/40 text-primary' :
                'bg-surface-container border-outline-variant/20 text-on-surface-variant/30'
              }`}>
                {i < stepIdx ? '✓' : i + 1}
              </div>
              <span className={`text-[9px] font-bold whitespace-nowrap ${i <= stepIdx ? 'text-on-surface-variant/60' : 'text-on-surface-variant/25'}`}>
                {step.label}
              </span>
            </div>
            {i < FLOW_STEPS.length - 1 && (
              <div className={`flex-1 h-px mx-1 mb-4 ${i < stepIdx ? 'bg-emerald-700/40' : 'bg-outline-variant/15'}`} />
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Escrow + proposal info */}
      {t.escrow && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[10px]">
          <div className="bg-surface-container-high/50 p-2.5 rounded-lg">
            <p className="text-on-surface-variant/40 mb-1">Escrow</p>
            <p className="font-bold capitalize">{t.escrow.status}</p>
          </div>
          <div className="bg-surface-container-high/50 p-2.5 rounded-lg">
            <p className="text-on-surface-variant/40 mb-1">Locked</p>
            <p className="font-mono font-bold">{t.escrow.lockedAmount || '—'}</p>
          </div>
          <div className="bg-surface-container-high/50 p-2.5 rounded-lg">
            <p className="text-on-surface-variant/40 mb-1">Proposal ID</p>
            <p className="font-mono truncate text-primary/60">{t.escrow.proposalId ?? '—'}</p>
          </div>
          <div className="bg-surface-container-high/50 p-2.5 rounded-lg">
            <p className="text-on-surface-variant/40 mb-1">Tx Hash</p>
            <p className="font-mono truncate text-on-surface-variant/50">{t.escrow.txHash ? truncAddr(t.escrow.txHash) : '—'}</p>
          </div>
        </div>
      )}

      {/* Seller action: submit to officers */}
      {t.status === 'escrow_locked' && (
        <button
          onClick={onSubmitToOfficers}
          disabled={actionLoading === `submit-${t._id}`}
          className="px-4 py-2 bg-primary/10 text-primary text-[10px] font-bold rounded-lg hover:bg-primary/20 transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          {actionLoading === `submit-${t._id}` ? (
            <span className="animate-pulse">Submitting on-chain...</span>
          ) : (
            'Submit for Officer Review →'
          )}
        </button>
      )}

      {/* Officer review actions */}
      {t.status === 'officer_review' && (
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-on-surface-variant/40">Officer review in progress</span>
          <div className="ml-auto flex gap-2">
            <button
              onClick={onOfficerApprove}
              disabled={actionLoading === `officer-${t._id}`}
              className="px-3 py-1.5 bg-emerald-900/30 text-emerald-400/80 text-[10px] font-bold rounded-md hover:bg-emerald-900/50 transition-colors disabled:opacity-50"
            >
              {actionLoading === `officer-${t._id}` ? '...' : '✓ Approve (Officer)'}
            </button>
            <button
              onClick={onOfficerReject}
              disabled={actionLoading === `officer-${t._id}`}
              className="px-3 py-1.5 bg-error/10 text-error text-[10px] font-bold rounded-md hover:bg-error/20 transition-colors disabled:opacity-50"
            >
              ✕ Reject (Officer)
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SellerTransfersPage;