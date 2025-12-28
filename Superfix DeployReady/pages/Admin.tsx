import React, { useState, useEffect, useMemo } from 'react';
import { JobCategory, Hero, ServiceRequest } from '../types';
import { 
    createHero, getAllRequests, loginUser, logoutUser, 
    getApplications, deleteApplication, getHeroes, 
    updateHero, deleteHero 
} from '../services/dataService';
import { RomaniaMap } from '../components/RomaniaMap';

const CLOUD_NAME = "dnsmgqllf";
const UPLOAD_PRESET = "superfix_upload";

const ROMANIAN_COUNTIES = [
  "Alba", "Arad", "Argeș", "Bacău", "Bihor", "Bistrița-Năsăud", "Botoșani", "Brașov", 
  "Brăila", "București", "Buzău", "Caraș-Severin", "Călărași", "Cluj", "Constanța", 
  "Covasna", "Dâmbovița", "Dolj", "Galați", "Giurgiu", "Gorj", "Harghita", "Hunedoara", 
  "Ialomița", "Iași", "Ilfov", "Maramureș", "Mehedinți", "Mureș", "Neamț", "Olt", 
  "Prahova", "Satu Mare", "Sălaj", "Sibiu", "Suceava", "Teleorman", "Timiș", "Tulcea", 
  "Vâlcea", "Vaslui", "Vrancea"
];

