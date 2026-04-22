import React, { useState, useCallback, useRef, useMemo } from 'react';
import SharedNavbar from '../SharedNavbar.jsx';
import Footer from '../Footer.jsx';
import PageHeader from '../shared/PageHeader.jsx';
import StatCard from '../shared/StatCard.jsx';
import StatusBadge from '../shared/StatusBadge.jsx';
import SpatialView from '../shared/SpatialView.jsx';

import { 
  IconLand, 
  IconTransfer, 
  IconShield, 
  IconAlert, 
  IconNotification, 
  IconDocument, 
  IconMap, 
  IconCheck, 
  IconUpload, 
  IconUser, 
  IconBlockchain,
  IconDownload 
} from '../icons/Icons.jsx';

import { useAuth } from '../../context/AuthContext.jsx';
import useApi, { useMutation } from '../../hooks/useApi.js';
import { 
  landAPI, 
  transferAPI, 
  verificationAPI, 
  notificationAPI, 
  polygonAPI 
} from '../../services/api.js';

import locationData from '../../data/maharashtra_full.json';

const cleanName = (name) => name.replace(/^[\d]+\s*/, '').trim();

const EMPTY_CO_OWNER = { name: '', share: '', walletAddress: '' };

const SellerPage = () => {
  useAuth();

  // Location Data
  const districts = useMemo(() =>
    locationData.map(d => ({
      id: d.id,
      name: cleanName(d.name)
    })).sort((a, b) => a.name.localeCompare(b.name)),
    []);

  const getTalukas = useCallback((districtId) => {
    const district = locationData.find(d => d.id === districtId);
    return district ? district.talukas.map(t => ({ id: t.id, name: cleanName(t.name) })) : [];
  }, []);

  const getVillages = useCallback((districtId, talukaId) => {
    const district = locationData.find(d => d.id === districtId);
    const taluka = district?.talukas.find(t => t.id === talukaId);
    return taluka ? taluka.villages.map(v => ({ id: v.id, name: cleanName(v.name) })) : [];
  }, []);

  // API Data
  const { data: lands, loading: landsLoading, refetch: refetchLands } = useApi(useCallback(() => landAPI.list({ role: 'seller' }), []));
  const { data: transfers, loading: transfersLoading } = useApi(useCallback(() => transferAPI.getMyTransfers(), []));
  const { data: notifications } = useApi(useCallback(() => notificationAPI.getAll(), []));

  // Derived Lists
  const landsList = Array.isArray(lands) ? lands : [];
  const transfersList = Array.isArray(transfers) ? transfers : [];
  const notifList = Array.isArray(notifications) ? notifications : [];
  const incomingOffers = transfersList.filter(t => t.status === 'pending');

  // Form State
  const [regForm, setRegForm] = useState({
    ownerName: '',
    districtId: '', district: '',
    talukaId: '', taluka: '',
    villageId: '', village: '',
    surveyNumber: '', gatNumber: '',
    area: '', areaUnit: 'hectare',
    encumbrances: '', boundaryDescription: '',
    coOwners: [],
  });

  const [registering, setRegistering] = useState(false);
  const [regError, setRegError] = useState(null);

  // Mahabhunaksha States
  const [fetchingFromMBN, setFetchingFromMBN] = useState(false);
  const [mbnError, setMbnError] = useState(null);

  // Selected Land
  const [selectedLandId, setSelectedLandId] = useState(null);
  const selectedLand = landsList.find(l => l._id === selectedLandId) || null;

  const isVerificationFailed = selectedLand?.status === 'verification_failed';

  const { data: verificationRaw, refetch: refetchVerification } = useApi(
    useCallback(() => selectedLandId ? verificationAPI.getResult(selectedLandId) : Promise.resolve({ data: null }), [selectedLandId]),
    [selectedLandId]
  );
  const verification = verificationRaw?.result || verificationRaw;

  // Upload State
  const fileInputRef = useRef(null);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [uploadError, setUploadError] = useState(null);

  const coOwnerShareTotal = regForm.coOwners.reduce((sum, c) => sum + (parseFloat(c.share) || 0), 0);

  // Form Handlers
  const handleDistrictChange = (e) => {
    const selected = districts.find(d => d.id === e.target.value);
    setRegForm(p => ({
      ...p,
      districtId: e.target.value,
      district: selected?.name || '',
      talukaId: '', taluka: '',
      villageId: '', village: ''
    }));
  };

  const handleTalukaChange = (e) => {
    const talukas = getTalukas(regForm.districtId);
    const selected = talukas.find(t => t.id === e.target.value);
    setRegForm(p => ({
      ...p,
      talukaId: e.target.value,
      taluka: selected?.name || '',
      villageId: '', village: ''
    }));
  };

  const handleVillageChange = (e) => {
    const villages = getVillages(regForm.districtId, regForm.talukaId);
    const selected = villages.find(v => v.id === e.target.value);
    setRegForm(p => ({
      ...p,
      villageId: e.target.value,
      village: selected?.name || ''
    }));
  };

  const handleRegChange = (e) => setRegForm(p => ({ ...p, [e.target.name]: e.target.value }));

  const addCoOwnerRow = () => setRegForm(p => ({ ...p, coOwners: [...p.coOwners, { ...EMPTY_CO_OWNER }] }));
  const removeCoOwnerRow = (idx) => setRegForm(p => ({ ...p, coOwners: p.coOwners.filter((_, i) => i !== idx) }));
  const handleCoOwnerChange = (idx, field, value) => {
    setRegForm(p => {
      const updated = [...p.coOwners];
      updated[idx] = { ...updated[idx], [field]: value };
      return { ...p, coOwners: updated };
    });
  };

  // Mahabhunaksha Handler
  const handleFetchFromMahabhunaksha = async () => {
    if (!regForm.districtId || !regForm.talukaId || !regForm.villageId || !regForm.surveyNumber) {
      alert('Please fill District, Taluka, Village and Survey Number first');
      return;
    }

    setFetchingFromMBN(true);
    setMbnError(null);

    try {
      const payload = {
        landId: selectedLandId,
        district: regForm.district,
        taluka: regForm.taluka,
        village: regForm.village,
        surveyNo: regForm.surveyNumber.trim()
      };

      const response = await polygonAPI.fromMahabhunaksha(payload);

      alert(`Mahabhunaksha Data Fetched!\nPlot No: ${response.data.data.plotNo || '-'}\nSurvey Code: ${response.data.data.surveyCode}`);

      refetchLands();
      if (response.data.data.polygonId) setSelectedLandId(response.data.data.polygonId);
    } catch (err) {
      setMbnError(err.response?.data?.message || err.message || 'Failed to fetch from Mahabhunaksha');
      alert('Failed to fetch from Mahabhunaksha');
    } finally {
      setFetchingFromMBN(false);
    }
  };

  // Registration Submit
  const handleRegSubmit = async (e) => {
    e.preventDefault();

    const payload = {
      ownerName: regForm.ownerName.trim(),
      district: regForm.district,
      districtValue: regForm.districtId,
      taluka: regForm.taluka,
      talukaValue: regForm.talukaId,
      village: regForm.village,
      villageValue: regForm.villageId,
      surveyNumber: regForm.surveyNumber.trim(),
      gatNumber: regForm.gatNumber?.trim() || '',
      area: regForm.area,
      areaUnit: regForm.areaUnit,
      encumbrances: regForm.encumbrances?.trim() || '',
      boundaryDescription: regForm.boundaryDescription?.trim() || '',
      coOwners: regForm.coOwners
        .filter(c => c.name?.trim())
        .map(co => ({
          fullName: co.name.trim(),
          sharePercent: parseFloat(co.share) || 0,
          walletAddress: co.walletAddress?.trim() || null,
        })),
      mobile: ''
    };

    if (!payload.ownerName) return alert('Owner name is required');
    if (!payload.districtValue) return alert('Please select a district');
    if (!payload.talukaValue) return alert('Please select a taluka');
    if (!payload.villageValue) return alert('Please select a village');
    if (!payload.surveyNumber) return alert('Survey number is required');
    if (!payload.area || isNaN(parseFloat(payload.area)) || parseFloat(payload.area) <= 0)
      return alert('Valid area is required');
    if (coOwnerShareTotal > 100)
      return alert(`Co-owner shares total ${coOwnerShareTotal}% — must be ≤ 100%`);

    setRegistering(true);
    setRegError(null);

    try {
      alert("Registering land on blockchain...\n\nThis may take 1–4 minutes...\n\nPlease do NOT close this tab.");

      await landAPI.register(payload);

      alert('Land registered successfully! Verification is in progress.');

      setRegForm({
        ownerName: '',
        districtId: '', district: '',
        talukaId: '', taluka: '',
        villageId: '', village: '',
        surveyNumber: '', gatNumber: '',
        area: '', areaUnit: 'hectare',
        encumbrances: '', boundaryDescription: '',
        coOwners: [],
      });

      refetchLands();
    } catch (err) {
      console.error('Registration Error:', err);
      setRegError(err.response?.data?.message || err.message || 'Registration failed');
      alert(err.response?.data?.message || err.message || 'Registration failed');
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
        landId: selectedLandId,
        ownerName: land.owner?.profile?.fullName || 'Seller Name',
        surveyNumber: land.location?.surveyNumber || land.surveyNumber || '',
        area: land.area?.value || land.area || 0,
        areaUnit: land.area?.unit || 'hectare',
        district: land.location?.district || land.district || '',
        taluka: land.location?.taluka || land.taluka || '',
        village: land.location?.village || land.village || ''
      };

      const formData = new FormData();
      formData.append('file', file);
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
    backgroundSize: '32px 32px', 
    color: '#e5e4ed' 
  };

  const inputCls = "w-full bg-surface-container-high border-none rounded-lg text-on-surface text-sm h-10 px-3 focus:ring-1 focus:ring-primary/40";
  const labelCls = "text-[10px] font-label uppercase tracking-widest text-on-surface-variant/60";

  return (
    <div className="text-on-surface flex flex-col min-h-screen" style={BG}>
      <SharedNavbar role="seller" activePage="dashboard" />

      <main className="relative z-10 p-8 max-w-[1600px] mx-auto space-y-8 w-full">
        <PageHeader title="Seller Dashboard" subtitle="Manage registered land assets and ownership transfers." icon={IconLand} />

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Lands Registered" value={String(landsList.length).padStart(2, '0')} icon={IconLand} iconColor="primary" loading={landsLoading} accentBorder />
          <StatCard label="Pending Transfers" value={String(transfersList.filter(t => ['pending', 'in_review'].includes(t.status)).length).padStart(2, '0')} icon={IconTransfer} iconColor="secondary" loading={transfersLoading} accentBorder />
          <StatCard label="Verified" value={String(landsList.filter(l => l.status === 'verified').length).padStart(2, '0')} icon={IconShield} iconColor="green-500" loading={landsLoading} accentBorder />
          <StatCard label="Flagged" value={String(landsList.filter(l => ['flagged', 'officer_review'].includes(l.status)).length).padStart(2, '0')} icon={IconAlert} iconColor="error" loading={landsLoading} accentBorder />
        </div>

        {/* Land Boundary Mapping - Mahabhunaksha + Bhuvan */}
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
                    const url = window.URL.createObjectURL(new Blob([res.data]));
                    const link = document.createElement('a');
                    link.href = url;
                    link.setAttribute('download', `plot_${selectedLand?.location?.surveyNumber || 'boundary'}.kml`);
                    document.body.appendChild(link);
                    link.click();
                    link.remove();
                    alert('KML downloaded successfully!');
                  } catch (e) {
                    alert('Failed to download KML');
                  }
                }}
                className="flex items-center gap-2 text-xs px-4 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 rounded-lg transition-colors"
              >
                <IconDownload size={16} /> Download KML for Bhuvan
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
              {/* Owner Name */}
              <div className="space-y-1.5">
                <label className={labelCls}>Owner Name</label>
                <input name="ownerName" value={regForm.ownerName} onChange={handleRegChange} className={inputCls} placeholder="Full legal name" />
              </div>

              {/* District → Taluka → Village */}
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
                  <select value={regForm.talukaId} onChange={handleTalukaChange} disabled={!regForm.districtId} className={`${inputCls} disabled:opacity-40 disabled:cursor-not-allowed`}>
                    <option value="">Select Taluka...</option>
                    {getTalukas(regForm.districtId).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className={labelCls}>Village</label>
                  <select value={regForm.villageId} onChange={handleVillageChange} disabled={!regForm.talukaId} className={`${inputCls} disabled:opacity-40 disabled:cursor-not-allowed`}>
                    <option value="">Select Village...</option>
                    {getVillages(regForm.districtId, regForm.talukaId).map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </div>
              </div>

              {/* Survey, Gat, Area */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  { name: 'surveyNumber', label: 'Survey Number', placeholder: '102/A' },
                  { name: 'gatNumber', label: 'Gat Number', placeholder: '442' },
                  { name: 'area', label: 'Area (Hectares)', placeholder: '2.45', type: 'number' },
                ].map(f => (
                  <div key={f.name} className="space-y-1.5">
                    <label className={labelCls}>{f.label}</label>
                    <input
                      name={f.name}
                      value={regForm[f.name]}
                      onChange={handleRegChange}
                      type={f.type || 'text'}
                      step={f.type === 'number' ? '0.01' : undefined}
                      className={inputCls}
                      placeholder={f.placeholder}
                    />
                  </div>
                ))}
              </div>

              {/* Mahabhunaksha Button */}
              <button
                type="button"
                onClick={handleFetchFromMahabhunaksha}
                disabled={fetchingFromMBN || !regForm.districtId || !regForm.talukaId || !regForm.villageId || !regForm.surveyNumber}
                className="w-full py-3.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-bold rounded-xl flex items-center justify-center gap-3 disabled:opacity-50"
              >
                {fetchingFromMBN ? (
                  <>Fetching Official Boundary from Mahabhunaksha...</>
                ) : (
                  <>Auto-Fetch Exact Plot Boundary from Mahabhunaksha</>
                )}
              </button>

              {/* Encumbrances + Boundary */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { name: 'encumbrances', label: 'Encumbrances', placeholder: 'Existing loans or disputes...' },
                  { name: 'boundaryDescription', label: 'Boundary Description', placeholder: 'Physical markers, adjacent plots...' },
                ].map(f => (
                  <div key={f.name} className="space-y-1.5">
                    <label className={labelCls}>{f.label}</label>
                    <textarea
                      name={f.name}
                      value={regForm[f.name]}
                      onChange={handleRegChange}
                      rows={2}
                      className="w-full bg-surface-container-high border-none rounded-lg text-on-surface text-sm p-3 focus:ring-1 focus:ring-primary/40 resize-none"
                      placeholder={f.placeholder}
                    />
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
                  <button type="button" onClick={addCoOwnerRow} className="flex items-center gap-1.5 text-[10px] font-bold text-secondary border border-secondary/20 bg-secondary/5 hover:bg-secondary/15 px-3 py-1.5 rounded-lg transition-all">
                    <IconUser size={11} /> + Add Co-Owner
                  </button>
                </div>

                {regForm.coOwners.length === 0 && (
                  <p className="text-[10px] text-on-surface-variant/30 italic py-1">
                    No co-owners added. Co-owners must be declared at registration time.
                  </p>
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
                    <button type="button" onClick={() => removeCoOwnerRow(idx)} className="h-10 w-8 flex items-center justify-center rounded-lg text-on-surface-variant/40 hover:text-error hover:bg-error/10 transition-all" title="Remove">✕</button>
                  </div>
                ))}
              </div>

              <button
                type="submit"
                disabled={registering}
                className="w-full h-11 bg-primary/15 hover:bg-primary/25 border border-primary/20 text-primary font-bold text-sm rounded-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {registering ? (
                  <>
                    <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    Processing on Government Portal...
                  </>
                ) : (
                  <>
                    <IconBlockchain size={15} />
                    Register on Blockchain
                  </>
                )}
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
              <div className="flex flex-col flex-grow gap-5">
                <div className={`p-3 rounded-lg border text-[10px] leading-relaxed ${isVerificationFailed ? 'bg-error/8 border-error/20 text-error/80' : selectedLand?.status === 'verified' ? 'bg-secondary/8 border-secondary/20 text-secondary/80' : selectedLand?.status === 'officer_review' ? 'bg-primary/8 border-primary/20 text-primary/80' : 'bg-surface-container-high border-outline-variant/10 text-on-surface-variant/60'}`}>
                  {isVerificationFailed ? 'Mahabhumi API could not auto-verify this land. Upload a manual 7/12 document.' : selectedLand?.status === 'verified' ? 'Verified successfully via Mahabhumi API.' : selectedLand?.status === 'officer_review' ? 'Manual proof uploaded. Awaiting officer review.' : 'Verification in progress...'}
                </div>

                {uploadError && <div className="p-3 bg-error/10 border border-error/20 rounded-lg text-error text-[10px]">{uploadError}</div>}

                {[
                  { label: 'Name Match', value: verification?.comparison?.nameMatch?.score ? Math.round(verification.comparison.nameMatch.score * 100) : 0 },
                  { label: 'Area Consistency', value: verification?.comparison?.areaMatch?.score ? Math.round(verification.comparison.areaMatch.score * 100) : 0 },
                ].map(bar => (
                  <div key={bar.label} className="space-y-1.5">
                    <div className="flex justify-between text-[10px] font-label uppercase text-on-surface-variant/60">
                      <span>{bar.label}</span><span>{bar.value}%</span>
                    </div>
                    <div className="h-1 w-full bg-surface-container-high rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${bar.value >= 80 ? 'bg-secondary' : bar.value > 50 ? 'bg-primary' : 'bg-error'}`} style={{ width: `${bar.value}%` }} />
                    </div>
                  </div>
                ))}

                {isVerificationFailed && (
                  <div className="mt-auto pt-4 border-t border-outline-variant/10 space-y-2">
                    <p className="text-[10px] text-on-surface-variant/50 font-label uppercase tracking-widest">Manual Proof (IPFS)</p>
                    <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept="image/*,application/pdf" onChange={handleDocumentUpload} />
                    <button onClick={() => fileInputRef.current?.click()} disabled={uploadingDoc} className="w-full py-3 border border-error/30 bg-error/5 hover:bg-error/10 rounded-lg text-error text-xs font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50">
                      {uploadingDoc ? (
                        <>Uploading & Extracting...</>
                      ) : (
                        <><IconUpload size={14} /> Upload 7/12 Document</>
                      )}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Registered Lands Table + Offers */}
        <div className="flex flex-col lg:flex-row gap-6">
          <div className="lg:w-[70%] bg-surface-container rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-outline-variant/10 flex items-center gap-2">
              <IconDocument className="text-on-surface-variant" size={14} />
              <h2 className="text-sm font-headline font-bold">Registered Land Assets</h2>
              <span className="ml-auto text-[10px] text-on-surface-variant/40 font-mono">{landsList.length} total</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-surface-container-low/50">
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
                    <tr key={l._id} className={`hover:bg-surface-container-high/30 transition-colors cursor-pointer ${selectedLandId === l._id ? 'bg-primary/5' : ''}`} onClick={() => setSelectedLandId(l._id)}>
                      <td className="px-5 py-3 font-mono text-xs">{l.location?.surveyNumber || l.surveyNumber}</td>
                      <td className="px-5 py-3 text-xs">{l.location?.village || l.village}</td>
                      <td className="px-5 py-3 text-xs">{l.area?.value || l.area} {l.area?.unit || 'HA'}</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <StatusBadge status={l.status} />
                          {l.status === 'verification_failed' && <span className="text-[9px] text-error/60 font-mono animate-pulse">↑ select to upload proof</span>}
                        </div>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button className="text-primary text-xs font-medium hover:underline">View</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="lg:w-[30%] bg-surface-container rounded-xl flex flex-col">
            <div className="px-5 py-4 border-b border-outline-variant/10 flex items-center gap-2">
              <IconTransfer className="text-on-surface-variant" size={14} />
              <h2 className="text-sm font-headline font-bold">Incoming Offers</h2>
            </div>
            <div className="p-4 space-y-3 flex-grow overflow-y-auto">
              {incomingOffers.length === 0 ? (
                <p className="text-xs text-on-surface-variant/40 text-center py-6">No pending offers</p>
              ) : incomingOffers.map(o => (
                <div key={o._id} className="p-3 bg-surface-container-high rounded-lg border border-outline-variant/10 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-mono text-secondary">{o.buyerWallet ? `${o.buyerWallet.slice(0, 6)}...${o.buyerWallet.slice(-4)}` : '—'}</span>
                    <span className="text-sm font-bold">{o.price || '—'}</span>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => acceptOffer(o._id)} className="flex-grow py-1.5 bg-secondary/10 text-secondary text-[10px] font-bold rounded-md hover:bg-secondary/20 transition-colors">Accept</button>
                    <button onClick={() => rejectOffer(o._id)} className="flex-grow py-1.5 bg-surface-container-highest text-on-surface text-[10px] font-bold rounded-md hover:bg-error/10 hover:text-error transition-colors">Reject</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default SellerPage;