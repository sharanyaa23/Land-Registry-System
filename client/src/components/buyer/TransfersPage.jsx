import React, { useState, useCallback } from 'react';
import SharedNavbar from '../SharedNavbar.jsx';
import Footer from '../Footer.jsx';
import PageHeader from '../shared/PageHeader.jsx';
import StatCard from '../shared/StatCard.jsx';
import StatusBadge from '../shared/StatusBadge.jsx';
import { IconTransfer, IconCheck, IconAlert } from '../icons/Icons.jsx';
import useApi, { useMutation } from '../../hooks/useApi.js';
import { transferAPI } from '../../services/api.js';

const BG = {
  backgroundColor: '#0c0e14',
  backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(116,117,125,0.04) 1px, transparent 0)',
  backgroundSize: '32px 32px',
  color: '#e5e4ed'
};

const truncAddr = (a) => a ? `${a.slice(0, 6)}...${a.slice(-4)}` : '—';

const formatPrice = (price) => {
  if (!price?.amount) return '—';
  if (price.currency === 'INR') {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency', currency: 'INR', maximumFractionDigits: 0
    }).format(price.amount);
  }
  return `${price.amount} ${price.currency}`;
};

const ACTIVE_STATUSES = [
  'offer_sent', 'coowner_consent_pending', 'offer_accepted',
  'escrow_locked', 'officer_review', 'approved'
];

