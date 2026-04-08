const axios = require('axios');
const FormData = require('form-data');

exports.pinBuffer = async (buffer, options = {}) => {
  try {
    const data = new FormData();

    // Append the actual image buffer (PNG)
    data.append('file', buffer, {
      filename: options.filename || `land_record_${Date.now()}.png`,
      contentType: 'image/png'
    });

    // Add useful metadata for your land registry
    const metadata = {
      name: options.filename || `land_record_main_${Date.now()}.png`,
      keyvalues: {
        landId: options.landId || 'unknown',
        surveyNumber: options.fullSurveyInput || '',
        villageValue: options.villageValue || '',
        districtValue: options.districtValue || '',
        talukaValue: options.talukaValue || '',
        mobile: options.mobile || '',
        type: '7_12_result_screenshot',
        capturedAt: new Date().toISOString()
      }
    };

    data.append('pinataMetadata', JSON.stringify(metadata));

    // Use JWT (recommended) or fallback to legacy keys
    const headers = {
      ...data.getHeaders(),
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    };

    if (process.env.PINATA_JWT) {
      headers.Authorization = `Bearer ${process.env.PINATA_JWT}`;
      console.log("Using JWT authentication for Pinata");
    } else {
      headers.pinata_api_key = process.env.PINATA_KEY;
      headers.pinata_secret_api_key = process.env.PINATA_SECRET;
      console.log("Using legacy key + secret authentication");
    }

    const res = await axios.post(
      'https://api.pinata.cloud/pinning/pinFileToIPFS',
      data,
      { 
        headers,
        maxBodyLength: Infinity,
        maxContentLength: Infinity 
      }
    );

    console.log("IPFS Upload Successful!");
    console.log("IPFS Hash:", res.data.IpfsHash);
    console.log("Gateway URL:", `https://gateway.pinata.cloud/ipfs/${res.data.IpfsHash}`);

    return res.data.IpfsHash;   // Keep same return as before for minimal change

  } catch (err) {
    console.error("IPFS Error:", err.response?.data || err.message);
    if (err.response?.data?.error?.reason === 'NO_SCOPES_FOUND') {
      console.error(" SOLUTION: Create a new Pinata key with **Admin** scope enabled");
      console.error("   Or add PINATA_JWT to your .env and use JWT authentication");
    }
    throw err;
  }
};