export const Admin: React.FC = () => {
  // === STATE ===
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [usernameInput, setUsernameInput] = useState('admin');
  const [passwordInput, setPasswordInput] = useState('');
  
  const [activeTab, setActiveTab] = useState<'HEROES' | 'REQUESTS' | 'APPLICATIONS' | 'SETTINGS'>('HEROES');
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [applications, setApplications] = useState<any[]>([]);
  const [heroes, setHeroes] = useState<Hero[]>([]);
  
  const [categoryList, setCategoryList] = useState<string[]>(Object.values(JobCategory));
  const [newCatInput, setNewCatInput] = useState('');

  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('ALL');
  const [uploading, setUploading] = useState(false);

  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<'VIEW' | 'EDIT' | 'ADD'>('VIEW');
  const [selectedHero, setSelectedHero] = useState<Hero | null>(null);
  const [viewEvidence, setViewEvidence] = useState<ServiceRequest | null>(null);
  const [recruitingAppId, setRecruitingAppId] = useState<string | null>(null);

  const [formData, setFormData] = useState<any>({
      alias: '', realName: '', username: '', password: '', 
      category: 'Electrician', description: '', 
      hourlyRate: 100, avatarUrl: '', videoUrl: '', 
      email: '', phone: '', location: 'București', powers: '', trustFactor: 50,
      actionAreas: [] 
  });
  
  const [isCustomCat, setIsCustomCat] = useState(false);
  const [formCustomCat, setFormCustomCat] = useState('');

  // === INIT ===
  useEffect(() => {
    const token = localStorage.getItem('superfix_token');
    const role = localStorage.getItem('superfix_role');
    if (token && role === 'ADMIN') setIsAuthenticated(true);
    else { setIsAuthenticated(false); if(token) logoutUser(); }

    const savedCats = localStorage.getItem('superfix_full_categories');
    if(savedCats) setCategoryList(JSON.parse(savedCats));
  }, []);

  useEffect(() => {
    if(!isAuthenticated) return;
    refreshAllData();
  }, [isAuthenticated, activeTab]);

  const refreshAllData = () => {
      getHeroes().then(setHeroes);
      getAllRequests().then(setRequests);
      getApplications().then(setApplications);
  };

  // === HANDLERS ===
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await loginUser(usernameInput, passwordInput)) {
        if (localStorage.getItem('superfix_role') === 'ADMIN') {
            setIsAuthenticated(true);
            setUsernameInput('');
            setPasswordInput('');
        } else {
            alert("Acest cont nu are drepturi de Administrator.");
            logoutUser();
        }
    } else alert('Date incorecte!');
  };

  const handleLogout = () => { logoutUser(); setIsAuthenticated(false); };

  const addCategory = () => {
      if (!newCatInput.trim() || categoryList.includes(newCatInput)) return;
      const updated = [...categoryList, newCatInput];
      setCategoryList(updated);
      localStorage.setItem('superfix_full_categories', JSON.stringify(updated));
      setNewCatInput('');
  };

  const removeCategory = (cat: string) => {
      if (confirm(`Sigur ștergi categoria "${cat}"?`)) {
          const updated = categoryList.filter(c => c !== cat);
          setCategoryList(updated);
          localStorage.setItem('superfix_full_categories', JSON.stringify(updated));
      }
  };

  const openAddModal = () => {
      setFormData({
        alias: '', realName: '', username: '', password: '', 
        category: categoryList[0] || 'Electrician', description: '', 
        hourlyRate: 100, avatarUrl: '', videoUrl: '', 
        email: '', phone: '', location: 'București', powers: '', 
        trustFactor: 50, actionAreas: []
      });
      setModalMode('ADD');
      setRecruitingAppId(null);
      setShowModal(true);
  };

  const openHeroFile = (hero: Hero) => {
      setSelectedHero(hero);
      setFormData({
          ...hero,
          realName: hero.realName || '', email: hero.email || '', phone: hero.phone || '',
          description: hero.description || '', location: hero.location || 'București',
          avatarUrl: hero.avatarUrl || '', videoUrl: hero.videoUrl || '', powers: hero.powers || '',
          actionAreas: (hero.actionAreas && Array.isArray(hero.actionAreas)) ? hero.actionAreas : [],
          password: '' 
      }); 
      setModalMode('VIEW');
      setShowModal(true);
  };

 const handleRecruit = (app: any) => {
      setFormData({
          alias: '', realName: app.name || '', 
          username: app.email.split('@')[0], password: 'Hero' + Math.floor(Math.random() * 1000), 
          category: app.category, 
          description: app.message || '', 
          hourlyRate: 100, 
          avatarUrl: '', videoUrl: '', email: app.email || '', phone: app.phone || '', 
          location: 'București', powers: '', trustFactor: 50, actionAreas: []
      });
      setRecruitingAppId(app.id);
      setActiveTab('HEROES');
      setModalMode('ADD');
      setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
      e.preventDefault();
      const payload = { ...formData };
      
      // === MODIFICARE 1: Asigurăm conversia în număr ===
      payload.hourlyRate = Number(payload.hourlyRate);
      // =================================================

      if(isCustomCat && formCustomCat) payload.category = formCustomCat; 
      if(!payload.password) delete payload.password;
      delete payload.id; delete payload.reviews; delete payload.requests; delete payload.createdAt; delete payload.updatedAt;
      if (!payload.actionAreas) payload.actionAreas = [];

      let success = false;
      if(modalMode === 'EDIT' && selectedHero) success = await updateHero(selectedHero.id, payload);
      else {
          success = await createHero(payload);
          if(success && recruitingAppId) { await deleteApplication(recruitingAppId); setRecruitingAppId(null); }
      }

      if(success) { setShowModal(false); refreshAllData(); alert("✅ Eroul a fost salvat cu succes!"); }
      else alert('❌ Eroare la salvare.');
  };

  const handleDeleteHero = async () => {
      if(selectedHero && confirm("Ești sigur că vrei să ștergi acest erou?")) {
          await deleteHero(selectedHero.id);
          setShowModal(false);
          refreshAllData();
          alert("🗑️ Erou șters!");
      }
  };

  const handleFileUpload = async (file: File, field: 'avatarUrl' | 'videoUrl') => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('upload_preset', UPLOAD_PRESET);
      setUploading(true);
      try {
          const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${field === 'videoUrl' ? 'video' : 'image'}/upload`, { method: 'POST', body: formData });
          const data = await res.json();
          if(data.secure_url) setFormData((prev: any) => ({ ...prev, [field]: data.secure_url }));
      } finally { setUploading(false); }
  };

  const toggleArea = (area: string) => {
      const current = formData.actionAreas || [];
      const newAreas = current.includes(area) ? current.filter((c:string) => c !== area) : [...current, area];
      setFormData({ ...formData, actionAreas: newAreas });
  };

  // === FUNCȚIE DOWNLOAD IMAGINE ===
  const downloadImage = async (url: string, filename: string) => {
      if (!url) {
          alert("Nu există poză de descărcat.");
          return;
      }
      try {
          const response = await fetch(url);
          const blob = await response.blob();
          const blobUrl = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = blobUrl;
          link.download = filename;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          window.URL.revokeObjectURL(blobUrl);
      } catch (error) {
          window.open(url, '_blank');
      }
  };

  // === ESCAPE HTML PENTRU SECURITATE ===
  const escapeHtml = (text: string) => {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
  };

  // === FORMATARE DATA CU ORA ===
  const formatDateTime = (date: Date | string) => {
      const d = new Date(date);
      return d.toLocaleDateString('ro-RO') + ' ' + d.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' });
  };

  // === PRINTARE DOSAR ÎMBUNĂTĂȚIT ===
  const handlePrintDossier = () => {
      if (!viewEvidence) return;

      const printWindow = window.open('', '_blank', 'width=900,height=1200');
      if (!printWindow) {
          alert("Te rugăm să permiți popup-urile pentru a printa!");
          return;
      }

      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Dosar ${escapeHtml(viewEvidence.clientName)}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { 
                font-family: 'Arial', 'Helvetica', sans-serif; 
                padding: 25px; 
                background: #fff;
            }
            
            /* PATTERN DE FUNDAL */
            .bg-pattern {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                opacity: 0.02;
                background-image: 
                    repeating-linear-gradient(45deg, transparent, transparent 10px, #000 10px, #000 11px),
                    repeating-linear-gradient(-45deg, transparent, transparent 10px, #000 10px, #000 11px);
                z-index: -1;
                pointer-events: none;
            }
            
            /* HEADER SIMPLU */
            .header { 
                border: 4px solid #000; 
                padding: 20px; 
                margin-bottom: 25px; 
                background: #fff;
                box-shadow: 6px 6px 0 #000;
                position: relative;
            }
            .logo { 
                font-size: 42px; 
                font-weight: 700; 
                font-style: italic; 
                color: #dc2626;
                letter-spacing: 2px;
                text-transform: uppercase;
                text-shadow: 2px 2px 0 #000;
                margin-bottom: 5px;
            }
            .subtitle { 
                font-size: 13px; 
                color: #000; 
                text-transform: uppercase;
                letter-spacing: 1.5px;
                font-weight: 700;
            }
            .header-right {
                position: absolute;
                top: 20px;
                right: 20px;
                text-align: right;
                font-size: 13px;
                color: #000;
                font-weight: 700;
                background: #f3f4f6;
                padding: 10px 15px;
                border: 3px solid #000;
                box-shadow: 3px 3px 0 #000;
            }
            
            /* TABEL */
            table { 
                width: 100%; 
                border-collapse: collapse; 
                margin-bottom: 25px;
                border: 4px solid #000;
                box-shadow: 5px 5px 0 #000;
            }
            th { 
                background: #000; 
                color: #fff; 
                padding: 12px; 
                text-align: left;
                font-size: 13px;
                text-transform: uppercase;
                letter-spacing: 1px;
                font-weight: 700;
            }
            td { 
                border: 2px solid #000; 
                padding: 12px; 
                font-weight: 600;
                font-size: 14px;
                background: #fff;
            }
            
            /* MESAJ MOTIVAȚIONAL */
            .motivational {
                background: #16a34a;
                color: #fff;
                padding: 12px;
                border: 4px solid #000;
                text-align: center;
                font-size: 16px;
                font-weight: 700;
                text-transform: uppercase;
                margin-bottom: 25px;
                box-shadow: 5px 5px 0 #000;
                letter-spacing: 1px;
            }
            
            /* GRID POZE */
            .grid { 
                display: grid; 
                grid-template-columns: 1fr 1fr; 
                gap: 20px;
                margin-bottom: 30px;
            }
            .box { 
                text-align: center;
                break-inside: avoid;
            }
            .badge { 
                display: inline-block; 
                padding: 8px 20px; 
                color: white; 
                font-weight: 700; 
                border: 4px solid black; 
                margin-bottom: 12px;
                font-size: 15px;
                text-transform: uppercase;
                letter-spacing: 1.5px;
                box-shadow: 3px 3px 0 #000;
            }
            .badge-before { 
                background: #dc2626; 
                transform: rotate(-2deg);
            }
            .badge-after { 
                background: #16a34a; 
                transform: rotate(2deg);
            }
            .img-wrap { 
                min-height: 320px; 
                border: 5px solid black; 
                background: #f5f5f5; 
                display: flex; 
                align-items: center; 
                justify-content: center;
                overflow: hidden;
                box-shadow: 6px 6px 0 #000;
                margin-bottom: 10px;
            }
            .img-wrap img { 
                max-width: 100%; 
                max-height: 100%; 
                object-fit: contain;
                display: block;
            }
            .img-placeholder {
                font-size: 20px;
                color: #999;
                font-weight: 700;
                text-transform: uppercase;
            }
            .photo-date {
                background: #000;
                color: #fff;
                padding: 6px 12px;
                border: 2px solid #000;
                font-size: 12px;
                font-weight: 700;
                display: inline-block;
                box-shadow: 2px 2px 0 rgba(0,0,0,0.3);
            }
            
            /* FOOTER */
            .footer { 
                margin-top: 30px;
                padding: 15px;
                font-size: 11px; 
                border: 3px solid #000;
                background: #f3f4f6;
                display: flex; 
                justify-content: space-between;
                font-weight: 600;
                text-transform: uppercase;
                box-shadow: 4px 4px 0 #000;
            }
            
            /* STAMP */
            .stamp {
                position: fixed;
                bottom: 80px;
                right: 50px;
                width: 110px;
                height: 110px;
                border: 4px solid #dc2626;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 14px;
                font-weight: 700;
                color: #dc2626;
                transform: rotate(15deg);
                background: rgba(220, 38, 38, 0.08);
                text-align: center;
                line-height: 1.2;
            }
            
            /* RESPONSIVE */
            @media screen and (max-width: 600px) {
                body { padding: 15px; }
                .logo { font-size: 32px; }
                .header { padding: 15px; }
                .header-right { position: static; margin-top: 15px; }
                .grid { grid-template-columns: 1fr; gap: 15px; }
                .img-wrap { min-height: 220px; }
                th, td { font-size: 11px; padding: 8px; }
                .motivational { font-size: 13px; padding: 10px; }
                .stamp { width: 75px; height: 75px; font-size: 10px; bottom: 60px; right: 20px; }
            }
            
            /* PRINT */
            @media print { 
                @page { 
                    size: A4; 
                    margin: 15mm; 
                }
                body { padding: 0; }
                .stamp { position: absolute; }
            }
          </style>
        </head>
        <body>
          <div class="bg-pattern"></div>
          
          <div class="header">
            <div class="logo">SUPERFIX</div>
            <div class="subtitle">🛡️ Raport Oficial Intervenție</div>
            <div class="header-right">
              <div>ID: #${escapeHtml(viewEvidence.id.slice(0, 8))}</div>
              <div style="margin-top: 5px;">📅 ${formatDateTime(viewEvidence.date)}</div>
            </div>
          </div>

          <div class="motivational">
            ⚡ MISIUNE COMPLETATĂ CU SUCCES ⚡
          </div>

          <table>
            <thead>
                <tr>
                    <th>👤 Client</th>
                    <th>📞 Telefon</th>
                    <th>🦸 Erou</th>
                    <th>✓ Status</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>${escapeHtml(viewEvidence.clientName)}</td>
                    <td>${escapeHtml(viewEvidence.clientPhone)}</td>
                    <td>${escapeHtml(viewEvidence.hero?.alias || 'N/A')}</td>
                    <td><strong>${escapeHtml(viewEvidence.status)}</strong></td>
                </tr>
            </tbody>
          </table>

          <div class="grid">
            <div class="box">
              <div class="badge badge-before">❌ ÎNAINTE</div>
              <div class="img-wrap">
                ${viewEvidence.photoBefore 
                    ? `<img src="${escapeHtml(viewEvidence.photoBefore)}" alt="Înainte" />` 
                    : '<div class="img-placeholder">📷 LIPSĂ</div>'}
              </div>
              <div class="photo-date">📅 ${formatDateTime(viewEvidence.date)}</div>
            </div>
            <div class="box">
              <div class="badge badge-after">✓ DUPĂ</div>
              <div class="img-wrap">
                ${viewEvidence.photoAfter 
                    ? `<img src="${escapeHtml(viewEvidence.photoAfter)}" alt="După" />` 
                    : '<div class="img-placeholder">📷 LIPSĂ</div>'}
              </div>
              <div class="photo-date">📅 ${formatDateTime(viewEvidence.date)}</div>
            </div>
          </div>

          <div class="footer">
            <div>🏆 Certificat emis de SuperFix HQ<br/>✓ Validat de Administrator</div>
            <div>📍 Portal Admin<br/>🔒 Confidențial</div>
          </div>
          
          <div class="stamp">
            CERTIFICAT<br/>OFICIAL
          </div>
          
          <script>
            window.onload = function() { 
                setTimeout(function() {
                    window.print();
                }, 500);
            }
          </script>
        </body>
        </html>
      `;

      printWindow.document.write(htmlContent);
      printWindow.document.close();
  };

  const heroMissions = selectedHero ? requests.filter(r => r.heroId === selectedHero.id) : [];
  const filteredHeroes = heroes.filter(h => (filterCategory === 'ALL' || h.category === filterCategory) && h.alias.toLowerCase().includes(searchTerm.toLowerCase()));

  // === RENDER ===
  if (!isAuthenticated) return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 p-4">
          <form onSubmit={handleLogin} className="bg-white p-8 border-4 border-black shadow-[8px_8px_0_#fff] w-full max-w-sm">
              <h1 className="font-heading text-3xl mb-6 text-center">ADMIN HQ</h1>
              <input className="w-full border-4 border-black p-3 mb-4 font-mono" placeholder="Username" value={usernameInput} onChange={e=>setUsernameInput(e.target.value)}/>
              <input className="w-full border-4 border-black p-3 mb-6 font-mono" type="password" placeholder="Password" value={passwordInput} onChange={e=>setPasswordInput(e.target.value)}/>
              <button className="w-full bg-red-600 text-white font-heading py-4 border-4 border-black hover:bg-red-700 shadow-[4px_4px_0_#000]">ACCESARE</button>
          </form>
      </div>
  );

  return (
    <div className="container mx-auto px-2 md:px-4 py-8 min-h-screen pb-24">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-center mb-8 border-b-4 border-black pb-4 bg-white p-4 shadow-comic gap-4">
        <h1 className="font-heading text-2xl md:text-4xl italic">SUPERFIX <span className="text-super-red">ADMIN</span></h1>
        <div className="flex flex-wrap justify-center gap-2">
            {['HEROES', 'REQUESTS', 'APPLICATIONS', 'SETTINGS'].map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab as any)} 
                    className={`font-heading text-xs md:text-sm px-3 py-1 border-2 border-transparent transition-all ${activeTab === tab ? 'bg-comic-yellow border-black shadow-comic' : 'hover:underline'}`}>
                    {tab === 'HEROES' ? 'EROI' : tab === 'REQUESTS' ? 'MISIUNI' : tab === 'APPLICATIONS' ? 'RECRUTARE' : 'SETĂRI'}
                </button>
            ))}
            <button onClick={handleLogout} className="text-gray-500 font-bold ml-2 border-l-2 border-gray-300 pl-2 text-sm">IEȘIRE</button>
        </div>
      </div>

      {/* TABS (EROI, MISIUNI, ETC) */}
      {activeTab === 'HEROES' && (
          <div className="animate-fade-in">
              <div className="bg-white border-4 border-black p-4 mb-6 flex flex-col md:flex-row gap-4">
                  <input placeholder="🔍 Caută erou..." className="flex-grow border-2 border-black p-2 font-comic" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                  <select className="border-2 border-black p-2 font-comic" value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
                      <option value="ALL">Toate Categoriile</option>
                      {categoryList.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <button onClick={openAddModal} className="bg-black text-white font-heading px-6 py-3 shadow-comic whitespace-nowrap">+ EROU NOU</button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                  {filteredHeroes.map(hero => (
                      <div key={hero.id} onClick={() => openHeroFile(hero)} className="bg-white border-4 border-black p-4 cursor-pointer hover:-translate-y-1 hover:shadow-comic transition-all relative group">
                          <div className="absolute top-2 right-2 bg-yellow-400 border-2 border-black px-2 text-xs font-bold z-10">★ {hero.trustFactor}</div>
                          <div className="aspect-square w-full mb-4 border-2 border-black overflow-hidden bg-gray-200">
                              {hero.avatarUrl ? <img src={hero.avatarUrl} className="w-full h-full object-cover" /> : <div className="flex h-full items-center justify-center text-4xl">🦸‍♂️</div>}
                          </div>
                          <h3 className="font-heading text-xl truncate">{hero.alias}</h3>
                          <span className="text-xs bg-black text-white px-2 py-1 uppercase font-bold">{hero.category}</span>
                          <div className="mt-4 text-center bg-gray-100 border-2 border-dashed border-gray-400 py-1 text-sm font-bold text-gray-500 group-hover:bg-yellow-100 group-hover:text-black group-hover:border-black transition-colors">DESCHIDE DOSAR</div>
                      </div>
                  ))}
              </div>
          </div>
      )}

      {activeTab === 'REQUESTS' && (
          <div className="bg-white border-4 border-black p-2 md:p-4 overflow-x-auto shadow-comic animate-fade-in">
              <table className="w-full text-left border-collapse min-w-[600px]">
                  <thead className="bg-black text-white font-heading text-sm"><tr><th className="p-3">Data</th><th className="p-3">Client</th><th className="p-3">Erou</th><th className="p-3">Status</th><th className="p-3 text-center">Acțiuni</th></tr></thead>
                  <tbody className="font-comic text-sm">
                      {requests.map(req => (
                          <tr key={req.id} className="border-b hover:bg-yellow-50">
                              <td className="p-3">{formatDateTime(req.date)}</td>
                              <td className="p-3 font-bold">{req.clientName}<br/><span className="text-xs font-normal font-mono">{req.clientPhone}</span></td>
                              <td className="p-3">{req.hero?.alias || '?'}</td>
                              <td className="p-3">
                                  <span className={`px-2 py-1 border border-black text-xs font-black shadow-sm ${
                                      req.status==='COMPLETED'?'bg-green-500 text-white':
                                      req.status==='REJECTED'?'bg-red-600 text-white':
                                      req.status==='PENDING'?'bg-yellow-400 text-black':'bg-blue-400 text-white'
                                  }`}>
                                      {req.status}
                                  </span>
                              </td>
                              <td className="p-3 text-center">{req.status === 'COMPLETED' && <button onClick={() => setViewEvidence(req)} className="text-blue-600 hover:underline font-bold text-xs">📷 VEZI DOSAR</button>}</td>
                          </tr>
                      ))}
                  </tbody>
              </table>
          </div>
      )}

      {activeTab === 'APPLICATIONS' && (
          <div className="grid gap-6 md:grid-cols-2 animate-fade-in">
              {applications.length === 0 && <p className="text-gray-500 p-4 font-comic">Momentan nu sunt recruți noi.</p>}
              {applications.map(app => (
                  <div key={app.id} className="bg-yellow-50 border-4 border-black p-6 shadow-comic relative">
                      <div className="absolute -top-3 -right-3 bg-red-600 text-white font-bold px-3 border-2 border-black rotate-3">NOU</div>
                      
                      <h3 className="font-heading text-xl">{app.name}</h3>
                      <p className="font-bold text-sm bg-white inline-block px-2 border border-black mb-4">{app.category}</p>
                      
                      <div className="font-mono text-sm mb-4">
                          <div>📞 {app.phone}</div>
                          <div>✉️ {app.email}</div>
                      </div>

                      {/* --- AICI ESTE MESAJUL EROULUI --- */}
                      {app.message && (
                          <div className="bg-white border-2 border-black p-3 mb-4 relative">
                              <span className="absolute -top-3 left-2 bg-black text-white text-[10px] px-2 font-bold uppercase">Mesaj Motivațional</span>
                              <p className="italic text-sm text-gray-800">"{app.message}"</p>
                          </div>
                      )}
                      {/* --------------------------------- */}

                      <div className="flex gap-2 flex-wrap">
                          <button onClick={() => handleRecruit(app)} className="flex-1 bg-green-500 text-white font-heading py-2 border-2 border-black hover:bg-green-600 shadow-sm">RECRUTEAZĂ</button>
                          <button
                              onClick={async () => {
                                  if (confirm(`Sigur respingi dosarul lui ${app.name}? Se va trimite automat un email de notificare.`)) {
                                      // Așteptăm să se termine ștergerea pe server
                                      await deleteApplication(app.id);
                                      // Abia acum facem refresh la listă
                                      refreshAllData();
                                      alert("🗑️ Candidat respins și notificat!");
                                  }
                              }}
                              className="px-4 bg-red-500 text-white font-bold border-2 border-black hover:bg-red-600 shadow-sm transition-colors"
                          >
                              RESPINGE
                          </button>
                      </div>
                  </div>
              ))}
          </div>
      )}

      {activeTab === 'SETTINGS' && (
          <div className="bg-white border-4 border-black p-6 max-w-2xl mx-auto shadow-comic animate-fade-in">
              <h3 className="font-heading text-2xl mb-4 text-center">GESTIUNE SPECIALIZĂRI</h3>
              <div className="flex gap-2 mb-6">
                  <input placeholder="Ex: Instalator Gaz..." className="flex-grow border-2 border-black p-2 font-bold font-comic" value={newCatInput} onChange={e => setNewCatInput(e.target.value)} />
                  <button onClick={addCategory} className="bg-green-500 text-white font-heading px-4 border-2 border-black shadow-sm hover:bg-green-600">ADAUGĂ</button>
              </div>
              <div className="flex flex-wrap gap-2">
                  {categoryList.map(cat => (
                      <div key={cat} className="bg-white border-2 border-black px-3 py-1 flex items-center gap-2 group hover:shadow-sm transition-all hover:bg-red-50">
                          <span className="font-bold text-sm uppercase">{cat}</span>
                          <button onClick={() => removeCategory(cat)} className="text-red-600 font-black hover:scale-125 ml-2 border-l border-gray-300 pl-2">x</button>
                      </div>
                  ))}
              </div>
          </div>
      )}

      {/* MODAL EROU */}
      {showModal && (
          <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-2 overflow-y-auto">
              <div className="bg-white w-full max-w-5xl border-4 border-white shadow-2xl flex flex-col rounded-sm relative my-auto max-h-[95vh] overflow-y-auto">
                  <button onClick={() => setShowModal(false)} className="absolute top-2 right-2 z-[60] bg-red-600 text-white w-8 h-8 font-black border-2 border-black hover:scale-110 shadow-comic">X</button>
                  
                  <div className="bg-dots p-4 md:p-6 border-b-4 border-black">
                      <div className="flex flex-col md:flex-row gap-6 items-start">
                          <div className="relative group w-32 h-32 md:w-40 md:h-40 flex-shrink-0 mx-auto md:mx-0">
                              <div className="w-full h-full bg-gray-300 border-4 border-black overflow-hidden shadow-comic">
                                  {formData.avatarUrl ? <img src={formData.avatarUrl} className="w-full h-full object-cover" /> : <span className="flex items-center justify-center h-full text-4xl">?</span>}
                              </div>
                              {modalMode !== 'VIEW' && (
                                  <label className="absolute -bottom-2 -right-2 bg-blue-600 text-white p-2 border-2 border-black cursor-pointer hover:bg-blue-700 shadow-md transform hover:scale-110 z-10 rounded-full">
                                      📷 <input type="file" hidden onChange={e => e.target.files?.[0] && handleFileUpload(e.target.files[0], 'avatarUrl')} />
                                  </label>
                              )}
                          </div>
                          <div className="flex-grow w-full md:w-auto h-40 md:h-40 relative border-4 border-black bg-black shadow-sm group">
                              {formData.videoUrl ? (
                                  <video src={formData.videoUrl} controls className="w-full h-full object-cover" />
                              ) : (
                                  <div className="w-full h-full flex flex-col items-center justify-center text-gray-500 font-mono text-xs p-4 text-center">
                                      <span className="text-2xl mb-2">🎬</span>
                                      {modalMode === 'VIEW' ? "FĂRĂ PREZENTARE VIDEO" : "VIDEO NECESAR"}
                                  </div>
                              )}
                              {modalMode !== 'VIEW' && (
                                  <label className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center cursor-pointer transition-opacity z-20">
                                      <span className="bg-white border-2 border-black px-3 py-1 font-bold text-xs hover:bg-yellow-300">
                                          {uploading ? 'UPLOADING...' : 'UPLOAD VIDEO'}
                                      </span>
                                      <input type="file" hidden accept="video/*" onChange={e => e.target.files?.[0] && handleFileUpload(e.target.files[0], 'videoUrl')} />
                                  </label>
                              )}
                          </div>
                          {modalMode === 'VIEW' && (
                              <div className="w-full md:w-auto text-center md:text-right self-center">
                                  <h2 className="font-heading text-2xl uppercase mb-2">{formData.alias}</h2>
                                  <button onClick={() => setModalMode('EDIT')} className="bg-comic-yellow px-6 py-2 font-heading border-2 border-black shadow-comic hover:translate-y-1 text-lg">
                                      ✏️ EDITEAZĂ
                                  </button>
                              </div>
                          )}
                      </div>
                  </div>

                  <div className="p-4 md:p-6 bg-white">
                      {modalMode === 'VIEW' ? (
                          <div className="space-y-6">
                                <div className="grid md:grid-cols-2 gap-4 text-sm font-mono">
                                    <div className="border-2 border-black p-3 bg-gray-50">
                                        <div className="font-bold text-gray-500">NUME REAL:</div> {formData.realName}
                                        <div className="font-bold text-gray-500 mt-2">TELEFON:</div> {formData.phone}
                                        <div className="font-bold text-gray-500 mt-2">EMAIL:</div> {formData.email}
                                    </div>
                                    <div className="border-2 border-black p-3 bg-gray-50">
                                        <div className="font-bold text-gray-500">CATEGORIE:</div> {formData.category}
                                        <div className="font-bold text-gray-500 mt-2">TARIF:</div> {formData.hourlyRate} RON/h
                                        <div className="font-bold text-gray-500 mt-2">TRUST FACTOR:</div> {formData.trustFactor}/100
                                    </div>
                                </div>
                                <div className="border-2 border-black p-3 bg-white">
                                    <h3 className="font-heading text-sm bg-black text-white px-2 inline-block mb-2">DESCRIERE</h3>
                                    <p className="italic">{formData.description || "N/A"}</p>
                                </div>
                                
                                <div className="grid md:grid-cols-2 gap-6">
                                    <div>
                                        <h3 className="font-heading text-sm mb-2 bg-blue-600 text-white px-2 inline-block">ZONE DE ACȚIUNE</h3>
                                        <div className="pointer-events-none opacity-90 border-2 border-black p-2 max-h-[300px] overflow-hidden">
                                            <div className="transform scale-90 origin-top">
                                                <RomaniaMap value={formData.actionAreas || []} className="w-full h-auto" />
                                            </div>
                                        </div>
                                        <p className="text-xs font-bold mt-1">Județe: {formData.actionAreas?.join(', ') || 'Niciunul'}</p>
                                    </div>
                                    <div>
                                        <h3 className="font-heading text-sm mb-2 bg-black text-white px-2 inline-block">ISTORIC MISIUNI</h3>
                                        <div className="border-2 border-black max-h-[300px] overflow-y-auto bg-gray-50">
                                            {heroMissions.length === 0 ? <p className="p-4 italic text-gray-500 text-sm">Nicio misiune.</p> : (
                                                <table className="w-full text-left text-xs">
                                                    <thead className="bg-gray-200 font-bold sticky top-0 border-b border-black">
                                                        <tr><th className="p-2">Data</th><th className="p-2">Client</th><th className="p-2">Status</th><th className="p-2">Dovadă</th></tr>
                                                    </thead>
                                                    <tbody>
                                                        {heroMissions.map(m => (
                                                            <tr key={m.id} className="border-b border-gray-200">
                                                                <td className="p-2 whitespace-nowrap">{formatDateTime(m.date)}</td>
                                                                <td className="p-2">{m.clientName}</td>
                                                                <td className="p-2">
                                                                    <span className={`px-2 py-1 text-[10px] font-bold border border-black ${
                                                                        m.status === 'COMPLETED' ? 'bg-green-400' : 
                                                                        m.status === 'REJECTED' ? 'bg-red-500 text-white' : 
                                                                        m.status === 'PENDING' ? 'bg-yellow-300' : 'bg-blue-300'
                                                                    }`}>
                                                                        {m.status}
                                                                    </span>
                                                                </td>
                                                                <td className="p-2">{m.status === 'COMPLETED' && <button onClick={() => setViewEvidence(m)} className="text-blue-600 underline font-bold">FOTO</button>}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            )}
                                        </div>
                                    </div>
                                </div>
                          </div>
                      ) : (
                          <form onSubmit={handleSave} className="space-y-4">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <div>
                                      <label className="font-bold text-xs">ALIAS</label>
                                      <input required className="w-full border-2 border-black p-2 font-bold bg-yellow-50" value={formData.alias} onChange={e => setFormData({...formData, alias: e.target.value})} />
                                  </div>
                                  <div>
                                      <label className="font-bold text-xs">CATEGORIE</label>
                                      {!isCustomCat ? (
                                          <select className="w-full border-2 border-black p-2" value={formData.category} onChange={e => {
                                              if(e.target.value === 'NEW') setIsCustomCat(true); else setFormData({...formData, category: e.target.value});
                                          }}>
                                              {categoryList.map(c => <option key={c} value={c}>{c}</option>)}
                                              <option value="NEW" className="text-red-600 font-bold">+ Nouă</option>
                                          </select>
                                      ) : (
                                          <div className="flex"><input autoFocus className="w-full border-2 border-black p-2 bg-yellow-50" value={formCustomCat} onChange={e => setFormCustomCat(e.target.value)} /><button type="button" onClick={() => setIsCustomCat(false)} className="bg-red-500 text-white px-2 border-2 border-black">X</button></div>
                                      )}
                                  </div>
                              </div>
                              <div className="grid grid-cols-2 gap-4">
                                  <input placeholder="Nume Real" className="border-2 border-black p-2" value={formData.realName} onChange={e => setFormData({...formData, realName: e.target.value})} />
                                  {/* === MODIFICARE 2: Input Number cu parseFloat === */}
                                  <input 
                                      type="number" 
                                      placeholder="Tarif (RON)" 
                                      className="border-2 border-black p-2" 
                                      value={formData.hourlyRate} 
                                      onChange={e => setFormData({...formData, hourlyRate: parseFloat(e.target.value) || 0})} 
                                  />
                                  {/* ================================================= */}
                              </div>
                              <div className="grid grid-cols-2 gap-4">
                                  <input placeholder="Telefon" className="border-2 border-black p-2" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} />
                                  <input placeholder="Email" className="border-2 border-black p-2" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
                              </div>
                              <div className="grid grid-cols-2 gap-4 bg-blue-50 p-2 border-2 border-blue-200">
                                  <input placeholder="Username Login" className="border-2 border-black p-2" value={formData.username} onChange={e => setFormData({...formData, username: e.target.value})} />
                                  <input placeholder="Password (Optional)" className="border-2 border-black p-2" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} />
                              </div>
                              <textarea rows={2} placeholder="Descriere erou..." className="w-full border-2 border-black p-2" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} />
                              
                              <div className="bg-yellow-200 p-4 border-2 border-black text-center shadow-comic">
                                  <p className="font-heading text-lg">TRUST FACTOR</p>
                                  <div className="flex items-center justify-center gap-4 my-2">
                                      <button type="button" onClick={() => setFormData({...formData, trustFactor: formData.trustFactor - 1})} className="w-8 h-8 bg-red-500 text-white font-black border-2 border-black hover:scale-110">-</button>
                                      <span className="text-3xl font-black">{formData.trustFactor}</span>
                                      <button type="button" onClick={() => setFormData({...formData, trustFactor: formData.trustFactor + 1})} className="w-8 h-8 bg-green-500 text-white font-black border-2 border-black hover:scale-110">+</button>
                                  </div>
                              </div>

                              <div className="bg-blue-50 border-4 border-black p-4 mt-4">
                                  <h3 className="font-heading text-sm text-center mb-2">ZONE DE ACȚIUNE</h3>
                                  <div className="mb-4">
                                      <select className="w-full border-2 border-black p-2 font-bold mb-2" 
                                          onChange={(e) => { if(e.target.value) toggleArea(e.target.value); e.target.value = ""; }}>
                                          <option value="">+ Adaugă Județ din Listă</option>
                                          {ROMANIAN_COUNTIES.map(c => (
                                              <option key={c} value={c} disabled={formData.actionAreas?.includes(c)}>{formData.actionAreas?.includes(c) ? `✓ ${c}` : c}</option>
                                          ))}
                                      </select>
                                      <div className="flex flex-wrap gap-2 mb-2">
                                          {formData.actionAreas?.map((area: string) => (
                                              <span key={area} onClick={() => toggleArea(area)} className="cursor-pointer bg-white border border-black px-2 py-1 text-xs font-bold hover:bg-red-100 flex items-center gap-1 group">
                                                  {area} <span className="text-red-500 group-hover:font-black">x</span>
                                              </span>
                                          ))}
                                      </div>
                                  </div>
                                  <div className="w-full max-w-md mx-auto relative border-2 border-black bg-white overflow-hidden" style={{ maxHeight: '300px' }}>
                                      <div className="transform scale-90 origin-top">
                                          <RomaniaMap value={formData.actionAreas || []} onToggle={toggleArea} className="w-full h-auto" />
                                      </div>
                                  </div>
                              </div>
                              <div className="flex gap-4 pt-4 border-t-4 border-black mt-4">
                                  <button disabled={uploading} className="flex-1 bg-green-500 text-white font-heading py-3 border-4 border-black shadow-comic text-lg hover:bg-green-600">
                                      {uploading ? '...' : '💾 SALVEAZĂ'}
                                  </button>
                                  {modalMode === 'EDIT' && <button type="button" onClick={handleDeleteHero} className="bg-red-600 text-white font-bold px-4 border-4 border-black">ȘTERGE</button>}
                              </div>
                          </form>
                      )}
                  </div>
              </div>
          </div>
      )}

      {/* MODAL EVIDENȚE CU ORA */}
      {viewEvidence && (
          <div className="fixed inset-0 bg-black/90 z-[70] flex items-center justify-center p-2 sm:p-4">
              <div className="bg-white p-3 sm:p-6 max-w-4xl w-full border-4 border-white overflow-y-auto max-h-[95vh] shadow-2xl">
                  
                  {/* HEADER */}
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4 pb-3 border-b-4 border-black">
                      <div>
                          <h2 className="font-heading text-xl sm:text-2xl">PROBE: {viewEvidence.clientName}</h2>
                          <p className="text-xs text-gray-600 font-mono mt-1">ID: #{viewEvidence.id.slice(0, 8)} • {formatDateTime(viewEvidence.date)}</p>
                      </div>
                      <button 
                          onClick={handlePrintDossier} 
                          className="w-full sm:w-auto bg-blue-600 text-white font-bold px-4 py-2 sm:py-3 border-2 border-black hover:bg-blue-700 shadow-comic flex items-center justify-center gap-2 text-sm sm:text-base"
                      >
                          🖨️ PRINTEAZĂ DOSAR
                      </button>
                  </div>

                  {/* GRID POZE */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                      {/* ÎNAINTE */}
                      <div className="text-center">
                          <div className="bg-red-600 text-white font-bold px-3 py-1 mb-3 inline-block border-2 border-black text-sm transform -rotate-2">
                              ÎNAINTE
                          </div>
                          <div className="border-4 border-black bg-gray-100 p-2 flex items-center justify-center min-h-[200px] sm:min-h-[300px]">
                              {viewEvidence.photoBefore ? (
                                  <img src={viewEvidence.photoBefore} className="w-full h-auto object-contain max-h-[400px]" alt="Înainte" />
                              ) : (
                                  <div className="p-8 text-sm font-bold text-gray-400">LIPSĂ</div>
                              )}
                          </div>
                          <div className="bg-black text-white px-3 py-1 text-xs font-bold mt-2 inline-block">
                              📅 {formatDateTime(viewEvidence.date)}
                          </div>
                          {viewEvidence.photoBefore && (
                              <button 
                                  onClick={() => downloadImage(viewEvidence.photoBefore!, `inainte-${viewEvidence.id.slice(0,8)}.jpg`)}
                                  className="block w-full mt-3 text-sm font-bold border-3 border-blue-600 bg-blue-50 text-blue-700 py-2 hover:bg-blue-600 hover:text-white transition-colors shadow-sm"
                              >
                                  ⬇️ DESCARCĂ ORIGINAL
                              </button>
                          )}
                      </div>
                      
                      {/* DUPĂ */}
                      <div className="text-center">
                          <div className="bg-green-600 text-white font-bold px-3 py-1 mb-3 inline-block border-2 border-black text-sm transform rotate-2">
                              DUPĂ
                          </div>
                          <div className="border-4 border-black bg-gray-100 p-2 flex items-center justify-center min-h-[200px] sm:min-h-[300px]">
                              {viewEvidence.photoAfter ? (
                                  <img src={viewEvidence.photoAfter} className="w-full h-auto object-contain max-h-[400px]" alt="După" />
                              ) : (
                                  <div className="p-8 text-sm font-bold text-gray-400">LIPSĂ</div>
                              )}
                          </div>
                          <div className="bg-black text-white px-3 py-1 text-xs font-bold mt-2 inline-block">
                              📅 {formatDateTime(viewEvidence.date)}
                          </div>
                          {viewEvidence.photoAfter && (
                              <button 
                                  onClick={() => downloadImage(viewEvidence.photoAfter!, `dupa-${viewEvidence.id.slice(0,8)}.jpg`)}
                                  className="block w-full mt-3 text-sm font-bold border-3 border-blue-600 bg-blue-50 text-blue-700 py-2 hover:bg-blue-600 hover:text-white transition-colors shadow-sm"
                              >
                                  ⬇️ DESCARCĂ ORIGINAL
                              </button>
                          )}
                      </div>
                  </div>

                  {/* FOOTER */}
                  <button 
                      onClick={() => setViewEvidence(null)} 
                      className="mt-6 w-full bg-black text-white py-3 font-heading border-2 border-gray-500 hover:bg-gray-800 text-sm sm:text-base shadow-comic"
                  >
                      ÎNCHIDE FEREASTRA
                  </button>
              </div>
          </div>
      )}

    </div>
  );
};
