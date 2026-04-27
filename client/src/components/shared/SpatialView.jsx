// src/components/shared/SpatialView.jsx
// Google Maps JS API — satellite hybrid with real polygon overlay
// API key is public (frontend Maps keys are always exposed in the browser bundle)

import React, { useEffect, useState, useCallback, useRef } from 'react';
import api from '../../services/api';

// ── Hardcoded Maps key (safe for frontend — restrict it in Google Console) ───
const GOOGLE_MAPS_API_KEY = 'AIzaSyC_S_-4ac4ezekA0rueOkcFoFnjG9b3iEc';

// ── Load Google Maps script once globally ────────────────────────────────────
let gmScriptPromise = null;

function loadGoogleMaps() {
  if (window.google && window.google.maps) {
    return Promise.resolve(window.google.maps);
  }
  if (gmScriptPromise) return gmScriptPromise;

  gmScriptPromise = new Promise(function (resolve, reject) {
    var cbName = '__gm_cb_' + Date.now();
    window[cbName] = function () {
      resolve(window.google.maps);
      delete window[cbName];
    };
    var s = document.createElement('script');
    s.src =
      'https://maps.googleapis.com/maps/api/js' +
      '?key=' + GOOGLE_MAPS_API_KEY +
      '&callback=' + cbName;
    s.async = true;
    s.defer = true;
    s.onerror = function () {
      gmScriptPromise = null;
      reject(new Error('Google Maps script failed to load'));
    };
    document.head.appendChild(s);
  });

  return gmScriptPromise;
}

