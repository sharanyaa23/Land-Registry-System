import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import Footer from "../Footer.jsx";
import { IconBlockchain, IconWallet, IconLand, IconShield, IconTransfer, IconPolygon, IconChevron } from "../icons/Icons.jsx";

const MainDashboard = () => {
  const navigate = useNavigate();
  const { isAuthenticated, truncatedWallet, balance, chainId, user, connectWallet, loading, switchRole } = useAuth();
  const isPolygon = chainId === 137 || chainId === 80001 || chainId === 80002;
  const isAmoy = chainId === 80002;
  const isMumbai = chainId === 80001;
  const isMainnet = chainId === 137;

  const getWelcomeMessage = () => {
    if (!isAuthenticated) return 'Decentralized Land Registry';
    
    // Government officers get special welcome
    if (user?.role === 'officer') {
      return 'Welcome Officer';
    }
    
    // Normal users (buyer/seller) get generic welcome
    return 'Welcome Back';
  };

  const getWelcomeDescription = () => {
    if (!isAuthenticated) {
      return 'Secure blockchain-based registration, verification, and transfer of physical land assets. Connect your wallet to get started.';
    }
    
    // Government officers
    if (user?.role === 'officer') {
      return 'Access your officer dashboard to review land verifications and manage government records.';
    }
    
    // Normal users - can switch between buyer and seller
    return 'Switch between Buyer and Seller modes to manage your land registry activities.';
  };

  // Get available dashboards based on user role
  const getAvailableDashboards = () => {
    if (!isAuthenticated) {
      // Not authenticated - show both options for role selection
      return [
        { role: 'buyer', icon: IconLand, label: 'Buyer Dashboard', desc: 'Browse parcels and initiate secure purchases with escrow protection.', color: 'secondary' },
        { role: 'seller', icon: IconTransfer, label: 'Seller Dashboard', desc: 'Register land records, verify ownership, and manage transfers.', color: 'primary' },
      ];
    }
    
    // Government officers - show only officer dashboard
    if (user?.role === 'officer') {
      return [
        { role: 'officer', icon: IconShield, label: 'Officer Dashboard', desc: 'Review land verifications and manage government records.', color: 'amber' },
      ];
    }
    
    // Normal users (buyer/seller) - show both dashboards for switching
    return [
      { role: 'buyer', icon: IconLand, label: 'Buyer Dashboard', desc: 'Browse parcels and initiate secure purchases with escrow protection.', color: 'secondary' },
      { role: 'seller', icon: IconTransfer, label: 'Seller Dashboard', desc: 'Register land records, verify ownership, and manage transfers.', color: 'primary' },
    ];
  };

  const handleRoleSelect = async (role) => {
    console.log('handleRoleSelect called with role:', role);
    console.log('Current user role before switch:', user?.role);
    
    if (!isAuthenticated) {
      // User not authenticated - connect wallet first
      const result = await connectWallet(role);
      if (result?.user) {
        navigate(`/${role}`);
      }
    } else {
      // User already authenticated - switch role first, then navigate
      await switchRole(role);
      navigate(`/${role}`);
    }
  };

  return (
    <div className="bg-surface text-on-surface font-body min-h-screen flex flex-col" style={{backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(116, 117, 125, 0.04) 1px, transparent 0)', backgroundSize: '32px 32px'}}>
      {/* Navbar */}
      <nav className="fixed top-0 w-full z-50 bg-[#0a0c12]/90 backdrop-blur-xl border-b border-[#1d1f27]/60">
        <div className="flex justify-between items-center h-16 px-8 max-w-7xl mx-auto">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <IconBlockchain className="text-primary" size={16} />
            </div>
            <span className="text-lg font-bold text-[#e5e4ed] tracking-tight font-headline">DLR</span>
          </div>
          <div className="flex items-center gap-3">
            {isAuthenticated ? (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-[#14161e] rounded-md border border-[#1d1f27]">
                <div className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse" />
                <span className="text-xs text-[#e5e4ed]/70 font-mono">{truncatedWallet}</span>
              </div>
            ) : (
              <button onClick={() => handleRoleSelect('buyer')} disabled={loading} className="flex items-center gap-2 px-3.5 py-1.5 bg-primary/15 border border-primary/20 rounded-md text-primary text-xs font-bold hover:bg-primary/25 transition-all disabled:opacity-50">
                {loading ? (
                  <div className="w-3.5 h-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                ) : (
                  <IconWallet size={14} />
                )}
                {loading ? 'Connecting...' : 'Connect Wallet'}
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* Main */}
      <main className="flex-grow pt-28 pb-16 px-8 max-w-7xl mx-auto w-full">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
          {/* Left: Welcome & Status */}
          <div className="lg:col-span-7 flex flex-col gap-10">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/8 border border-primary/15 text-primary text-[10px] font-bold uppercase tracking-widest mb-5">
                <IconShield size={12} /> Decentralized Land Registry System
              </div>
              <h1 className="font-headline text-[38px] md:text-[44px] font-bold leading-[1.1] tracking-tight text-on-surface mb-4">
                {getWelcomeMessage()}
              </h1>
              <p className="text-[15px] text-on-surface-variant max-w-md leading-relaxed">
                {getWelcomeDescription()}
              </p>
            </div>

            {/* Role Selection */}
            {isAuthenticated ? (
              <section className="flex flex-col gap-4">
                <p className="text-[10px] font-label uppercase tracking-[0.15em] text-on-surface-variant/60">
                  {user?.role === 'officer' ? 'Officer Dashboard' : 'Access Dashboard'}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {getAvailableDashboards().map(card => (
                    <button
                      key={card.role}
                      onClick={() => handleRoleSelect(card.role)}
                      className={`group p-5 rounded-xl border border-[#1d1f27]/60 bg-[#11131a] hover:bg-[#14161e] hover:border-${card.color}/20 transition-all text-left`}
                    >
                      <div className={`w-9 h-9 rounded-lg bg-${card.color}/10 flex items-center justify-center mb-4`}>
                        <card.icon className={`text-${card.color}`} size={16} />
                      </div>
                      <h3 className="font-headline text-base font-bold text-on-surface mb-1">{card.label}</h3>
                      <p className="text-xs text-on-surface-variant leading-relaxed">{card.desc}</p>
                      <p className="text-[9px] text-outline mt-3 font-label uppercase tracking-widest">Click to enter</p>
                    </button>
                  ))}
                </div>
              </section>
            ) : (
              <section className="flex flex-col gap-4">
                <p className="text-[10px] font-label uppercase tracking-[0.15em] text-on-surface-variant/60">Select your role to get started</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {getAvailableDashboards().map(card => (
                    <button
                      key={card.role}
                      onClick={() => handleRoleSelect(card.role)}
                      disabled={loading}
                      className={`group p-5 rounded-xl border border-[#1d1f27]/60 bg-[#11131a] hover:bg-[#14161e] hover:border-${card.color}/20 transition-all text-left disabled:opacity-50`}
                    >
                      <div className={`w-9 h-9 rounded-lg bg-${card.color}/10 flex items-center justify-center mb-4`}>
                        {loading ? (
                          <div className={`w-4 h-4 border-2 border-${card.color} border-t-transparent rounded-full animate-spin`} />
                        ) : (
                          <card.icon className={`text-${card.color}`} size={16} />
                        )}
                      </div>
                      <h3 className="font-headline text-base font-bold text-on-surface mb-1">{card.label}</h3>
                      <p className="text-xs text-on-surface-variant leading-relaxed">{card.desc}</p>
                      {loading && (
                        <p className="text-[9px] text-primary mt-3 font-label uppercase tracking-widest animate-pulse">Connecting...</p>
                      )}
                      {!loading && (
                        <p className="text-[9px] text-outline mt-3 font-label uppercase tracking-widest">Click to connect & enter</p>
                      )}
                    </button>
                  ))}
                </div>
                <p className="text-[9px] text-on-surface-variant/30 mt-1">
                  Officers are pre-whitelisted by administrators and will be recognized automatically on wallet connect.
                </p>
              </section>
            )}
          </div>

          {/* Right: Status panels */}
          <div className="lg:col-span-5 flex flex-col gap-4">
            {/* Network Status */}
            <div className="bg-[#11131a] border border-[#1d1f27]/60 p-5 rounded-xl">
              <div className="flex justify-between items-center mb-4">
                <p className="text-[10px] font-label uppercase tracking-[0.15em] text-on-surface-variant/60">Network</p>
                <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                  isAuthenticated && isPolygon ? 'text-secondary' : isAuthenticated ? 'text-amber-400' : 'text-on-surface-variant/40'
                }`}>
                  <div className={`w-1.5 h-1.5 rounded-full ${isAuthenticated ? (isAmoy ? 'bg-green-500 animate-pulse' : isMumbai ? 'bg-yellow-500' : isMainnet ? 'bg-blue-500' : 'bg-amber-400') : 'bg-[#1d1f27]'}`} />
                  {isAuthenticated ? (isAmoy ? 'Amoy' : isMumbai ? 'Mumbai' : isMainnet ? 'Mainnet' : 'Wrong Network') : 'Offline'}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${isAuthenticated ? 'bg-secondary/10' : 'bg-[#1d1f27]'}`}>
                  <IconPolygon className={isAuthenticated ? 'text-secondary' : 'text-on-surface-variant/30'} size={16} />
                </div>
                <div>
                  <p className="text-sm font-medium text-on-surface">
                    {isAuthenticated ? (chainId === 80002 ? 'Polygon Amoy Testnet' : chainId === 80001 ? 'Polygon Mumbai Testnet' : chainId === 137 ? 'Polygon Mainnet' : `Chain ${chainId}`) : 'Not connected'}
                  </p>
                  <p className="text-[10px] text-on-surface-variant/50 font-mono">
                    {isAuthenticated ? 'dl-reg-rpc-01.polygon.net' : 'Awaiting wallet'}
                  </p>
                </div>
              </div>
            </div>

            {/* Wallet Card */}
            <div className="bg-[#11131a] border border-[#1d1f27]/60 p-5 rounded-xl">
              <p className="text-[10px] font-label uppercase tracking-[0.15em] text-on-surface-variant/60 mb-5">Wallet</p>
              <div className="space-y-4">
                <div>
                  <p className="text-[9px] uppercase font-bold tracking-widest text-on-surface-variant/40 mb-1">Address</p>
                  <p className="text-on-surface font-mono text-base font-medium">{isAuthenticated ? truncatedWallet : '\u2014'}</p>
                </div>
                <div className="pt-3 border-t border-[#1d1f27]/60">
                  <p className="text-[9px] uppercase font-bold tracking-widest text-on-surface-variant/40 mb-1">Balance</p>
                  <p className="text-2xl font-headline font-bold text-primary">
                    {balance !== null ? balance : '\u2014'}
                    <span className="ml-1 text-sm font-medium text-on-surface-variant/60">MATIC</span>
                  </p>
                </div>
              </div>
            </div>

            {/* Profile Card */}
            <div className="bg-[#11131a] border border-[#1d1f27]/60 p-5 rounded-xl">
              <p className="text-[10px] font-label uppercase tracking-[0.15em] text-on-surface-variant/60 mb-5">Profile</p>
              <div className="space-y-3">
                {[
                  { label: 'Wallet', value: isAuthenticated ? truncatedWallet : '\u2014' },
                  { label: 'Role', value: user?.role === 'officer' ? 'Officer' : 'User', isBadge: true },
                  { label: 'Status', value: isAuthenticated ? 'Authenticated' : 'Not Connected', isGreen: isAuthenticated },
                ].map((row, i) => (
                  <div key={i} className="flex justify-between items-center py-1.5 border-b border-[#1d1f27]/40 last:border-0">
                    <span className="text-xs text-on-surface-variant/60">{row.label}</span>
                    {row.isBadge ? (
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                        user?.role === 'officer' ? 'bg-amber-500/10 text-amber-400' :
                        user?.role === 'seller' ? 'bg-primary/10 text-primary' :
                        'bg-secondary/10 text-secondary'
                      }`}>{row.value}</span>
                    ) : (
                      <span className={`text-xs font-medium ${row.isGreen ? 'text-secondary' : 'text-on-surface-variant'}`}>{row.value}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default MainDashboard;
