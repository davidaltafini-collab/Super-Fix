import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const HeroOnboarding = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    description: '',
    hourlyRate: '',
    actionAreas: '', // Vom cere județele separate prin virgulă pentru simplitate
    videoLink: ''    // Link către video-ul lor de prezentare
  });
  const [avatarFile, setAvatarFile] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  // Verificăm dacă e logat
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
        alert("Te rugăm să te loghezi mai întâi cu contul primit pe mail!");
        navigate('/login'); // Sau ruta ta de login
    }
  }, [navigate]);

  // Conversie Poza în Base64
  const handleFileChange = (e: any) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 5000000) { // 5MB limită
          alert("Poza este prea mare! Maxim 5MB.");
          return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatarFile(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    setLoading(true);
    const token = localStorage.getItem('token');

    try {
      const response = await fetch('https://api.super-fix.ro/api/hero/submit-update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          description: formData.description,
          hourlyRate: formData.hourlyRate,
          actionAreas: formData.actionAreas.split(',').map(s => s.trim()), // Transformăm textul în array
          videoUrl: formData.videoLink,
          avatarUrl: avatarFile
        })
      });

      const data = await response.json();
      if (data.success) {
        setMessage("✅ Date trimise cu succes! Vei fi notificat când profilul este actualizat.");
        setTimeout(() => navigate('/'), 3000);
      } else {
        setMessage("❌ Eroare: " + (data.error || "Ceva nu a mers."));
      }
    } catch (err) {
      setMessage("❌ Eroare de conexiune.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 py-12 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-3xl mx-auto bg-white p-8 rounded-lg shadow-2xl border-t-4 border-red-600">
        
        {/* PARTEA 1: VIDEO INROLARE */}
        <div className="mb-10 text-center">
          <h1 className="text-3xl font-black italic mb-4">PASUL 2: INSTRUCTAJ</h1>
          <p className="mb-6 text-gray-600">Urmărește cu atenție materialul de mai jos înainte de a completa datele.</p>
          
          <div className="aspect-w-16 aspect-h-9 bg-black rounded-lg overflow-hidden shadow-lg mb-6">
            {/* AICI PUI LINK-UL TĂU DE YOUTUBE (Embed) */}
            <iframe 
                width="100%" 
                height="400" 
                src="https://www.youtube.com/embed/PUNE_ID_AICI?rel=0" 
                title="SuperFix Onboarding" 
                frameBorder="0" 
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                allowFullScreen
            ></iframe>
          </div>
        </div>

        <hr className="border-gray-300 my-8" />

        {/* PARTEA 2: FORMULAR */}
        <div className="text-center mb-8">
            <h2 className="text-2xl font-bold">DATE PROFIL PUBLIC</h2>
            <p className="text-sm text-gray-500">Aceste date vor apărea pe site după aprobare.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
            
            {/* Poza Profil */}
            <div>
                <label className="block text-sm font-bold text-gray-700">Poza de Profil (Profesională)</label>
                <input type="file" accept="image/*" onChange={handleFileChange} required 
                    className="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-red-50 file:text-red-700 hover:file:bg-red-100"/>
                {avatarFile && <img src={avatarFile} alt="Preview" className="mt-4 h-32 w-32 object-cover rounded-full border-4 border-gray-200 mx-auto"/>}
            </div>

            {/* Descriere */}
            <div>
                <label className="block text-sm font-bold text-gray-700">Descriere Scurtă</label>
                <textarea 
                    rows={4}
                    placeholder="Ex: Electrician cu 10 ani experiență, specializat în panouri..."
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-3 focus:ring-red-500 focus:border-red-500"
                    value={formData.description}
                    onChange={e => setFormData({...formData, description: e.target.value})}
                    required
                />
            </div>

            {/* Pret */}
            <div>
                <label className="block text-sm font-bold text-gray-700">Preț Estimativ (RON/Oră)</label>
                <input 
                    type="number" 
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-3"
                    value={formData.hourlyRate}
                    onChange={e => setFormData({...formData, hourlyRate: e.target.value})}
                    required
                />
            </div>

            {/* Judete */}
            <div>
                <label className="block text-sm font-bold text-gray-700">Județe/Zone de acțiune</label>
                <input 
                    type="text" 
                    placeholder="Ex: București, Ilfov, Prahova"
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-3"
                    value={formData.actionAreas}
                    onChange={e => setFormData({...formData, actionAreas: e.target.value})}
                    required
                />
                <p className="text-xs text-gray-500 mt-1">Separate prin virgulă.</p>
            </div>

            {/* Link Video Prezentare */}
            <div>
                <label className="block text-sm font-bold text-gray-700">Link Video Prezentare (Opțional)</label>
                <input 
                    type="text" 
                    placeholder="Link YouTube / Drive / TikTok"
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-3"
                    value={formData.videoLink}
                    onChange={e => setFormData({...formData, videoLink: e.target.value})}
                />
            </div>

            <button 
                type="submit" 
                disabled={loading}
                className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-bold text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50"
            >
                {loading ? 'Se trimite...' : 'TRIMITE PENTRU APROBARE'}
            </button>

            {message && (
                <div className={`p-4 rounded text-center font-bold ${message.includes('succes') ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    {message}
                </div>
            )}
        </form>
      </div>
    </div>
  );
};

export default HeroOnboarding;