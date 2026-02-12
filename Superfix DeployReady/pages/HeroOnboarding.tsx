import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { RomaniaMap } from '../components/RomaniaMap';

const CLOUD_NAME = "dnsmgqllf";
const UPLOAD_PRESET = "superfix_upload";

const HeroOnboarding = () => {
  const [searchParams] = useSearchParams();
  const heroId = searchParams.get('id');
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    description: '',
    hourlyRate: 100,
    actionAreas: [] as string[],
    avatarUrl: '',
    videoUrl: ''
  });
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');

  // Logica de upload Cloudinary (identică cu cea din Admin)
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
    } catch(e) { alert("Eroare la încărcare!"); }
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
    setUploading(true);
    try {
      const res = await fetch('https://api.super-fix.ro/api/hero/public-submit-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ heroId, ...formData })
      });
      const data = await res.json();
      if (data.success) {
        setMessage("✅ DATE TRIMISE! ADMIN-UL VA ACTIVA PROFILUL TĂU.");
        setTimeout(() => window.location.href = "https://super-fix.ro", 3000);
      }
    } catch (err) { setMessage("❌ EROARE CONEXIUNE."); }
    finally { setUploading(false); }
  };

  if (!heroId) return <div className="p-20 text-center font-black">ACCES NEAUTORIZAT</div>;

  return (
    <div className="min-h-screen bg-gray-100 py-12 px-4 font-sans">
      <div className="max-w-4xl mx-auto bg-white border-4 border-black p-6 md:p-10 shadow-[12px_12px_0_0_rgba(0,0,0,1)]">
        
        {/* HEADER & VIDEO */}
        <div className="text-center mb-10">
          <h1 className="font-heading text-4xl md:text-5xl italic uppercase mb-6">Instrucțiuni <span className="text-red-600">Erou</span></h1>
          <div className="border-4 border-black bg-black shadow-comic overflow-hidden aspect-video mb-8">
            <iframe width="100%" height="100%" src="https://www.youtube.com/embed/PUNE_ID_VIDEO_AICI" title="Video Inrolare" frameBorder="0" allowFullScreen></iframe>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-10">
          
          {/* UPLOAD SECTIUNE */}
          <div className="grid md:grid-cols-2 gap-8">
            <div className="border-4 border-black p-4 bg-yellow-50">
              <label className="font-heading text-lg block mb-2 text-center uppercase">Poza Profil</label>
              <div className="w-32 h-32 border-4 border-black mx-auto mb-4 overflow-hidden bg-gray-200">
                {formData.avatarUrl ? <img src={formData.avatarUrl} className="w-full h-full object-cover" /> : <div className="flex h-full items-center justify-center text-4xl">👤</div>}
              </div>
              <input type="file" accept="image/*" onChange={e => e.target.files?.[0] && handleFileUpload(e.target.files[0], 'avatarUrl')} className="w-full text-xs" />
            </div>

            <div className="border-4 border-black p-4 bg-blue-50">
              <label className="font-heading text-lg block mb-2 text-center uppercase">Video Prezentare</label>
              <div className="w-full h-32 border-4 border-black bg-black mb-4 flex items-center justify-center text-white text-xs text-center p-2">
                {formData.videoUrl ? "✅ VIDEO ÎNCĂRCAT" : "Aici încarci un video scurt cu tine (max 50MB)"}
              </div>
              <input type="file" accept="video/*" onChange={e => e.target.files?.[0] && handleFileUpload(e.target.files[0], 'videoUrl')} className="w-full text-xs" />
            </div>
          </div>

          {/* DESCRIERE SI PRET */}
          <div className="space-y-4">
            <label className="font-heading text-xl block border-b-4 border-black inline-block">DESCRIERE ȘI TARIF</label>
            <textarea rows={4} placeholder="Cine ești și ce știi să faci?..." className="w-full border-4 border-black p-4 font-bold" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} required />
            <div className="flex items-center gap-4 bg-green-100 p-4 border-4 border-black">
                <span className="font-heading">TARIF (RON/h):</span>
                <input type="number" className="border-2 border-black p-2 w-24 font-black" value={formData.hourlyRate} onChange={e => setFormData({...formData, hourlyRate: parseInt(e.target.value)})} />
            </div>
          </div>

          {/* HARTA JUDETE */}
          <div className="space-y-4">
            <label className="font-heading text-xl block border-b-4 border-black inline-block uppercase">Zone de Acțiune</label>
            <p className="text-sm italic">Dă click pe județele în care te poți deplasa:</p>
            <div className="border-4 border-black bg-white p-4 flex justify-center shadow-comic">
              <div className="max-w-[500px] w-full transform scale-95 md:scale-100">
                <RomaniaMap value={formData.actionAreas} onToggle={toggleArea} />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
                {formData.actionAreas.map(a => <span key={a} className="bg-black text-white px-2 py-1 text-xs font-bold uppercase">{a}</span>)}
            </div>
          </div>

          <button type="submit" disabled={uploading} className="w-full bg-red-600 text-white font-heading text-2xl py-6 border-4 border-black shadow-comic hover:bg-red-700 transition-all hover:-translate-y-1 disabled:opacity-50">
            {uploading ? 'SE ÎNCARCĂ DATELE...' : 'TRIMITE PROFILUL SPRE ACTIVARE!'}
          </button>

          {message && <div className="p-6 bg-green-500 text-white font-black text-center border-4 border-black shadow-comic">{message}</div>}
        </form>
      </div>
    </div>
  );
};

export default HeroOnboarding;