// ── Component ────────────────────────────────────────────────────────────────
const SpatialView = ({ landId, className = '' }) => {
  const mapDivRef  = useRef(null);
  const gmapRef    = useRef(null);
  const polygonRef = useRef(null);

  const [polygon, setPolygon] = useState(null);
  const [meta,    setMeta]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  // ── Fetch polygon from backend ──────────────────────────────
  const fetchBhuvanPreview = useCallback(async () => {
    if (!landId) return;
    setLoading(true);
    setError(null);
    setPolygon(null);
    setMeta(null);

    try {
      const res    = await api.get('/polygon/' + landId + '/bhuvan-preview');
      const config = res.data && res.data.data;
      const metaIn = res.data && res.data.meta;

      if (
        config &&
        config.plotPolygon &&
        config.plotPolygon.latLngs &&
        config.plotPolygon.latLngs.length >= 3
      ) {
        setPolygon(config.plotPolygon.latLngs);
        setMeta(metaIn || config.meta || null);
      } else {
        setError('No boundary data available for this land');
      }
    } catch (err) {
      setError(
        (err.response && err.response.data && err.response.data.error) ||
        'Failed to load boundary'
      );
    } finally {
      setLoading(false);
    }
  }, [landId]);

  useEffect(function () { fetchBhuvanPreview(); }, [fetchBhuvanPreview]);

  // ── Init / update Google Map whenever polygon changes ────────
  useEffect(function () {
    if (!polygon || polygon.length < 3 || !mapDivRef.current) return;

    // Centroid
    var sLat = 0, sLng = 0;
    for (var i = 0; i < polygon.length; i++) {
      sLat += polygon[i][0];
      sLng += polygon[i][1];
    }
    var centre = { lat: sLat / polygon.length, lng: sLng / polygon.length };

    // Path for Google Maps
    var path = polygon.map(function (p) { return { lat: p[0], lng: p[1] }; });

    loadGoogleMaps().then(function (maps) {

      // Create map once
      if (!gmapRef.current) {
        gmapRef.current = new maps.Map(mapDivRef.current, {
          center:            centre,
          zoom:              17,
          mapTypeId:         'hybrid',
          disableDefaultUI:  false,
          zoomControl:       true,
          mapTypeControl:    false,
          streetViewControl: false,
          fullscreenControl: true,
        });
      }

      // Remove previous polygon
      if (polygonRef.current) {
        polygonRef.current.setMap(null);
      }

      // Draw polygon
      polygonRef.current = new maps.Polygon({
        paths:         path,
        strokeColor:   '#FF6B00',
        strokeOpacity: 1.0,
        strokeWeight:  3,
        fillColor:     '#FF6B00',
        fillOpacity:   0.20,
        map:           gmapRef.current,
      });

      // Info window on polygon click
      var infoWindow = new maps.InfoWindow();
      maps.event.addListener(polygonRef.current, 'click', function (e) {
        infoWindow.setContent(
          '<div style="font-family:sans-serif;font-size:13px;padding:4px;min-width:160px">' +
          '<p style="margin:0 0 6px;font-weight:700;color:#FF6B00;font-size:14px">Plot ' +
          (meta && meta.plotNo ? meta.plotNo : '-') + '</p>' +
          (meta && meta.surveyCode ? '<p style="margin:0 0 3px">Survey: ' + meta.surveyCode + '</p>' : '') +
          (meta && meta.village   ? '<p style="margin:0 0 3px">Village: ' + meta.village   + '</p>' : '') +
          (meta && meta.taluka    ? '<p style="margin:0 0 3px">Taluka: '  + meta.taluka    + '</p>' : '') +
          (meta && meta.area      ? '<p style="margin:4px 0 0;color:#059669;font-weight:700">Area: ' + meta.area + '</p>' : '') +
          '</div>'
        );
        infoWindow.setPosition(e.latLng);
        infoWindow.open(gmapRef.current);
      });

      // Fit bounds to polygon
      var bounds = new maps.LatLngBounds();
      path.forEach(function (p) { bounds.extend(p); });
      gmapRef.current.fitBounds(bounds, 60);

    }).catch(function (e) {
      setError('Google Maps failed to load: ' + e.message);
    });

  }, [polygon, meta]);

  // ── External links ──────────────────────────────────────────
  var centroid = null;
  if (polygon && polygon.length > 0) {
    var tLat = 0, tLng = 0;
    for (var k = 0; k < polygon.length; k++) {
      tLat += polygon[k][0];
      tLng += polygon[k][1];
    }
    centroid = { lat: tLat / polygon.length, lng: tLng / polygon.length };
  }

  var googleMapsUrl = centroid
    ? 'https://www.google.com/maps/@' + centroid.lat.toFixed(6) + ',' + centroid.lng.toFixed(6) + ',19z/data=!3m1!1e3'
    : null;

  var bhuvanUrl = centroid
    ? 'https://bhuvan.nrsc.gov.in/bhuvan2d/#' + centroid.lat.toFixed(6) + '/' + centroid.lng.toFixed(6) + '/19'
    : null;

  return (
    <div
      className={className}
      style={{ position: 'relative', height: '100%', minHeight: 400, borderRadius: 12, overflow: 'hidden', background: '#0c0e14' }}
    >

      {/* Loading */}
      {loading && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.78)', borderRadius: 12 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: 32, height: 32, border: '3px solid #6366f1', borderTopColor: 'transparent', borderRadius: '50%', animation: 'sv-spin 0.8s linear infinite', margin: '0 auto' }} />
            <p style={{ marginTop: 12, fontSize: 12, color: '#9ca3af' }}>Fetching official boundary...</p>
          </div>
        </div>
      )}

      {/* Error */}
      {error && !polygon && !loading && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 30, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.78)' }}>
          <p style={{ color: '#f87171', fontSize: 13, marginBottom: 12, textAlign: 'center', maxWidth: 300 }}>{error}</p>
          <button onClick={fetchBhuvanPreview} style={{ fontSize: 12, padding: '6px 18px', borderRadius: 8, background: '#374151', color: '#e5e7eb', border: '1px solid #4b5563', cursor: 'pointer' }}>
            Retry
          </button>
        </div>
      )}

      {/* Google Maps div — always mounted so ref is stable */}
      <div
        ref={mapDivRef}
        style={{ width: '100%', height: '100%', display: polygon ? 'block' : 'none' }}
      />

      {/* Info card */}
      {polygon && centroid && (
        <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 20, background: 'rgba(0,0,0,0.88)', border: '1px solid rgba(255,107,0,0.4)', borderRadius: 10, padding: '10px 14px', fontFamily: 'monospace', fontSize: 10, color: '#e5e7eb', minWidth: 190, backdropFilter: 'blur(8px)', pointerEvents: 'none' }}>
          <p style={{ margin: '0 0 6px 0', color: '#FF6B00', fontWeight: 700, fontSize: 11, letterSpacing: 1 }}>PLOT BOUNDARY</p>
          {meta && meta.plotNo     && <p style={{ margin: '0 0 2px 0' }}>Plot No: <strong>{meta.plotNo}</strong></p>}
          {meta && meta.surveyCode && <p style={{ margin: '0 0 2px 0' }}>Survey: {meta.surveyCode}</p>}
          {meta && meta.village    && <p style={{ margin: '0 0 2px 0' }}>Village: {meta.village}</p>}
          {meta && meta.taluka     && <p style={{ margin: '0 0 2px 0' }}>Taluka: {meta.taluka}</p>}
          {meta && meta.area       && <p style={{ margin: '4px 0 0 0', color: '#6ee7b7', fontWeight: 700 }}>Area: {meta.area}</p>}
          <p style={{ margin: '4px 0 0 0', color: '#6b7280', fontSize: 9 }}>
            {centroid.lat.toFixed(5)}, {centroid.lng.toFixed(5)} ({polygon.length} pts)
          </p>
        </div>
      )}

      {/* Bottom bar */}
      {polygon && (
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(8px)', padding: '8px 14px', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <span style={{ fontSize: 10, color: '#6ee7b7', fontFamily: 'monospace', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: '#22c55e', fontSize: 13 }}>&#10003;</span>
            Mahabhunaksha + Bhuvan Official Boundary
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            {googleMapsUrl && (
              <a href={googleMapsUrl} target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 10, padding: '4px 10px', borderRadius: 6, background: 'rgba(234,88,12,0.15)', color: '#fb923c', border: '1px solid rgba(234,88,12,0.3)', textDecoration: 'none', fontFamily: 'monospace' }}>
                Google Maps
              </a>
            )}
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: '@keyframes sv-spin { to { transform: rotate(360deg); } }' }} />
    </div>
  );
};

export default SpatialView;