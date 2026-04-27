import React, { useState, useCallback } from 'react';
import SharedNavbar from '../SharedNavbar.jsx';
import Footer from '../Footer.jsx';
import PageHeader from '../shared/PageHeader.jsx';
import StatCard from '../shared/StatCard.jsx';
import StatusBadge from '../shared/StatusBadge.jsx';
import {
  IconLand, IconTransfer, IconSearch, IconNotification,
  IconCheck, IconChevron, IconAlert, IconMapPin
} from '../icons/Icons.jsx';
import SpatialView from '../shared/SpatialView.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import useApi, { useMutation } from '../../hooks/useApi.js';
import { landAPI, transferAPI, notificationAPI } from '../../services/api.js';

const BG = {
  backgroundColor: '#0c0e14',
  backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(116,117,125,0.04) 1px, transparent 0)',
  backgroundSize:  '32px 32px',
  color:           '#e5e4ed'
};

const truncAddr = (a) => a ? `${a.slice(0, 6)}...${a.slice(-4)}` : '—';

const STAGE_LABEL = {
  offer_sent:              'Offer Sent',
  offer_accepted:          'Accepted',
  coowner_consent_pending: 'Co-owner Consent',
  escrow_locked:           'Escrow Locked',
  officer_review:          'Officer Review',
  approved:                'Approved',
  completed:               'Completed',
  rejected:                'Rejected',
  cancelled:               'Cancelled',
};

