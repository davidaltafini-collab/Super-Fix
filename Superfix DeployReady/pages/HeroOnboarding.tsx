import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { RomaniaMap } from '../components/RomaniaMap';

const CLOUD_NAME = "dnsmgqllf";
const UPLOAD_PRESET = "superfix_upload";

// Limite fișiere
const MAX_VIDEO_SIZE_MB = 100;
const MAX_IMAGE_SIZE_MB = 10;

// Lista județe
const ALL_COUNTIES = [
  'AB', 'AR', 'AG', 'BC', 'BH', 'BN', 'BT', 'BV', 'BR', 'BZ', 'CS', 'CL', 
  'CJ', 'CT', 'CV', 'DB', 'DJ', 'GL', 'GR', 'GJ', 'HR', 'HD', 'IL', 'IS', 
  'IF', 'MM', 'MH', 'MS', 'NT', 'OT', 'PH', 'SM', 'SJ', 'SB', 'SV', 'TR', 
  'TM', 'TL', 'VS', 'VL', 'VN', 'B'
];

const COUNTY_NAMES: Record<string, string> = {
  'AB': 'Alba', 'AR': 'Arad', 'AG': 'Argeș', 'BC': 'Bacău', 'BH': 'Bihor',
  'BN': 'Bistrița-Năsăud', 'BT': 'Botoșani', 'BV': 'Brașov', 'BR': 'Brăila',
  'BZ': 'Buzău', 'CS': 'Caraș-Severin', 'CL': 'Călărași', 'CJ': 'Cluj',
  'CT': 'Constanța', 'CV': 'Covasna', 'DB': 'Dâmbovița', 'DJ': 'Dolj',
  'GL': 'Galați', 'GR': 'Giurgiu', 'GJ': 'Gorj', 'HR': 'Harghita',
  'HD': 'Hunedoara', 'IL': 'Ialomița', 'IS': 'Iași', 'IF': 'Ilfov',
  'MM': 'Maramureș', 'MH': 'Mehedinți', 'MS': 'Mureș', 'NT': 'Neamț',
  'OT': 'Olt', 'PH': 'Prahova', 'SM': 'Satu Mare', 'SJ': 'Sălaj',
  'SB': 'Sibiu', 'SV': 'Suceava', 'TR': 'Teleorman', 'TM': 'Timiș',
  'TL': 'Tulcea', 'VS': 'Vaslui', 'VL': 'Vâlcea', 'VN': 'Vrancea',
  'B': 'București'
};

