import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { RomaniaMap } from '../components/RomaniaMap';

const CLOUD_NAME = "dnsmgqllf";
const UPLOAD_PRESET = "superfix_upload";

// ✅ Limită mărită pentru video-uri (Cloudinary Free: 100MB)
const MAX_VIDEO_SIZE_MB = 100;

// ✅ Lista completă cu toate județele din România
const ALL_COUNTIES = [
  'AB', 'AR', 'AG', 'BC', 'BH', 'BN', 'BT', 'BV', 'BR', 'BZ', 'CS', 'CL', 
  'CJ', 'CT', 'CV', 'DB', 'DJ', 'GL', 'GR', 'GJ', 'HR', 'HD', 'IL', 'IS', 
  'IF', 'MM', 'MH', 'MS', 'NT', 'OT', 'PH', 'SM', 'SJ', 'SB', 'SV', 'TR', 
  'TM', 'TL', 'VS', 'VL', 'VN', 'B'
];

// ✅ Numele complete ale județelor pentru listă
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
  const [showCountyList, setShowCountyList] = useState(false); // ✅ Toggle pentru listă

  const handleFileUpload = async (file: File, field: 'avatarUrl' | 'videoUrl') => {
    // ✅ Validare dimensiune
    const maxSizeMB = field === 'videoUrl' ? MAX_VIDEO_SIZE_MB : 10; // 10MB pentru poze, 100MB pentru video
    const fileSizeMB = file.size / (1024 * 1024);
    
    if (fileSizeMB > maxSizeMB) {
      const fileType = field === 'videoUrl' ? 'video-ul' : 'poza';
      setErrorMsg(`🚫 ${fileType.charAt(0).toUpperCase() + fileType.slice(1)} e prea mare! Limită: ${maxSizeMB}MB. Tu ai încărcat ${fileSizeMB.toFixed(1)}MB. Comprimă fișierul și încearcă din nou.`);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    const data = new FormData();
    data.append('file', file);
    data.append('upload_preset', UPLOAD_PRESET);
    
    setUploading(true);
    setErrorMsg(''); // Clear previous errors
    
    try {
      const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${field === 'videoUrl' ? 'video' : 'image'}/upload`, { 
        method: 'POST', 
        body: data 
      });
      const resData = await res.json();
      if(resData.secure_url) {
        setFormData(prev => ({ ...prev, [field]: resData.secure_url }));
        setErrorMsg(''); // ✅ Clear error on success
      } else {
        setErrorMsg("❌ Eroare la încărcarea fișierului. Încearcă din nou!");
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } catch(e) { 
      setErrorMsg("❌ Eroare la conexiunea cu serverul de upload. Verifică internetul și încearcă din nou!"); 
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    finally { setUploading(false); }
  };

  const toggleArea = (area: string) => {
    const current = formData.actionAreas;
    const newAreas = current.includes(area) ? current.filter(a => a !== area) : [...current, area];
    setFormData({ ...formData, actionAreas: newAreas });
  };

  // ✅ FUNCȚIE NOUĂ: Selectează/Deselectează toată România
  const toggleAllRomania = () => {
    if (formData.actionAreas.length === ALL_COUNTIES.length) {
      // Dacă toate sunt selectate, le deselectăm
      setFormData({ ...formData, actionAreas: [] });
    } else {
      // Altfel, le selectăm pe toate
      setFormData({ ...formData, actionAreas: ALL_COUNTIES });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!heroId) return;
    if (!formData.alias.trim()) {
        setErrorMsg("Te rugăm să îți alegi un nume de erou!");
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
        setErrorMsg(data.error || "Eroare la trimiterea datelor.");
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } catch (err) { 
        setErrorMsg("Eroare de conexiune la server. Încearcă din nou."); 
    }
    finally { setUploading(false); }
  };

  // === ECRANUL DE SUCCES (Fullscreen Fix) ===
  if (isSuccess) {
      return (
          <div className="fixed inset-0 flex items-center justify-center bg-green-500 p-4 font-sans z-50 overflow-hidden">
              <div className="bg-white p-10 md:p-16 border-8 border-black shadow-[16px_16px_0_0_rgba(0,0,0,1)] text-center max-w-2xl animate-fade-in">
                  <div className="text-8xl mb-6">💥</div>
                  <h1 className="text-5xl md:text-6xl font-black mb-6 uppercase italic tracking-tight">MISIUNE ÎNDEPLINITĂ!</h1>
                  <p className="text-xl font-bold mb-6 text-gray-800">
                      Datele tale au fost transmise cu succes către Cartierul General SuperFix!
                  </p>
                  <p className="text-md text-gray-600 mb-8 border-t-2 border-dashed border-gray-300 pt-6">
                      Administratorii noștri îți vor analiza dosarul. Odată aprobat, numele tău de erou (<span className="font-bold text-black">{formData.alias}</span>) și profilul tău vor deveni publice pe site.
                  </p>
                  <button onClick={() => window.location.href = "https://super-fix.ro"} className="bg-black text-white font-black text-xl px-8 py-4 uppercase border-4 border-transparent hover:bg-white hover:text-black hover:border-black transition-all">
                      Întoarce-te pe Site
                  </button>
              </div>
          </div>
      );
  }

  if (!heroId) return <div className="p-20 text-center font-black text-2xl">⚠️ ACCES NEAUTORIZAT. Folosește link-ul din email!</div>;

  return (
    <div className="min-h-screen bg-gray-100 py-12 px-2 md:px-4 font-sans">
      <div className="max-w-4xl mx-auto bg-white border-4 border-black shadow-[12px_12px_0_0_rgba(0,0,0,1)] overflow-hidden">
        
        {/* HEADER */}
        <div className="bg-black text-white p-8 text-center border-b-4 border-black relative">
            <div className="absolute top-0 left-0 w-full h-full opacity-10" style={{ backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 10px, #fff 10px, #fff 20px)' }}></div>
            <h1 className="font-black text-4xl md:text-5xl italic uppercase relative z-10">INFORMAȚII <span className="text-red-500">DOSAR</span></h1>
            <p className="mt-2 text-gray-300 relative z-10">Completează profilul pentru a putea prelua misiuni.</p>
        </div>

        {/* ✅ SECȚIUNE NOUĂ: VIDEO TUTORIAL ÎNROLARE */}
        <div className="bg-gradient-to-r from-yellow-50 to-orange-50 border-b-4 border-black p-6 md:p-10">
            <div className="flex items-center gap-3 mb-4">
                <span className="text-4xl">🎬</span>
                <h2 className="font-black text-2xl md:text-3xl uppercase">Briefing de Misiune</h2>
            </div>
            <p className="text-gray-700 font-bold mb-4">
                Hei, recrut! Înainte să completezi dosarul, bagă un ochi pe acest video. E scurt, te învață ce trebuie să știi ca să fii un SuperFix de top:
            </p>
            <div className="relative" style={{ paddingBottom: '56.25%', height: 0, overflow: 'hidden' }}>
                <iframe 
                    className="absolute top-0 left-0 w-full h-full border-4 border-black shadow-lg"
                    src="https://www.youtube.com/embed/qlgBAqtwgcI" 
                    title="Video Înrolare SuperFix" 
                    frameBorder="0" 
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                    allowFullScreen
                ></iframe>
            </div>
            <p className="text-sm text-gray-600 mt-4 font-bold">
                ⚡ L-ai văzut? Perfect! Acum hai să completăm formularul de mai jos și să te băgăm în Liga SuperFix.
            </p>
        </div>

        <div className="p-6 md:p-10">
            {errorMsg && (
                <div className="bg-red-100 border-l-8 border-red-600 p-4 mb-8 flex items-center gap-4 animate-pulse">
                    <span className="text-3xl">⚠️</span>
                    <p className="font-bold text-red-800 text-lg">{errorMsg}</p>
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-12">
            
            {/* SECTIUNEA 1: NUMELE DE EROU */}
            <div className="bg-yellow-50 border-4 border-black p-6 relative">
                <span className="absolute -top-4 left-4 bg-black text-white px-3 py-1 font-black text-sm uppercase">Pasul 1</span>
                <label className="font-black text-2xl block mb-2 uppercase">🦸 Numele Tău de Erou</label>
                <p className="text-sm text-gray-600 mb-4 font-bold">Ia-ți un nume de luptător! Ceva catchy, profesionist, dar care sună bine. (ex: Instalatorul Rapid, Super Gigel, ElectroĂla Bun)</p>
                <input 
                    type="text" 
                    required 
                    placeholder="Ex: Electro Man, Țevar King..."
                    className="w-full border-4 border-black p-4 text-xl font-bold uppercase focus:outline-none focus:ring-4 focus:ring-yellow-400 transition-all"
                    value={formData.alias} 
                    onChange={e => setFormData({...formData, alias: e.target.value})} 
                />
            </div>

            {/* SECTIUNEA 2: UPLOAD */}
            <div className="bg-white border-4 border-black p-6 relative">
                <span className="absolute -top-4 left-4 bg-black text-white px-3 py-1 font-black text-sm uppercase">Pasul 2</span>
                <h3 className="font-black text-2xl block mb-2 uppercase">Identitate Vizuală</h3>
                <p className="text-sm text-gray-600 mb-6 font-bold">Arată-ne cine ești! Încarcă o poză și un scurt video de prezentare.</p>
                
                <div className="grid md:grid-cols-2 gap-8">
                    {/* POZĂ - CLICK PE TOATĂ ZONA */}
                    <div 
                        className="border-4 border-dashed border-gray-400 p-6 text-center hover:border-black hover:bg-gray-50 transition-all cursor-pointer"
                        onClick={() => document.getElementById('avatar-input')?.click()}
                    >
                        <label className="font-black text-lg block mb-4 uppercase text-blue-600 pointer-events-none">📸 Poza de Profil</label>
                        <div className="w-32 h-32 border-4 border-black mx-auto mb-4 overflow-hidden bg-gray-200 rounded-full shadow-md pointer-events-none">
                            {formData.avatarUrl ? 
                                <img src={formData.avatarUrl} className="w-full h-full object-cover" alt="Avatar" /> : 
                                <div className="flex h-full items-center justify-center text-5xl">👤</div>
                            }
                        </div>
                        <div className="text-sm font-bold text-gray-500 pointer-events-none">
                            {formData.avatarUrl ? '✅ Încărcat! Click pentru a schimba' : 'Click oriunde aici pentru a încărca'}
                        </div>
                        <input 
                            id="avatar-input"
                            type="file" 
                            accept="image/*" 
                            onChange={e => e.target.files?.[0] && handleFileUpload(e.target.files[0], 'avatarUrl')} 
                            className="hidden"
                        />
                    </div>

                    {/* VIDEO - CLICK PE TOATĂ ZONA */}
                    <div 
                        className="border-4 border-dashed border-gray-400 p-6 text-center hover:border-black hover:bg-gray-50 transition-all cursor-pointer"
                        onClick={() => document.getElementById('video-input')?.click()}
                    >
                        <label className="font-black text-lg block mb-4 uppercase text-red-600 pointer-events-none">🎬 Video Prezentare</label>
                        <div className="w-full h-32 border-4 border-black bg-black mb-4 flex flex-col items-center justify-center text-white p-2 shadow-md pointer-events-none">
                            {formData.videoUrl ? 
                                <><span className="text-xl font-bold text-green-400">✅ VIDEO ÎNCĂRCAT</span><span className="text-xs mt-1">Click pentru a schimba</span></> : 
                                <><span className="text-3xl mb-2">🎬</span><span className="text-xs">Scurt video cu tine<br/>(Max {MAX_VIDEO_SIZE_MB}MB)</span></>
                            }
                        </div>
                        <div className="text-sm font-bold text-gray-500 pointer-events-none">
                            {formData.videoUrl ? '✅ Încărcat! Click pentru a schimba' : 'Click oriunde aici pentru a încărca'}
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

            {/* SECTIUNEA 3: DESCRIERE SI PRET */}
            <div className="bg-white border-4 border-black p-6 relative">
                <span className="absolute -top-4 left-4 bg-black text-white px-3 py-1 font-black text-sm uppercase">Pasul 3</span>
                <label className="font-black text-2xl block mb-4 uppercase">💪 Bio & Tarif</label>
                <textarea 
                    rows={4} 
                    placeholder="Prezintă-te scurt: ce știi să faci, de ce ești cel mai bun, ce probleme rezolvi... Convinge clienții că tu ești alegerea potrivită!" 
                    className="w-full border-4 border-black p-4 font-bold mb-4 focus:outline-none focus:ring-4 focus:ring-blue-400 transition-all" 
                    value={formData.description} 
                    onChange={e => setFormData({...formData, description: e.target.value})} 
                    required 
                />
                <div className="flex items-center gap-4 bg-gray-100 p-4 border-4 border-black w-fit">
                    <span className="font-black uppercase">💰 Tarif (RON/oră):</span>
                    <input 
                        type="number" 
                        className="border-b-4 border-black bg-transparent p-2 w-24 font-black text-2xl text-center focus:outline-none" 
                        value={formData.hourlyRate} 
                        onChange={e => setFormData({...formData, hourlyRate: parseInt(e.target.value)})} 
                    />
                </div>
                <p className="text-xs text-gray-500 mt-2 font-bold">Pune un preț competitiv, dar care te valorifică!</p>
            </div>

            {/* ✅ SECTIUNEA 4: HARTA CU BUTON "SELECTEAZĂ TOATĂ ROMÂNIA" */}
            <div className="bg-white border-4 border-black p-6 relative">
                <span className="absolute -top-4 left-4 bg-black text-white px-3 py-1 font-black text-sm uppercase">Pasul 4</span>
                <label className="font-black text-2xl block mb-2 uppercase">Zone de Acțiune</label>
                <p className="text-sm font-bold text-gray-600 mb-4">Selectează județele în care intervii sau alege toată țara.</p>
                
                {/* ✅ BUTOANE DE CONTROL */}
                <div className="mb-4 flex flex-wrap items-center gap-3">
                    <button 
                        type="button"
                        onClick={toggleAllRomania}
                        className="bg-gray-100 text-gray-700 font-bold px-4 py-2 text-sm uppercase border-2 border-gray-400 hover:border-black hover:bg-gray-200 transition-all"
                    >
                        {formData.actionAreas.length === ALL_COUNTIES.length ? '❌ Deselectează' : '🇷🇴 Toată România'}
                    </button>
                    
                    <button 
                        type="button"
                        onClick={() => setShowCountyList(!showCountyList)}
                        className="bg-gray-100 text-gray-700 font-bold px-4 py-2 text-sm uppercase border-2 border-gray-400 hover:border-black hover:bg-gray-200 transition-all"
                    >
                        {showCountyList ? '🗺️ Arată Harta' : '📋 Arată Lista'}
                    </button>
                    
                    <span className="text-sm font-bold text-gray-500">
                        {formData.actionAreas.length}/{ALL_COUNTIES.length} județe
                    </span>
                </div>

                {/* ✅ HARTĂ SAU LISTĂ (TOGGLE) */}
                {!showCountyList ? (
                    // HARTĂ
                    <div className="border-4 border-black bg-blue-50 p-4 flex justify-center shadow-inner mb-4">
                        <div className="max-w-[500px] w-full">
                            <RomaniaMap value={formData.actionAreas} onToggle={toggleArea} />
                        </div>
                    </div>
                ) : (
                    // LISTĂ CU CHECKBOXURI
                    <div className="border-4 border-black bg-gray-50 p-4 mb-4 max-h-[400px] overflow-y-auto">
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                            {ALL_COUNTIES.map(code => (
                                <label 
                                    key={code}
                                    className={`flex items-center gap-2 p-3 border-2 cursor-pointer transition-all ${
                                        formData.actionAreas.includes(code) 
                                            ? 'bg-black text-white border-black font-black' 
                                            : 'bg-white text-black border-gray-300 hover:border-black'
                                    }`}
                                >
                                    <input 
                                        type="checkbox"
                                        checked={formData.actionAreas.includes(code)}
                                        onChange={() => toggleArea(code)}
                                        className="w-4 h-4"
                                    />
                                    <span className="text-sm font-bold">
                                        {code} - {COUNTY_NAMES[code]}
                                    </span>
                                </label>
                            ))}
                        </div>
                    </div>
                )}
                
                {/* ✅ DISPLAY SELECTAT */}
                {formData.actionAreas.length === 0 && (
                    <div className="text-center">
                        <span className="text-sm font-bold text-red-500">⚠️ Niciun județ selectat!</span>
                    </div>
                )}
                
                {formData.actionAreas.length > 0 && formData.actionAreas.length < ALL_COUNTIES.length && (
                    <div className="flex flex-wrap gap-2">
                        {formData.actionAreas.map(a => (
                            <span key={a} className="bg-black text-white px-3 py-1 text-xs font-black uppercase shadow-sm">
                                {a}
                            </span>
                        ))}
                    </div>
                )}
                
                {formData.actionAreas.length === ALL_COUNTIES.length && (
                    <div className="text-center bg-green-100 border-2 border-green-600 p-3 rounded">
                        <span className="text-sm font-black text-green-700 uppercase">✅ Toată România Selectată</span>
                    </div>
                )}
            </div>

            <button type="submit" disabled={uploading} className="w-full bg-red-600 text-white font-black text-2xl py-6 border-4 border-black shadow-[8px_8px_0_0_rgba(0,0,0,1)] hover:bg-red-700 hover:translate-y-1 hover:shadow-[4px_4px_0_0_rgba(0,0,0,1)] transition-all disabled:opacity-50 disabled:cursor-not-allowed uppercase">
                {uploading ? 'SE ÎNCARCĂ DOSARUL...' : 'TRIMITE SPRE APROBARE!'}
            </button>

            </form>
        </div>
      </div>
    </div>
  );
};

export default HeroOnboarding;


