import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { RomaniaMap } from '../components/RomaniaMap';

const CLOUD_NAME = "dnsmgqllf";
const UPLOAD_PRESET = "superfix_upload";

const HeroOnboarding = () => {
  const [searchParams] = useSearchParams();
  const heroId = searchParams.get('id');

  const [formData, setFormData] = useState({
    alias: '', // Numele de supererou
    description: '',
    hourlyRate: 100,
    actionAreas: [] as string[],
    avatarUrl: '',
    videoUrl: ''
  });
  
  const [uploading, setUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isSuccess, setIsSuccess] = useState(false); // <--- Controlăm ecranul de succes

  const handleFileUpload = async (file: File, field: 'avatarUrl' | 'videoUrl') => {
    const data = new FormData();
    data.append('file', file);
    data.append('upload_preset', UPLOAD_PRESET);
    setUploading(true);
    try {
      const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${field === 'videoUrl' ? 'video' : 'image'}/upload`, { 
        method: 'POST', 
        body: data 
      });
      const resData = await res.json();
      if(resData.secure_url) setFormData(prev => ({ ...prev, [field]: resData.secure_url }));
    } catch(e) { setErrorMsg("Eroare la încărcarea fișierului!"); }
    finally { setUploading(false); }
  };

  const toggleArea = (area: string) => {
    const current = formData.actionAreas;
    const newAreas = current.includes(area) ? current.filter(a => a !== area) : [...current, area];
    setFormData({ ...formData, actionAreas: newAreas });
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
        setIsSuccess(true); // Afișăm ecranul de SUCCES
      } else {
        // Aici prindem eroarea dacă numele e deja luat!
        setErrorMsg(data.error || "Eroare la trimiterea datelor.");
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } catch (err) { 
        setErrorMsg("Eroare de conexiune la server. Încearcă din nou."); 
    }
    finally { setUploading(false); }
  };

  // === ECRANUL DE SUCCES (Apare în locul formularului) ===
  if (isSuccess) {
      return (
          <div className="min-h-screen flex items-center justify-center bg-green-500 p-4 font-sans">
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
        
        {/* HEADER & VIDEO */}
        <div className="bg-black text-white p-8 text-center border-b-4 border-black relative">
            <div className="absolute top-0 left-0 w-full h-full opacity-10" style={{ backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 10px, #fff 10px, #fff 20px)' }}></div>
            <h1 className="font-black text-4xl md:text-5xl italic uppercase relative z-10">INFORMAȚII <span className="text-red-500">DOSAR</span></h1>
            <p className="mt-2 text-gray-300 relative z-10">Completează profilul pentru a putea prelua misiuni.</p>
        </div>

        <div className="p-6 md:p-10">
            {errorMsg && (
                <div className="bg-red-100 border-l-8 border-red-600 p-4 mb-8 flex items-center gap-4 animate-pulse">
                    <span className="text-3xl">⚠️</span>
                    <p className="font-bold text-red-800 text-lg">{errorMsg}</p>
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-12">
            
            {/* SECTIUNEA 1: NUMELE DE EROU (NOUĂ) */}
            <div className="bg-yellow-50 border-4 border-black p-6 relative">
                <span className="absolute -top-4 left-4 bg-black text-white px-3 py-1 font-black text-sm uppercase">Pasul 1</span>
                <label className="font-black text-2xl block mb-2 uppercase">Alege-ți Numele de Erou</label>
                <p className="text-sm text-gray-600 mb-4 font-bold">Acesta va fi numele tău oficial pe site. Fii creativ, dar profesionist! (ex: Super Gigel, Instalatorul VIP)</p>
                <input 
                    type="text" 
                    required 
                    placeholder="Ex: Electro Man..."
                    className="w-full border-4 border-black p-4 text-xl font-bold uppercase focus:outline-none focus:ring-4 focus:ring-yellow-400 transition-all"
                    value={formData.alias} 
                    onChange={e => setFormData({...formData, alias: e.target.value})} 
                />
            </div>

            {/* SECTIUNEA 2: UPLOAD */}
            <div className="bg-white border-4 border-black p-6 relative">
                <span className="absolute -top-4 left-4 bg-black text-white px-3 py-1 font-black text-sm uppercase">Pasul 2</span>
                <h3 className="font-black text-2xl block mb-6 uppercase">Identitate Vizuală</h3>
                <div className="grid md:grid-cols-2 gap-8">
                    {/* POZĂ */}
                    <div className="border-2 border-dashed border-gray-400 p-6 text-center hover:border-black transition-colors">
                        <label className="font-black text-lg block mb-4 uppercase text-blue-600">Poza de Profil</label>
                        <div className="w-32 h-32 border-4 border-black mx-auto mb-4 overflow-hidden bg-gray-200 rounded-full shadow-md">
                            {formData.avatarUrl ? <img src={formData.avatarUrl} className="w-full h-full object-cover" /> : <div className="flex h-full items-center justify-center text-5xl">👤</div>}
                        </div>
                        <input type="file" accept="image/*" onChange={e => e.target.files?.[0] && handleFileUpload(e.target.files[0], 'avatarUrl')} className="w-full text-xs font-bold" />
                    </div>

                    {/* VIDEO */}
                    <div className="border-2 border-dashed border-gray-400 p-6 text-center hover:border-black transition-colors">
                        <label className="font-black text-lg block mb-4 uppercase text-red-600">Video Prezentare</label>
                        <div className="w-full h-32 border-4 border-black bg-black mb-4 flex flex-col items-center justify-center text-white p-2 shadow-md">
                            {formData.videoUrl ? <span className="text-xl font-bold text-green-400">✅ ÎNCĂRCAT</span> : <><span className="text-3xl mb-2">🎬</span><span className="text-xs">Scurt video cu tine (max 50MB)</span></>}
                        </div>
                        <input type="file" accept="video/*" onChange={e => e.target.files?.[0] && handleFileUpload(e.target.files[0], 'videoUrl')} className="w-full text-xs font-bold" />
                    </div>
                </div>
            </div>

            {/* SECTIUNEA 3: DESCRIERE SI PRET */}
            <div className="bg-white border-4 border-black p-6 relative">
                <span className="absolute -top-4 left-4 bg-black text-white px-3 py-1 font-black text-sm uppercase">Pasul 3</span>
                <label className="font-black text-2xl block mb-4 uppercase">Descriere și Tarif</label>
                <textarea rows={4} placeholder="Cine ești și ce știi să faci? Convinge clienții..." className="w-full border-4 border-black p-4 font-bold mb-4 focus:outline-none focus:ring-4 focus:ring-blue-400 transition-all" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} required />
                <div className="flex items-center gap-4 bg-gray-100 p-4 border-4 border-black w-fit">
                    <span className="font-black uppercase">Tarif (RON/oră):</span>
                    <input type="number" className="border-b-4 border-black bg-transparent p-2 w-24 font-black text-2xl text-center focus:outline-none" value={formData.hourlyRate} onChange={e => setFormData({...formData, hourlyRate: parseInt(e.target.value)})} />
                </div>
            </div>

            {/* SECTIUNEA 4: HARTA */}
            <div className="bg-white border-4 border-black p-6 relative">
                <span className="absolute -top-4 left-4 bg-black text-white px-3 py-1 font-black text-sm uppercase">Pasul 4</span>
                <label className="font-black text-2xl block mb-2 uppercase">Zone de Acțiune</label>
                <p className="text-sm font-bold text-gray-600 mb-6">Selectează de pe hartă județele în care ești dispus să te deplasezi.</p>
                <div className="border-4 border-black bg-blue-50 p-4 flex justify-center shadow-inner mb-4">
                <div className="max-w-[500px] w-full">
                    <RomaniaMap value={formData.actionAreas} onToggle={toggleArea} />
                </div>
                </div>
                <div className="flex flex-wrap gap-2">
                    {formData.actionAreas.length === 0 && <span className="text-xs font-bold text-red-500">Niciun județ selectat!</span>}
                    {formData.actionAreas.map(a => <span key={a} className="bg-black text-white px-3 py-1 text-xs font-black uppercase shadow-sm">{a}</span>)}
                </div>
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