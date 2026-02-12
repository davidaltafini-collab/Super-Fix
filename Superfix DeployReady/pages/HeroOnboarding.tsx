import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

const HeroOnboarding = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const heroId = searchParams.get('id'); // Luăm ID-ul din link (?id=...)

  const [formData, setFormData] = useState({
    description: '',
    hourlyRate: '',
    actionAreas: '',
    videoLink: ''
  });
  const [avatarFile, setAvatarFile] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleFileChange = (e: any) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setAvatarFile(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    if (!heroId) {
        alert("Eroare: Link invalid. Te rugăm să folosești link-ul primit pe email.");
        return;
    }
    setLoading(true);

    try {
      // Trimitem către noua rută publică
      const response = await fetch('https://api.super-fix.ro/api/hero/public-submit-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          heroId: heroId, // Trimitem ID-ul citit din URL
          description: formData.description,
          hourlyRate: formData.hourlyRate,
          actionAreas: formData.actionAreas.split(',').map(s => s.trim()),
          videoUrl: formData.videoLink,
          avatarUrl: avatarFile
        })
      });

      const data = await response.json();
      if (data.success) {
        setMessage("✅ Datele au fost trimise! Admin-ul le va verifica și profilul tău va deveni activ.");
        setTimeout(() => window.location.href = "https://superfix.ro", 3000);
      } else {
        setMessage("❌ Eroare: " + data.error);
      }
    } catch (err) {
      setMessage("❌ Eroare de conexiune la server.");
    } finally {
      setLoading(false);
    }
  };

  if (!heroId) {
      return (
          <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
              <div className="bg-white p-8 border-4 border-black shadow-comic text-center">
                  <h1 className="text-2xl font-black text-red-600 mb-4">ACCES NEAUTORIZAT</h1>
                  <p>Te rugăm să folosești link-ul primit în email-ul de confirmare.</p>
              </div>
          </div>
      );
  }

  return (
    <div className="min-h-screen bg-gray-100 py-12 px-4 font-sans">
      <div className="max-w-3xl mx-auto bg-white p-8 rounded-lg shadow-2xl border-t-4 border-red-600">
        <div className="mb-10 text-center">
          <h1 className="text-3xl font-black italic mb-4 uppercase">Instruire și Activare Profil</h1>
          <div className="aspect-video bg-black rounded-lg overflow-hidden shadow-lg mb-6">
            <iframe 
                width="100%" height="100%" 
                src="https://www.youtube.com/embed/ID_VIDEO_AICI" 
                title="SuperFix Onboarding" frameBorder="0" allowFullScreen
            ></iframe>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
            <div>
                <label className="block text-sm font-bold">Poza de Profil</label>
                <input type="file" accept="image/*" onChange={handleFileChange} required className="mt-1 block w-full text-sm"/>
                {avatarFile && <img src={avatarFile} alt="Preview" className="mt-4 h-32 w-32 object-cover rounded-full border-4 border-gray-200 mx-auto"/>}
            </div>

            <div>
                <label className="block text-sm font-bold">Descriere Servicii</label>
                <textarea rows={3} className="w-full border-2 border-black p-2" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} required />
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-bold">Preț/Oră (RON)</label>
                    <input type="number" className="w-full border-2 border-black p-2" value={formData.hourlyRate} onChange={e => setFormData({...formData, hourlyRate: e.target.value})} required />
                </div>
                <div>
                    <label className="block text-sm font-bold">Județe (Ex: București, Ilfov)</label>
                    <input type="text" className="w-full border-2 border-black p-2" value={formData.actionAreas} onChange={e => setFormData({...formData, actionAreas: e.target.value})} required />
                </div>
            </div>

            <button type="submit" disabled={loading} className="w-full bg-red-600 text-white font-black py-4 border-4 border-black shadow-comic hover:bg-red-700">
                {loading ? 'SE TRIMITE...' : 'ACTIVEAZĂ PROFILUL'}
            </button>
            {message && <div className="p-4 mt-4 bg-yellow-100 border-2 border-yellow-400 text-center font-bold">{message}</div>}
        </form>
      </div>
    </div>
  );
};

export default HeroOnboarding;