import React from 'react';
import { Link } from 'react-router-dom';

const SellerNavbar = ({ activePage }) => {
  return (
    <nav className="bg-[#11131a] flex justify-between items-center w-full px-8 py-4 max-w-full docked full-width top-0 z-50">
      <div className="flex items-center gap-8">
        <div className="flex items-center gap-2">
          <Link to="/" className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary" style={{fontVariationSettings: '"FILL" 0, "wght" 400, "GRAD" 0, "opsz" 24', verticalAlign: 'middle'}}>account_balance</span>
            <span className="text-2xl font-bold tracking-tighter text-[#e5e4ed] font-headline">DLR</span>
          </Link>
        </div>
        <div className="hidden md:flex gap-6 items-center">
          <Link 
            to="/seller" 
            className={`font-['Space_Grotesk'] tracking-wide uppercase text-sm font-bold transition-colors ${
              activePage === 'dashboard' 
                ? 'text-[#7C5CFF] border-b-2 border-[#7C5CFF] pb-1' 
                : 'text-[#e5e4ed]/60 hover:text-[#e5e4ed]'
            }`}
          >
            Dashboard
          </Link>
          <Link 
            to="/seller/transfers" 
            className={`font-['Space_Grotesk'] tracking-wide uppercase text-sm font-bold transition-colors ${
              activePage === 'transfers' 
                ? 'text-[#7C5CFF] border-b-2 border-[#7C5CFF] pb-1' 
                : 'text-[#e5e4ed]/60 hover:text-[#e5e4ed]'
            }`}
          >
            Transfers
          </Link>
          <Link 
            to="/seller/documents" 
            className={`font-['Space_Grotesk'] tracking-wide uppercase text-sm font-bold transition-colors ${
              activePage === 'documents' 
                ? 'text-[#7C5CFF] border-b-2 border-[#7C5CFF] pb-1' 
                : 'text-[#e5e4ed]/60 hover:text-[#e5e4ed]'
            }`}
          >
            Documents
          </Link>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 bg-surface-container-high px-3 py-1.5 rounded-full border border-outline-variant/20">
          <div className="w-2 h-2 rounded-full bg-secondary animate-pulse"></div>
          <span className="font-label text-xs font-medium uppercase tracking-widest text-secondary">Polygon Active</span>
        </div>
        <div className="flex items-center gap-2 bg-surface-container-high px-4 py-1.5 rounded-md border border-outline-variant/10">
          <span className="font-label text-xs font-medium text-on-surface/80">0x7C5...FF21</span>
          <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center">
            <span className="material-symbols-outlined text-[16px] text-primary" style={{fontVariationSettings: '"FILL" 0, "wght" 400, "GRAD" 0, "opsz" 24', verticalAlign: 'middle'}}>wallet</span>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default SellerNavbar;
