import { useMemo } from 'react';
import locationData from '../data/maharashtra_full.json';


const cleanName = (name) => name.replace(/^[\d]+\s*/, '').trim();

export const useLocationData = () => {
  const districts = useMemo(() =>
    locationData.map(d => ({
      id: d.id,         
      name: cleanName(d.name),
      rawName: d.name     
    })).sort((a, b) => a.name.localeCompare(b.name)),
  []);

  const getTalukas = (districtId) => {
    const district = locationData.find(d => d.id === districtId);
    if (!district) return [];
    return district.talukas.map(t => ({
      id: t.id,
      name: cleanName(t.name),
      rawName: t.name
    })).sort((a, b) => a.name.localeCompare(b.name));
  };

  const getVillages = (districtId, talukaId) => {
    const district = locationData.find(d => d.id === districtId);
    if (!district) return [];
    const taluka = district.talukas.find(t => t.id === talukaId);
    if (!taluka) return [];
    return taluka.villages.map(v => ({
      id: v.id,                    
      name: cleanName(v.name),    
      rawName: v.name              
    })).sort((a, b) => a.name.localeCompare(b.name));
  };

  return { districts, getTalukas, getVillages };
};