// ── Offer Price Modal ────────────────────────────────────────────
// Shows the land's listed price and confirms before sending offer
const OfferModal = ({ land, onClose, onConfirm, loading }) => {
  const listedPrice    = land?.listingPrice?.amount;
  const listedCurrency = land?.listingPrice?.currency || 'POL';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-[#1a1c24] border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-sm font-bold text-white">Confirm Transfer Request</h3>
            <p className="text-[10px] text-white/40 mt-0.5 font-mono">
              Survey: {land?.location?.surveyNumber || land?.surveyNumber} — {land?.location?.village || land?.village}
            </p>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 text-white/40 hover:text-white flex items-center justify-center transition-colors text-sm">✕</button>
        </div>

        {/* Price */}
        <div className="p-4 bg-white/5 rounded-xl mb-5 space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-white/40">Listed Price</span>
            <span className="font-bold text-white font-mono">
              {listedPrice
                ? listedCurrency === 'INR'
                  ? new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(listedPrice)
                  : `${listedPrice} ${listedCurrency}`
                : 'Price not set'}
            </span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-white/40">Owner</span>
            <span className="font-mono text-white/70">
              {land?.owner?.profile?.fullName || truncAddr(land?.owner?.walletAddress) || '—'}
            </span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-white/40">Area</span>
            <span className="font-mono text-white/70">
              {land?.area?.value || land?.area} {land?.area?.unit?.toUpperCase() || 'HA'}
            </span>
          </div>
        </div>

        <p className="text-[10px] text-white/30 mb-5 leading-relaxed">
          Sending this request notifies the seller. You will be asked to lock funds
          on-chain only after the seller accepts your offer.
        </p>

        <div className="flex gap-3">
          <button onClick={onClose}
            className="flex-1 h-10 bg-white/5 hover:bg-white/10 text-white/60 text-xs font-bold rounded-lg transition-colors">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={loading}
            className="flex-[2] h-10 bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
            {loading ? <span className="animate-pulse">Sending...</span> : <><IconCheck size={12} /> Send Offer</>}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Transfer Stage Tracker ───────────────────────────────────────
const TransferStageTracker = ({ transfer }) => {
  const stages = [
    'offer_sent', 'offer_accepted',
    'coowner_consent_pending', 'escrow_locked',
    'officer_review', 'approved', 'completed',
  ];
  const currentIdx = stages.indexOf(transfer.status);
  const isRejected = ['rejected', 'cancelled'].includes(transfer.status);

  return (
    <div className="p-3 bg-surface-container-high rounded-lg space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant/50">Progress</span>
        <StatusBadge status={transfer.status} />
      </div>
      {isRejected ? (
        <p className="text-[10px] text-error/70">
          Transfer {transfer.status}.
          {transfer.rejectionReason && ` Reason: ${transfer.rejectionReason}`}
        </p>
      ) : (
        <div className="flex items-center gap-1 flex-wrap">
          {stages.map((stage, i) => (
            <React.Fragment key={stage}>
              <div className={`text-[9px] px-2 py-1 rounded-full font-bold transition-colors ${
                i < currentIdx   ? 'bg-secondary/20 text-secondary' :
                i === currentIdx ? 'bg-primary/20 text-primary ring-1 ring-primary/40' :
                'bg-surface-container text-on-surface-variant/30'
              }`}>
                {STAGE_LABEL[stage]}
              </div>
              {i < stages.length - 1 && (
                <span className={`text-[8px] ${i < currentIdx ? 'text-secondary/40' : 'text-white/10'}`}>›</span>
              )}
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
};

// ── Main Component ───────────────────────────────────────────────
const BuyerPage = () => {
  useAuth();

  const [searchForm,     setSearchForm]     = useState({ village: '', surveyNumber: '', status: '' });
  const [selectedParcel, setSelectedParcel] = useState(null);
  const [viewMode,       setViewMode]       = useState('list');
  const [currentPage,    setCurrentPage]    = useState(1);
  const [offerLand,      setOfferLand]      = useState(null); // land to show offer modal for
  const landsPerPage = 10;

  const { data: availableLands, loading: availableLandsLoading, refetch: refetchAvailableLands } = useApi(
    useCallback(() => landAPI.search({ page: currentPage, limit: landsPerPage }), [currentPage])
  );
  const { data: ownedLands,  loading: ownedLandsLoading  } = useApi(useCallback(() => landAPI.list({ role: 'buyer' }), []));
  const { data: transfers,   loading: transfersLoading, refetch: refetchTransfers } = useApi(useCallback(() => transferAPI.getMyTransfers(), []));
  const { data: notifications } = useApi(useCallback(() => notificationAPI.getAll(), []));

  const availableLandsList = Array.isArray(availableLands?.data)
    ? availableLands.data
    : Array.isArray(availableLands) ? availableLands : [];
  const ownedLandsList  = Array.isArray(ownedLands)    ? ownedLands    : [];
  const transfersList   = Array.isArray(transfers)     ? transfers     : [];
  const notifList       = Array.isArray(notifications) ? notifications : [];

  const filteredLands = availableLandsList.filter(land => {
    const villageMatch = !searchForm.village ||
      (land.location?.village || land.village || '').toLowerCase().includes(searchForm.village.toLowerCase());
    const surveyMatch = !searchForm.surveyNumber ||
      (land.location?.surveyNumber || land.surveyNumber || '').toLowerCase().includes(searchForm.surveyNumber.toLowerCase());
    const statusMatch = !searchForm.status || land.status === searchForm.status;
    return villageMatch && surveyMatch && statusMatch;
  });

  const pagination  = availableLands?.pagination || {};
  const totalPages  = pagination.totalPages || 1;
  const totalLands  = pagination.total || availableLandsList.length;
  const hasFilters  = searchForm.village || searchForm.surveyNumber || searchForm.status;

  const activeTransfers  = transfersList.filter(t => !['completed', 'rejected', 'cancelled'].includes(t.status)).length;
  const pendingTransfers = transfersList.filter(t => t.status === 'offer_sent').length;

  const { execute: createOffer, loading: offerLoading } = useMutation(
    useCallback((d) => transferAPI.createOffer(d), [])
  );

  // ── Open offer modal ─────────────────────────────────────────
  const handleInitiateTransfer = () => {
    if (!selectedParcel) return;
    setOfferLand(selectedParcel);
  };

  // ── Confirm offer ─────────────────────────────────────────────
  const handleConfirmOffer = async () => {
    if (!offerLand) return;
    try {
      await createOffer({
        landId:   offerLand._id,
        price:    offerLand.listingPrice?.amount || 0,
        currency: offerLand.listingPrice?.currency || 'POL',
      });
      setOfferLand(null);
      setSelectedParcel(null);
      setViewMode('list');
      await refetchTransfers();
      await refetchAvailableLands();
      alert('Transfer request sent! The seller will be notified.');
    } catch (error) {
      alert('Transfer failed: ' + (error.response?.data?.error || error.message));
    }
  };

  return (
    <div className="font-body min-h-screen flex flex-col" style={BG}>
      <SharedNavbar role="buyer" activePage="dashboard" />

      {/* Offer Modal */}
      {offerLand && (
        <OfferModal
          land={offerLand}
          onClose={() => setOfferLand(null)}
          onConfirm={handleConfirmOffer}
          loading={offerLoading}
        />
      )}

      <main className="flex-grow w-full max-w-7xl mx-auto px-8 py-10">
        <PageHeader title="Buyer Dashboard" subtitle="Explore verified land parcels and manage purchase requests." icon={IconLand} />

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard label="Available Lands"  value={String(availableLandsList.length).padStart(2,'0')} icon={IconLand}         iconColor="primary"             loading={availableLandsLoading} />
          <StatCard label="Active Transfers" value={String(activeTransfers).padStart(2,'0')}           icon={IconTransfer}     iconColor="secondary"           loading={transfersLoading}      />
          <StatCard label="Pending Offers"   value={String(pendingTransfers).padStart(2,'0')}          icon={IconTransfer}     iconColor="tertiary-container"  loading={transfersLoading}      />
          <StatCard label="Notifications"    value={notifList.length}                                   icon={IconNotification} iconColor="on-surface-variant"                                  />
        </div>

        {/* Map */}
        <div className="w-full h-[350px] rounded-xl overflow-hidden border border-outline-variant/10 mb-8 relative z-0">
          {selectedParcel?._id ? (
            <SpatialView key={selectedParcel._id} landId={selectedParcel._id} className="w-full h-full" />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center bg-surface-container">
              <IconMapPin size={48} className="text-on-surface-variant/20 mb-3" />
              <p className="text-sm text-on-surface-variant/40">No land selected</p>
              <p className="text-xs text-on-surface-variant/25 mt-1">Select a land from the list to view its boundary</p>
            </div>
          )}
        </div>

        {/* Search + Available Lands */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">

          {/* Land Search */}
          <div className="bg-surface-container p-6 rounded-xl space-y-5">
            <div className="flex items-center gap-2">
              <IconSearch size={16} className="text-on-surface-variant" />
              <h3 className="text-sm font-headline font-bold">Land Search</h3>
            </div>
            <div className="grid grid-cols-1 gap-4">
              {[
                { key: 'village',       label: 'Village',       placeholder: 'Enter village name' },
                { key: 'surveyNumber',  label: 'Survey Number', placeholder: 'Enter survey number' },
              ].map(f => (
                <div key={f.key} className="space-y-1">
                  <label className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant/60">{f.label}</label>
                  <input value={searchForm[f.key]} onChange={e => setSearchForm(p => ({ ...p, [f.key]: e.target.value }))}
                    className="w-full bg-surface-container-high border-none rounded-lg text-on-surface text-sm h-10 px-3 focus:ring-1 focus:ring-primary/40"
                    placeholder={f.placeholder} />
                </div>
              ))}
              <div className="space-y-1">
                <label className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant/60">Status</label>
                <select value={searchForm.status} onChange={e => setSearchForm(p => ({ ...p, status: e.target.value }))}
                  className="w-full bg-surface-container-high border-none rounded-lg text-on-surface text-sm h-10 px-3 focus:ring-1 focus:ring-primary/40">
                  <option value="">All</option>
                  <option value="verification_passed">Verified</option>
                  <option value="listed">Listed</option>
                  <option value="officer_review">Officer Review</option>
                  <option value="verification_failed">Verification Failed</option>
                  <option value="verification_pending">Pending</option>
                  <option value="transfer_pending">Transfer Pending</option>
                </select>
              </div>
            </div>
            <button onClick={() => setCurrentPage(1)} disabled={availableLandsLoading}
              className="w-full h-10 bg-primary/15 hover:bg-primary/25 border border-primary/20 text-primary font-bold text-xs rounded-lg transition-all disabled:opacity-50 uppercase tracking-wider">
              {availableLandsLoading ? 'Loading...' : 'Apply Filters'}
            </button>
            <p className="text-[10px] text-on-surface-variant/40">
              {filteredLands.length} result(s){hasFilters && ` (filtered from ${availableLandsList.length})`}
            </p>
          </div>

          {/* Available Lands / Land Detail */}
          <div className="bg-surface-container p-6 rounded-xl">
            {viewMode === 'list' ? (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-headline font-bold">Available Lands</h3>
                  <span className="text-[10px] text-on-surface-variant/40">{hasFilters ? `${filteredLands.length} filtered` : `${totalLands} total`}</span>
                </div>
                <div className="space-y-2 max-h-[280px] overflow-y-auto">
                  {availableLandsLoading ? (
                    <div className="text-center py-8"><p className="text-xs text-on-surface-variant/40">Loading...</p></div>
                  ) : filteredLands.length === 0 ? (
                    <div className="text-center py-8">
                      <div className="w-10 h-10 rounded-full bg-surface-variant/20 flex items-center justify-center mx-auto mb-3">
                        <IconSearch size={16} className="text-on-surface-variant" />
                      </div>
                      <p className="text-xs text-on-surface-variant">No lands found</p>
                      {hasFilters && (
                        <button onClick={() => setSearchForm({ village: '', surveyNumber: '', status: '' })}
                          className="mt-2 text-[10px] text-primary hover:underline">Clear filters</button>
                      )}
                    </div>
                  ) : filteredLands.map(land => (
                    <div key={land._id} className="bg-surface-container-high rounded-lg p-3 flex items-center justify-between hover:bg-surface-container-highest transition-colors">
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-xs">{land.location?.surveyNumber || land.surveyNumber}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <p className="text-[10px] text-on-surface-variant truncate">
                            {land.location?.village || land.village} — {land.area?.value || land.area} {land.area?.unit?.toUpperCase() || 'HA'}
                          </p>
                          <StatusBadge status={land.status} />
                        </div>
                        {/* Show listing price if set */}
                        {land.listingPrice?.amount && (
                          <p className="text-[10px] font-mono text-primary mt-0.5">
                            {land.listingPrice.currency === 'INR'
                              ? new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(land.listingPrice.amount)
                              : `${land.listingPrice.amount} ${land.listingPrice.currency}`}
                          </p>
                        )}
                      </div>
                      <button onClick={() => { setSelectedParcel(land); setViewMode('detail'); }}
                        className="w-8 h-8 rounded-full bg-primary/10 hover:bg-primary/20 flex items-center justify-center transition-colors shrink-0 ml-2">
                        <IconChevron size={14} className="text-primary" />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Pagination */}
                {!hasFilters && totalPages > 1 && (
                  <div className="flex items-center justify-between pt-3 mt-3 border-t border-outline-variant/10">
                    <div className="text-[10px] text-on-surface-variant/60">
                      {((currentPage - 1) * landsPerPage) + 1}–{Math.min(currentPage * landsPerPage, totalLands)} of {totalLands}
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
                        className="w-8 h-8 rounded-lg bg-surface-container-high border border-outline-variant/20 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed hover:bg-surface-container-highest transition-colors">
                        <IconChevron size={12} className="text-on-surface-variant rotate-180" />
                      </button>
                      <span className="text-[10px] text-on-surface-variant font-mono min-w-[50px] text-center">
                        {currentPage} / {totalPages}
                      </span>
                      <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
                        className="w-8 h-8 rounded-lg bg-surface-container-high border border-outline-variant/20 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed hover:bg-surface-container-highest transition-colors">
                        <IconChevron size={12} className="text-on-surface-variant" />
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              /* Land Detail View */
              <>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <button onClick={() => { setSelectedParcel(null); setViewMode('list'); }}
                      className="w-8 h-8 rounded-full bg-surface-variant/20 hover:bg-surface-variant/30 flex items-center justify-center transition-colors">
                      <IconChevron size={14} className="text-on-surface-variant rotate-180" />
                    </button>
                    <div>
                      <h3 className="text-sm font-headline font-bold">Land Details</h3>
                      {selectedParcel?.listingPrice?.amount && (
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-xs font-semibold text-primary">
                            {selectedParcel.listingPrice.currency === 'INR'
                              ? new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(selectedParcel.listingPrice.amount)
                              : `${selectedParcel.listingPrice.amount} ${selectedParcel.listingPrice.currency}`}
                          </span>
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-primary/10 text-primary leading-none">
                            {selectedParcel.listingPrice.currency}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  {selectedParcel?.status && <StatusBadge status={selectedParcel.status} />}
                </div>

                {selectedParcel && (
                  <div className="space-y-4">
                    <div className="bg-surface-container-high rounded-lg p-4 space-y-1">
                      {[
                        { label: 'Survey ID', value: selectedParcel.location?.surveyNumber || selectedParcel.surveyNumber },
                        { label: 'Village',   value: selectedParcel.location?.village  || selectedParcel.village },
                        { label: 'Taluka',    value: selectedParcel.location?.taluka   || '—' },
                        { label: 'District',  value: selectedParcel.location?.district || '—' },
                        { label: 'Area',      value: `${selectedParcel.area?.value || selectedParcel.area} ${selectedParcel.area?.unit?.toUpperCase() || 'HA'}` },
                        { label: 'Gat Number',value: selectedParcel.location?.gatNumber || 'N/A' },
                        { label: 'Owner',     value: selectedParcel.owner?.profile?.fullName || truncAddr(selectedParcel.owner?.walletAddress) || 'Unknown' },
                      ].map((row, i, arr) => (
                        <div key={row.label} className={`flex justify-between py-2 ${i < arr.length - 1 ? 'border-b border-outline-variant/10' : ''}`}>
                          <span className="text-on-surface-variant text-xs">{row.label}</span>
                          <span className="font-bold text-xs text-right max-w-[60%] truncate">{row.value}</span>
                        </div>
                      ))}
                    </div>

                    <button
                      onClick={handleInitiateTransfer}
                      disabled={offerLoading}
                      className="w-full h-10 bg-primary/15 hover:bg-primary/25 border border-primary/20 text-primary text-xs font-bold rounded-lg transition-all disabled:opacity-50 uppercase tracking-wider flex items-center justify-center gap-2">
                      {offerLoading ? 'Sending...' : <>Initiate Transfer <IconChevron size={12} /></>}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Owned Lands + Active Transfers */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <div className="bg-surface-container rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-outline-variant/10 flex justify-between items-center">
              <h4 className="text-sm font-headline font-bold">Owned Lands</h4>
              <span className="text-[10px] text-on-surface-variant/40 font-mono">{ownedLandsList.length} total</span>
            </div>
            <div className="overflow-auto max-h-[280px]">
              <table className="w-full text-left">
                <thead className="sticky top-0 bg-surface-container">
                  <tr className="text-[10px] font-label uppercase text-on-surface-variant/50 tracking-widest border-b border-outline-variant/10">
                    <th className="px-5 py-3">Survey ID</th>
                    <th className="px-5 py-3">Village</th>
                    <th className="px-5 py-3">Area</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/5 text-xs">
                  {ownedLandsLoading
                    ? <tr><td colSpan={3} className="px-5 py-6 text-center text-on-surface-variant/40">Loading...</td></tr>
                    : ownedLandsList.length === 0
                      ? <tr><td colSpan={3} className="px-5 py-6 text-center text-on-surface-variant/40">No owned lands</td></tr>
                      : ownedLandsList.map(l => (
                        <tr key={l._id} className="hover:bg-surface-container-high/30 transition-colors">
                          <td className="px-5 py-3 font-bold">{l.location?.surveyNumber || l.surveyNumber}</td>
                          <td className="px-5 py-3 text-on-surface-variant">{l.location?.village || l.village}</td>
                          <td className="px-5 py-3">{l.area?.value || l.area} {l.area?.unit?.toUpperCase() || 'HA'}</td>
                        </tr>
                      ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Active Transfers with Stage Tracker */}
          <div className="bg-surface-container rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-outline-variant/10 flex justify-between items-center">
              <h4 className="text-sm font-headline font-bold">Active Transfers</h4>
              <span className="text-[10px] text-on-surface-variant/40 font-mono">{activeTransfers} pending</span>
            </div>
            <div className="overflow-auto max-h-[280px] divide-y divide-outline-variant/5">
              {transfersLoading ? (
                <div className="px-5 py-6 text-center text-on-surface-variant/40 text-xs">Loading...</div>
              ) : transfersList.length === 0 ? (
                <div className="px-5 py-6 text-center text-on-surface-variant/40 text-xs">No transfers</div>
              ) : transfersList.map(t => (
                <div key={t._id} className="px-5 py-4 space-y-2">
                  {/* Header row */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold font-mono">
                      {t.land?.location?.surveyNumber || t.land?.surveyNumber || t._id.slice(-6)}
                    </span>
                    <span className="text-xs font-bold font-mono text-primary">
                      {t.price?.amount ? `${t.price.amount} ${t.price.currency || 'POL'}` : '—'}
                    </span>
                  </div>
                  {/* Seller */}
                  <div className="text-[10px] text-on-surface-variant/50">
                    Seller: {t.seller?.profile?.fullName || truncAddr(t.seller?.walletAddress) || '—'}
                  </div>
                  
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Notifications */}
        <div className="bg-surface-container p-6 rounded-xl">
          <div className="flex items-center gap-2 mb-5">
            <IconNotification className="text-on-surface-variant" size={14} />
            <h4 className="text-sm font-headline font-bold">Recent Alerts</h4>
          </div>
          <div className="space-y-3 max-h-[180px] overflow-auto">
            {notifList.length === 0
              ? <p className="text-xs text-on-surface-variant/40 text-center py-4">No recent alerts</p>
              : notifList.slice(0, 5).map((n, i) => (
                <div key={n._id || i} className="flex gap-3 items-start p-2.5 rounded-lg hover:bg-surface-container-high transition-colors">
                  <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                    {n.type === 'warning'
                      ? <IconAlert className="text-error" size={12} />
                      : <IconCheck className="text-secondary" size={12} />}
                  </div>
                  <div>
                    <p className="text-xs font-medium">{n.title || 'Notification'}</p>
                    <p className="text-[10px] text-on-surface-variant mt-0.5">{n.message}</p>
                    <p className="text-[9px] text-on-surface-variant/30 mt-1 font-mono">
                      {n.createdAt ? new Date(n.createdAt).toLocaleString() : ''}
                    </p>
                  </div>
                </div>
              ))}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default BuyerPage;