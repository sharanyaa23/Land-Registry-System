import React, { useState, useCallback, useRef, useMemo } from 'react';
import SharedNavbar from '../SharedNavbar.jsx';
import Footer from '../Footer.jsx';
import PageHeader from '../shared/PageHeader.jsx';
import StatCard from '../shared/StatCard.jsx';
import StatusBadge from '../shared/StatusBadge.jsx';
import SpatialView from '../shared/SpatialView.jsx';

import {
  IconLand, IconTransfer, IconShield, IconAlert,
  IconDocument, IconMap, IconCheck, IconUpload,
  IconUser, IconBlockchain, IconDownload
} from '../icons/Icons.jsx';

import { useAuth } from '../../context/AuthContext.jsx';
import useApi, { useMutation } from '../../hooks/useApi.js';
import {
  landAPI, transferAPI, verificationAPI,
  notificationAPI, polygonAPI
} from '../../services/api.js';

import locationData from '../../data/maharashtra_full.json';

const cleanName = (name) => name.replace(/^[\d]+\s*/, '').trim();
const EMPTY_CO_OWNER = { name: '', share: '', walletAddress: '' };

// ── Transfer Stage Labels ────────────────────────────────────────
const STAGE_LABEL = {
  offer_sent:               'Offer Sent',
  offer_accepted:           'Accepted',
  coowner_consent_pending:  'Co-owner Consent',
  escrow_locked:            'Escrow Locked',
  officer_review:           'Officer Review',
  approved:                 'Approved',
  completed:                'Completed',
  rejected:                 'Rejected',
  cancelled:                'Cancelled',
};