const HeroOnboarding = () => {
  const [searchParams] = useSearchParams();
  const heroId = searchParams.get('id');

  const [formData, setFormData] = useState({
    alias: '',
    description: '',
    hourlyRate: 100,
    actionAreas: [] as string[],
    avatarUrl: '',
    videoUrl: ''
  });
  
  const [uploading, setUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);
  const [showCountyList, setShowCountyList] = useState(false);

  const handleFileUpload = async (file: File, field: 'avatarUrl' | 'videoUrl') => {
    const maxSizeMB = field === 'videoUrl' ? MAX_VIDEO_SIZE_MB : MAX_IMAGE_SIZE_MB;
    const fileSizeMB = file.size / (1024 * 1024);
    
    if (fileSizeMB > maxSizeMB) {
      const type = field === 'videoUrl' ? 'Clipul video' : 'Poza de profil';
      setErrorMsg(`${type} este prea mare (${fileSizeMB.toFixed(1)}MB). Limita este de ${maxSizeMB}MB. Te rugăm să încerci un fișier mai mic.`);
      return;
    }

    const data = new FormData();
    data.append('file', file);
    data.append('upload_preset', UPLOAD_PRESET);
    
    setUploading(true);
    setErrorMsg('');
    
    try {
      const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${field === 'videoUrl' ? 'video' : 'image'}/upload`, { 
        method: 'POST', 
        body: data 
      });
      const resData = await res.json();
      if(resData.secure_url) {
        setFormData(prev => ({ ...prev, [field]: resData.secure_url }));
        setErrorMsg(''); 
      } else {
        setErrorMsg("Am întâmpinat o problemă la încărcare. Te rugăm să încerci din nou.");
      }
    } catch(e) { 
      setErrorMsg("Eroare de conexiune la internet. Verifică rețeaua și încearcă din nou."); 
    }
    finally { setUploading(false); }
  };

  const toggleArea = (area: string) => {
    const current = formData.actionAreas;
    const newAreas = current.includes(area) ? current.filter(a => a !== area) : [...current, area];
    setFormData({ ...formData, actionAreas: newAreas });
  };

  const toggleAllRomania = () => {
    if (formData.actionAreas.length === ALL_COUNTIES.length) {
      setFormData({ ...formData, actionAreas: [] });
    } else {
      setFormData({ ...formData, actionAreas: ALL_COUNTIES });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!heroId) return;
    if (!formData.alias.trim()) {
        setErrorMsg("Orice Erou are nevoie de un nume! Alege-ți numele de Erou înainte de a continua.");
        return;
    }

    setUploading(true);
    setErrorMsg('');
    
    try {
      const res = await fetch('https://api.super-fix.ro/api/hero/public-submit-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ heroId, ...formData })
      });
      const data = await res.json();
      
      if (data.success) {
        setIsSuccess(true);
      } else {
        setErrorMsg(data.error || "A apărut o eroare la salvarea datelor. Te rugăm să verifici informațiile.");
      }
    } catch (err) { 
        setErrorMsg("A apărut o problemă de server. Te rugăm să dai un refresh paginii și să încerci din nou."); 
    }
    finally { setUploading(false); }
  };

  // === ECRAN LIPSĂ ID (Securitate) ===
  if (!heroId) {
      return (
          <div className="min-h-screen bg-black flex items-center justify-center p-4 font-sans relative overflow-hidden">
              <div className="absolute inset-0 bg-yellow-600 opacity-20" style={{ backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 20px, #000 20px, #000 40px)' }}></div>
              <div className="bg-white border-8 border-black p-8 md:p-12 max-w-xl text-center relative z-10 shadow-[16px_16px_0_0_rgba(255,200,0,1)]">
                  <div className="text-7xl mb-6">🛡️</div>
                  <h1 className="text-4xl md:text-5xl font-black text-black uppercase mb-4">Zona de Echipare</h1>
                  <p className="text-xl font-bold text-gray-800 mb-6">Această pagină este securizată și dedicată exclusiv Eroilor SuperFix aprobați.</p>
                  <p className="text-md text-gray-600 font-medium bg-gray-100 p-4 border-2 border-black inline-block">
                      Te rugăm să accesezi acest formular folosind link-ul oficial pe care l-ai primit pe email.
                  </p>
              </div>
          </div>
      );
  }

  // === ECRAN SUCCES ===
  if (isSuccess) {
      return (
          <div className="fixed inset-0 flex items-center justify-center bg-green-500 p-4 font-sans z-50 overflow-hidden">
              <div className="bg-white p-8 md:p-14 border-8 border-black shadow-[16px_16px_0_0_rgba(0,0,0,1)] text-center max-w-2xl animate-fade-in">
                  <div className="text-7xl mb-6">🌟</div>
                  <h1 className="text-4xl md:text-5xl font-black mb-4 uppercase tracking-tight">Misiune Îndeplinită!</h1>
                  <p className="text-xl font-bold mb-6 text-gray-800">
                      Felicitări! Profilul tău a fost trimis spre evaluare.
                  </p>
                  <p className="text-md text-gray-600 mb-8 border-t-2 border-gray-200 pt-6">
                      Echipa noastră va verifica informațiile în cel mai scurt timp. Imediat ce profilul va fi activat, te vei putea mândri cu numele tău: <span className="font-bold text-black">{formData.alias}</span>.
                  </p>
                  <button onClick={() => window.location.href = "https://super-fix.ro"} className="bg-black text-white font-black text-xl px-8 py-4 uppercase border-4 border-transparent hover:bg-white hover:text-black hover:border-black transition-all">
                      Întoarce-te pe Site
                  </button>
              </div>
          </div>
      );
  }

  return (
    <div className="min-h-screen bg-gray-100 py-10 px-4 md:px-6 font-sans relative">
      
      {/* 🚨 NOTIFICAREA FLOATING - REPARATĂ: Acum este centrată perfect 🚨 */}
      {errorMsg && (
        <div className="fixed bottom-8 left-0 right-0 flex justify-center px-4 z-50 pointer-events-none">
            <div className="bg-red-500 border-4 border-black p-4 shadow-[8px_8px_0_0_rgba(0,0,0,1)] flex items-center justify-between gap-4 max-w-lg w-full pointer-events-auto animate-bounce-short">
                <div className="flex gap-4 items-center">
                    <span className="text-4xl">⚠️</span>
                    <div>
                        <h4 className="font-black text-white uppercase text-lg mb-1">Atenție, Eroule!</h4>
                        <p className="font-bold text-white text-sm leading-tight">{errorMsg}</p>
                    </div>
                </div>
                <button onClick={() => setErrorMsg('')} className="bg-black text-white font-black text-xl px-3 py-1 border-2 border-black hover:bg-white hover:text-black transition-colors shrink-0">
                    X
                </button>
            </div>
        </div>
      )}

      <div className="max-w-4xl mx-auto bg-white border-4 border-black shadow-[12px_12px_0_0_rgba(0,0,0,1)] overflow-hidden">
        
        {/* HEADER */}
        <div className="bg-black text-white p-8 md:p-10 text-center border-b-4 border-black relative">
            <h1 className="font-black text-4xl md:text-5xl uppercase relative z-10">Echipare <span className="text-yellow-400">Profil</span></h1>
            <p className="mt-4 text-gray-300 relative z-10 font-bold text-lg">Acesta este primul pas către noile tale misiuni. Completează profilul cu atenție!</p>
        </div>

        {/* SECȚIUNE VIDEO TUTORIAL */}
        <div className="bg-yellow-400 border-b-4 border-black p-6 md:p-10">
            <div className="flex flex-col md:flex-row items-center justify-center gap-4 mb-6">
                <span className="text-4xl">🎬</span>
                <div className="text-center md:text-left">
                    <h2 className="font-black text-2xl uppercase text-black">Urmărește acest scurt ghid</h2>
                    <p className="text-black font-bold text-md mt-1">Un video scurt care îți explică exact cum să te prezinți excelent pe platformă.</p>
                </div>
            </div>
            
            {/* ALINIAT PERFECT LA CENTRU */}
            <div className="relative w-full max-w-sm mx-auto shadow-[8px_8px_0_0_rgba(0,0,0,1)] border-4 border-black bg-white" style={{ paddingBottom: '177.77%', height: 0, overflow: 'hidden' }}>
                <iframe 
                    className="absolute top-0 left-0 w-full h-full"
                    src="https://www.youtube.com/embed/qlgBAqtwgcI" 
                    title="Video Înrolare SuperFix" 
                    frameBorder="0" 
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                    allowFullScreen
                ></iframe>
            </div>
        </div>

        <div className="p-6 md:p-10">
            <form onSubmit={handleSubmit} className="space-y-10 md:space-y-12">
            
            {/* PASUL 1: NUMELE */}
            {/* REPARAT: Badge-urile "Pasul X" nu mai sunt "absolute" pentru a evita tăierea sau suprapunerea pe mobile */}
            <div className="bg-gray-50 border-4 border-black p-6 md:p-8 hover:bg-yellow-50 transition-colors">
                <span className="inline-block bg-black text-white px-3 py-1 font-black text-sm uppercase mb-4 shadow-[4px_4px_0_0_rgba(0,0,0,0.3)]">Pasul 1</span>
                <label className="font-black text-2xl block mb-2 uppercase">Numele tău de Erou</label>
                <p className="text-sm text-gray-600 mb-6 font-bold">Alege un nume profesionist și ușor de reținut. Acesta va fi văzut de toți clienții care îți cer ajutorul.</p>
                <input 
                    type="text" 
                    required 
                    placeholder="Ex: Expertul Electric, Instalator Rapid..."
                    className="w-full border-4 border-black p-4 text-xl font-bold focus:outline-none focus:bg-white transition-all placeholder:font-normal"
                    value={formData.alias} 
                    onChange={e => setFormData({...formData, alias: e.target.value})} 
                />
            </div>

            {/* PASUL 2: IDENTITATE VIZUALĂ */}
            <div className="bg-white border-4 border-black p-6 md:p-8">
                <span className="inline-block bg-black text-white px-3 py-1 font-black text-sm uppercase mb-4 shadow-[4px_4px_0_0_rgba(0,0,0,0.3)]">Pasul 2</span>
                <h3 className="font-black text-2xl block mb-2 uppercase">Identitate Vizuală</h3>
                <p className="text-sm text-gray-600 mb-6 font-bold">Oamenii au încredere în cineva pe care îl pot vedea. Adaugă o poză clară cu tine și un scurt video de prezentare.</p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
                    {/* POZĂ */}
                    <div 
                        className="border-4 border-dashed border-gray-400 bg-gray-50 p-6 text-center hover:border-black hover:bg-blue-50 transition-all cursor-pointer relative"
                        onClick={() => document.getElementById('avatar-input')?.click()}
                    >
                        {formData.avatarUrl && <span className="absolute top-3 right-3 text-2xl">✅</span>}
                        <label className="font-black text-lg block mb-4 uppercase text-black pointer-events-none">Poza de Profil</label>
                        <div className="w-32 h-32 border-4 border-black mx-auto mb-4 overflow-hidden bg-white rounded-full shadow-md pointer-events-none">
                            {formData.avatarUrl ? 
                                <img src={formData.avatarUrl} className="w-full h-full object-cover" alt="Avatar" /> : 
                                <div className="flex h-full items-center justify-center text-5xl opacity-30">👤</div>
                            }
                        </div>
                        <div className="text-sm font-bold text-gray-600 pointer-events-none">
                            {formData.avatarUrl ? 'Fotografie încărcată. Apasă pentru a schimba.' : 'Apasă aici pentru a încărca poza'}
                        </div>
                        <input 
                            id="avatar-input"
                            type="file" 
                            accept="image/*" 
                            onChange={e => e.target.files?.[0] && handleFileUpload(e.target.files[0], 'avatarUrl')} 
                            className="hidden"
                        />
                    </div>

                    {/* VIDEO */}
                    <div 
                        className="border-4 border-dashed border-gray-400 bg-gray-50 p-6 text-center hover:border-black hover:bg-red-50 transition-all cursor-pointer relative"
                        onClick={() => document.getElementById('video-input')?.click()}
                    >
                        {formData.videoUrl && <span className="absolute top-3 right-3 text-2xl">✅</span>}
                        <label className="font-black text-lg block mb-4 uppercase text-black pointer-events-none">Video Prezentare</label>
                        <div className="w-full h-32 border-4 border-black bg-gray-900 mb-4 flex flex-col items-center justify-center text-white p-2 shadow-md pointer-events-none">
                            {formData.videoUrl ? 
                                <><span className="text-lg font-bold text-green-400">✅ Video Salvat</span></> : 
                                <><span className="text-4xl mb-2">📹</span><span className="text-xs font-medium">Video scurt (Max {MAX_VIDEO_SIZE_MB}MB)</span></>
                            }
                        </div>
                        <div className="text-sm font-bold text-gray-600 pointer-events-none">
                            {formData.videoUrl ? 'Video încărcat. Apasă pentru a schimba.' : 'Apasă aici pentru a încărca video-ul'}
                        </div>
                        <input 
                            id="video-input"
                            type="file" 
                            accept="video/*" 
                            onChange={e => e.target.files?.[0] && handleFileUpload(e.target.files[0], 'videoUrl')} 
                            className="hidden"
                        />
                    </div>
                </div>
            </div>

            {/* PASUL 3: BIO SI PRET */}
            <div className="bg-white border-4 border-black p-6 md:p-8">
                <span className="inline-block bg-black text-white px-3 py-1 font-black text-sm uppercase mb-4 shadow-[4px_4px_0_0_rgba(0,0,0,0.3)]">Pasul 3</span>
                <label className="font-black text-2xl block mb-4 uppercase">Descriere și Tarif</label>
                <textarea 
                    rows={5} 
                    placeholder="Povestește-ne pe scurt despre tine. Ce experiență ai? Ce tip de lucrări faci cel mai des? Convinge clienții că ești alegerea potrivită!" 
                    className="w-full border-4 border-black p-4 font-bold mb-6 focus:outline-none focus:bg-yellow-50 transition-all resize-y placeholder:font-normal" 
                    value={formData.description} 
                    onChange={e => setFormData({...formData, description: e.target.value})} 
                    required 
                />
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 bg-gray-100 p-4 border-4 border-black w-full md:w-fit">
                    <span className="font-bold text-lg">Tarif de bază (orar):</span>
                    <div className="flex items-center">
                        <input 
                            type="number" 
                            className="border-b-4 border-black bg-transparent p-2 w-24 font-black text-3xl text-center focus:outline-none" 
                            value={formData.hourlyRate} 
                            onChange={e => setFormData({...formData, hourlyRate: parseInt(e.target.value)})} 
                        />
                        <span className="font-bold text-xl ml-2 text-gray-500">RON</span>
                    </div>
                </div>
            </div>

            {/* PASUL 4: HARTA */}
            <div className="bg-white border-4 border-black p-6 md:p-8">
                <span className="inline-block bg-black text-white px-3 py-1 font-black text-sm uppercase mb-4 shadow-[4px_4px_0_0_rgba(0,0,0,0.3)]">Pasul 4</span>
                <label className="font-black text-2xl block mb-2 uppercase">Zonele tale de acțiune</label>
                <p className="text-sm font-bold text-gray-600 mb-6">Selectează județele în care ești dispus să te deplasezi pentru misiuni.</p>
                
                <div className="mb-6 flex flex-col md:flex-row items-stretch md:items-center gap-3">
                    <button 
                        type="button"
                        onClick={toggleAllRomania}
                        className={`font-black px-6 py-3 text-sm uppercase border-4 transition-all ${
                            formData.actionAreas.length === ALL_COUNTIES.length 
                            ? 'bg-black border-black text-white' 
                            : 'bg-white border-black text-black hover:bg-gray-100'
                        }`}
                    >
                        {formData.actionAreas.length === ALL_COUNTIES.length ? '❌ Deselectează Toate' : '🇷🇴 Selectează Toată Țara'}
                    </button>
                    
                    <button 
                        type="button"
                        onClick={() => setShowCountyList(!showCountyList)}
                        className="bg-white text-black font-black px-6 py-3 text-sm uppercase border-4 border-black hover:bg-gray-100 transition-all"
                    >
                        {showCountyList ? '🗺️ Vizualizare Hartă' : '📋 Vizualizare Listă'}
                    </button>
                    
                    <div className="text-center md:text-left text-sm font-bold text-gray-600 px-4 py-2 border-2 border-transparent bg-gray-100">
                        Ai selectat <span className="text-black font-black">{formData.actionAreas.length}</span> din {ALL_COUNTIES.length} județe
                    </div>
                </div>

                {!showCountyList ? (
                    <div className="border-4 border-black bg-blue-50 p-4 flex justify-center mb-4 overflow-hidden">
                        {/* Harta este conținută corespunzător */}
                        <div className="max-w-full md:max-w-[500px] w-full">
                            <RomaniaMap value={formData.actionAreas} onToggle={toggleArea} />
                        </div>
                    </div>
                ) : (
                    <div className="border-4 border-black bg-gray-50 p-4 mb-4 max-h-[400px] overflow-y-auto">
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                            {ALL_COUNTIES.map(code => (
                                <label 
                                    key={code}
                                    className={`flex items-center gap-3 p-3 border-2 cursor-pointer transition-all ${
                                        formData.actionAreas.includes(code) 
                                            ? 'bg-black text-white border-black font-bold shadow-[2px_2px_0_0_rgba(0,0,0,0.3)]' 
                                            : 'bg-white text-black border-gray-300 hover:border-black'
                                    }`}
                                >
                                    <input 
                                        type="checkbox"
                                        checked={formData.actionAreas.includes(code)}
                                        onChange={() => toggleArea(code)}
                                        className="w-5 h-5 accent-black cursor-pointer"
                                    />
                                    <span className="text-sm font-bold uppercase tracking-wide">
                                        {code} <span className="text-xs font-normal opacity-80">({COUNTY_NAMES[code]})</span>
                                    </span>
                                </label>
                            ))}
                        </div>
                    </div>
                )}
                
                {formData.actionAreas.length === 0 && (
                    <div className="text-center bg-yellow-100 border-2 border-yellow-500 p-4 mt-4">
                        <span className="text-sm font-bold text-yellow-800">Este necesar să alegi cel puțin un județ pentru a putea primi misiuni.</span>
                    </div>
                )}
            </div>

            <button type="submit" disabled={uploading} className="w-full bg-red-600 text-white font-black text-2xl py-6 border-4 border-black shadow-[8px_8px_0_0_rgba(0,0,0,1)] hover:bg-red-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-wide mt-8">
                {uploading ? 'Se trimite profilul...' : 'Trimite Profilul spre Aprobare'}
            </button>

            </form>
        </div>
      </div>
    </div>
  );
};

export default HeroOnboarding;
