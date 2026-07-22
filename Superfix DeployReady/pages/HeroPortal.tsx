import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ServiceRequest, Hero } from '../types';
import { getMyMissions, updateMissionStatus, loginHero, logoutUser, getHeroById } from '../services/dataService';
import { CameraCapture } from '../components/CameraCapture';
import { uploadSignedMedia } from '../services/mediaUpload';

export const HeroPortal: React.FC = () => {
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  
  // Date Erou
  const [currentHero, setCurrentHero] = useState<Hero | null>(null);
  const [missions, setMissions] = useState<ServiceRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'ACTIVE' | 'HISTORY'>('ACTIVE');

  // Camera State
  const [showCamera, setShowCamera] = useState(false);
  const [currentMissionId, setCurrentMissionId] = useState<string | null>(null);
  const [cameraMode, setCameraMode] = useState<'START' | 'FINISH'>('START');

  // === NEW: Modal Info State ===
  const [showInfoModal, setShowInfoModal] = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const token = localStorage.getItem('superfix_token');
    const role = localStorage.getItem('superfix_role');
    
    if (token && role === 'HERO') {
        setIsAuthenticated(true);
        try {
            const base64Url = token.split('.')[1];
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const jsonPayload = decodeURIComponent(window.atob(base64).split('').map(function(c) {
                return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
            }).join(''));
            const payload = JSON.parse(jsonPayload);
            
            if (typeof payload.sub === 'string' && payload.sub) {
                localStorage.setItem('superfix_hero_id', payload.sub);
                refreshData(payload.sub);
            } else {
                throw new Error('Tokenul nu conține identitatea eroului.');
            }
        } catch (e) {
            console.error("Eroare decodare token", e);
            logoutUser();
            setIsAuthenticated(false);
        }
    } else {
        setIsAuthenticated(false);
    }
  };

  const refreshData = async (id: string) => {
      setLoading(true);
      const heroData = await getHeroById(id);
      if (heroData) setCurrentHero(heroData);
      
      const missionsData = await getMyMissions();
      setMissions(missionsData);
      setLoading(false);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const success = await loginHero(usernameInput, passwordInput);
    
    if (success) {
        await checkAuth();
        setUsernameInput('');
        setPasswordInput('');
    } else {
        alert('Date incorecte! Verifică numele de cod și parola.');
    }
  };

  const handleStatusChange = async (id: string, newStatus: string) => {
      if (newStatus === 'IN_PROGRESS') {
          setCurrentMissionId(id);
          setCameraMode('START');
          setShowCamera(true);
          return;
      }
      if (newStatus === 'COMPLETED') {
          setCurrentMissionId(id);
          setCameraMode('FINISH');
          setShowCamera(true);
          return;
      }

      const success = await updateMissionStatus(id, newStatus, null);
      if (!success) alert('Statusul misiunii nu a putut fi actualizat. Reîncearcă.');
      if (currentHero) refreshData(currentHero.id);
  };

  const handlePhotoCapture = async (base64Image: string) => {
      if (!currentMissionId || !currentHero) return;
      
      const blob = await (await fetch(base64Image)).blob();
      const file = new File([blob], `mission-${currentMissionId}-${Date.now()}.jpg`, { type: 'image/jpeg' });
      const photoUrl = await uploadSignedMedia(file, 'image');
      if (!photoUrl) {
          alert('Fotografia nu a putut fi încărcată. Verifică conexiunea și încearcă din nou.');
          return;
      }
      const newStatus = cameraMode === 'START' ? 'IN_PROGRESS' : 'COMPLETED';
      const success = await updateMissionStatus(currentMissionId, newStatus, photoUrl);
      if (!success) {
          alert('Fotografia a fost încărcată, dar statusul misiunii nu a putut fi actualizat. Reîncearcă.');
          return;
      }
      
      setShowCamera(false);
      setCurrentMissionId(null);
      refreshData(currentHero.id);
  };

  const activeMissions = missions.filter(m => ['PENDING', 'ACCEPTED', 'IN_PROGRESS'].includes(m.status));
  const historyMissions = missions.filter(m => ['COMPLETED', 'CANCELLED', 'REJECTED'].includes(m.status));

  // === ECRAN LOGIN ===
  if (!isAuthenticated) return (
      <div className="min-h-screen flex items-center justify-center bg-super-blue p-4 relative overflow-hidden bg-dots">
          <div className="bg-white p-8 border-4 border-black shadow-[10px_10px_0_#000] w-full max-w-sm relative z-10">
              <div className="bg-super-red text-white font-heading text-center py-2 -mx-8 -mt-8 mb-6 border-b-4 border-black text-2xl uppercase">
                  ACCES EROI
              </div>
              
              <form onSubmit={handleLogin} className="space-y-4">
                  <div>
                      <label className="block font-bold text-xs mb-1 uppercase">Nume de Cod</label>
                      <input className="w-full border-4 border-black p-3 font-comic text-lg outline-none focus:bg-yellow-50" placeholder="Ex: SuperMeseriaș" value={usernameInput} onChange={e=>setUsernameInput(e.target.value)}/>
                  </div>
                  <div>
                      <label className="block font-bold text-xs mb-1 uppercase">Parolă Secretă</label>
                      <input className="w-full border-4 border-black p-3 font-comic text-lg outline-none focus:bg-yellow-50" type="password" placeholder="••••••" value={passwordInput} onChange={e=>setPasswordInput(e.target.value)}/>
                  </div>
                  <button className="w-full bg-black text-white font-heading text-xl py-4 border-4 border-black hover:bg-gray-800 shadow-[4px_4px_0_#ccc] active:translate-y-1 active:shadow-none transition-all">
                      INTRĂ ÎN BAZĂ
                  </button>
              </form>

              <Link to="/reset-password?role=HERO" className="mt-3 block text-center text-sm font-bold underline">
                  Ai uitat parola?
              </Link>

              <div className="mt-6 pt-4 border-t-2 border-dashed border-gray-400 text-center">
                  <p className="font-comic text-sm text-gray-600 mb-2">Ești un meseriaș cu superputeri?</p>
                  <Link to="/register" className="inline-block bg-yellow-400 text-black font-bold px-4 py-2 border-2 border-black shadow-comic hover:scale-105 transition-transform text-sm uppercase">
                      Vino în echipa SuperFix!
                  </Link>
              </div>
          </div>
      </div>
  );

  // === DASHBOARD EROU ===
  return (
    <div className="min-h-screen bg-gray-100 pb-20">
      
      {/* HEADER HUD */}
      <div className="bg-white border-b-4 border-black p-4 shadow-md sticky top-0 z-30">
          <div className="container mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
              <div className="text-center md:text-left">
                  <h1 className="font-heading text-2xl md:text-3xl italic">
                      SALUT, <span className="text-super-red">{currentHero?.alias || 'EROULE'}</span>!
                  </h1>
                  <p className="font-comic text-xs text-gray-500 font-bold uppercase tracking-widest">CONECTAT LA REȚEAUA SUPERFIX</p>
              </div>

              {/* STATS BUBBLES */}
              <div className="flex gap-4 items-center">
                  <div className="bg-black text-white p-2 px-4 border-2 border-gray-500 rounded text-center min-w-[100px] shadow-sm">
                      <div className="text-[10px] uppercase text-yellow-400 font-bold tracking-wider">TRUST</div>
                      <div className="text-2xl font-heading leading-none">{currentHero?.trustFactor || 50}</div>
                  </div>
                  <div className="bg-white text-black p-2 px-4 border-2 border-black rounded text-center min-w-[100px] shadow-sm">
                      <div className="text-[10px] uppercase text-gray-500 font-bold tracking-wider">MISIUNI</div>
                      <div className="text-2xl font-heading leading-none">{currentHero?.missionsCompleted || 0}</div>
                  </div>
              </div>

              {/* ACTION BUTTONS */}
              <div className="flex gap-2">
                  {/* === BUTON INFO NOU === */}
                  <button onClick={() => setShowInfoModal(true)} className="text-xs font-bold bg-blue-100 text-blue-800 px-4 py-2 border border-blue-200 hover:bg-blue-600 hover:text-white transition-colors flex items-center gap-1">
                      ℹ️ CUM FUNCȚIONEAZĂ
                  </button>
                  
                  <button onClick={() => { logoutUser(); setIsAuthenticated(false); }} className="text-xs font-bold underline bg-red-100 text-red-600 px-4 py-2 border border-red-200 hover:bg-red-600 hover:text-white transition-colors">
                      DECONECTARE
                  </button>
              </div>
          </div>
      </div>

      {/* MESAJE ATMOSFERĂ */}
      <div className="container mx-auto px-4 mt-6">
          <div className="bg-yellow-100 border-4 border-black p-4 font-comic text-sm md:text-base shadow-comic flex items-start gap-3">
              <span className="text-2xl">💬</span>
              <div>
                  <strong>Mesaj de la Cartierul General:</strong> 
                  {activeMissions.length > 0 
                    ? " Orașul este sub asediu (de țevi sparte)! Cetățenii se bazează pe tine. Un răspuns rapid crește Trust Factor-ul!" 
                    : " Liniște pe frecvențe. Profită de pauză pentru a-ți curăța pelerina (sau trusa de scule)."}
              </div>
          </div>
      </div>

      {/* TABS */}
      <div className="flex justify-center gap-4 my-8 px-4 container mx-auto">
          <button onClick={() => setActiveTab('ACTIVE')} className={`flex-1 max-w-[200px] py-3 font-heading border-4 border-black shadow-comic transition-transform ${activeTab === 'ACTIVE' ? 'bg-super-red text-white -translate-y-1' : 'bg-white hover:bg-gray-50 text-gray-400'}`}>
              MISIUNI ACTIVE ({activeMissions.length})
          </button>
          <button onClick={() => setActiveTab('HISTORY')} className={`flex-1 max-w-[200px] py-3 font-heading border-4 border-black shadow-comic transition-transform ${activeTab === 'HISTORY' ? 'bg-blue-500 text-white -translate-y-1' : 'bg-white hover:bg-gray-50 text-gray-400'}`}>
              ISTORIC
          </button>
      </div>

      {/* LISTA MISIUNI */}
      <div className="container mx-auto px-4 max-w-4xl space-y-8">
          {loading && <div className="text-center font-heading text-xl animate-pulse bg-white p-4 border-2 border-black inline-block">SE SCANEAZĂ FRECVENȚELE...</div>}
          
          {!loading && activeTab === 'ACTIVE' && activeMissions.length === 0 && (
              <div className="text-center py-12 bg-white border-4 border-black shadow-comic">
                  <div className="text-6xl mb-4">💤</div>
                  <h3 className="font-heading text-2xl uppercase">Nicio Urgență</h3>
                  <p className="font-comic text-gray-500">Momentan nu ai nicio misiune alocată.</p>
              </div>
          )}

          {(activeTab === 'ACTIVE' ? activeMissions : historyMissions).map(mission => (
              <div key={mission.id} className="bg-white border-4 border-black p-0 shadow-[8px_8px_0_#000] relative overflow-hidden">
                  {/* Status Strip */}
                  <div className={`py-2 px-4 font-heading text-white text-center text-lg border-b-4 border-black
                      ${mission.status === 'PENDING' ? 'bg-yellow-500 text-black' : 
                        mission.status === 'IN_PROGRESS' ? 'bg-blue-600 animate-pulse' : 
                        mission.status === 'ACCEPTED' ? 'bg-purple-600' :
                        mission.status === 'COMPLETED' ? 'bg-green-600' : 'bg-gray-600'}`}>
                      STATUS: {mission.status === 'PENDING' ? 'APEL DE URGENȚĂ (Așteaptă Răspuns)' : 
                               mission.status === 'ACCEPTED' ? 'MISIUNE ACCEPTATĂ' :
                               mission.status === 'IN_PROGRESS' ? 'ÎN DESFĂȘURARE' : 
                               mission.status}
                  </div>

                  <div className="p-6">
                      <div className="grid md:grid-cols-2 gap-8">
                          <div>
                              <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2 border-b-2 border-gray-100 pb-1">DATE CETĂȚEAN</h3>
                              <p className="font-heading text-2xl mb-1">{mission.clientName}</p>
                              <a href={`tel:${mission.clientPhone}`} className="inline-block bg-green-100 text-green-800 px-3 py-1 font-bold border-2 border-green-200 hover:bg-green-200 rounded mb-2">
                                  📞 {mission.clientPhone}
                              </a>
                              <p className="text-sm text-gray-500 font-mono">{mission.clientEmail}</p>
                          </div>
                          <div>
                              <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2 border-b-2 border-gray-100 pb-1">DESCRIERE PROBLEMĂ</h3>
                              <div className="font-comic text-lg bg-yellow-50 p-4 border-l-4 border-black shadow-sm italic text-gray-800">
                                  "{mission.description}"
                              </div>
                              <p className="text-xs text-gray-400 mt-2 text-right">
                                  Recepționat: {new Date(mission.date).toLocaleString()}
                              </p>
                          </div>
                      </div>

                      {/* ZONA DE ACȚIUNE */}
                      {activeTab === 'ACTIVE' && (
                          <div className="mt-8 pt-6 border-t-4 border-dashed border-gray-300">
                              
                              {mission.status === 'PENDING' && (
                                  <div className="flex flex-col sm:flex-row gap-4">
                                      <button onClick={() => handleStatusChange(mission.id, 'ACCEPTED')} className="flex-1 bg-green-500 text-white font-heading py-3 text-lg border-4 border-black hover:bg-green-600 shadow-comic hover:translate-y-[-2px] transition-all">
                                          ACCEPTĂ MISIUNEA
                                      </button>
                                      <button onClick={() => handleStatusChange(mission.id, 'REJECTED')} className="flex-1 bg-red-500 text-white font-heading py-3 text-lg border-4 border-black hover:bg-red-600 shadow-comic hover:translate-y-[-2px] transition-all">
                                          REFUZĂ
                                      </button>
                                  </div>
                              )}

                              {mission.status === 'ACCEPTED' && (
                                  <button onClick={() => handleStatusChange(mission.id, 'IN_PROGRESS')} className="w-full bg-blue-600 text-white font-heading py-4 text-xl border-4 border-black hover:bg-blue-700 shadow-comic animate-bounce-slow">
                                      📸 AM AJUNS! ÎNCEPE LUCRAREA (POZĂ)
                                  </button>
                              )}

                              {mission.status === 'IN_PROGRESS' && (
                                  <button onClick={() => handleStatusChange(mission.id, 'COMPLETED')} className="w-full bg-green-600 text-white font-heading py-4 text-xl border-4 border-black hover:bg-green-700 shadow-comic">
                                      ✅ MISIUNE ÎNDEPLINITĂ (POZĂ FINALĂ)
                                  </button>
                              )}
                          </div>
                      )}
                  </div>
              </div>
          ))}
      </div>

      {/* CAMERA */}
      {showCamera && (
          <CameraCapture 
              onCapture={handlePhotoCapture} 
              onClose={() => setShowCamera(false)} 
              label={cameraMode === 'START' ? "FĂ O POZĂ LA ÎNCEPUTUL LUCRĂRII" : "FĂ O POZĂ CU REZULTATUL FINAL"}
          />
      )}

      {/* === MODAL INFO NOU === */}
      {showInfoModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90">
            <div className="bg-white w-full max-w-2xl border-4 border-white shadow-2xl relative animate-fade-in flex flex-col max-h-[90vh]">
                
                {/* Header Modal */}
                <div className="bg-blue-600 p-4 border-b-4 border-black flex justify-between items-center shrink-0">
                    <h2 className="font-heading text-xl md:text-2xl text-white uppercase tracking-wider">
                        📘 MANUAL DE OPERARE SUPERFIX
                    </h2>
                    <button onClick={() => setShowInfoModal(false)} className="text-white font-bold text-xl hover:scale-110">X</button>
                </div>

                {/* Body Scrollable */}
                <div className="p-6 font-comic text-gray-800 overflow-y-auto">
                    <div className="mb-6">
                        <h3 className="font-bold text-lg mb-2 flex items-center gap-2">
                            <span className="text-2xl">⚡</span> FIXOMETRUL (FACTORUL DE ÎNCREDERE)
                        </h3>
                        <p className="mb-2">
                            Fixometrul este reputația ta. Cu cât ai un scor mai mare, cu atât 
                            <span className="bg-yellow-200 px-1 font-bold">apari mai sus în lista de eroi</span> 
                            când clienții caută meseriași.
                        </p>
                        <p className="text-sm italic text-gray-500">Un Trust Factor mare = Mai mulți clienți = Mai mulți bani.</p>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2 mb-6">
                        <div className="bg-green-50 border-2 border-green-600 p-4 rounded">
                            <h4 className="font-bold text-green-700 mb-2">CUM CÂȘTIGI PUNCTE 📈</h4>
                            <ul className="list-disc pl-4 space-y-1 text-sm">
                                <li><strong>+5 Puncte:</strong> Misiune finalizată cu succes (cu poze Before/After).</li>
                                <li><strong>+2 Puncte:</strong> Recenzie de 5 stele de la client.</li>
                            </ul>
                        </div>
                        <div className="bg-red-50 border-2 border-red-600 p-4 rounded">
                            <h4 className="font-bold text-red-700 mb-2">CUM PIERZI PUNCTE 📉</h4>
                            <ul className="list-disc pl-4 space-y-1 text-sm">
                                <li><strong>-1 Punct:</strong> Refuzarea unei misiuni alocate.</li>
                                <li><strong>-2 Puncte:</strong> Recenzie de o stea de la client.</li>
                            </ul>
                        </div>
                    </div>

                    <div className="bg-gray-100 p-4 border-l-4 border-black">
                        <h3 className="font-bold mb-2">📸 DE CE SUNT IMPORTANTE POZELE?</h3>
                        <p className="mb-2 text-sm">
                            Deși <strong>nu sunt obligatorii</strong>, pozele (Început și Final) sunt dovada muncii tale în fața Cartierului General.
                        </p>
                        <p className="text-sm">
                            Fără poze, sistemul nu poate valida complet misiunea, iar Trust Factor-ul tău nu va crește la fel de repede. 
                            <span className="font-bold"> Arată-le oamenilor ce treabă bună faci!</span>
                        </p>
                    </div>
                </div>

                {/* Footer Modal */}
                <div className="p-4 border-t-4 border-black bg-gray-50 text-center shrink-0">
                    <button 
                        onClick={() => setShowInfoModal(false)}
                        className="bg-black text-white font-heading py-3 px-8 border-2 border-transparent hover:bg-gray-800 hover:border-black shadow-comic uppercase"
                    >
                        AM ÎNȚELES, LA TREABĂ!
                    </button>
                </div>
            </div>
        </div>
      )}

    </div>
  );
};



