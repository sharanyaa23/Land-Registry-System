import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { BrowserProvider } from 'ethers';
import { authAPI } from '../services/api';

const AuthContext = createContext(null);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('dlr_token'));
  const [wallet, setWallet] = useState(null);
  const [balance, setBalance] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [loading, setLoading] = useState(true);

  const isAuthenticated = !!token && !!user;

  const truncatedWallet = wallet
    ? `${wallet.slice(0, 6)}...${wallet.slice(-4)}`
    : null;

  // Restore session on mount
  useEffect(() => {
    const init = async () => {
      if (token) {
        try {
          const res = await authAPI.getMe();
          setUser(res.data.user || res.data.data || res.data);
          if (window.ethereum) {
            const accounts = await window.ethereum.request({ method: 'eth_accounts' });
            if (accounts.length > 0) {
              setWallet(accounts[0]);
              const provider = new BrowserProvider(window.ethereum);
              const bal = await provider.getBalance(accounts[0]);
              setBalance(parseFloat((Number(bal) / 1e18).toFixed(4)));
              const network = await provider.getNetwork();
              setChainId(Number(network.chainId));
            }
          }
        } catch {
          localStorage.removeItem('dlr_token');
          localStorage.removeItem('dlr_user');
          setToken(null);
          setUser(null);
        }
      }
      setLoading(false);
    };
    init();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const accountChangeTimeoutRef = useRef(null);

  // Listen for wallet changes
  useEffect(() => {
    if (!window.ethereum) return;
    const handleAccounts = async (accounts) => { 
      // Debounce the account change handler
      if (accountChangeTimeoutRef.current) {
        clearTimeout(accountChangeTimeoutRef.current);
      }
      
      accountChangeTimeoutRef.current = setTimeout(async () => {
        if (accounts.length === 0) {
          logout(); 
        } else {
          // Automatically re-authenticate with the new wallet
          console.log("Account switched, reconnecting...");
          try {
            const result = await connectWallet();
            if (!result) {
              console.log("Auto-reconnect failed (returned null), logging out...");
              logout();
            }
          } catch (err) {
            console.error("Auto-reconnect failed:", err);
            logout();
          }
        }
      }, 500); // 500ms debounce
    };
    const handleChain = (hex) => setChainId(parseInt(hex, 16));
    window.ethereum.on('accountsChanged', handleAccounts);
    window.ethereum.on('chainChanged', handleChain);
    return () => {
      window.ethereum.removeListener('accountsChanged', handleAccounts);
      window.ethereum.removeListener('chainChanged', handleChain);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Simple wallet connection test (no auth)
   */
  const testWalletConnection = useCallback(async () => {
    if (!window.ethereum) {
      alert('Please install MetaMask to use this application.');
      return null;
    }
    try {
      console.log('Testing basic wallet connection...');
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      const address = accounts[0];
      console.log('Basic wallet connection successful:', address);
      
      const provider = new BrowserProvider(window.ethereum);
      const network = await provider.getNetwork();
      const chainId = Number(network.chainId);
      console.log('Network:', chainId);
      
      // Update basic state without authentication
      setWallet(address);
      setChainId(chainId);
      
      return { address, chainId };
    } catch (err) {
      console.error('Basic wallet connection failed:', err);
      alert(`Basic connection failed: ${err.message}`);
      return null;
    }
  }, []);

  /**
   * Connect wallet + SIWE auth.
   * Returns { user, isNew, existingRole } so the caller can decide navigation.
   * - Returning users: existingRole is set, role param is ignored
   * - New users: role param determines their role (buyer/seller)
   */
  const connectWallet = useCallback(async (role = 'buyer') => {
    if (!window.ethereum) {
      alert('Please install MetaMask to use this application.');
      return null;
    }
    try {
      setLoading(true);
      console.log('Starting wallet connection...');
      
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      const address = accounts[0];
      console.log('Wallet connected:', address);
      setWallet(address);

      const provider = new BrowserProvider(window.ethereum);
      const bal = await provider.getBalance(address);
      setBalance(parseFloat((Number(bal) / 1e18).toFixed(4)));
      const network = await provider.getNetwork();
      const chainId = Number(network.chainId);
      setChainId(chainId);
      console.log('Network detected:', chainId);

      // Warning if not on supported networks (Amoy or Hardhat Local)
      if (chainId !== 80002 && chainId !== 31337 && chainId !== 1337 && chainId !== 80001 && chainId !== 137) {
        console.warn('Network may not be supported:', chainId);
      }

      console.log('Requesting nonce from backend...');
      // Backend returns { success, nonce, message, existingRole }
      const nonceRes = await authAPI.getNonce(address);
      console.log('Nonce response:', nonceRes.data);
      const siweMessage = nonceRes.data.message;
      const existingRole = nonceRes.data.existingRole;

      console.log('Requesting signature...');
      // Sign the SIWE message
      const signer = await provider.getSigner();
      const signature = await signer.signMessage(siweMessage);
      console.log('Signature obtained');

      console.log('Verifying signature with backend...');
      // Verify with backend => JWT
      // For returning users, backend ignores the role param and uses their existing role
      const authRes = await authAPI.verifySignature({ message: siweMessage, signature, role });
      console.log('Auth response:', authRes.data);
      const jwt = authRes.data.token;
      const userData = authRes.data.user;

      localStorage.setItem('dlr_token', jwt);
      localStorage.setItem('dlr_user', JSON.stringify(userData));
      setToken(jwt);
      setUser(userData);
      console.log('Authentication successful!');

      return {
        user: userData,
        isNew: authRes.data.isNew,
        existingRole
      };
    } catch (err) {
      console.error('Wallet connection failed:', err);
      alert(`Connection failed: ${err.message || err.response?.data?.error || 'Unknown error'}`);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('dlr_token');
    localStorage.removeItem('dlr_user');
    setToken(null);
    setUser(null);
    setWallet(null);
    setBalance(null);
  }, []);

  const switchRole = useCallback(async (newRole) => {
  try {
    // Call a backend endpoint to update role + re-issue JWT
    const res = await authAPI.updateRole(newRole);
    const newToken = res.data.token;
    const updatedUser = res.data.user;
    
    localStorage.setItem('dlr_token', newToken);
    localStorage.setItem('dlr_user', JSON.stringify(updatedUser));
    setToken(newToken);
    setUser(updatedUser);
  } catch (err) {
    console.error('Role switch failed:', err);
  }
}, []);

  return (
    <AuthContext.Provider value={{ user, token, wallet, truncatedWallet, balance, chainId, isAuthenticated, loading, connectWallet, logout, switchRole, testWalletConnection }}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;
