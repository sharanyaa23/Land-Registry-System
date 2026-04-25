import { useState, useEffect } from 'react';
import axios from 'axios';

export const useCryptoPrice = (cryptoId = 'matic-network', currency = 'inr') => {
  const [price, setPrice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;
    
    const fetchPrice = async () => {
      try {
        setLoading(true);
        // Using CoinGecko's public API
        const res = await axios.get(`https://api.coingecko.com/api/v3/simple/price?ids=${cryptoId}&vs_currencies=${currency}`);
        if (isMounted && res.data && res.data[cryptoId]) {
          setPrice(res.data[cryptoId][currency]);
          setError(null);
        }
      } catch (err) {
        if (isMounted) {
          console.error("Failed to fetch crypto price:", err);
          setError(err.message);
          // Fallback static price if API limit reached
          setPrice(55.42); 
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchPrice();
    
    // Refresh every 5 minutes
    const interval = setInterval(fetchPrice, 5 * 60 * 1000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [cryptoId, currency]);

  const convertToINR = (amount) => {
    if (!price || !amount) return null;
    return (parseFloat(amount) * price).toLocaleString('en-IN', {
      maximumFractionDigits: 0,
      style: 'currency',
      currency: 'INR'
    });
  };

  return { price, loading, error, convertToINR };
};