// ── Listing Modal ────────────────────────────────────────────────
const ListingModal = ({ land, onClose, onSuccess }) => {
  const [price, setPrice]       = useState(land?.listingPrice?.amount || '');
  const [currency, setCurrency] = useState(land?.listingPrice?.currency || 'POL');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);

  const handleSubmit = async () => {
    if (!price || parseFloat(price) <= 0) {
      setError('Enter a valid price greater than 0');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await landAPI.listForSale(land._id, {
        price:    parseFloat(price),
        currency,
      });
      onSuccess();
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.message || 'Failed to list land');
    } finally {
      setLoading(false);
    }
  };

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-[#1a1c24] border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-sm font-bold text-white">
              {land?.status === 'listed' ? 'Update Listing Price' : 'List Land for Sale'}
            </h3>
            <p className="text-[10px] text-white/40 mt-0.5 font-mono">
              Survey: {land?.location?.surveyNumber || land?.surveyNumber} —{' '}
              {land?.location?.village || land?.village}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 text-white/40 hover:text-white flex items-center justify-center transition-colors text-sm"
          >
            ✕
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-xs">
            {error}
          </div>
        )}

        {/* Price Input */}
        <div className="space-y-1.5 mb-4">
          <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">
            Listing Price
          </label>
          <div className="flex gap-2">
            <input
              type="number"
              min="0"
              step="0.0001"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="flex-1 bg-white/5 border border-white/10 rounded-lg text-white text-sm h-11 px-3 focus:outline-none focus:ring-1 focus:ring-violet-500/50 placeholder-white/20"
              placeholder="e.g. 0.5"
              autoFocus
            />
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="w-24 bg-white/5 border border-white/10 rounded-lg text-white text-sm h-11 px-2 focus:outline-none focus:ring-1 focus:ring-violet-500/50"
            >
              <option value="POL">ETH</option>
              <option value="MATIC">MATIC</option>
              <option value="INR">INR</option>
            </select>
          </div>
        </div>

        {/* Info note */}
        <p className="text-[10px] text-white/30 mb-5 leading-relaxed">
          Once listed, buyers can see this land and send purchase offers.
          You can update the price or delist at any time before an offer is accepted.
        </p>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 h-10 bg-white/5 hover:bg-white/10 text-white/60 text-xs font-bold rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex-[2] h-10 bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? (
              <span className="animate-pulse">Listing...</span>
            ) : (
              land?.status === 'listed' ? 'Update Price' : 'List for Sale'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Transfer Stage Tracker ───────────────────────────────────────
const TransferStageTracker = ({ transfer }) => {
  if (!transfer) return null;
  const stages = [
    'offer_sent', 'offer_accepted',
    'coowner_consent_pending', 'escrow_locked',
    'officer_review', 'approved', 'completed',
  ];
  const currentIdx = stages.indexOf(transfer.status);
  const isRejected = transfer.status === 'rejected' || transfer.status === 'cancelled';

  return (
    <div className="p-3 bg-surface-container-high rounded-lg space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant/50">
          Transfer Progress
        </span>
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
                i < currentIdx  ? 'bg-secondary/20 text-secondary' :
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
const SellerPage = () => {
  useAuth();

  // Location Data
  const districts = useMemo(() =>
    locationData.map(d => ({ id: d.id, name: cleanName(d.name) }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    []);

  const getTalukas = useCallback((districtId) => {
    const d = locationData.find(d => d.id === districtId);
    return d ? d.talukas.map(t => ({ id: t.id, name: cleanName(t.name) })) : [];
  }, []);

  const getVillages = useCallback((districtId, talukaId) => {
    const d = locationData.find(d => d.id === districtId);
    const t = d?.talukas.find(t => t.id === talukaId);
    return t ? t.villages.map(v => ({ id: v.id, name: cleanName(v.name) })) : [];
  }, []);

  // API Data
  const { data: lands, loading: landsLoading, refetch: refetchLands } = useApi(
    useCallback(() => landAPI.list({ role: 'seller' }), [])
  );
  const { data: transfers, loading: transfersLoading } = useApi(
    useCallback(() => transferAPI.getMyTransfers(), [])
  );
  const { data: incomingOffersRaw, refetch: refetchOffers } = useApi(
    useCallback(() => transferAPI.getIncomingOffers(), [])
  );
  const { data: notifications } = useApi(
    useCallback(() => notificationAPI.getAll(), [])
  );
  const { data: coownerRaw } = useApi(
    useCallback(() => transferAPI.getCoownerPending(), [])
  );

  const coownerPendingCount = coownerRaw?.transfers?.length || 0;
  const allCoownerCount     = coownerRaw?.allCoownerTransfers?.length || 0;

  const landsList     = Array.isArray(lands)        ? lands        : [];
  const transfersList = Array.isArray(transfers)    ? transfers    : [];
  const incomingOffers = Array.isArray(incomingOffersRaw)
    ? incomingOffersRaw
    : (incomingOffersRaw?.transfers || []);

  // Form State
  const [regForm, setRegForm] = useState({
    ownerName: '', districtId: '', district: '',
    talukaId: '', taluka: '', villageId: '', village: '',
    surveyNumber: '', gatNumber: '', area: '', areaUnit: 'hectare',
    encumbrances: '', boundaryDescription: '', coOwners: [],
  });
  const [registering,     setRegistering]     = useState(false);
  const [regError,        setRegError]        = useState(null);
  const [fetchingFromMBN, setFetchingFromMBN] = useState(false);
  const [mbnError,        setMbnError]        = useState(null);

  // Selected Land
  const [selectedLandId, setSelectedLandId] = useState(null);
  const selectedLand = landsList.find(l => l._id === selectedLandId) || null;
  const isVerificationFailed = selectedLand?.status === 'verification_failed';

  const { data: verificationRaw, refetch: refetchVerification } = useApi(
    useCallback(() =>
      selectedLandId
        ? verificationAPI.getResult(selectedLandId)
        : Promise.resolve({ data: null }),
      [selectedLandId]
    ),
    [selectedLandId]
  );
  const verification = verificationRaw?.result || verificationRaw;

  // Upload State
  const fileInputRef = useRef(null);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [uploadError,  setUploadError]  = useState(null);

  // ── Listing Modal State ──────────────────────────────────────
  const [listingLand, setListingLand] = useState(null);

  const handleListSuccess = async () => {
    setListingLand(null);
    await refetchLands();
  };

  // ── Selected transfer for stage tracker ─────────────────────
  const [selectedTransferId, setSelectedTransferId] = useState(null);
  const selectedTransfer = transfersList.find(t => t._id === selectedTransferId) || null;

  const coOwnerShareTotal = regForm.coOwners.reduce(
    (sum, c) => sum + (parseFloat(c.share) || 0), 0
  );

  // Form handlers
  const handleDistrictChange = (e) => {
    const selected = districts.find(d => d.id === e.target.value);
    setRegForm(p => ({
      ...p, districtId: e.target.value, district: selected?.name || '',
      talukaId: '', taluka: '', villageId: '', village: ''
    }));
  };

  const handleTalukaChange = (e) => {
    const talukas = getTalukas(regForm.districtId);
    const selected = talukas.find(t => t.id === e.target.value);
    setRegForm(p => ({
      ...p, talukaId: e.target.value, taluka: selected?.name || '',
      villageId: '', village: ''
    }));
  };

  const handleVillageChange = (e) => {
    const villages = getVillages(regForm.districtId, regForm.talukaId);
    const selected = villages.find(v => v.id === e.target.value);
    setRegForm(p => ({ ...p, villageId: e.target.value, village: selected?.name || '' }));
  };

  const handleRegChange   = (e) => setRegForm(p => ({ ...p, [e.target.name]: e.target.value }));
  const addCoOwnerRow     = () => setRegForm(p => ({ ...p, coOwners: [...p.coOwners, { ...EMPTY_CO_OWNER }] }));
  const removeCoOwnerRow  = (idx) => setRegForm(p => ({ ...p, coOwners: p.coOwners.filter((_, i) => i !== idx) }));
  const handleCoOwnerChange = (idx, field, value) => {
    setRegForm(p => {
      const updated = [...p.coOwners];
      updated[idx] = { ...updated[idx], [field]: value };
      return { ...p, coOwners: updated };
    });
  };

  // Mahabhunaksha
  const handleFetchFromMahabhunaksha = async () => {
    if (!regForm.districtId || !regForm.talukaId || !regForm.villageId || !regForm.surveyNumber) {
      alert('Please fill District, Taluka, Village and Survey Number first');
      return;
    }
    setFetchingFromMBN(true);
    setMbnError(null);
    try {
      const districtObj = locationData.find(d => d.id === regForm.districtId);
      const talukaObj   = districtObj?.talukas.find(t => t.id === regForm.talukaId);
      const villageObj  = talukaObj?.villages.find(v => v.id === regForm.villageId);

      const payload = {
        ownerName:     regForm.ownerName.trim() || 'Owner',
        districtValue: regForm.districtId,
        talukaValue:   regForm.talukaId,
        villageValue:  regForm.villageId,
        district:      districtObj ? cleanName(districtObj.name) : '',
        taluka:        talukaObj   ? cleanName(talukaObj.name)   : '',
        village:       villageObj  ? cleanName(villageObj.name)  : '',
        surveyNo:      regForm.surveyNumber.trim(),
      };

      const response = await polygonAPI.fromMahabhunaksha(payload);
      alert(`Mahabhunaksha Data Fetched!\nPlot No: ${response.data.data.plotNo || '-'}\nSurvey Code: ${response.data.data.surveyCode}`);
      refetchLands();
      if (response.data.data.landId) setSelectedLandId(response.data.data.landId);
    } catch (err) {
      setMbnError(err.response?.data?.error || err.message || 'Failed to fetch from Mahabhunaksha');
    } finally {
      setFetchingFromMBN(false);
    }
  };

  // Registration Submit
  const handleRegSubmit = async (e) => {
    e.preventDefault();
    if (!regForm.ownerName.trim())                        return alert('Owner name is required');
    if (!regForm.surveyNumber.trim())                     return alert('Survey number is required');
    if (!regForm.area || parseFloat(regForm.area) <= 0)   return alert('Valid area is required');
    if (coOwnerShareTotal > 100)                          return alert(`Co-owner shares total ${coOwnerShareTotal}% — must be ≤ 100%`);
    if (!selectedLandId) {
      if (!regForm.districtId) return alert('Please select a district');
      if (!regForm.talukaId)   return alert('Please select a taluka');
      if (!regForm.villageId)  return alert('Please select a village');
    }

    setRegistering(true);
    setRegError(null);

    const coOwnersPayload = regForm.coOwners
      .filter(c => c.name?.trim())
      .map(co => ({
        fullName:      co.name.trim(),
        sharePercent:  parseFloat(co.share) || 0,
        walletAddress: co.walletAddress?.trim() || null,
      }));

    try {
      alert('Registering land on blockchain...\n\nThis may take 1–4 minutes...\n\nPlease do NOT close this tab.');

      if (selectedLandId) {
        await landAPI.registerExisting(selectedLandId, {
          ownerName: regForm.ownerName.trim(),
          area: regForm.area, areaUnit: regForm.areaUnit,
          encumbrances: regForm.encumbrances?.trim() || '',
          boundaryDescription: regForm.boundaryDescription?.trim() || '',
          coOwners: coOwnersPayload, mobile: ''
        });
      } else {
        await landAPI.register({
          ownerName: regForm.ownerName.trim(),
          district: regForm.district, districtValue: regForm.districtId,
          taluka: regForm.taluka, talukaValue: regForm.talukaId,
          village: regForm.village, villageValue: regForm.villageId,
          surveyNumber: regForm.surveyNumber.trim(),
          gatNumber: regForm.gatNumber?.trim() || '',
          area: regForm.area, areaUnit: regForm.areaUnit,
          encumbrances: regForm.encumbrances?.trim() || '',
          boundaryDescription: regForm.boundaryDescription?.trim() || '',
          coOwners: coOwnersPayload, mobile: ''
        });
      }

      alert('Land registered successfully! Verification is in progress.');
      setRegForm({
        ownerName: '', districtId: '', district: '',
        talukaId: '', taluka: '', villageId: '', village: '',
        surveyNumber: '', gatNumber: '', area: '', areaUnit: 'hectare',
        encumbrances: '', boundaryDescription: '', coOwners: [],
      });
      setSelectedLandId(null);
      refetchLands();
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Registration failed';
      setRegError(msg);
      alert(msg);
    } finally {
      setRegistering(false);
    }
  };

  // Document Upload
  const handleDocumentUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || !selectedLandId) return;

    setUploadingDoc(true);
    setUploadError(null);

    try {
      const land = selectedLand;
      if (!land) throw new Error('Land not found');

      const userInput = {
        landId:       selectedLandId,
        ownerName:    land.owner?.profile?.fullName || 'Seller Name',
        surveyNumber: land.location?.surveyNumber || land.surveyNumber || '',
        area:         land.area?.value || land.area || 0,
        areaUnit:     land.area?.unit || 'hectare',
        district:     land.location?.district || land.district || '',
        taluka:       land.location?.taluka   || land.taluka   || '',
        village:      land.location?.village  || land.village  || ''
      };

      const formData = new FormData();
      formData.append('file',      file);
      formData.append('userInput', JSON.stringify(userInput));

      await verificationAPI.uploadDocument(formData);
      await refetchLands();
      await refetchVerification();
      alert('Document uploaded successfully!');
    } catch (err) {
      setUploadError(err.response?.data?.error || err.message || 'Upload failed');
    } finally {
      setUploadingDoc(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const { execute: acceptOffer } = useMutation(useCallback((id) => transferAPI.accept(id), []));
  const { execute: rejectOffer } = useMutation(useCallback((id) => transferAPI.reject(id), []));

  const BG = {
    backgroundColor: '#0c0e14',
    backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(116,117,125,0.04) 1px, transparent 0)',
    backgroundSize:  '32px 32px',
    color:           '#e5e4ed'
  };

  const inputCls = "w-full bg-surface-container-high border-none rounded-lg text-on-surface text-sm h-10 px-3 focus:ring-1 focus:ring-primary/40";
  const labelCls = "text-[10px] font-label uppercase tracking-widest text-on-surface-variant/60";

  return (
    <div className="text-on-surface flex flex-col min-h-screen" style={BG}>
      <SharedNavbar role="seller" activePage="dashboard" />

      {/* ── Listing Modal ── */}
      {listingLand && (
        <ListingModal
          land={listingLand}
          onClose={() => setListingLand(null)}
          onSuccess={handleListSuccess}
        />
      )}

      <main className="relative z-10 p-8 max-w-[1600px] mx-auto space-y-8 w-full">
        <PageHeader title="Seller Dashboard" subtitle="Manage registered land assets and ownership transfers." icon={IconLand} />

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Lands Registered"  value={String(landsList.length).padStart(2,'0')} icon={IconLand}     iconColor="primary"   loading={landsLoading}     accentBorder />
          <StatCard label="Pending Transfers" value={String(incomingOffers.length).padStart(2,'0')} icon={IconTransfer} iconColor="secondary" loading={transfersLoading} accentBorder />
          <StatCard label="Verified"          value={String(landsList.filter(l => l.status === 'verified' || l.status === 'verification_passed').length).padStart(2,'0')} icon={IconShield}   iconColor="green-500" loading={landsLoading}     accentBorder />
          <StatCard label="Flagged"           value={String(landsList.filter(l => ['flagged','officer_review'].includes(l.status)).length).padStart(2,'0')} icon={IconAlert}    iconColor="error"     loading={landsLoading}     accentBorder />
        </div>

        {/* NOC / Co-owner Alert Banners */}
        {(coownerPendingCount > 0 || allCoownerCount > 0) && (
          <div className="flex flex-col sm:flex-row gap-3">
            {coownerPendingCount > 0 && (
              <a href="/seller/transfers" className="flex items-center gap-3 flex-1 px-4 py-3 bg-error/8 border border-error/20 rounded-xl hover:bg-error/12 transition-colors">
                <div className="w-9 h-9 rounded-lg bg-error/15 flex items-center justify-center shrink-0">
                  <IconShield className="text-error" size={15} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-error">NOC Consent Required</p>
                  <p className="text-[10px] text-error/60 mt-0.5">
                    {coownerPendingCount} transfer{coownerPendingCount > 1 ? 's' : ''} awaiting your approval as co-owner
                  </p>
                </div>
                <span className="text-[10px] font-mono px-2.5 py-1 rounded-full bg-error/15 text-error animate-pulse shrink-0 font-bold">
                  {coownerPendingCount} pending
                </span>
              </a>
            )}
            {allCoownerCount > 0 && (
              <a href="/seller/transfers" className="flex items-center gap-3 flex-1 px-4 py-3 bg-primary/8 border border-primary/20 rounded-xl hover:bg-primary/12 transition-colors">
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <IconTransfer className="text-primary" size={15} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-primary">Co-owner Transfers</p>
                  <p className="text-[10px] text-primary/50 mt-0.5">
                    You are a co-owner on {allCoownerCount} land transfer{allCoownerCount > 1 ? 's' : ''}
                  </p>
                </div>
                <span className="text-[10px] font-mono px-2.5 py-1 rounded-full bg-primary/10 text-primary shrink-0 font-bold">
                  {allCoownerCount} total
                </span>
              </a>
            )}
          </div>
        )}

        {/* Land Boundary Mapping */}
        <div className="bg-surface-container rounded-xl overflow-hidden flex flex-col h-[560px]">
          <div className="p-5 flex justify-between items-center border-b border-outline-variant/10">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <IconMap className="text-primary" size={16} />
              </div>
              <div>
                <h2 className="text-sm font-headline font-bold">Land Boundary Mapping</h2>
                <p className="text-[10px] text-on-surface-variant">Official boundary from Mahabhunaksha + ISRO Bhuvan</p>
              </div>
            </div>
            {selectedLandId && (
              <button
                onClick={async () => {
                  try {
                    const res = await polygonAPI.exportKml(selectedLandId);
                    const url  = window.URL.createObjectURL(new Blob([res.data]));
                    const link = document.createElement('a');
                    link.href = url;
                    link.setAttribute('download', `plot_${selectedLand?.location?.surveyNumber || 'boundary'}.kml`);
                    document.body.appendChild(link);
                    link.click();
                    link.remove();
                  } catch { alert('Failed to download KML'); }
                }}
                className="flex items-center gap-2 text-xs px-4 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 rounded-lg transition-colors"
              >
                <IconDownload size={16} /> Download KML
              </button>
            )}
          </div>
          <div className="flex-1 relative">
            {selectedLandId ? (
              <SpatialView className="absolute inset-0" landId={selectedLandId} />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-on-surface-variant/40">
                <IconMap className="mx-auto mb-6 opacity-30" size={72} />
                <p className="text-lg">No land selected</p>
                <p className="text-sm mt-2">Select a registered land from the table below</p>
              </div>
            )}
          </div>
        </div>

        {/* Registration Form + Verification Panel */}
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Registration Form */}
          <div className="lg:w-[70%] bg-surface-container rounded-xl p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <IconDocument className="text-primary" size={16} />
              </div>
              <h2 className="text-base font-headline font-bold">Register New Land Asset</h2>
            </div>

            {regError && <div className="mb-4 p-3 bg-error/10 border border-error/20 rounded-lg text-error text-xs">{regError}</div>}
            {mbnError && <div className="mb-4 p-3 bg-error/10 border border-error/20 rounded-lg text-error text-xs">{mbnError}</div>}

            <form onSubmit={handleRegSubmit} className="space-y-5">
              <div className="space-y-1.5">
                <label className={labelCls}>Owner Name</label>
                <input name="ownerName" value={regForm.ownerName} onChange={handleRegChange} className={inputCls} placeholder="Full legal name" />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className={labelCls}>District</label>
                  <select value={regForm.districtId} onChange={handleDistrictChange} className={inputCls}>
                    <option value="">Select District...</option>
                    {districts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className={labelCls}>Taluka</label>
                  <select value={regForm.talukaId} onChange={handleTalukaChange} disabled={!regForm.districtId} className={`${inputCls} disabled:opacity-40`}>
                    <option value="">Select Taluka...</option>
                    {getTalukas(regForm.districtId).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className={labelCls}>Village</label>
                  <select value={regForm.villageId} onChange={handleVillageChange} disabled={!regForm.talukaId} className={`${inputCls} disabled:opacity-40`}>
                    <option value="">Select Village...</option>
                    {getVillages(regForm.districtId, regForm.talukaId).map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  { name: 'surveyNumber', label: 'Survey Number', placeholder: '102/A' },
                  { name: 'gatNumber',    label: 'Gat Number',    placeholder: '442'   },
                  { name: 'area',         label: 'Area (Ha)',      placeholder: '2.45', type: 'number' },
                ].map(f => (
                  <div key={f.name} className="space-y-1.5">
                    <label className={labelCls}>{f.label}</label>
                    <input name={f.name} value={regForm[f.name]} onChange={handleRegChange}
                      type={f.type || 'text'} step={f.type === 'number' ? '0.01' : undefined}
                      className={inputCls} placeholder={f.placeholder} />
                  </div>
                ))}
              </div>

              <button type="button" onClick={handleFetchFromMahabhunaksha}
                disabled={fetchingFromMBN || !regForm.districtId || !regForm.talukaId || !regForm.villageId || !regForm.surveyNumber}
                className="w-full py-3.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-bold rounded-xl flex items-center justify-center gap-3 disabled:opacity-50">
                {fetchingFromMBN ? 'Fetching from Mahabhunaksha...' : 'Auto-Fetch Plot Boundary from Mahabhunaksha'}
              </button>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { name: 'encumbrances',        label: 'Encumbrances',        placeholder: 'Existing loans or disputes...'   },
                  { name: 'boundaryDescription', label: 'Boundary Description', placeholder: 'Physical markers, adjacent plots...' },
                ].map(f => (
                  <div key={f.name} className="space-y-1.5">
                    <label className={labelCls}>{f.label}</label>
                    <textarea name={f.name} value={regForm[f.name]} onChange={handleRegChange}
                      rows={2} className="w-full bg-surface-container-high border-none rounded-lg text-on-surface text-sm p-3 focus:ring-1 focus:ring-primary/40 resize-none"
                      placeholder={f.placeholder} />
                  </div>
                ))}
              </div>

              {/* Co-Owners */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <label className={labelCls}>Co-Owners</label>
                    {regForm.coOwners.length > 0 && (
                      <span className={`text-[9px] font-mono px-2 py-0.5 rounded-full ${coOwnerShareTotal > 100 ? 'bg-error/15 text-error' : 'bg-secondary/10 text-secondary'}`}>
                        {coOwnerShareTotal}% / 100%
                      </span>
                    )}
                  </div>
                  <button type="button" onClick={addCoOwnerRow}
                    className="flex items-center gap-1.5 text-[10px] font-bold text-secondary border border-secondary/20 bg-secondary/5 hover:bg-secondary/15 px-3 py-1.5 rounded-lg transition-all">
                    <IconUser size={11} /> + Add Co-Owner
                  </button>
                </div>
                {regForm.coOwners.length === 0 && (
                  <p className="text-[10px] text-on-surface-variant/30 italic py-1">No co-owners added.</p>
                )}
                {regForm.coOwners.map((co, idx) => (
                  <div key={idx} className="grid grid-cols-[1fr_80px_1fr_32px] gap-2 items-end p-3 bg-surface-container-high/60 rounded-lg border border-outline-variant/10">
                    <div className="space-y-1">
                      <label className={labelCls}>Full Name</label>
                      <input value={co.name} onChange={e => handleCoOwnerChange(idx, 'name', e.target.value)} className={inputCls} placeholder="Jane Doe" />
                    </div>
                    <div className="space-y-1">
                      <label className={labelCls}>Share %</label>
                      <input value={co.share} onChange={e => handleCoOwnerChange(idx, 'share', e.target.value)} type="number" min="0" max="100" step="0.01" className={inputCls} placeholder="25" />
                    </div>
                    <div className="space-y-1">
                      <label className={labelCls}>Wallet Address</label>
                      <input value={co.walletAddress} onChange={e => handleCoOwnerChange(idx, 'walletAddress', e.target.value)} className={inputCls} placeholder="0x..." />
                    </div>
                    <button type="button" onClick={() => removeCoOwnerRow(idx)}
                      className="h-10 w-8 flex items-center justify-center rounded-lg text-on-surface-variant/40 hover:text-error hover:bg-error/10 transition-all">✕</button>
                  </div>
                ))}
              </div>

              <button type="submit" disabled={registering}
                className="w-full h-11 bg-primary/15 hover:bg-primary/25 border border-primary/20 text-primary font-bold text-sm rounded-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                {registering ? '...' : <><IconBlockchain size={15} /> Register on Blockchain</>}
              </button>
            </form>
          </div>

          {/* Verification Panel */}
          <div className="lg:w-[30%] bg-surface-container rounded-xl p-5 flex flex-col">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <IconShield className="text-on-surface-variant" size={14} />
                <h2 className="text-sm font-headline font-bold">Verification</h2>
              </div>
              {verification?.verdict && <StatusBadge status={verification.verdict} />}
            </div>

            {!selectedLandId ? (
              <p className="text-xs text-on-surface-variant/40 text-center py-8 flex-grow flex items-center justify-center">
                Select a land from the table to view verification status
              </p>
            ) : (
              <div className="flex flex-col flex-grow gap-4">

                {/* Status Banner */}
                <div className={`p-3 rounded-lg border text-[10px] leading-relaxed ${isVerificationFailed
                  ? 'bg-error/8 border-error/20 text-error/80'
                  : selectedLand?.status === 'verification_passed'
                    ? 'bg-secondary/8 border-secondary/20 text-secondary/80'
                    : selectedLand?.status === 'officer_review'
                      ? 'bg-primary/8 border-primary/20 text-primary/80'
                      : 'bg-surface-container-high border-outline-variant/10 text-on-surface-variant/60'
                  }`}>
                  {isVerificationFailed
                    ? 'Mahabhumi API could not auto-verify this land. Upload a manual 7/12 document.'
                    : selectedLand?.status === 'verification_passed'
                      ? 'Verified successfully via Mahabhumi API.'
                      : selectedLand?.status === 'officer_review'
                        ? 'Manual proof uploaded. Awaiting officer review.'
                        : 'Verification in progress...'}
                </div>

                {/* Overall Score */}
                {verification?.overallScore != null && (
                  <div className="flex items-center justify-between p-3 bg-surface-container-high rounded-lg">
                    <span className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant/60">Overall Score</span>
                    <span className={`text-sm font-bold font-mono ${verification.overallScore >= 0.8 ? 'text-secondary' :
                      verification.overallScore >= 0.5 ? 'text-primary' : 'text-error'
                      }`}>
                      {Math.round(verification.overallScore * 100)}%
                    </span>
                  </div>
                )}

                {/* Score Bars */}
                {[
                  { label: 'Name Match', score: verification?.nameScore ?? 0 },
                  { label: 'Area Consistency', score: verification?.areaScore ?? 0 },
                ].map(bar => {
                  const pct = Math.round((bar.score ?? 0) * 100);
                  return (
                    <div key={bar.label} className="space-y-1.5">
                      <div className="flex justify-between text-[10px] font-label uppercase text-on-surface-variant/60">
                        <span>{bar.label}</span>
                        <span className={pct >= 80 ? 'text-secondary' : pct >= 50 ? 'text-primary' : 'text-error'}>
                          {pct}%
                        </span>
                      </div>
                      <div className="h-1 w-full bg-surface-container-high rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${pct >= 80 ? 'bg-secondary' : pct >= 50 ? 'bg-primary' : 'bg-error'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}

                {/* Name Details */}
                {Array.isArray(verification?.nameDetails) && verification.nameDetails.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant/50">Name Matches</p>
                    {verification.nameDetails.map((d, i) => (
                      <div key={i} className="flex justify-between items-center px-3 py-2 bg-surface-container-high rounded-lg">
                        <div className="flex items-center gap-2 max-w-[75%]">
                          {d.isBestMatch && (
                            <span className="text-[8px] px-1.5 py-0.5 bg-secondary/15 text-secondary rounded font-bold shrink-0">BEST</span>
                          )}
                          <span className="text-[10px] text-on-surface-variant/70 truncate">{d.scrapedName || '—'}</span>
                        </div>
                        <span className={`text-[10px] font-mono font-bold shrink-0 ${(d.score ?? 0) >= 0.8 ? 'text-secondary' :
                          (d.score ?? 0) >= 0.5 ? 'text-primary' : 'text-error'
                          }`}>
                          {Math.round((d.score ?? 0) * 100)}%
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Area Details */}
                {verification?.areaDetails && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant/50">Area Details</p>
                    <div className="px-3 py-2 bg-surface-container-high rounded-lg space-y-1.5">
                      <div className="flex justify-between text-[10px]">
                        <span className="text-on-surface-variant/60">Input</span>
                        <span className="font-mono">{verification.areaDetails.inputArea} {verification.areaDetails.inputUnit?.toUpperCase()}</span>
                      </div>
                      <div className="flex justify-between text-[10px]">
                        <span className="text-on-surface-variant/60">Scraped</span>
                        <span className="font-mono">{verification.areaDetails.scrapedArea} {verification.areaDetails.scrapedUnit?.toUpperCase()}</span>
                      </div>
                      <div className="flex justify-between text-[10px]">
                        <span className="text-on-surface-variant/60">Difference</span>
                        <span className={`font-mono ${(verification.areaDetails.diffSqm ?? 0) <= (verification.areaDetails.toleranceSqm ?? 0) ? 'text-secondary' : 'text-error'}`}>
                          {verification.areaDetails.diffSqm} sqm
                        </span>
                      </div>
                      <div className="flex justify-between text-[10px]">
                        <span className="text-on-surface-variant/60">Tolerance</span>
                        <span className="font-mono text-on-surface-variant/50">±{verification.areaDetails.toleranceSqm} sqm</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Encumbrance */}
                {verification?.encumbranceText && (
                  <div className="flex justify-between items-center px-3 py-2 bg-surface-container-high rounded-lg">
                    <span className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant/50">Encumbrance</span>
                    <span className={`text-[10px] font-mono ${verification.encumbranceFlag ? 'text-error' : 'text-secondary'}`}>
                      {verification.encumbranceText}
                    </span>
                  </div>
                )}

                {/* Flags */}
                {Array.isArray(verification?.flags) && verification.flags.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant/50">Flags</p>
                    {verification.flags.map((f, i) => (
                      <div key={i} className="flex items-center gap-2 px-3 py-2 bg-error/8 border border-error/15 rounded-lg">
                        <IconAlert size={10} className="text-error shrink-0" />
                        <span className="text-[10px] text-error/80">{f}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Parse Source */}
                {verification?.parseSource && (
                  <div className="flex justify-between items-center px-3 py-2 bg-surface-container-high rounded-lg">
                    <span className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant/50">Parse Source</span>
                    <span className="text-[10px] font-mono text-on-surface-variant/70">{verification.parseSource}</span>
                  </div>
                )}

                {uploadError && (
                  <div className="p-3 bg-error/10 border border-error/20 rounded-lg text-error text-[10px]">{uploadError}</div>
                )}

                {/* Manual Upload */}
                {isVerificationFailed && (
                  <div className="mt-auto pt-4 border-t border-outline-variant/10 space-y-2">
                    <p className="text-[10px] text-on-surface-variant/50 font-label uppercase tracking-widest">Manual Proof (IPFS)</p>
                    <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept="image/*,application/pdf" onChange={handleDocumentUpload} />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingDoc}
                      className="w-full py-3 border border-error/30 bg-error/5 hover:bg-error/10 rounded-lg text-error text-xs font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {uploadingDoc ? <>Uploading & Extracting...</> : <><IconUpload size={14} /> Upload 7/12 Document</>}
                    </button>
                  </div>
                )}

              </div>
            )}
          </div>
        </div>

        {/* Lands Table + Incoming Offers + Transfer Tracker */}
        <div className="flex flex-col lg:flex-row gap-6">

          {/* Lands Table */}
          <div className="lg:w-[70%] bg-surface-container rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-outline-variant/10 flex items-center gap-2">
              <IconDocument className="text-on-surface-variant" size={14} />
              <h2 className="text-sm font-headline font-bold">Registered Land Assets</h2>
              <span className="ml-auto text-[10px] text-on-surface-variant/40 font-mono">{landsList.length} total</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-surface-container-low/60">
                  <tr className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant/50">
                    <th className="px-5 py-3">Survey No.</th>
                    <th className="px-5 py-3">Village</th>
                    <th className="px-5 py-3">Area</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/5 text-sm">
                  {landsLoading ? (
                    <tr><td colSpan={5} className="px-5 py-8 text-center text-on-surface-variant/40 text-xs">Loading...</td></tr>
                  ) : landsList.length === 0 ? (
                    <tr><td colSpan={5} className="px-5 py-8 text-center text-on-surface-variant/40 text-xs">No lands registered yet</td></tr>
                  ) : landsList.map(l => (
                    <tr key={l._id}
                      className={`hover:bg-surface-container-high/30 transition-colors cursor-pointer ${selectedLandId === l._id ? 'bg-primary/5' : ''}`}
                      onClick={() => setSelectedLandId(l._id)}>
                      <td className="px-5 py-3 font-mono text-xs">{l.location?.surveyNumber || l.surveyNumber}</td>
                      <td className="px-5 py-3 text-xs">{l.location?.village || l.village}</td>
                      <td className="px-5 py-3 text-xs">
                        {typeof l.area === 'object' ? l.area?.value : l.area}{' '}
                        {typeof l.area === 'object' ? l.area?.unit?.toUpperCase() : 'HA'}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <StatusBadge status={l.status} />
                          {l.status === 'verification_failed' && (
                            <span className="text-[9px] text-error/60 font-mono animate-pulse">↑ select to upload</span>
                          )}
                          {l.frozen && (
                            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-error/15 text-error">FROZEN</span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={(e) => { e.stopPropagation(); setSelectedLandId(l._id); }}
                            className="text-primary text-xs font-medium hover:underline">
                            View
                          </button>
                          {/* ── LIST BUTTON — fixed ── */}
                          {(l.status === 'verification_passed' || l.status === 'listed') && !l.frozen && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();  // don't select the row
                                setListingLand(l);    // open modal
                              }}
                              className="text-secondary text-xs font-medium hover:underline">
                              {l.status === 'listed' ? 'Update Price' : 'List'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Right panel: Offers + Transfer Tracker */}
          <div className="lg:w-[30%] flex flex-col gap-4">

            {/* Incoming Offers */}
            <div className="bg-surface-container rounded-xl flex flex-col flex-1">
              <div className="px-5 py-4 border-b border-outline-variant/10 flex items-center gap-2">
                <IconTransfer className="text-on-surface-variant" size={14} />
                <h2 className="text-sm font-headline font-bold">Incoming Offers</h2>
                {incomingOffers.length > 0 && (
                  <span className="ml-auto text-[10px] font-mono px-2 py-0.5 rounded-full bg-secondary/10 text-secondary">
                    {incomingOffers.length}
                  </span>
                )}
              </div>
              <div className="p-4 space-y-3 flex-grow overflow-y-auto max-h-64">
                {incomingOffers.length === 0 ? (
                  <p className="text-xs text-on-surface-variant/40 text-center py-6">No pending offers</p>
                ) : incomingOffers.map(o => (
                  <div key={o._id} className="p-3 bg-surface-container-high rounded-lg border border-outline-variant/10 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-mono text-on-surface-variant/60 truncate max-w-[60%]">
                        {o.land?.location?.village || '—'}
                      </span>
                      <StatusBadge status={o.status} />
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-mono text-secondary truncate max-w-[55%]">
                        {o.buyer?.walletAddress
                          ? `${o.buyer.walletAddress.slice(0,6)}...${o.buyer.walletAddress.slice(-4)}`
                          : o.buyer?.profile?.fullName || '—'}
                      </span>
                      <span className="text-sm font-bold font-mono">
                        {o.price?.amount
                          ? o.price.currency === 'INR'
                            ? new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(o.price.amount)
                            : `${o.price.amount} ${o.price.currency}`
                          : '—'}
                      </span>
                    </div>
                    <div className="text-[9px] font-mono text-on-surface-variant/40">
                      Survey: {o.land?.location?.surveyNumber || '—'}
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => acceptOffer(o._id).then(() => refetchOffers())}
                        className="flex-grow py-1.5 bg-secondary/10 text-secondary text-[10px] font-bold rounded-md hover:bg-secondary/20 transition-colors flex items-center justify-center gap-1">
                        <IconCheck size={10} /> Accept
                      </button>
                      <button
                        onClick={() => rejectOffer(o._id).then(() => refetchOffers())}
                        className="flex-grow py-1.5 bg-surface-container-highest text-on-surface text-[10px] font-bold rounded-md hover:bg-error/10 hover:text-error transition-colors">
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Transfer Stage Tracker */}
            {transfersList.length > 0 && (
              <div className="bg-surface-container rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-headline font-bold">Transfer Tracker</h2>
                  <span className="text-[10px] text-on-surface-variant/40">{transfersList.length} total</span>
                </div>
                <select
                  value={selectedTransferId || ''}
                  onChange={(e) => setSelectedTransferId(e.target.value)}
                  className="w-full bg-surface-container-high border-none rounded-lg text-on-surface text-xs h-9 px-3 focus:ring-1 focus:ring-primary/40">
                  <option value="">Select a transfer...</option>
                  {transfersList.map(t => (
                    <option key={t._id} value={t._id}>
                      {t.land?.location?.surveyNumber || t.land?.surveyNumber || t._id.slice(-6)} — {STAGE_LABEL[t.status] || t.status}
                    </option>
                  ))}
                </select>
                {selectedTransfer}
              </div>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default SellerPage;