/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI } from "@google/genai";
import { 
  Scan, 
  Search, 
  MapPin, 
  Navigation, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  ChevronRight, 
  ArrowRight,
  Loader2,
  Camera,
  History,
  TrendingDown,
  Info,
  ExternalLink,
  Store,
  DollarSign,
  Package,
  X,
  Map as MapIcon,
  ShoppingCart,
  PlusCircle,
  Trash2,
  Printer
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---

interface PharmacyPrice {
  pharmacyName: string;
  price: string;
  stockStatus: 'In Stock' | 'Low Stock' | 'Out of Stock';
  distance: string;
  address: string;
  url?: string;
}

interface MedicationAnalysis {
  medicationName: string;
  dosage: string;
  description: string;
  prices: PharmacyPrice[];
  cheapestOption: string;
  averagePrice: string;
  genericAlternative?: {
    name: string;
    price: string;
    savings: string;
  };
}

interface GroundingLink {
  uri: string;
  title: string;
}

// --- Components ---

const Badge = ({ children, className, variant = 'default' }: { 
  children: React.ReactNode; 
  className?: string;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info';
}) => {
  const variants = {
    default: 'bg-slate-100 text-slate-700 border border-slate-200',
    success: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
    warning: 'bg-amber-100 text-amber-700 border border-amber-200',
    danger: 'bg-red-100 text-red-700 border border-red-200',
    info: 'bg-blue-100 text-blue-700 border border-blue-200',
  };
  
  return (
    <span className={cn("px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider", variants[variant], className)}>
      {children}
    </span>
  );
};

const SAMPLE_MEDS = [
  "Paracetamol 500mg",
  "Ventolin Inhaler",
  "Amoxicillin 250mg",
  "Loratadine 10mg"
];

export default function App() {
  const [input, setInput] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<MedicationAnalysis | null>(null);
  const [basket, setBasket] = useState<MedicationAnalysis[]>([]);
  const [groundingLinks, setGroundingLinks] = useState<GroundingLink[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [showBasket, setShowBasket] = useState(false);
  const [history, setHistory] = useState<MedicationAnalysis[]>([]);
  const [savedPrescriptions, setSavedPrescriptions] = useState<MedicationAnalysis[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const [selectedPharmacyForCheckout, setSelectedPharmacyForCheckout] = useState<string | null>(null);
  const [selectedItemsForCheckout, setSelectedItemsForCheckout] = useState<string[]>([]);

  // Load from localStorage
  useEffect(() => {
    const savedHistory = localStorage.getItem('medprice_history');
    if (savedHistory) setHistory(JSON.parse(savedHistory));

    const savedPrescs = localStorage.getItem('medprice_prescriptions');
    if (savedPrescs) setSavedPrescriptions(JSON.parse(savedPrescs));
  }, []);

  // Save to localStorage
  useEffect(() => {
    localStorage.setItem('medprice_history', JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    localStorage.setItem('medprice_prescriptions', JSON.stringify(savedPrescriptions));
  }, [savedPrescriptions]);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        (err) => console.error("Geolocation error:", err)
      );
    }
  }, []);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setIsCameraActive(true);
      }
    } catch (err) {
      setError("Could not access camera. Please check permissions.");
    }
  };

  const capturePhoto = () => {
    if (videoRef.current) {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(videoRef.current, 0, 0);
      const dataUrl = canvas.toDataURL('image/png');
      setImage(dataUrl);
      stopCamera();
    }
  };

  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
      setIsCameraActive(false);
    }
  };

  const processAnalysis = async (medName?: string) => {
    const query = medName || input;
    if (!query && !image) {
      setError("Please provide a medication name or scan the packaging.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setResult(null);
    setGroundingLinks([]);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      
      const prompt = `
        You are MedPrice AI, a pharmacy transparency tool for the AdvanceHealth Hackathon.
        Analyze the medication or prescription (from text or image) and provide a price comparison across major pharmacies (e.g., Boots, LloydsPharmacy, local chemists).
        Find real-time or realistic prices for this medication in Ireland/UK.
        
        If an image is provided, it might be a medication box or a handwritten/printed prescription. Use OCR to identify the drug name, dosage, and quantity.
        
        IMPORTANT: Your response MUST be ONLY a valid JSON object. Do not include any other text before or after the JSON.
        
        JSON Schema:
        {
          "medicationName": "Name of the drug",
          "dosage": "e.g., 500mg, 30 tablets",
          "description": "Brief description of what it's for",
          "cheapestOption": "Name of cheapest pharmacy",
          "averagePrice": "Average price string",
          "genericAlternative": {
            "name": "Generic Name",
            "price": "€X.XX",
            "savings": "€X.XX"
          },
          "prices": [
            {
              "pharmacyName": "Boots",
              "price": "€12.50",
              "stockStatus": "In Stock",
              "distance": "0.8 km",
              "address": "123 Main St, Dublin",
              "url": "https://www.boots.ie/..."
            },
            ... (at least 3-4 pharmacies)
          ]
        }
      `;

      const contents: any = {
        parts: [{ text: prompt + "\n\nInput: " + query }]
      };

      if (image) {
        contents.parts.push({
          inlineData: {
            mimeType: "image/png",
            data: image.split(',')[1]
          }
        });
      }

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [contents],
        config: {
          // responseMimeType: "application/json", // Not allowed with googleMaps tool
          tools: [{ googleSearch: {} }, { googleMaps: {} }],
          toolConfig: location ? {
            retrievalConfig: {
              latLng: {
                latitude: location.lat,
                longitude: location.lng
              }
            }
          } : undefined
        }
      });

      // Manually extract JSON from response as responseMimeType is not allowed with googleMaps
      const text = response.text || "";
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : text;
      const data = JSON.parse(jsonStr) as MedicationAnalysis;
      setResult(data);

      // Add to history
      setHistory(prev => {
        const filtered = prev.filter(h => h.medicationName !== data.medicationName);
        return [data, ...filtered].slice(0, 10); // Keep last 10
      });

      // Extract grounding links (Search and Maps)
      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
      if (chunks) {
        const links: GroundingLink[] = [];
        chunks.forEach((c: any) => {
          if (c.web) {
            links.push({ uri: c.web.uri, title: c.web.title });
          } else if (c.maps) {
            links.push({ uri: c.maps.uri, title: c.maps.title });
          }
        });
        setGroundingLinks(links);
      }
    } catch (err: any) {
      console.error(err);
      setError("Failed to analyze medication. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const openMapView = () => {
    if (result) {
      // Find the first map link if available, otherwise search on Google Maps
      const mapLink = groundingLinks.find(l => l.uri.includes('google.com/maps'))?.uri;
      if (mapLink) {
        window.open(mapLink, '_blank');
      } else {
        const query = encodeURIComponent(`pharmacies selling ${result.medicationName} near me`);
        window.open(`https://www.google.com/maps/search/${query}`, '_blank');
      }
    }
  };

  const handleSwitchToGeneric = () => {
    if (result?.genericAlternative) {
      setInput(result.genericAlternative.name);
      processAnalysis(result.genericAlternative.name);
    }
  };

  const addToBasket = (med: MedicationAnalysis) => {
    if (!basket.find(item => item.medicationName === med.medicationName)) {
      setBasket([...basket, med]);
    }
    setShowBasket(true);
  };

  const addAllToBasket = () => {
    const newItems = savedPrescriptions.filter(
      saved => !basket.find(item => item.medicationName === saved.medicationName)
    );
    if (newItems.length > 0) {
      setBasket([...basket, ...newItems]);
    }
    setShowBasket(true);
    setShowSaved(false);
  };

  const removeFromBasket = (name: string) => {
    setBasket(basket.filter(item => item.medicationName !== name));
    if (basket.length <= 1) setSelectedPharmacyForCheckout(null);
  };

  const clearBasket = () => {
    setBasket([]);
    setSelectedPharmacyForCheckout(null);
    setShowBasket(false);
  };

  const calculateBasketTotal = (pharmacyName: string) => {
    let total = 0;
    const itemsToSum = selectedPharmacyForCheckout ? basket.filter(m => selectedItemsForCheckout.includes(m.medicationName)) : basket;
    itemsToSum.forEach(med => {
      const priceStr = med.prices.find(p => p.pharmacyName === pharmacyName)?.price || "€0";
      const price = parseFloat(priceStr.replace(/[^\d.]/g, '')) || 0;
      total += price;
    });
    return `€${total.toFixed(2)}`;
  };

  const getCommonPharmacies = () => {
    const pharmacyCounts: Record<string, number> = {};
    basket.forEach(med => {
      med.prices.forEach(p => {
        pharmacyCounts[p.pharmacyName] = (pharmacyCounts[p.pharmacyName] || 0) + 1;
      });
    });
    // Only return pharmacies that have all items in the basket
    return Object.keys(pharmacyCounts).filter(name => pharmacyCounts[name] === basket.length);
  };

  const toggleSavePrescription = (med: MedicationAnalysis) => {
    if (savedPrescriptions.find(p => p.medicationName === med.medicationName)) {
      setSavedPrescriptions(savedPrescriptions.filter(p => p.medicationName !== med.medicationName));
    } else {
      setSavedPrescriptions([...savedPrescriptions, med]);
    }
  };

  const shareResult = () => {
    if (result) {
      const text = `Check out prices for ${result.medicationName} on MedPrice AI! Average price: ${result.averagePrice}. Cheapest at ${result.cheapestOption}.`;
      if (navigator.share) {
        navigator.share({ title: 'MedPrice AI Result', text, url: window.location.href });
      } else {
        navigator.clipboard.writeText(text);
        alert("Result copied to clipboard!");
      }
    }
  };

  const handlePharmacySelect = (pharmacy: string) => {
    setSelectedPharmacyForCheckout(pharmacy);
    setSelectedItemsForCheckout(basket.map(m => m.medicationName));
  };

  const toggleItemSelection = (name: string) => {
    if (selectedItemsForCheckout.includes(name)) {
      setSelectedItemsForCheckout(selectedItemsForCheckout.filter(n => n !== name));
    } else {
      setSelectedItemsForCheckout([...selectedItemsForCheckout, name]);
    }
  };

  const toggleSelectAll = () => {
    if (selectedItemsForCheckout.length === basket.length) {
      setSelectedItemsForCheckout([]);
    } else {
      setSelectedItemsForCheckout(basket.map(m => m.medicationName));
    }
  };

  return (
    <div className="min-h-screen bg-[#F1F5F9] text-slate-900 font-sans">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-200">
              <Scan size={24} />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">MedPrice AI</h1>
              <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold flex items-center gap-1">
                <MapPin size={10} className="text-indigo-500" />
                Dublin, Ireland
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setShowBasket(!showBasket)}
              className="relative p-2 text-slate-400 hover:text-indigo-600 transition-colors"
              aria-label="View Basket"
            >
              <ShoppingCart size={20} />
              {basket.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                  {basket.length}
                </span>
              )}
            </button>
            <button 
              onClick={() => setShowHistory(!showHistory)}
              className="p-2 text-slate-400 hover:text-indigo-600 transition-colors"
              aria-label="View History"
            >
              <History size={20} />
            </button>
            <button 
              onClick={() => setShowSaved(!showSaved)}
              className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-all shadow-md shadow-indigo-100"
            >
              My Prescriptions
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {/* Search & Scan Section */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-8">
          <div className="lg:col-span-12">
            <div className="bg-white rounded-3xl p-8 shadow-xl shadow-slate-200/50 border border-slate-100">
              <h2 className="text-2xl font-extrabold text-slate-900 mb-6 text-center">
                Find the best price for your medication
              </h2>
              
              <div className="flex flex-col md:flex-row gap-4 mb-6">
                <div className="relative flex-1">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && processAnalysis()}
                    placeholder="Enter medication name (e.g. Paracetamol, Ventolin)..."
                    className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-base focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={startCamera}
                    className="p-4 bg-slate-100 text-slate-700 rounded-2xl hover:bg-slate-200 transition-all flex items-center gap-2 font-semibold"
                  >
                    <Camera size={24} />
                    <span className="hidden sm:inline">Scan Box</span>
                  </button>
                  <button
                    onClick={() => processAnalysis()}
                    disabled={isLoading || (!input && !image)}
                    className="px-8 py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-indigo-200 flex items-center gap-2"
                  >
                    {isLoading ? <Loader2 className="animate-spin" size={24} /> : <Navigation size={24} />}
                    Compare
                  </button>
                </div>
              </div>

              {/* Sample Meds */}
              <div className="flex flex-wrap justify-center gap-2">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest mr-2 py-2">Try:</span>
                {SAMPLE_MEDS.map((med) => (
                  <button
                    key={med}
                    onClick={() => { setInput(med); processAnalysis(med); }}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 rounded-full text-xs font-medium transition-colors border border-slate-200"
                  >
                    {med}
                  </button>
                ))}
              </div>

              {/* Camera Modal/Overlay */}
              {isCameraActive && (
                <div className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center p-4">
                  <div className="absolute top-4 right-4 z-[110]">
                    <button onClick={stopCamera} className="p-3 bg-white/20 text-white rounded-full hover:bg-white/30 transition-all">
                      <X size={24} />
                    </button>
                  </div>
                  <video ref={videoRef} autoPlay playsInline className="max-w-full max-h-[70vh] rounded-2xl shadow-2xl" />
                  <div className="mt-8 flex gap-6 items-center">
                    <button onClick={capturePhoto} className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-2xl hover:scale-110 transition-transform">
                      <div className="w-16 h-16 border-4 border-slate-900 rounded-full" />
                    </button>
                  </div>
                  <p className="mt-6 text-white/60 text-sm font-medium">Align medication box within the frame</p>
                </div>
              )}

              {image && !isCameraActive && (
                <div className="mt-6 flex items-center gap-4 p-4 bg-indigo-50 rounded-2xl border border-indigo-100">
                  <img src={image} alt="Medication" className="w-16 h-16 object-cover rounded-lg shadow-sm" />
                  <div className="flex-1">
                    <p className="text-sm font-bold text-indigo-900">Medication Scanned</p>
                    <p className="text-xs text-indigo-600">Ready for comparison</p>
                  </div>
                  <button onClick={() => setImage(null)} className="p-2 text-slate-400 hover:text-red-500 transition-colors">
                    <X size={20} />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Results Section */}
        {isLoading && (
          <div className="text-center py-20">
            <div className="relative inline-block">
              <div className="w-24 h-24 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
              <Scan className="absolute inset-0 m-auto text-indigo-600 animate-pulse" size={40} />
            </div>
            <h3 className="text-xl font-bold text-slate-900 mt-8">Scanning local pharmacies...</h3>
            <p className="text-slate-500 mt-2">Comparing prices at Boots, Lloyds, and local chemists</p>
          </div>
        )}

        {error && (
          <div className="p-4 bg-red-50 border border-red-100 rounded-2xl text-red-700 flex items-center gap-3 mb-8">
            <AlertCircle size={20} />
            <p className="text-sm font-medium">{error}</p>
          </div>
        )}

        {result && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
            {/* Med Info Card */}
            <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-sm flex flex-col md:flex-row gap-8 items-center">
              <div className="w-24 h-24 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 shrink-0">
                <Package size={48} />
              </div>
              <div className="flex-1 text-center md:text-left">
                <div className="flex flex-wrap justify-center md:justify-start gap-2 mb-2">
                  <Badge variant="info">{result.dosage}</Badge>
                  <Badge variant="success">Cheapest: {result.cheapestOption}</Badge>
                </div>
                <div className="flex items-center justify-center md:justify-start gap-3 mb-2">
                  <h2 className="text-3xl font-black text-slate-900">{result.medicationName}</h2>
                  <div className="flex items-center gap-1">
                    <button 
                      onClick={() => addToBasket(result)}
                      className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-full transition-colors"
                      title="Add to Basket"
                    >
                      <PlusCircle size={24} />
                    </button>
                    <button 
                      onClick={() => toggleSavePrescription(result)}
                      className={cn(
                        "p-2 rounded-full transition-colors",
                        savedPrescriptions.find(p => p.medicationName === result.medicationName)
                          ? "text-rose-500 bg-rose-50"
                          : "text-slate-400 hover:bg-slate-50"
                      )}
                      title="Save to My Prescriptions"
                    >
                      <CheckCircle2 size={24} />
                    </button>
                    <button 
                      onClick={shareResult}
                      className="p-2 text-slate-400 hover:bg-slate-50 rounded-full transition-colors"
                      title="Share Result"
                    >
                      <ExternalLink size={20} />
                    </button>
                    <button 
                      onClick={() => window.print()}
                      className="p-2 text-slate-400 hover:bg-slate-50 rounded-full transition-colors print:hidden"
                      title="Print Result"
                    >
                      <Printer size={20} />
                    </button>
                  </div>
                </div>
                <p className="text-slate-500 leading-relaxed max-w-xl">{result.description}</p>
              </div>
              <div className="text-center md:text-right">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Avg. Price</p>
                <p className="text-3xl font-black text-indigo-600">{result.averagePrice}</p>
              </div>
            </div>

            {/* Price List */}
            <div className="space-y-4">
              <div className="flex items-center justify-between px-2">
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <TrendingDown size={20} className="text-emerald-500" />
                  Nearby Availability
                </h3>
                <button 
                  onClick={openMapView}
                  className="text-xs font-bold text-indigo-600 flex items-center gap-1 hover:underline"
                >
                  <MapIcon size={14} />
                  View Map
                </button>
              </div>
              
              <div className="grid grid-cols-1 gap-4">
                {result.prices.map((pharmacy, idx) => (
                  <div 
                    key={idx} 
                    className={cn(
                      "bg-white rounded-2xl p-6 border transition-all hover:shadow-md flex flex-col sm:flex-row items-center gap-6",
                      idx === 0 ? "border-emerald-200 bg-emerald-50/10 shadow-sm" : "border-slate-100"
                    )}
                  >
                    <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center text-slate-400 shrink-0">
                      <Store size={24} />
                    </div>
                    <div className="flex-1 text-center sm:text-left">
                      <div className="flex flex-wrap justify-center sm:justify-start items-center gap-2 mb-1">
                        <h4 className="font-bold text-lg">{pharmacy.pharmacyName}</h4>
                        {idx === 0 && <Badge variant="success" className="text-[8px]">Best Value</Badge>}
                        <Badge variant={pharmacy.stockStatus === 'In Stock' ? 'success' : 'warning'}>
                          {pharmacy.stockStatus}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-500 flex items-center justify-center sm:justify-start gap-1">
                        <MapPin size={12} />
                        {pharmacy.address} • {pharmacy.distance} away
                      </p>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-center sm:text-right">
                        <p className="text-2xl font-black text-slate-900">{pharmacy.price}</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase">Per Pack</p>
                      </div>
                      <button className="p-3 bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-all">
                        <ArrowRight size={20} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Savings Tip */}
            {result.genericAlternative && (
              <div className="bg-emerald-900 text-white rounded-3xl p-8 relative overflow-hidden shadow-xl">
                <div className="relative z-10 flex flex-col md:flex-row items-center gap-6">
                  <div className="w-16 h-16 bg-emerald-800 rounded-2xl flex items-center justify-center text-emerald-400 shrink-0">
                    <DollarSign size={32} />
                  </div>
                  <div className="flex-1 text-center md:text-left">
                    <h4 className="text-xl font-bold mb-1">Potential Savings: {result.genericAlternative.savings}</h4>
                    <p className="text-emerald-100/80 text-sm">
                      By switching to the generic version ({result.genericAlternative.name}) at {result.cheapestOption}, you could save significantly on your monthly prescription.
                    </p>
                  </div>
                  <button 
                    onClick={handleSwitchToGeneric}
                    className="px-6 py-3 bg-emerald-500 text-white rounded-xl font-bold hover:bg-emerald-400 transition-all whitespace-nowrap"
                  >
                    Switch to Generic
                  </button>
                </div>
                <TrendingDown className="absolute -bottom-8 -right-8 text-emerald-800/30 w-48 h-48" />
              </div>
            )}

            {/* Grounding Links */}
            {groundingLinks.length > 0 && (
              <div className="bg-slate-50 rounded-2xl p-6 border border-slate-200">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <Info size={14} />
                  Data Sources & References
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {groundingLinks.slice(0, 4).map((link, i) => (
                    <a 
                      key={i} 
                      href={link.uri} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 p-3 bg-white rounded-xl border border-slate-100 text-sm text-indigo-600 hover:text-indigo-700 hover:border-indigo-200 transition-all group"
                    >
                      <ExternalLink size={14} className="shrink-0" />
                      <span className="truncate flex-1">{link.title || link.uri}</span>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {!result && !isLoading && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12">
            {[
              { icon: <Scan />, title: "Scan Packaging", desc: "Use your camera to instantly identify any medication box." },
              { icon: <TrendingDown />, title: "Compare Prices", desc: "See real-time pricing across major pharmacy chains." },
              { icon: <Navigation />, title: "Check Stock", desc: "Verify availability before you leave your home." }
            ].map((item, i) => (
              <div key={i} className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm text-center">
                <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center mx-auto mb-4">
                  {item.icon}
                </div>
                <h4 className="font-bold text-slate-900 mb-2">{item.title}</h4>
                <p className="text-sm text-slate-500 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        )}
        {/* History Sidebar */}
        {showHistory && (
          <div className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-sm flex justify-end">
            <div className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-xl font-bold flex items-center gap-2">
                  <History className="text-indigo-600" />
                  Search History
                </h3>
                <button onClick={() => setShowHistory(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                  <X size={24} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {history.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center text-slate-400">
                    <History size={48} className="mb-4 opacity-20" />
                    <p>No search history yet</p>
                  </div>
                ) : (
                  history.map((item, i) => (
                    <button 
                      key={i} 
                      onClick={() => {
                        setResult(item);
                        setShowHistory(false);
                      }}
                      className="w-full text-left bg-slate-50 rounded-2xl p-4 border border-slate-100 hover:border-indigo-200 transition-all group"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <p className="font-bold text-sm group-hover:text-indigo-600 transition-colors">{item.medicationName}</p>
                        <ChevronRight size={16} className="text-slate-300 group-hover:text-indigo-400" />
                      </div>
                      <p className="text-xs text-slate-500">{item.dosage}</p>
                    </button>
                  ))
                )}
              </div>
              {history.length > 0 && (
                <div className="p-6 border-t border-slate-100">
                  <button 
                    onClick={() => setHistory([])}
                    className="w-full py-3 text-sm font-bold text-red-500 hover:bg-red-50 rounded-xl transition-colors"
                  >
                    Clear History
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Saved Prescriptions Sidebar */}
        {showSaved && (
          <div className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-sm flex justify-end">
            <div className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-xl font-bold flex items-center gap-2">
                  <CheckCircle2 className="text-rose-500" />
                  My Prescriptions
                </h3>
                <button onClick={() => setShowSaved(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                  <X size={24} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {savedPrescriptions.length > 0 && (
                  <button 
                    onClick={addAllToBasket}
                    className="w-full flex items-center justify-center gap-2 py-3 bg-indigo-50 text-indigo-600 rounded-xl font-bold hover:bg-indigo-100 transition-colors mb-2"
                  >
                    <PlusCircle size={18} />
                    Add All to Basket
                  </button>
                )}
                {savedPrescriptions.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center text-slate-400">
                    <CheckCircle2 size={48} className="mb-4 opacity-20" />
                    <p>No saved prescriptions</p>
                    <p className="text-xs mt-1">Save your recurring meds for quick access</p>
                  </div>
                ) : (
                  savedPrescriptions.map((item, i) => (
                    <div key={i} className="bg-slate-50 rounded-2xl p-4 border border-slate-100 flex items-center gap-4">
                      <button 
                        onClick={() => {
                          setResult(item);
                          setShowSaved(false);
                        }}
                        className="flex-1 text-left group"
                      >
                        <p className="font-bold text-sm group-hover:text-rose-600 transition-colors">{item.medicationName}</p>
                        <p className="text-xs text-slate-500">{item.dosage}</p>
                      </button>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => addToBasket(item)}
                          className="text-indigo-600 hover:bg-indigo-50 p-1.5 rounded-lg transition-colors"
                          title="Add to Basket"
                        >
                          <PlusCircle size={18} />
                        </button>
                        <button 
                          onClick={() => toggleSavePrescription(item)}
                          className="text-slate-300 hover:text-red-500 p-1.5 rounded-lg transition-colors"
                          title="Remove from Saved"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* Basket Sidebar/Overlay */}
        {showBasket && (
          <div className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-sm flex justify-end">
            <div className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-xl font-bold flex items-center gap-2">
                  {selectedPharmacyForCheckout ? (
                    <button 
                      onClick={() => setSelectedPharmacyForCheckout(null)}
                      className="p-1 hover:bg-slate-100 rounded-full transition-colors mr-1"
                    >
                      <X size={20} />
                    </button>
                  ) : (
                    <ShoppingCart className="text-indigo-600" />
                  )}
                  {selectedPharmacyForCheckout ? 'Checkout Summary' : 'Medication Basket'}
                </h3>
                <button onClick={() => setShowBasket(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                  <X size={24} />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {selectedPharmacyForCheckout ? (
                  <div className="space-y-6">
                    <div className="bg-indigo-50 p-4 rounded-2xl border border-indigo-100">
                      <p className="text-xs font-bold text-indigo-400 uppercase tracking-widest mb-1">Selected Pharmacy</p>
                      <p className="text-lg font-black text-indigo-900">{selectedPharmacyForCheckout}</p>
                    </div>
                    
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Items to Reserve</h4>
                        <button 
                          onClick={toggleSelectAll}
                          className="text-[10px] font-bold text-indigo-600 hover:underline"
                        >
                          {selectedItemsForCheckout.length === basket.length ? 'Deselect All' : 'Select All'}
                        </button>
                      </div>
                      {basket.map((med, i) => {
                        const pharmacyPrice = med.prices.find(p => p.pharmacyName === selectedPharmacyForCheckout);
                        const isSelected = selectedItemsForCheckout.includes(med.medicationName);
                        return (
                          <div 
                            key={i} 
                            onClick={() => toggleItemSelection(med.medicationName)}
                            className={cn(
                              "flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer",
                              isSelected ? "bg-white border-indigo-200 shadow-sm" : "bg-slate-50 border-slate-100 opacity-60"
                            )}
                          >
                            <div className="flex items-center gap-3">
                              <div className={cn(
                                "w-5 h-5 rounded border flex items-center justify-center transition-colors",
                                isSelected ? "bg-indigo-600 border-indigo-600" : "bg-white border-slate-200"
                              )}>
                                {isSelected && <CheckCircle2 size={14} className="text-white" />}
                              </div>
                              <div>
                                <p className="font-bold text-sm">{med.medicationName}</p>
                                <p className="text-[10px] text-slate-500">{med.dosage}</p>
                              </div>
                            </div>
                            <p className="font-black text-slate-900">{pharmacyPrice?.price || 'N/A'}</p>
                          </div>
                        );
                      })}
                    </div>

                    <div className="pt-4 border-t border-slate-100">
                      <div className="flex items-center justify-between mb-6">
                        <p className="text-slate-500 font-medium">Total Amount</p>
                        <p className="text-2xl font-black text-indigo-600">{calculateBasketTotal(selectedPharmacyForCheckout)}</p>
                      </div>
                      
                      <button 
                        onClick={() => {
                          if (selectedItemsForCheckout.length === 0) {
                            alert("Please select at least one item to reserve.");
                            return;
                          }
                          alert(`Reservation confirmed for ${selectedItemsForCheckout.length} items at ${selectedPharmacyForCheckout}! You will receive a notification when it's ready for collection.`);
                          const remainingItems = basket.filter(m => !selectedItemsForCheckout.includes(m.medicationName));
                          setBasket(remainingItems);
                          setSelectedPharmacyForCheckout(null);
                          if (remainingItems.length === 0) setShowBasket(false);
                        }}
                        className={cn(
                          "w-full py-4 rounded-2xl font-bold transition-all shadow-lg flex items-center justify-center gap-2",
                          selectedItemsForCheckout.length > 0 
                            ? "bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-100" 
                            : "bg-slate-200 text-slate-400 cursor-not-allowed shadow-none"
                        )}
                      >
                        <CheckCircle2 size={20} />
                        Confirm Reservation
                      </button>
                      <button 
                        onClick={() => setSelectedPharmacyForCheckout(null)}
                        className="w-full mt-3 py-3 text-sm font-bold text-slate-400 hover:text-slate-600 transition-colors"
                      >
                        Go Back to Basket
                      </button>
                    </div>
                  </div>
                ) : basket.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center text-slate-400">
                    <Package size={48} className="mb-4 opacity-20" />
                    <p>Your basket is empty</p>
                    <p className="text-xs mt-1">Add medications to compare total costs</p>
                  </div>
                ) : (
                  basket.map((med, i) => (
                    <div key={i} className="bg-slate-50 rounded-2xl p-4 border border-slate-100 flex items-center gap-4">
                      <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-lg flex items-center justify-center shrink-0">
                        <Package size={20} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm truncate">{med.medicationName}</p>
                        <p className="text-xs text-slate-500">{med.dosage}</p>
                      </div>
                      <button 
                        onClick={() => removeFromBasket(med.medicationName)}
                        className="text-slate-300 hover:text-red-500 transition-colors"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  ))
                )}
              </div>

              {!selectedPharmacyForCheckout && basket.length > 0 && (
                <div className="p-6 bg-slate-50 border-t border-slate-200 space-y-4">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Total Cost Comparison</h4>
                  <div className="space-y-2">
                    {getCommonPharmacies().map((pharmacy, i) => (
                      <button 
                        key={i} 
                        onClick={() => handlePharmacySelect(pharmacy)}
                        className="w-full flex items-center justify-between p-3 bg-white rounded-xl border border-slate-100 hover:border-indigo-300 hover:shadow-sm transition-all group"
                      >
                        <div className="flex items-center gap-2">
                          <Store size={16} className="text-slate-400 group-hover:text-indigo-500 transition-colors" />
                          <span className="text-sm font-medium">{pharmacy}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-black text-indigo-600">{calculateBasketTotal(pharmacy)}</span>
                          <ChevronRight size={16} className="text-slate-300 group-hover:text-indigo-400" />
                        </div>
                      </button>
                    ))}
                    {getCommonPharmacies().length === 0 && (
                      <p className="text-xs text-slate-500 italic">No single pharmacy has all items in stock. Try comparing individually.</p>
                    )}
                  </div>
                  <button 
                    onClick={() => setBasket([])}
                    className="w-full mt-2 py-2 text-xs font-bold text-slate-400 hover:text-red-500 transition-colors"
                  >
                    Clear All Items
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-12 mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-8">
            <div className="flex items-center gap-2 opacity-50 grayscale">
              <Scan size={20} />
              <span className="font-bold">MedPrice AI</span>
            </div>
            <div className="flex gap-8 text-sm text-slate-500">
              <a href="#" className="hover:text-slate-900">Pharmacy Partners</a>
              <a href="#" className="hover:text-slate-900">Data Sources</a>
              <a href="#" className="hover:text-slate-900">Privacy</a>
            </div>
            <p className="text-xs text-slate-400">
              © 2026 AdvanceHealth Hackathon. Real-time data via Gemini AI.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
