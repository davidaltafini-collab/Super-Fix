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
      const isVideo = field === 'videoUrl';
      setErrorMsg(`HOPA, HERCULE! 🏋️‍♂️ ${isVideo ? 'Clipul' : 'Poza'} e mai greu decât ciocanul lui Thor. Avem loc de maxim ${maxSizeMB}MB, iar tu ne dai ${fileSizeMB.toFixed(1)}MB. Mai taie din el!`);
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
        setErrorMsg("BRUIAJ PE LINIE! 📡 Satelitul nostru a pierdut fișierul pe drum. Mai încearcă o dată!");
      }
    } catch(e) { 
      setErrorMsg("FĂRĂ SEMNAL! 🔌 Ne-a picat conexiunea cu serverul. Verifică-ți netul și dă-i iar!"); 
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
        setErrorMsg("FĂRĂ NUME NU IEȘI PE TEREN! 🪪 Botează-te mai întâi! Alege-ți un nume de Erou.");
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
        setErrorMsg(data.error || "DOSAR RESPINS! ❌ Ceva n-a mers bine la înregistrare. Verifică datele.");
      }
    } catch (err) { 
        setErrorMsg("SISTEM ÎN AVARIE! 💥 A crăpat țeava la serverul principal. Dă un refresh și mai încearcă."); 
    }
    finally { setUploading(false); }
  };

  // === ECRAN LIPSĂ ID (Intrus) ===
  if (!heroId) {
      return (
          <div className="min-h-screen bg-black flex items-center justify-center p-4 font-sans relative overflow-hidden">
              <div className="absolute inset-0 bg-red-900 opacity-20" style={{ backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 20px, #000 20px, #000 40px)' }}></div>
              <div className="bg-red-600 border-8 border-white p-10 max-w-2xl text-center relative z-10 shadow-[20px_20px_0_0_rgba(255,255,255,1)] animate-pulse">
                  <div className="text-8xl mb-6">🛑</div>
                  <h1 className="text-5xl md:text-6xl font-black text-white uppercase italic mb-6">INTRUS DETECTAT!</h1>
                  <p className="text-2xl font-bold text-white mb-4">Zona asta e strict secretă și rezervată doar recruților SuperFix!</p>
                  <p className="text-lg text-red-200 font-bold bg-black p-4 inline-block border-2 border-white">
                      Folosește link-ul oficial primit pe email de la Cartierul General pentru a accesa formularul.
                  </p>
              </div>
          </div>
      );
  }

  // === ECRAN SUCCES ===
  if (isSuccess) {
      return (
          <div className="fixed inset-0 flex items-center justify-center bg-green-500 p-4 font-sans z-50 overflow-hidden">
              <div className="bg-white p-10 md:p-16 border-8 border-black shadow-[16px_16px_0_0_rgba(0,0,0,1)] text-center max-w-2xl animate-fade-in">
                  <div className="text-8xl mb-6">💥</div>
                  <h1 className="text-5xl md:text-6xl font-black mb-6 uppercase italic tracking-tight">DOSAR TRIMIS!</h1>
                  <p className="text-xl font-bold mb-6 text-gray-800">
                      Datele tale au ajuns pe biroul Comandamentului SuperFix!
                  </p>
                  <p className="text-md text-gray-600 mb-8 border-t-4 border-dashed border-black pt-6">
                      Băieții de la butoane îți analizează acum profilul. Când primești verde, <span className="font-black text-black text-lg bg-yellow-300 px-2">{formData.alias}</span> va deveni oficial public pe site!
                  </p>
                  <button onClick={() => window.location.href = "https://super-fix.ro"} className="bg-black text-white font-black text-xl px-8 py-4 uppercase border-4 border-transparent hover:bg-white hover:text-black hover:border-black transition-all">
                      ÎNAPOI LA BAZĂ
                  </button>
              </div>
          </div>
      );
  }

  return (
    <div className="min-h-screen bg-gray-100 py-12 px-2 md:px-4 font-sans relative">
      
      {/* 🚨 NOTIFICAREA FLOATING (TOAST) ÎN STIL BRUTALIST 🚨 */}
      {errorMsg && (
        <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 w-[90%] max-w-lg z-50 animate-bounce">
            <div className="bg-red-500 border-4 border-black p-4 shadow-[8px_8px_0_0_rgba(0,0,0,1)] flex items-start justify-between gap-4">
                <div className="flex gap-4 items-center">
                    <span className="text-5xl animate-pulse">🚨</span>
                    <div>
                        <h4 className="font-black text-white uppercase text-xl mb-1">Atenție, Recrut!</h4>
                        <p className="font-bold text-black text-sm leading-tight">{errorMsg}</p>
                    </div>
                </div>
                <button onClick={() => setErrorMsg('')} className="bg-black text-white font-black text-xl px-3 py-1 border-2 border-black hover:bg-white hover:text-black transition-colors">
                    X
                </button>
            </div>
        </div>
      )}

      <div className="max-w-4xl mx-auto bg-white border-4 border-black shadow-[12px_12px_0_0_rgba(0,0,0,1)] overflow-hidden">
        
        {/* HEADER */}
        <div className="bg-black text-white p-8 text-center border-b-4 border-black relative">
            <div className="absolute top-0 left-0 w-full h-full opacity-10" style={{ backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 10px, #fff 10px, #fff 20px)' }}></div>
            <h1 className="font-black text-4xl md:text-5xl italic uppercase relative z-10">ÎNROLARE <span className="text-red-500">DOSAR</span></h1>
            <p className="mt-2 text-gray-300 relative z-10 font-bold">Completează inteligent. De aici îți iei misiunile!</p>
        </div>

        {/* SECȚIUNE VIDEO TUTORIAL */}
        <div className="bg-yellow-400 border-b-4 border-black p-6 md:p-10">
            <div className="flex items-center justify-center gap-3 mb-6 bg-black text-white w-fit mx-auto px-6 py-2 border-2 border-black shadow-[4px_4px_0_0_rgba(255,255,255,1)]">
                <span className="text-2xl">🎬</span>
                <h2 className="font-black text-xl md:text-2xl uppercase">Briefing de Misiune</h2>
            </div>
            <p className="text-black font-black text-center mb-6 text-lg">
                Înainte să dai cu pixul, ascultă aici! Acest video te învață cum să-ți faci profilul ca un profesionist.
            </p>
            <div className="relative w-full max-w-sm mx-auto" style={{ paddingBottom: '177.77%', height: 0, overflow: 'hidden' }}>
                <iframe 
                    className="absolute top-0 left-0 w-full h-full border-4 border-black shadow-[8px_8px_0_0_rgba(0,0,0,1)] bg-white"
                    src="https://www.youtube.com/embed/qlgBAqtwgcI" 
                    title="Video Înrolare SuperFix" 
                    frameBorder="0" 
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                    allowFullScreen
                ></iframe>
            </div>
        </div>

        <div className="p-6 md:p-10">
            <form onSubmit={handleSubmit} className="space-y-12">
            
            {/* PASUL 1: NUMELE */}
            <div className="bg-gray-50 border-4 border-black p-6 relative hover:bg-yellow-50 transition-colors">
                <span className="absolute -top-4 left-4 bg-black text-white px-4 py-1 font-black text-sm uppercase shadow-[4px_4px_0_0_rgba(0,0,0,0.3)]">Pasul 1</span>
                <label className="font-black text-2xl block mb-2 uppercase">🦸 Nume de Cod</label>
                <p className="text-sm text-gray-600 mb-4 font-bold">Ia-ți un nume de luptător! Ceva curat și profi, care să le arate clienților că știi ce faci.</p>
                <input 
                    type="text" 
                    required 
                    placeholder="Ex: Electro Man, Țevar King..."
                    className="w-full border-4 border-black p-4 text-xl font-bold uppercase focus:outline-none focus:bg-yellow-100 transition-all placeholder:normal-case"
                    value={formData.alias} 
                    onChange={e => setFormData({...formData, alias: e.target.value})} 
                />
            </div>

            {/* PASUL 2: IDENTITATE VIZUALĂ */}
            <div className="bg-white border-4 border-black p-6 relative">
                <span className="absolute -top-4 left-4 bg-black text-white px-4 py-1 font-black text-sm uppercase shadow-[4px_4px_0_0_rgba(0,0,0,0.3)]">Pasul 2</span>
                <h3 className="font-black text-2xl block mb-2 uppercase">Identitate Vizuală</h3>
                <p className="text-sm text-gray-600 mb-6 font-bold">Fă clienții să aibă încredere în tine de la prima vedere!</p>
                
                <div className="grid md:grid-cols-2 gap-8">
                    {/* POZĂ */}
                    <div 
                        className="border-4 border-dashed border-black bg-blue-50 p-6 text-center hover:bg-blue-100 hover:-translate-y-1 transition-all cursor-pointer shadow-[4px_4px_0_0_rgba(0,0,0,1)] relative"
                        onClick={() => document.getElementById('avatar-input')?.click()}
                    >
                        {formData.avatarUrl && <span className="absolute top-2 right-2 text-2xl">✅</span>}
                        <label className="font-black text-lg block mb-4 uppercase text-black pointer-events-none">📸 Poza Ta</label>
                        <div className="w-32 h-32 border-4 border-black mx-auto mb-4 overflow-hidden bg-white rounded-full shadow-md pointer-events-none">
                            {formData.avatarUrl ? 
                                <img src={formData.avatarUrl} className="w-full h-full object-cover" alt="Avatar" /> : 
                                <div className="flex h-full items-center justify-center text-5xl opacity-50">👤</div>
                            }
                        </div>
                        <div className="text-sm font-black text-black pointer-events-none uppercase">
                            {formData.avatarUrl ? 'SCHIMBĂ POZA' : 'APASĂ AICI SĂ ÎNCARCI'}
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
                        className="border-4 border-dashed border-black bg-red-50 p-6 text-center hover:bg-red-100 hover:-translate-y-1 transition-all cursor-pointer shadow-[4px_4px_0_0_rgba(0,0,0,1)] relative"
                        onClick={() => document.getElementById('video-input')?.click()}
                    >
                        {formData.videoUrl && <span className="absolute top-2 right-2 text-2xl">✅</span>}
                        <label className="font-black text-lg block mb-4 uppercase text-black pointer-events-none">🎬 Video Prezentare</label>
                        <div className="w-full h-32 border-4 border-black bg-black mb-4 flex flex-col items-center justify-center text-white p-2 shadow-md pointer-events-none">
                            {formData.videoUrl ? 
                                <><span className="text-xl font-black text-green-400">FIȘIER RECEPȚIONAT</span></> : 
                                <><span className="text-4xl mb-2">📹</span><span className="text-xs font-bold uppercase tracking-widest">Max {MAX_VIDEO_SIZE_MB}MB</span></>
                            }
                        </div>
                        <div className="text-sm font-black text-black pointer-events-none uppercase">
                            {formData.videoUrl ? 'SCHIMBĂ VIDEO-UL' : 'APASĂ AICI SĂ ÎNCARCI'}
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
            <div className="bg-white border-4 border-black p-6 relative">
                <span className="absolute -top-4 left-4 bg-black text-white px-4 py-1 font-black text-sm uppercase shadow-[4px_4px_0_0_rgba(0,0,0,0.3)]">Pasul 3</span>
                <label className="font-black text-2xl block mb-4 uppercase">💪 Arsenal & Tarif</label>
                <textarea 
                    rows={4} 
                    placeholder="Ce probleme rezolvi? Scrie aici de ce ești tăticul lor în reparații..." 
                    className="w-full border-4 border-black p-4 font-bold mb-4 focus:outline-none focus:bg-yellow-50 transition-all resize-none" 
                    value={formData.description} 
                    onChange={e => setFormData({...formData, description: e.target.value})} 
                    required 
                />
                <div className="flex flex-wrap items-center gap-4 bg-gray-100 p-4 border-4 border-black w-fit">
                    <span className="font-black uppercase text-lg">💰 Tarif Orare:</span>
                    <div className="flex items-center">
                        <input 
                            type="number" 
                            className="border-b-4 border-black bg-transparent p-2 w-28 font-black text-3xl text-center focus:outline-none" 
                            value={formData.hourlyRate} 
                            onChange={e => setFormData({...formData, hourlyRate: parseInt(e.target.value)})} 
                        />
                        <span className="font-black text-2xl ml-2 text-gray-400">RON</span>
                    </div>
                </div>
            </div>

            {/* PASUL 4: HARTA */}
            <div className="bg-white border-4 border-black p-6 relative">
                <span className="absolute -top-4 left-4 bg-black text-white px-4 py-1 font-black text-sm uppercase shadow-[4px_4px_0_0_rgba(0,0,0,0.3)]">Pasul 4</span>
                <label className="font-black text-2xl block mb-2 uppercase">🗺️ Teritoriu</label>
                <p className="text-sm font-bold text-gray-600 mb-6">Unde operezi? Alege județele de mai jos.</p>
                
                <div className="mb-6 flex flex-wrap items-center gap-4">
                    <button 
                        type="button"
                        onClick={toggleAllRomania}
                        className={`font-black px-6 py-3 text-sm uppercase border-4 transition-all shadow-[4px_4px_0_0_rgba(0,0,0,1)] hover:-translate-y-1 hover:shadow-[6px_6px_0_0_rgba(0,0,0,1)] ${
                            formData.actionAreas.length === ALL_COUNTIES.length 
                            ? 'bg-red-500 border-black text-white' 
                            : 'bg-yellow-400 border-black text-black'
                        }`}
                    >
                        {formData.actionAreas.length === ALL_COUNTIES.length ? '❌ Deselectează Tot' : '🇷🇴 CUCEREȘTE TOATĂ ȚARA'}
                    </button>
                    
                    <button 
                        type="button"
                        onClick={() => setShowCountyList(!showCountyList)}
                        className="bg-white text-black font-black px-6 py-3 text-sm uppercase border-4 border-black shadow-[4px_4px_0_0_rgba(0,0,0,1)] hover:-translate-y-1 hover:shadow-[6px_6px_0_0_rgba(0,0,0,1)] transition-all"
                    >
                        {showCountyList ? '🗺️ TRECI LA HARTĂ' : '📋 ARATĂ LISTA CLASICĂ'}
                    </button>
                    
                    <span className="text-lg font-black text-black bg-gray-200 px-4 py-2 border-2 border-black">
                        {formData.actionAreas.length} / {ALL_COUNTIES.length} JUDEȚE
                    </span>
                </div>

                {!showCountyList ? (
                    <div className="border-4 border-black bg-blue-50 p-4 flex justify-center shadow-[inset_4px_4px_0_rgba(0,0,0,0.1)] mb-4 overflow-hidden">
                        <div className="max-w-[500px] w-full">
                            <RomaniaMap value={formData.actionAreas} onToggle={toggleArea} />
                        </div>
                    </div>
                ) : (
                    <div className="border-4 border-black bg-gray-50 p-4 mb-4 max-h-[400px] overflow-y-auto shadow-[inset_4px_4px_0_rgba(0,0,0,0.1)]">
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                            {ALL_COUNTIES.map(code => (
                                <label 
                                    key={code}
                                    className={`flex items-center gap-3 p-3 border-4 cursor-pointer transition-all ${
                                        formData.actionAreas.includes(code) 
                                            ? 'bg-black text-white border-black font-black shadow-[4px_4px_0_0_rgba(0,0,0,0.3)]' 
                                            : 'bg-white text-black border-gray-300 hover:border-black hover:bg-yellow-50'
                                    }`}
                                >
                                    <input 
                                        type="checkbox"
                                        checked={formData.actionAreas.includes(code)}
                                        onChange={() => toggleArea(code)}
                                        className="w-5 h-5 accent-black cursor-pointer"
                                    />
                                    <span className="text-sm font-bold uppercase tracking-wide">
                                        {code} <span className="text-xs opacity-70">({COUNTY_NAMES[code]})</span>
                                    </span>
                                </label>
                            ))}
                        </div>
                    </div>
                )}
                
                {formData.actionAreas.length === 0 && (
                    <div className="text-center bg-red-100 border-4 border-red-500 p-4 mt-4">
                        <span className="text-lg font-black text-red-700 uppercase">⚠️ Niciun Teritoriu Selectat! Alege măcar un județ!</span>
                    </div>
                )}
            </div>

            <button type="submit" disabled={uploading} className="w-full bg-red-600 text-white font-black text-2xl py-6 border-4 border-black shadow-[8px_8px_0_0_rgba(0,0,0,1)] hover:bg-red-700 hover:-translate-y-1 hover:shadow-[12px_12px_0_0_rgba(0,0,0,1)] transition-all disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-widest">
                {uploading ? '📡 SE TRANSMITE DOSARUL...' : '🚀 TRIMITE DOSARUL LA BAZĂ!'}
            </button>

            </form>
        </div>
      </div>
    </div>
  );
};

export default HeroOnboarding;
