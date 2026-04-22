import React, { useEffect, useState, useCallback } from 'react';
import { MapContainer, TileLayer, Polygon, useMap } from 'react-leaflet';
import L from 'leaflet';
import api from '../../services/api';

// Fix Leaflet icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
  iconUrl: require('leaflet/dist/images/marker-icon.png'),
  shadowUrl: require('leaflet/dist/images/marker-shadow.png'),
});

const FitBounds = ({ bounds }) => {
  const map = useMap();
  useEffect(() => {
    if (bounds) {
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [bounds, map]);
  return null;
};

const SpatialView = ({ landId, className = "w-full h-full" }) => {
  const [polygon, setPolygon] = useState(null);
  const [center, setCenter] = useState([18.5204, 73.8567]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [source, setSource] = useState(null);

  const fetchBhuvanPreview = useCallback(async () => {
    if (!landId) return;
    setLoading(true);
    setError(null);

    try {
      const res = await api.get(`/polygon/${landId}/bhuvan-preview`);
      const config = res.data.data;

      if (config?.plotPolygon?.latLngs) {
        setPolygon(config.plotPolygon.latLngs);
        setCenter([config.centre.lat, config.centre.lng]);
        setSource('mahabhunaksha_bhuvan');
      } else {
        setError('No boundary data available');
      }
    } catch (err) {
      // Show specific message from backend if available
      const msg = err.response?.data?.error || 'Failed to load boundary';
      setError(msg);  // "No polygon found for this land"
    }
  }, [landId]);

  useEffect(() => {
    if (landId) {
      fetchBhuvanPreview();
    }
  }, [landId, fetchBhuvanPreview]);

  return (
    <div className={`relative ${className}`} style={{ minHeight: 400 }}>
      {loading && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 rounded-xl">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="mt-3 text-xs text-gray-400">Loading official boundary from Bhuvan...</p>
          </div>
        </div>
      )}

      <MapContainer
        center={center}
        zoom={16}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='© ISRO Bhuvan & OpenStreetMap'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {polygon && (
          <Polygon
            positions={polygon}
            pathOptions={{
              color: '#FF6B00',
              weight: 3,
              opacity: 1,
              fillColor: '#FF6B00',
              fillOpacity: 0.18,
            }}
          />
        )}

        <FitBounds bounds={polygon ? L.latLngBounds(polygon) : null} />
      </MapContainer>

      {source && (
        <div className="absolute bottom-4 left-4 bg-emerald-900/90 text-emerald-300 text-[10px] px-3 py-1 rounded font-mono z-[1000]">
          ✓ Mahabhunaksha + Bhuvan Official Boundary
        </div>
      )}
    </div>
  );
};

export default SpatialView;