const FLOW_STEPS = [
  { key: 'offer_sent',               label: 'Offer Sent' },
  { key: 'offer_accepted',           label: 'Accepted' },
  { key: 'escrow_locked',            label: 'Funds Locked' },
  { key: 'officer_review',           label: 'Under Review' },
  { key: 'completed',                label: 'Completed' },
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

const TransfersPage = () => {
  const [filter, setFilter] = useState('all');
  const [actionLoading, setActionLoading] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [modalTransfer, setModalTransfer] = useState(null);

  const { data: transfers, loading, refetch } = useApi(useCallback(() => transferAPI.getMyTransfers(), []));
  const transfersList = Array.isArray(transfers) ? transfers : (transfers?.transfers || []);

  const filtered = transfersList.filter(t => {
    if (filter === 'active') return ACTIVE_STATUSES.includes(t.status);
    if (filter === 'completed') return t.status === 'completed';
    if (filter === 'rejected') return t.status === 'rejected' || t.status === 'cancelled';
    return true;
  });

  const activeCount    = transfersList.filter(t => ACTIVE_STATUSES.includes(t.status)).length;
  const completedCount = transfersList.filter(t => t.status === 'completed').length;
  const rejectedCount  = transfersList.filter(t => ['rejected', 'cancelled'].includes(t.status)).length;

 // ==================== LOCK FUNDS - USER INPUT IN ETH/POL ====================
const handleLockFunds = async (transfer) => {
  if (!window.ethereum) {
    alert("MetaMask not detected. Please connect to Hardhat Local network (Chain ID: 31337)");
    return;
  }

  setActionLoading(`lock-${transfer._id}`);
  setActionError(null);

  try {
    await window.ethereum.request({ method: 'eth_requestAccounts' });

    const currency = transfer.price?.currency || 'ETH';
    const suggestedAmount = transfer.price?.amount 
      ? Number(transfer.price.amount).toFixed(4) 
      : "0.1";   // Default 0.1 ETH/POL

    const amountInEth = prompt(
      `Enter amount to lock in ${currency}:\n\n` +
      `Land: Survey ${transfer.land?.location?.surveyNumber || '—'}\n` +
      `Original Price: ${formatPrice(transfer.price)}\n\n` +
      `Suggested: ${suggestedAmount} ${currency}`,
      suggestedAmount
    );

    if (!amountInEth || isNaN(amountInEth)) {
      alert("Invalid amount entered.");
      return;
    }

    // Convert ETH/POL to Wei
    const amountWei = (parseFloat(amountInEth) * 1e18).toString();

    await transferAPI.lockFunds(transfer._id, { amountWei });

    alert(`✅ Successfully locked ${amountInEth} ${currency} in escrow!`);
    await refetch();
    setModalTransfer(null);

  } catch (err) {
    console.error(err);
    setActionError(err.response?.data?.error || err.message || 'Failed to lock funds');
  } finally {
    setActionLoading(null);
  }
};

  // ==================== SUBMIT TO OFFICERS - NO PRIVATE KEY ====================
  const handleSubmitOfficers = async (transfer) => {
    if (!window.ethereum) {
      alert("MetaMask not detected.");
      return;
    }

    setActionLoading(`submit-${transfer._id}`);
    setActionError(null);

    try {
      await window.ethereum.request({ method: 'eth_requestAccounts' });

      await transferAPI.submitToOfficers(transfer._id);

      alert("✅ Submitted to officers successfully!");
      await refetch();

    } catch (err) {
      console.error(err);
      setActionError(err.response?.data?.error || 'Failed to submit');
    } finally {
      setActionLoading(null);
    }
  };

  const getNextAction = (t) => {
    switch (t.status) {
      case 'offer_accepted':
        return { label: 'Lock Funds', color: 'emerald', handler: () => handleLockFunds(t), key: `lock-${t._id}` };
      case 'escrow_locked':
        return { label: 'Submit to Officers', color: 'primary', handler: () => handleSubmitOfficers(t), key: `submit-${t._id}` };
      default:
        return null;
    }
  };

  return (
    <div className="font-body min-h-screen flex flex-col" style={BG}>
      <SharedNavbar role="buyer" activePage="/buyer/transfers" />
      <main className="flex-grow w-full max-w-7xl mx-auto px-8 py-10 space-y-8">
        <PageHeader title="Transfer Requests" subtitle="Track land transfer transactions and escrow status." icon={IconTransfer} />

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total"     value={loading ? '...' : String(transfersList.length).padStart(2,'0')} icon={IconTransfer} iconColor="primary" />
          <StatCard label="Active"    value={loading ? '...' : String(activeCount).padStart(2,'0')}          icon={IconTransfer} iconColor="secondary" />
          <StatCard label="Completed" value={loading ? '...' : String(completedCount).padStart(2,'0')}       icon={IconCheck}    iconColor="green-500" />
          <StatCard label="Rejected"  value={loading ? '...' : String(rejectedCount).padStart(2,'0')}        icon={IconAlert}    iconColor="error" />
        </div>

        {/* Error banner */}
        {actionError && (
          <div className="p-3 bg-error/10 border border-error/20 rounded-lg text-error text-xs">
            {actionError}
            <button onClick={() => setActionError(null)} className="ml-3 underline opacity-60">Dismiss</button>
          </div>
        )}

        {/* Filter tabs */}
        <div className="flex gap-1.5">
          {['all', 'active', 'completed', 'rejected'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-colors ${
                filter === f ? 'bg-primary/10 text-primary' : 'text-on-surface-variant/40 hover:bg-surface-container-high'
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Transfers table - EXACT SAME DESIGN AS BEFORE */}
        <div className="bg-surface-container rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-surface-container-low/50">
                <tr className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant/50">
                  <th className="px-5 py-3">ID</th>
                  <th className="px-5 py-3">Survey No.</th>
                  <th className="px-5 py-3">Village</th>
                  <th className="px-5 py-3">Seller</th>
                  <th className="px-5 py-3">Price</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/5 text-xs">
                {loading ? (
                  <tr><td colSpan={8} className="px-5 py-8 text-center text-on-surface-variant/40">Loading...</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={8} className="px-5 py-8 text-center text-on-surface-variant/40">No transfers found</td></tr>
                ) : filtered.map(t => {
                  const action = getNextAction(t);
                  return (
                    <React.Fragment key={t._id}>
                      <tr
                        className="hover:bg-surface-container-high/30 transition-colors cursor-pointer"
                        onClick={() => setModalTransfer(modalTransfer?._id === t._id ? null : t)}
                      >
                        <td className="px-5 py-3 font-mono text-primary/60">#{(t._id || '').slice(-6).toUpperCase()}</td>
                        <td className="px-5 py-3 font-mono">{t.land?.location?.surveyNumber || '—'}</td>
                        <td className="px-5 py-3 text-on-surface-variant/70">{t.land?.location?.village || '—'}</td>
                        <td className="px-5 py-3 font-mono text-on-surface-variant/50">
                          {t.seller?.walletAddress ? truncAddr(t.seller.walletAddress) : t.seller?.profile?.fullName || '—'}
                        </td>
                        <td className="px-5 py-3 font-bold">{formatPrice(t.price)}</td>
                        <td className="px-5 py-3"><StatusBadge status={t.status} /></td>
                        <td className="px-5 py-3 font-mono text-on-surface-variant/50">
                          {t.createdAt ? new Date(t.createdAt).toLocaleDateString('en-IN') : '—'}
                        </td>
                        <td className="px-5 py-3 text-right">
                          {action ? (
                            <button
                              onClick={(e) => { e.stopPropagation(); action.handler(); }}
                              disabled={actionLoading === action.key}
                              className={`px-3 py-1.5 text-[10px] font-bold rounded-md transition-colors disabled:opacity-50 ${
                                action.color === 'emerald'
                                  ? 'bg-emerald-900/30 text-emerald-400/80 hover:bg-emerald-900/50'
                                  : 'bg-primary/10 text-primary hover:bg-primary/20'
                              }`}
                            >
                              {actionLoading === action.key ? 'Processing...' : action.label}
                            </button>
                          ) : (
                            <span className="text-[10px] text-on-surface-variant/30">—</span>
                          )}
                        </td>
                      </tr>

                      {/* Expandable progress row - unchanged */}
                      {modalTransfer?._id === t._id && (
                        <tr className="bg-surface-container-high/20">
                          <td colSpan={8} className="px-5 py-5">
                            <TransferProgressDetail 
                              transfer={t} 
                              onLockFunds={() => handleLockFunds(t)}
                              onSubmitOfficers={() => handleSubmitOfficers(t)}
                              actionLoading={actionLoading} 
                            />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Active transfers — detailed progress cards - unchanged */}
        {transfersList.filter(t => ACTIVE_STATUSES.includes(t.status)).length > 0 && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold font-headline px-1">Active Transfer Progress</h3>
            {transfersList
              .filter(t => ACTIVE_STATUSES.includes(t.status))
              .map(t => (
                <ActiveTransferCard
                  key={t._id}
                  transfer={t}
                  onLockFunds={() => handleLockFunds(t)}
                  onSubmitOfficers={() => handleSubmitOfficers(t)}
                  actionLoading={actionLoading}
                />
              ))}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
};

/** Progress stepper detail - Design unchanged */
const TransferProgressDetail = ({ transfer: t, onLockFunds, onSubmitOfficers, actionLoading }) => {
  const stepIdx = STATUS_STEP_INDEX[t.status] ?? 0;
  const isFailed = t.status === 'rejected' || t.status === 'cancelled';

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-0">
        {FLOW_STEPS.map((step, i) => (
          <React.Fragment key={step.key}>
            <div className="flex flex-col items-center gap-1 min-w-0">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold border transition-all ${
                isFailed && i === stepIdx ? 'bg-error/15 border-error text-error' :
                i < stepIdx  ? 'bg-emerald-900/40 border-emerald-700/50 text-emerald-400/80' :
                i === stepIdx ? 'bg-primary/10 border-primary/40 text-primary' :
                'bg-surface-container border-outline-variant/20 text-on-surface-variant/30'
              }`}>
                {i < stepIdx ? '✓' : i + 1}
              </div>
              <span className={`text-[9px] font-bold whitespace-nowrap ${
                i <= stepIdx ? 'text-on-surface-variant/70' : 'text-on-surface-variant/30'
              }`}>{step.label}</span>
            </div>
            {i < FLOW_STEPS.length - 1 && (
              <div className={`flex-1 h-px mx-1 mb-4 ${i < stepIdx ? 'bg-emerald-700/40' : 'bg-outline-variant/15'}`} />
            )}
          </React.Fragment>
        ))}
      </div>

      {t.escrow && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[10px]">
          <div className="bg-surface-container p-3 rounded-lg">
            <p className="text-on-surface-variant/40 mb-1">Escrow Status</p>
            <p className="font-bold capitalize">{t.escrow.status || '—'}</p>
          </div>
          <div className="bg-surface-container p-3 rounded-lg">
            <p className="text-on-surface-variant/40 mb-1">Locked Amount</p>
            <p className="font-bold font-mono">{t.escrow.lockedAmount || '—'}</p>
          </div>
          <div className="bg-surface-container p-3 rounded-lg col-span-2">
            <p className="text-on-surface-variant/40 mb-1">Tx Hash</p>
            <p className="font-mono truncate text-primary/60">{t.escrow.txHash || '—'}</p>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      {t.status === 'offer_accepted' && (
        <button
          onClick={onLockFunds}
          disabled={actionLoading === `lock-${t._id}`}
          className="px-4 py-2 bg-emerald-900/30 text-emerald-400/80 text-[10px] font-bold rounded-lg hover:bg-emerald-900/50 transition-colors disabled:opacity-50"
        >
          {actionLoading === `lock-${t._id}` ? 'Processing...' : 'Lock Funds in Escrow →'}
        </button>
      )}

      {t.status === 'escrow_locked' && (
        <button
          onClick={onSubmitOfficers}
          disabled={actionLoading === `submit-${t._id}`}
          className="px-4 py-2 bg-primary/10 text-primary text-[10px] font-bold rounded-lg hover:bg-primary/20 transition-colors disabled:opacity-50"
        >
          {actionLoading === `submit-${t._id}` ? 'Processing...' : 'Submit to Officers →'}
        </button>
      )}
    </div>
  );
};

const ActiveTransferCard = ({ transfer: t, onLockFunds, onSubmitOfficers, actionLoading }) => {
  const stepIdx  = STATUS_STEP_INDEX[t.status] ?? 0;
  const isFailed = t.status === 'rejected' || t.status === 'cancelled';

  return (
    <div className="bg-surface-container rounded-xl border border-outline-variant/10 overflow-hidden">
      <div className="px-5 py-4 border-b border-outline-variant/10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-mono text-on-surface-variant/30">#{(t._id || '').slice(-6).toUpperCase()}</span>
          <span className="text-xs font-bold">Survey {t.land?.location?.surveyNumber || '—'}</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant/50 border border-outline-variant/10">
            {t.land?.location?.village || '—'}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold">{formatPrice(t.price)}</span>
          <StatusBadge status={t.status} />
        </div>
      </div>

      <div className="p-5 space-y-5">
        <div className="flex items-center gap-0">
          {FLOW_STEPS.map((step, i) => (
            <React.Fragment key={step.key}>
              <div className="flex flex-col items-center gap-1 min-w-0">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-bold border transition-all ${
                  isFailed && i === stepIdx ? 'bg-error/15 border-error text-error' :
                  i < stepIdx  ? 'bg-emerald-900/40 border-emerald-700/50 text-emerald-400/80' :
                  i === stepIdx ? 'bg-primary/10 border-primary/40 text-primary animate-pulse' :
                  'bg-surface-container border-outline-variant/20 text-on-surface-variant/30'
                }`}>
                  {i < stepIdx ? '✓' : i + 1}
                </div>
                <span className={`text-[9px] font-bold whitespace-nowrap ${
                  i <= stepIdx ? 'text-on-surface-variant/70' : 'text-on-surface-variant/30'
                }`}>{step.label}</span>
              </div>
              {i < FLOW_STEPS.length - 1 && (
                <div className={`flex-1 h-px mx-2 mb-4 ${i < stepIdx ? 'bg-emerald-700/40' : 'bg-outline-variant/15'}`} />
              )}
            </React.Fragment>
          ))}
        </div>

        <StatusMessage transfer={t} />

        {t.escrow && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-[10px]">
            <div className="bg-surface-container-high/40 p-3 rounded-lg border border-outline-variant/10">
              <p className="text-on-surface-variant/40 mb-1">Escrow Status</p>
              <p className="font-bold capitalize">{t.escrow.status || '—'}</p>
            </div>
            <div className="bg-surface-container-high/40 p-3 rounded-lg border border-outline-variant/10">
              <p className="text-on-surface-variant/40 mb-1">Locked Amount</p>
              <p className="font-bold font-mono">{t.escrow.lockedAmount || '—'}</p>
            </div>
            <div className="bg-surface-container-high/40 p-3 rounded-lg border border-outline-variant/10 col-span-2 md:col-span-1">
              <p className="text-on-surface-variant/40 mb-1">Proposal ID</p>
              <p className="font-mono truncate text-primary/60">{t.escrow.proposalId ?? '—'}</p>
            </div>
          </div>
        )}

        {t.status === 'offer_accepted' && (
          <button
            onClick={onLockFunds}
            disabled={actionLoading === `lock-${t._id}`}
            className="w-full py-2.5 bg-emerald-900/30 text-emerald-400/80 text-[10px] font-bold rounded-lg hover:bg-emerald-900/50 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {actionLoading === `lock-${t._id}` ? (
              <span className="animate-pulse">Processing transaction...</span>
            ) : (
              <>
                <span className="text-sm">🔒</span> Lock Funds in Escrow
              </>
            )}
          </button>
        )}

        {t.status === 'escrow_locked' && (
          <button
            onClick={onSubmitOfficers}
            disabled={actionLoading === `submit-${t._id}`}
            className="w-full py-2.5 bg-primary/10 text-primary text-[10px] font-bold rounded-lg hover:bg-primary/20 transition-colors disabled:opacity-50"
          >
            {actionLoading === `submit-${t._id}` ? 'Processing...' : 'Submit to Officers'}
          </button>
        )}
      </div>
    </div>
  );
};

const StatusMessage = ({ transfer: t }) => {
  const messages = {
    offer_sent:               { text: 'Waiting for the seller to accept your offer.', color: 'text-on-surface-variant/50' },
    coowner_consent_pending:  { text: 'Seller accepted. Waiting for co-owner consents.', color: 'text-on-surface-variant/50' },
    offer_accepted:           { text: 'All consents received. Lock your funds to proceed.', color: 'text-emerald-400/80' },
    escrow_locked:            { text: 'Funds locked. Waiting for seller to submit for officer review.', color: 'text-on-surface-variant/50' },
    officer_review:           { text: 'Under officer review. Officers will approve or reject shortly.', color: 'text-on-surface-variant/50' },
    approved:                 { text: 'Officers approved. Transfer is being finalized.', color: 'text-emerald-400/80' },
    completed:                { text: 'Transfer complete. Land ownership has been transferred to you.', color: 'text-emerald-400/80' },
    rejected:                 { text: 'Transfer was rejected. Your funds will be refunded.', color: 'text-error' },
    cancelled:                { text: 'Transfer was cancelled.', color: 'text-error' },
  };
  const m = messages[t.status];
  if (!m) return null;
  return <p className={`text-[10px] ${m.color}`}>{m.text}</p>;
};

export default TransfersPage;