import React, { useEffect, useState, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, Polygon, FeatureGroup, useMap } from 'react-leaflet';
import { EditControl } from 'react-leaflet-draw';
import L from 'leaflet';
import 'leaflet-draw/dist/leaflet.draw.css';
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
    if (bounds && bounds.isValid()) {
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [bounds, map]);
  return null;
};

const SpatialView = ({ landId, editable = false, className = "w-full h-full" }) => {
  const [polygon, setPolygon] = useState(null);
  const [center, setCenter] = useState([18.5204, 73.8567]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [source, setSource] = useState(null);
  const [isModified, setIsModified] = useState(false);
  const [saving, setSaving] = useState(false);
  const featureGroupRef = useRef(null);

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
      const msg = err.response?.data?.error || 'Failed to load boundary';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [landId]);

  useEffect(() => {
    if (landId) {
      fetchBhuvanPreview();
    }
  }, [landId, fetchBhuvanPreview]);

  // Leaflet-draw event handlers
  const onEdited = (e) => {
    e.layers.eachLayer((layer) => {
      const latlngs = layer.getLatLngs()[0].map(ll => [ll.lat, ll.lng]);
      setPolygon(latlngs);
      setIsModified(true);
    });
  };

  const handleSave = async () => {
    if (!polygon) return;
    setSaving(true);
    try {
      // Build a simple GeoJSON from the current polygon state
      const geoJson = {
        type: "Feature",
        properties: {},
        geometry: {
          type: "Polygon",
          coordinates: [polygon.map(p => [p[1], p[0]])] // [lng, lat] for GeoJSON
        }
      };
      
      // Close the ring if needed
      const ring = geoJson.geometry.coordinates[0];
      if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) {
        ring.push([...ring[0]]);
      }

      await api.put(`/polygon/${landId}`, { geoJson });
      setIsModified(false);
      alert('Boundary updated successfully!');
    } catch (err) {
      console.error(err);
      alert('Failed to save boundary updates.');
    } finally {
      setSaving(false);
    }
  };

  const bounds = polygon && polygon.length > 0 ? L.latLngBounds(polygon) : null;

  return (
    <div className={`relative ${className}`} style={{ minHeight: 400 }}>
      {loading && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 rounded-xl">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="mt-3 text-xs text-gray-400">Loading boundary data…</p>
          </div>
        </div>
      )}

      {error && !loading && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#0c0e14]/90 rounded-xl">
          <div className="text-center px-6">
            <p className="text-sm text-on-surface-variant/50">{error}</p>
            <p className="text-xs text-on-surface-variant/30 mt-2">Select a land with polygon data to view the map.</p>
          </div>
        </div>
      )}

      {/* Save Overlay */}
      {editable && isModified && (
        <div className="absolute top-4 right-4 z-[1000]">
          <button 
            onClick={handleSave} 
            disabled={saving}
            className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold rounded-lg shadow-lg transition-colors"
          >
            {saving ? 'Saving...' : 'Save Boundary Changes'}
          </button>
        </div>
      )}

      <MapContainer
        center={center}
        zoom={16}
        style={{ height: '100%', width: '100%' }}
        className="rounded-b-xl"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {polygon && (
          <FeatureGroup ref={featureGroupRef}>
            {editable && (
              <EditControl
                position="topright"
                onEdited={onEdited}
                draw={{
                  polyline: false,
                  polygon: false,
                  rectangle: false,
                  circle: false,
                  marker: false,
                  circlemarker: false,
                }}
                edit={{
                  edit: true,
                  remove: false
                }}
              />
            )}
            <Polygon
              positions={polygon}
              pathOptions={{
                color: '#6366f1',
                weight: 3,
                opacity: 1,
                fillColor: '#6366f1',
                fillOpacity: 0.15,
              }}
            />
          </FeatureGroup>
        )}

        <FitBounds bounds={bounds} />
      </MapContainer>

      {source && (
        <div className="absolute bottom-4 left-4 bg-emerald-900/90 text-emerald-300 text-[10px] px-3 py-1 rounded font-mono z-[1000] pointer-events-none">
          ✓ Official Boundary
        </div>
      )}
    </div>
  );
};

export default SpatialView;