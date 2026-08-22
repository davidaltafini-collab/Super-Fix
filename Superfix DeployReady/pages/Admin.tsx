import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  MagnifyingGlass, Plus, Minus, X, SignOut, ArrowsClockwise, DownloadSimple,
  Printer, PencilSimple, FloppyDisk, Trash, Camera, VideoCamera, ImageSquare,
  Pulse, Broom, Warning,
} from '@phosphor-icons/react';
import { JobCategory, Hero, ServiceRequest } from '../types';
import { 
    createHero, getAllRequests, loginUser, logoutUser, 
    getApplications, deleteApplication, getHeroes, 
    updateHero, deleteHero 
} from '../services/dataService';
import { RomaniaMap } from '../components/RomaniaMap';
import { API_URL } from '../config/api';
import { uploadSignedMedia, uploadErrorText } from '../services/mediaUpload';
import { useToast } from '../components/Toast';
import { SuperfixMark } from '../components/SuperfixMark';
import { PhotoCropper } from '../components/PhotoCropper';
import { netLog, onNetLog, clearNetLog, NetEntry } from '../services/netlog';
import { thumb } from '../lib/img';

import './admin.css';

const ROMANIAN_COUNTIES = [
  "Alba", "Arad", "Argeș", "Bacău", "Bihor", "Bistrița-Năsăud", "Botoșani", "Brașov", 
  "Brăila", "București", "Buzău", "Caraș-Severin", "Călărași", "Cluj", "Constanța", 
  "Covasna", "Dâmbovița", "Dolj", "Galați", "Giurgiu", "Gorj", "Harghita", "Hunedoara", 
  "Ialomița", "Iași", "Ilfov", "Maramureș", "Mehedinți", "Mureș", "Neamț", "Olt", 
  "Prahova", "Satu Mare", "Sălaj", "Sibiu", "Suceava", "Teleorman", "Timiș", "Tulcea", 
  "Vâlcea", "Vaslui", "Vrancea"
];
const DEFAULT_AVATAR = "https://super-fix.ro/revizie.png"; // Pui link-ul tău real aici

type PayoutBatch = {
  id: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  totalBani: number;
  reference?: string | null;
  createdAt: string;
  paidAt?: string | null;
  itemCount?: number;
  recruiterCount?: number;
  _count?: { items?: number };
};

export const Admin: React.FC = () => {
  const toast = useToast();
  // === STATE ===
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [usernameInput, setUsernameInput] = useState('admin');
  const [passwordInput, setPasswordInput] = useState('');
  
  const [activeTab, setActiveTab] = useState<'HEROES' | 'REQUESTS' | 'APPLICATIONS' | 'RECRUITERS' | 'PAYOUTS' | 'SETTINGS' | 'LOGS'>('HEROES');
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [applications, setApplications] = useState<any[]>([]);
  const [heroes, setHeroes] = useState<Hero[]>([]);
  
  const [categoryList, setCategoryList] = useState<string[]>(Object.values(JobCategory));
  const [newCatInput, setNewCatInput] = useState('');

  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('ALL');
  const [uploading, setUploading] = useState(false);

  const [recruiters, setRecruiters] = useState<any[]>([]);
  const [recruiterLoading, setRecruiterLoading] = useState(false);
  const [recruiterError, setRecruiterError] = useState('');
  const [recruiterAction, setRecruiterAction] = useState<string | null>(null);

  const [payouts, setPayouts] = useState<PayoutBatch[]>([]);
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [payoutAction, setPayoutAction] = useState<string | null>(null);
  const [payoutError, setPayoutError] = useState('');
  const [transferReferences, setTransferReferences] = useState<Record<string, string>>({});

  const [showModal, setShowModal] = useState(false);
  // poza aleasă pentru fișa eroului, înainte de decupaj
  const [toCrop, setToCrop] = useState<File | null>(null);

  /* Jurnalul de apeluri. `netlog` tine un inel in memorie si ne anunta cand se
     schimba; nu-l interogam pe cronometru. */
  const [logs, setLogs] = useState<NetEntry[]>([]);
  const [onlyBad, setOnlyBad] = useState(false);

  useEffect(() => {
    if (activeTab !== 'LOGS') return;
    setLogs(netLog());
    return onNetLog(() => setLogs(netLog()));
  }, [activeTab]);
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
        else { setIsAuthenticated(false); if (token) logoutUser(); }

        const savedCats = localStorage.getItem('superfix_full_categories');
        if (savedCats) setCategoryList(JSON.parse(savedCats));
    }, []);

    useEffect(() => {
        if (!isAuthenticated) return;
        refreshAllData();
    }, [isAuthenticated, activeTab]);

    /* Coada de aprobare a profilurilor a fost retrasă de pe server: `/api/hero/basics`
       salvează direct. Tabul „Modificări", funcțiile de aprobare și alerta din fișa
       eroului rămăseseră aici, dar nu puteau afișa niciodată nimic — `fetchUpdates`
       punea o listă goală, iar butonul de aprobare doar spunea că workflow-ul nu
       mai există. Le-am scos. */

    const readApiError = async (response: Response, fallback: string) => {
        try {
            const data = await response.json();
            return data.message || data.error || fallback;
        } catch {
            return fallback;
        }
    };

    const fetchPayouts = async () => {
        const token = localStorage.getItem('superfix_token');
        if (!token) return;
        setPayoutLoading(true);
        setPayoutError('');
        try {
            const response = await fetch(`${API_URL}/admin/payouts`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (response.status === 401 || response.status === 403) {
                logoutUser();
                setIsAuthenticated(false);
                throw new Error('Sesiunea de administrator a expirat. Autentifică-te din nou.');
            }
            if (!response.ok) throw new Error(await readApiError(response, 'Lista de payout-uri nu a putut fi încărcată.'));
            const data = await response.json();
            const batches = Array.isArray(data) ? data : (data.batches || data.payouts || []);
            setPayouts(Array.isArray(batches) ? batches : []);
        } catch (error) {
            setPayoutError(error instanceof Error ? error.message : 'Lista de payout-uri nu a putut fi încărcată.');
        } finally {
            setPayoutLoading(false);
        }
    };

    const createPayoutBatch = async () => {
        if (!(await toast.confirm('Creezi un batch catch-up cu toate comisioanele eligibile și neincluse în alte batch-uri?', { confirmLabel: 'Creez batch' }))) return;
        const token = localStorage.getItem('superfix_token');
        if (!token) return;
        setPayoutAction('create');
        setPayoutError('');
        try {
            const response = await fetch(`${API_URL}/admin/payouts`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!response.ok) throw new Error(await readApiError(response, 'Batch-ul nu a putut fi creat.'));
            await fetchPayouts();
        } catch (error) {
            setPayoutError(error instanceof Error ? error.message : 'Batch-ul nu a putut fi creat.');
        } finally {
            setPayoutAction(null);
        }
    };

    const downloadPayoutCsv = async (batch: PayoutBatch) => {
        const token = localStorage.getItem('superfix_token');
        if (!token) return;
        setPayoutAction(`export:${batch.id}`);
        setPayoutError('');
        try {
            const response = await fetch(`${API_URL}/admin/payouts/${encodeURIComponent(batch.id)}/export`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!response.ok) throw new Error(await readApiError(response, 'Fișierul CSV nu a putut fi generat.'));
            const blob = await response.blob();
            const contentDisposition = response.headers.get('Content-Disposition') || '';
            const filenameMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
            const filename = (filenameMatch?.[1] || `superfix-payout-${batch.id}.csv`).replace(/[^a-zA-Z0-9._-]/g, '_');
            const objectUrl = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = objectUrl;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 1000);
            await fetchPayouts();
        } catch (error) {
            setPayoutError(error instanceof Error ? error.message : 'Fișierul CSV nu a putut fi generat.');
        } finally {
            setPayoutAction(null);
        }
    };

    const markPayoutPaid = async (batch: PayoutBatch) => {
        const reference = (transferReferences[batch.id] || '').trim();
        if (!reference) {
            setPayoutError('Introdu referința transferului înainte de confirmarea plății.');
            return;
        }
        if (!(await toast.confirm(`Confirmi că batch-ul ${batch.id.slice(0, 8)} a fost transferat? Referință: ${reference}`, { confirmLabel: 'Confirm transferul' }))) return;
        const token = localStorage.getItem('superfix_token');
        if (!token) return;
        setPayoutAction(`paid:${batch.id}`);
        setPayoutError('');
        try {
            const response = await fetch(`${API_URL}/admin/payouts/${encodeURIComponent(batch.id)}/mark-paid`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ reference }),
            });
            if (!response.ok) throw new Error(await readApiError(response, 'Payout-ul nu a putut fi marcat ca plătit.'));
            setTransferReferences((current) => {
                const next = { ...current };
                delete next[batch.id];
                return next;
            });
            await fetchPayouts();
        } catch (error) {
            setPayoutError(error instanceof Error ? error.message : 'Payout-ul nu a putut fi marcat ca plătit.');
        } finally {
            setPayoutAction(null);
        }
    };

    const cancelPayoutBatch = async (batch: PayoutBatch) => {
        const reason = window.prompt('Motivul anulării batch-ului (minimum 5 caractere):')?.trim() || '';
        if (reason.length < 5) {
            setPayoutError('Anularea cere un motiv de minimum 5 caractere.');
            return;
        }
        if (!(await toast.confirm(`Anulezi batch-ul ${batch.id.slice(0, 8)} și eliberezi comisioanele pentru un batch nou?`, { confirmLabel: 'Anulez batch-ul', danger: true }))) return;
        const token = localStorage.getItem('superfix_token');
        if (!token) return;
        setPayoutAction(`cancel:${batch.id}`);
        setPayoutError('');
        try {
            const response = await fetch(`${API_URL}/admin/payouts/${encodeURIComponent(batch.id)}/cancel`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ reason }),
            });
            if (!response.ok) throw new Error(await readApiError(response, 'Batch-ul nu a putut fi anulat.'));
            await fetchPayouts();
        } catch (error) {
            setPayoutError(error instanceof Error ? error.message : 'Batch-ul nu a putut fi anulat.');
        } finally {
            setPayoutAction(null);
        }
    };

    const fetchRecruiters = async () => {
        const token = localStorage.getItem('superfix_token');
        if (!token) return;
        setRecruiterLoading(true);
        setRecruiterError('');
        try {
            const response = await fetch(`${API_URL}/admin/recruiters`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (response.status === 401 || response.status === 403) {
                logoutUser();
                setIsAuthenticated(false);
                throw new Error('Sesiunea de administrator a expirat. Autentifică-te din nou.');
            }
            if (!response.ok) throw new Error(await readApiError(response, 'Lista de recruiteri nu a putut fi încărcată.'));
            const data = await response.json();
            setRecruiters(Array.isArray(data) ? data : []);
        } catch (error) {
            setRecruiterError(error instanceof Error ? error.message : 'Lista de recruiteri nu a putut fi încărcată.');
        } finally {
            setRecruiterLoading(false);
        }
    };

    const recruiterRequest = async (id: string, path: string, actionKey: string, body?: any) => {
        const token = localStorage.getItem('superfix_token');
        if (!token) return;
        setRecruiterAction(actionKey);
        setRecruiterError('');
        try {
            const response = await fetch(`${API_URL}/admin/recruiters/${encodeURIComponent(id)}/${path}`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: body ? JSON.stringify(body) : undefined,
            });
            if (!response.ok) throw new Error(await readApiError(response, 'Acțiunea nu a putut fi executată.'));
            await fetchRecruiters();
        } catch (error) {
            setRecruiterError(error instanceof Error ? error.message : 'Acțiunea nu a putut fi executată.');
        } finally {
            setRecruiterAction(null);
        }
    };

    const approveRecruiter = async (rec: any) => {
        if (!(await toast.confirm(`Aprobi recruiterul ${rec.name}? Va primi pe email codul personal ${rec.code}.`, { confirmLabel: 'Aprob' }))) return;
        return recruiterRequest(rec.id, 'approve', `approve:${rec.id}`);
    };

    const rejectRecruiter = (rec: any) => {
        const reason = window.prompt(`Motivul respingerii pentru ${rec.name} (minimum 5 caractere):`)?.trim() || '';
        if (reason.length < 5) {
            setRecruiterError('Respingerea cere un motiv de minimum 5 caractere.');
            return;
        }
        return recruiterRequest(rec.id, 'reject', `reject:${rec.id}`, { reason });
    };

    const suspendRecruiter = async (rec: any) => {
        if (!(await toast.confirm(`Suspenzi recruiterul ${rec.name}? Sesiunile lui vor fi invalidate.`, { confirmLabel: 'Suspend', danger: true }))) return;
        return recruiterRequest(rec.id, 'suspend', `suspend:${rec.id}`);
    };

    const reactivateRecruiter = async (rec: any) => {
        if (!(await toast.confirm(`Reactivezi recruiterul ${rec.name}?`, { confirmLabel: 'Reactivez' }))) return;
        return recruiterRequest(rec.id, 'reactivate', `reactivate:${rec.id}`);
    };

    const refreshAllData = () => {
        getHeroes().then(setHeroes);
        getAllRequests().then(setRequests);
        getApplications().then(setApplications);
        if (activeTab === 'PAYOUTS') fetchPayouts();
        if (activeTab === 'RECRUITERS') fetchRecruiters();
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
            toast.error('Contul acesta nu are drepturi de administrator.');
            logoutUser();
        }
    } else toast.error('Date incorecte.');
  };

  const handleLogout = () => { logoutUser(); setIsAuthenticated(false); };

  const addCategory = () => {
      if (!newCatInput.trim() || categoryList.includes(newCatInput)) return;
      const updated = [...categoryList, newCatInput];
      setCategoryList(updated);
      localStorage.setItem('superfix_full_categories', JSON.stringify(updated));
      setNewCatInput('');
  };

  const removeCategory = async (cat: string) => {
      if (await toast.confirm(`Sigur ștergi categoria "${cat}"?`, { confirmLabel: 'Șterg', danger: true })) {
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
        // Autocompletează totul cu date "Basic", dar lasă totul editabil!
        setFormData({
            alias: app.name || 'Recrut Nou',
            realName: app.name || '',
            username: (app.email ? app.email.split('@')[0] : 'user') + Math.floor(Math.random() * 1000),
            password: 'Hero' + Math.floor(Math.random() * 1000) + '!',
            category: app.category,
            description: 'Agent nou recrutat. Profilul și identitatea vizuală sunt în curs de actualizare.',
            hourlyRate: 100,
            avatarUrl: '',
            videoUrl: '',
            email: app.email || '',
            phone: app.phone || '',
            location: 'București',
            powers: '',
            trustFactor: 50,
            actionAreas: []
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
          if (recruitingAppId) (payload as any).applicationId = recruitingAppId;
          success = await createHero(payload);
          if(success && recruitingAppId) setRecruitingAppId(null);
      }

      if(success) { setShowModal(false); refreshAllData(); toast.success('Eroul a fost salvat.'); }
      else toast.error('Salvarea a eșuat. Încearcă din nou.');
  };

  const handleDeleteHero = async () => {
      if (selectedHero && (await toast.confirm(`Ștergi definitiv eroul ${selectedHero.alias}?`, { confirmLabel: 'Șterg', danger: true }))) {
          await deleteHero(selectedHero.id);
          setShowModal(false);
          refreshAllData();
          toast.success('Erou șters.');
      }
  };

  const handleFileUpload = async (file: File, field: 'avatarUrl' | 'videoUrl') => {
      setUploading(true);
      try {
          const kind = field === 'videoUrl' ? 'video' : 'image';
          const result = await uploadSignedMedia(file, kind);
          if (result.url) setFormData((prev: any) => ({ ...prev, [field]: result.url }));
          else toast.error(uploadErrorText(result.reason || 'network', kind));
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
          toast.info('Nu există poză de descărcat.');
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

  const formatMoney = (amountBani: number) => new Intl.NumberFormat('ro-RO', {
      style: 'currency',
      currency: 'RON',
      minimumFractionDigits: 2,
  }).format((Number(amountBani) || 0) / 100);

  // === PRINTARE DOSAR ÎMBUNĂTĂȚIT ===
  const handlePrintDossier = () => {
      if (!viewEvidence) return;

      const printWindow = window.open('', '_blank', 'width=900,height=1200');
      if (!printWindow) {
          toast.error('Permite ferestrele pop-up ca să poți printa.');
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
            <div class="subtitle">Raport oficial de intervenție</div>
            <div class="header-right">
              <div>ID: #${escapeHtml(viewEvidence.id.slice(0, 8))}</div>
              <div style="margin-top: 5px;">${formatDateTime(viewEvidence.date)}</div>
            </div>
          </div>

          <div class="motivational">
            ⚡ MISIUNE COMPLETATĂ CU SUCCES ⚡
          </div>

          <table>
            <thead>
                <tr>
                    <th>👤 Client</th>
                    <th>Telefon</th>
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
              <div class="badge badge-before">ÎNAINTE</div>
              <div class="img-wrap">
                ${viewEvidence.photoBefore 
                    ? `<img src="${escapeHtml(viewEvidence.photoBefore)}" alt="Înainte" />` 
                    : '<div class="img-placeholder">LIPSĂ</div>'}
              </div>
              <div class="photo-date">${formatDateTime(viewEvidence.date)}</div>
            </div>
            <div class="box">
              <div class="badge badge-after">✓ DUPĂ</div>
              <div class="img-wrap">
                ${viewEvidence.photoAfter 
                    ? `<img src="${escapeHtml(viewEvidence.photoAfter)}" alt="După" />` 
                    : '<div class="img-placeholder">LIPSĂ</div>'}
              </div>
              <div class="photo-date">${formatDateTime(viewEvidence.date)}</div>
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

  /* Numele stărilor, o singură dată. Serverul le trimite în engleză și cu
     majuscule; pe ecran n-au ce căuta așa. */
  const MISSION_STATE: Record<string, { word: string; tone: string }> = {
    PENDING: { word: 'Așteaptă', tone: 'wait' },
    ACCEPTED: { word: 'Acceptată', tone: 'info' },
    IN_PROGRESS: { word: 'În lucru', tone: 'info' },
    COMPLETED: { word: 'Finalizată', tone: 'live' },
    REJECTED: { word: 'Refuzată', tone: 'stop' },
    CANCELLED: { word: 'Anulată', tone: 'off' },
  };

  const RECRUITER_STATE: Record<string, { word: string; tone: string }> = {
    PENDING: { word: 'De verificat', tone: 'wait' },
    ACTIVE: { word: 'Activ', tone: 'live' },
    SUSPENDED: { word: 'Suspendat', tone: 'stop' },
    REJECTED: { word: 'Respins', tone: 'off' },
  };

  const PAYOUT_STATE: Record<string, { word: string; tone: string }> = {
    DRAFT: { word: 'Ciornă', tone: 'wait' },
    EXPORTED: { word: 'Exportat', tone: 'info' },
    PAID: { word: 'Plătit', tone: 'live' },
    CANCELLED: { word: 'Anulat', tone: 'off' },
  };

  const State: React.FC<{ map: Record<string, { word: string; tone: string }>; value?: string }> = ({ map, value }) => {
    const found = map[value || ''] ?? { word: value || '—', tone: 'off' };
    return <span className="adm-state" data-tone={found.tone}>{found.word}</span>;
  };

  const pendingRecruiters = recruiters.filter(r => r.status === 'PENDING').length;

  const TABS = [
    { key: 'HEROES', label: 'Eroi', count: 0 },
    { key: 'REQUESTS', label: 'Misiuni', count: 0 },
    { key: 'APPLICATIONS', label: 'Recrutare', count: applications.length },
    { key: 'RECRUITERS', label: 'Recruiteri', count: pendingRecruiters },
    { key: 'PAYOUTS', label: 'Plăți', count: 0 },
    { key: 'SETTINGS', label: 'Setări', count: 0 },
    { key: 'LOGS', label: 'Jurnal', count: 0 },
  ] as const;

  /* ---------------- poarta ---------------- */
  if (!isAuthenticated) return (
    <div className="flex min-h-screen items-center justify-center px-5 font-sans text-graphite">
      <form onSubmit={handleLogin} className="adm adm-card w-full max-w-sm p-7">
        <SuperfixMark className="mx-auto h-14 w-14" />
        <h1 className="mt-5 text-center font-heading text-2xl font-bold text-graphite">Cartierul general</h1>
        <p className="mt-2 text-center text-sm text-graphite-soft">Doar pentru conturile cu drepturi de administrator.</p>

        <div className="mt-6 space-y-3">
          <div>
            <label htmlFor="adm-user" className="adm-label">Utilizator</label>
            <input
              id="adm-user"
              className="adm-input"
              autoComplete="username"
              value={usernameInput}
              onChange={e => setUsernameInput(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="adm-pass" className="adm-label">Parolă</label>
            <input
              id="adm-pass"
              type="password"
              className="adm-input"
              autoComplete="current-password"
              value={passwordInput}
              onChange={e => setPasswordInput(e.target.value)}
            />
          </div>
        </div>

        <button type="submit" className="adm-btn adm-btn--main mt-6 w-full">Intră</button>
      </form>
    </div>
  );

  return (
    <div className="adm min-h-screen px-4 pb-24 pt-28 font-sans text-graphite sm:px-6">
      <div className="mx-auto max-w-7xl">
        {/* ---------------- bara de sus ---------------- */}
        <header className="adm-card flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <SuperfixMark className="h-9 w-9 shrink-0" />
            <div>
              <h1 className="font-heading text-lg leading-tight text-graphite">Cartierul general</h1>
              <p className="text-xs text-graphite-soft">
                <span className="adm-num">{heroes.length}</span> eroi ·{' '}
                <span className="adm-num">{requests.length}</span> misiuni
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 overflow-x-auto">
            <div className="adm-tabs" role="tablist" aria-label="Secțiuni">
              {TABS.map(tab => (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab.key}
                  onClick={() => setActiveTab(tab.key as typeof activeTab)}
                  className="adm-tab"
                >
                  {tab.label}
                  {tab.count > 0 && <span className="adm-tab__count adm-num">{tab.count}</span>}
                </button>
              ))}
            </div>

            <button type="button" onClick={handleLogout} className="adm-btn adm-btn--quiet shrink-0">
              <SignOut size={15} weight="bold" aria-hidden="true" />
              Ieșire
            </button>
          </div>
        </header>

        {/* ---------------- EROI ---------------- */}
        {activeTab === 'HEROES' && (
          <section className="mt-5">
            <div className="adm-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <MagnifyingGlass
                  size={16}
                  weight="bold"
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-graphite-soft"
                  aria-hidden="true"
                />
                <input
                  className="adm-input pl-9"
                  placeholder="Caută după nume de erou…"
                  aria-label="Caută erou"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>
              {/* Într-un rând flex, `width: 100%` din `.adm-input` bate lățimea din
                  markup, iar lista înghițea tot spațiul câmpului de căutare.
                  Lățimea o ține învelișul, nu controlul. */}
              <div className="sm:w-56 sm:shrink-0">
                <select
                  className="adm-input"
                  aria-label="Filtrează după meserie"
                  value={filterCategory}
                  onChange={e => setFilterCategory(e.target.value)}
                >
                  <option value="ALL">Toate meseriile</option>
                  {categoryList.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <button type="button" onClick={openAddModal} className="adm-btn adm-btn--main">
                <Plus size={15} weight="bold" aria-hidden="true" />
                Erou nou
              </button>
            </div>

            {filteredHeroes.length === 0 ? (
              <p className="adm-card mt-5 p-8 text-center text-sm text-graphite-soft">
                {heroes.length === 0
                  ? 'Încă nu e niciun erou în bază.'
                  : 'Niciun erou nu se potrivește cu ce ai căutat.'}
              </p>
            ) : (
              <div className="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
                {filteredHeroes.map(hero => (
                  <button key={hero.id} type="button" onClick={() => openHeroFile(hero)} className="adm-hero">
                    <div className="adm-hero__pic">
                      <img src={thumb(hero.avatarUrl || DEFAULT_AVATAR, 420, { square: true })} alt="" loading="lazy" />
                      <span className="adm-hero__trust">{hero.trustFactor}</span>
                    </div>
                    <div className="p-3">
                      <p className="truncate font-heading text-base leading-tight text-graphite">{hero.alias}</p>
                      <p className="mt-1 truncate text-xs text-graphite-soft">{hero.category}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>
        )}

        {/* ---------------- MISIUNI ---------------- */}
        {activeTab === 'REQUESTS' && (
          <section className="adm-card adm-scroll mt-5">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Client</th>
                  <th>Erou</th>
                  <th>Stare</th>
                  <th className="text-right">Dovezi</th>
                </tr>
              </thead>
              <tbody>
                {requests.length === 0 && (
                  <tr><td colSpan={5} className="py-10 text-center text-graphite-soft">Nicio misiune încă.</td></tr>
                )}
                {requests.map(req => (
                  <tr key={req.id}>
                    <td className="adm-num whitespace-nowrap">{formatDateTime(req.date)}</td>
                    <td>
                      <span className="font-semibold text-graphite">{req.clientName}</span>
                      <span className="adm-num mt-0.5 block text-xs text-graphite-soft">{req.clientPhone}</span>
                    </td>
                    <td>{req.hero?.alias || '—'}</td>
                    <td><State map={MISSION_STATE} value={req.status} /></td>
                    <td className="text-right">
                      {req.status === 'COMPLETED' && (
                        <button type="button" onClick={() => setViewEvidence(req)} className="adm-btn adm-btn--quiet">
                          <ImageSquare size={15} weight="bold" aria-hidden="true" />
                          Vezi
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* ---------------- RECRUTARE ---------------- */}
        {activeTab === 'APPLICATIONS' && (
          <section className="mt-5">
            {applications.length === 0 ? (
              <p className="adm-card p-8 text-center text-sm text-graphite-soft">
                Niciun dosar nou. Cererile din „Devino erou" apar aici.
              </p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {applications.map(app => (
                  <article key={app.id} className="adm-card p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="font-heading text-lg leading-tight text-graphite">{app.name}</h3>
                        <p className="mt-1 text-sm text-graphite-soft">{app.category}</p>
                      </div>
                      <span className="adm-state" data-tone="wait">Nou</span>
                    </div>

                    <dl className="adm-num mt-4 space-y-1 text-sm text-graphite-soft">
                      <div><dt className="sr-only">Telefon</dt><dd>{app.phone}</dd></div>
                      <div><dt className="sr-only">Email</dt><dd className="break-all">{app.email}</dd></div>
                    </dl>

                    {app.message && (
                      <blockquote className="mt-4 rounded-xl bg-white/60 p-3 text-sm italic leading-relaxed text-graphite">
                        „{app.message}"
                      </blockquote>
                    )}

                    <div className="mt-5 flex gap-2">
                      <button type="button" onClick={() => handleRecruit(app)} className="adm-btn adm-btn--main flex-1">
                        Recrutează
                      </button>
                      <button
                        type="button"
                        className="adm-btn adm-btn--danger"
                        onClick={async () => {
                          if (await toast.confirm(
                            `Respingi dosarul lui ${app.name}? Primește automat un email.`,
                            { confirmLabel: 'Resping', danger: true },
                          )) {
                            await deleteApplication(app.id);
                            refreshAllData();
                            toast.success('Dosar respins, candidatul a fost anunțat.');
                          }
                        }}
                      >
                        Respinge
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        {/* ---------------- RECRUITERI ---------------- */}
        {activeTab === 'RECRUITERS' && (
          <section className="mt-5 space-y-4" aria-labelledby="recruiters-title">
            <div className="adm-card flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 id="recruiters-title" className="font-heading text-lg text-graphite">Recruiteri</h2>
                <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-graphite-soft">
                  Aprobarea îi activează codul personal — îl primește singur pe email.
                  Datele bancare complete nu se văd aici, ci doar în CSV-ul de plată.
                </p>
              </div>
              <button
                type="button"
                onClick={fetchRecruiters}
                disabled={Boolean(recruiterAction) || recruiterLoading}
                className="adm-btn adm-btn--quiet"
              >
                <ArrowsClockwise size={15} weight="bold" aria-hidden="true" />
                {recruiterLoading ? 'Se încarcă…' : 'Reîmprospătează'}
              </button>
            </div>

            {recruiterError && (
              <div role="alert" className="flex items-start justify-between gap-4 rounded-2xl bg-super-red/8 p-4 text-sm font-semibold text-super-red-dark">
                <span>{recruiterError}</span>
                <button type="button" onClick={() => setRecruiterError('')} aria-label="Închide" className="shrink-0">
                  <X size={16} weight="bold" />
                </button>
              </div>
            )}

            {recruiterLoading && recruiters.length === 0 ? (
              <p className="adm-card p-8 text-center text-sm text-graphite-soft">Se încarcă…</p>
            ) : recruiters.length === 0 ? (
              <p className="adm-card p-8 text-center text-sm text-graphite-soft">
                Niciun recruiter încă. Cererile din pagina „/recruiter" apar aici.
              </p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {recruiters.map(rec => {
                  const isPending = rec.status === 'PENDING';
                  const isActive = rec.status === 'ACTIVE';
                  const isSuspended = rec.status === 'SUSPENDED';
                  return (
                    <article key={rec.id} className="adm-card p-5">
                      <div className="flex flex-wrap items-center gap-2">
                        <State map={RECRUITER_STATE} value={rec.status} />
                        {rec.code && !isPending && (
                          <span className="rounded-full bg-graphite/8 px-2.5 py-1 font-mono text-[0.7rem] tracking-wide text-graphite">
                            {rec.code}
                          </span>
                        )}
                      </div>

                      <h3 className="mt-3 font-heading text-lg leading-tight text-graphite">{rec.name}</h3>

                      <dl className="adm-num mt-3 space-y-1 text-sm text-graphite-soft">
                        <div><dt className="sr-only">Email</dt><dd className="break-all">{rec.email}</dd></div>
                        {rec.phone && <div><dt className="sr-only">Telefon</dt><dd>{rec.phone}</dd></div>}
                        <div><dt className="sr-only">IBAN</dt><dd>{rec.ibanMask}</dd></div>
                      </dl>

                      <p className="mt-3 text-xs text-graphite-soft">
                        Înscris {formatDateTime(rec.createdAt)}
                        {rec.counts && (
                          <> · {rec.counts.attributions ?? 0} atribuiri · {rec.counts.commissions ?? 0} comisioane</>
                        )}
                      </p>

                      <div className="mt-5 flex flex-wrap gap-2">
                        {isPending && (
                          <>
                            <button type="button" onClick={() => approveRecruiter(rec)} disabled={Boolean(recruiterAction)} className="adm-btn adm-btn--main flex-1">
                              {recruiterAction === `approve:${rec.id}` ? 'Se aprobă…' : 'Aprobă'}
                            </button>
                            <button type="button" onClick={() => rejectRecruiter(rec)} disabled={Boolean(recruiterAction)} className="adm-btn adm-btn--danger">
                              {recruiterAction === `reject:${rec.id}` ? '…' : 'Respinge'}
                            </button>
                          </>
                        )}
                        {isActive && (
                          <button type="button" onClick={() => suspendRecruiter(rec)} disabled={Boolean(recruiterAction)} className="adm-btn adm-btn--danger flex-1">
                            {recruiterAction === `suspend:${rec.id}` ? 'Se suspendă…' : 'Suspendă'}
                          </button>
                        )}
                        {isSuspended && (
                          <button type="button" onClick={() => reactivateRecruiter(rec)} disabled={Boolean(recruiterAction)} className="adm-btn adm-btn--dark flex-1">
                            {recruiterAction === `reactivate:${rec.id}` ? 'Se reactivează…' : 'Reactivează'}
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* ---------------- PLĂȚI ---------------- */}
        {activeTab === 'PAYOUTS' && (
          <section className="mt-5 space-y-4" aria-labelledby="payouts-title">
            <div className="adm-card flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 id="payouts-title" className="font-heading text-lg text-graphite">Plăți către recruiteri</h2>
                <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-graphite-soft">
                  Un lot strânge toate comisioanele eligibile care nu sunt deja în altul.
                  IBAN-urile apar numai în CSV-ul descărcat, niciodată pe ecran.
                </p>
              </div>
              <button type="button" onClick={createPayoutBatch} disabled={Boolean(payoutAction)} className="adm-btn adm-btn--main">
                <Plus size={15} weight="bold" aria-hidden="true" />
                {payoutAction === 'create' ? 'Se creează…' : 'Lot nou'}
              </button>
            </div>

            {payoutError && (
              <div role="alert" className="flex items-start justify-between gap-4 rounded-2xl bg-super-red/8 p-4 text-sm font-semibold text-super-red-dark">
                <span>{payoutError}</span>
                <button type="button" onClick={() => setPayoutError('')} aria-label="Închide" className="shrink-0">
                  <X size={16} weight="bold" />
                </button>
              </div>
            )}

            {payoutLoading && payouts.length === 0 ? (
              <p className="adm-card p-8 text-center text-sm text-graphite-soft">Se încarcă…</p>
            ) : payouts.length === 0 ? (
              <p className="adm-card p-8 text-center text-sm text-graphite-soft">
                Niciun lot. Creează unul după ce există comisioane ajunse la scadență.
              </p>
            ) : (
              <div className="space-y-4">
                {payouts.map(batch => {
                  const isPaid = batch.status === 'PAID';
                  const isDraft = batch.status === 'DRAFT';
                  const isExported = batch.status === 'EXPORTED';
                  const isCancelled = batch.status === 'CANCELLED';
                  const itemCount = batch.itemCount ?? batch._count?.items;
                  const reference = transferReferences[batch.id] || '';

                  return (
                    <article key={batch.id} className="adm-card p-5">
                      <div className="flex flex-col gap-6 xl:flex-row xl:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <State map={PAYOUT_STATE} value={batch.status} />
                            <span className="font-mono text-xs text-graphite-soft">#{batch.id.slice(0, 8)}</span>
                          </div>

                          <p className="adm-num mt-3 font-heading text-3xl leading-none text-graphite">
                            {formatMoney(batch.totalBani)}
                          </p>

                          <dl className="mt-5 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
                            <div>
                              <dt className="adm-label">Perioadă</dt>
                              <dd className="adm-num text-graphite">
                                {new Date(batch.periodStart).toLocaleDateString('ro-RO')} – {new Date(batch.periodEnd).toLocaleDateString('ro-RO')}
                              </dd>
                            </div>
                            <div>
                              <dt className="adm-label">Creat</dt>
                              <dd className="adm-num text-graphite">{formatDateTime(batch.createdAt)}</dd>
                            </div>
                            {typeof batch.recruiterCount === 'number' && (
                              <div>
                                <dt className="adm-label">Recruiteri</dt>
                                <dd className="adm-num text-graphite">{batch.recruiterCount}</dd>
                              </div>
                            )}
                            {typeof itemCount === 'number' && (
                              <div>
                                <dt className="adm-label">Comisioane</dt>
                                <dd className="adm-num text-graphite">{itemCount}</dd>
                              </div>
                            )}
                            {isPaid && batch.paidAt && (
                              <div>
                                <dt className="adm-label">Plătit</dt>
                                <dd className="adm-num text-graphite">{formatDateTime(batch.paidAt)}</dd>
                              </div>
                            )}
                            {isPaid && batch.reference && (
                              <div className="min-w-0">
                                <dt className="adm-label">Referință</dt>
                                <dd className="break-all font-mono text-xs text-graphite">{batch.reference}</dd>
                              </div>
                            )}
                          </dl>
                        </div>

                        <div className="w-full space-y-3 xl:w-[22rem] xl:shrink-0 xl:border-l xl:border-graphite/10 xl:pl-5">
                          {!isCancelled && (
                            <button
                              type="button"
                              onClick={() => downloadPayoutCsv(batch)}
                              disabled={Boolean(payoutAction)}
                              className="adm-btn adm-btn--dark w-full"
                            >
                              <DownloadSimple size={15} weight="bold" aria-hidden="true" />
                              {payoutAction === `export:${batch.id}` ? 'Se generează…' : 'Descarcă CSV pentru bancă'}
                            </button>
                          )}

                          {(isDraft || isExported) && (
                            <div className="space-y-3 rounded-xl bg-white/60 p-3.5">
                              {isDraft && (
                                <p className="text-xs leading-relaxed text-graphite-soft">
                                  Descarcă întâi CSV-ul. Exportul îngheață beneficiarii, IBAN-urile și sumele.
                                </p>
                              )}
                              <div>
                                <label htmlFor={`reference-${batch.id}`} className="adm-label">Referința transferului</label>
                                <input
                                  id={`reference-${batch.id}`}
                                  className="adm-input font-mono"
                                  maxLength={120}
                                  autoComplete="off"
                                  placeholder="OP-2026-07-001"
                                  value={reference}
                                  onChange={event => setTransferReferences(current => ({ ...current, [batch.id]: event.target.value }))}
                                />
                              </div>
                              <button
                                type="button"
                                onClick={() => markPayoutPaid(batch)}
                                disabled={Boolean(payoutAction) || !isExported || !reference.trim()}
                                className="adm-btn adm-btn--main w-full"
                              >
                                {payoutAction === `paid:${batch.id}` ? 'Se confirmă…' : 'Confirmă transferul'}
                              </button>
                              <p className="text-[0.7rem] leading-relaxed text-graphite-soft">
                                Cere confirmare și rămâne definitiv în registrul de comisioane.
                              </p>
                              <button
                                type="button"
                                onClick={() => cancelPayoutBatch(batch)}
                                disabled={Boolean(payoutAction)}
                                className="adm-btn adm-btn--danger w-full"
                              >
                                {payoutAction === `cancel:${batch.id}` ? 'Se anulează…' : 'Anulează lotul'}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* ---------------- JURNAL ---------------- */}
        {activeTab === 'LOGS' && (() => {
          const shown = onlyBad
            ? logs.filter(entry => entry.offline || (entry.status ?? 0) >= 400)
            : logs;
          const bad = logs.filter(entry => entry.offline || (entry.status ?? 0) >= 400).length;
          const slowest = logs.reduce((worst, entry) => Math.max(worst, entry.ms), 0);

          /* Starea, ca ton: reușit / de știut / cere atenție / stricat. */
          const toneOf = (entry: NetEntry) => {
            if (entry.offline) return 'stop';
            const code = entry.status ?? 0;
            if (code >= 500) return 'stop';
            if (code >= 400) return 'wait';
            if (code >= 300) return 'info';
            return 'live';
          };

          return (
            <section className="mt-5 space-y-4" aria-labelledby="logs-title">
              <div className="adm-card flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 id="logs-title" className="font-heading text-lg text-graphite">Jurnal de apeluri</h2>
                  <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-graphite-soft">
                    <span className="adm-num">{logs.length}</span> cereri &middot;{' '}
                    <span className="adm-num">{bad}</span> cu probleme &middot; cea mai lentă{' '}
                    <span className="adm-num">{slowest}</span> ms
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="adm-btn adm-btn--quiet"
                    aria-pressed={onlyBad}
                    onClick={() => setOnlyBad(v => !v)}
                  >
                    <Warning size={15} weight="bold" aria-hidden="true" />
                    {onlyBad ? 'Arată tot' : 'Doar problemele'}
                  </button>
                  <button type="button" className="adm-btn adm-btn--quiet" onClick={() => { clearNetLog(); setLogs([]); }}>
                    <Broom size={15} weight="bold" aria-hidden="true" />
                    Golește
                  </button>
                </div>
              </div>

              {/* Limita e scrisă pe față: cine caută ce a pățit un meseriaș marți
                  trebuie să știe din prima că nu aici o găsește. */}
              <div className="adm-card flex items-start gap-3 p-4">
                <Pulse size={18} weight="duotone" className="mt-0.5 shrink-0 text-graphite-soft" aria-hidden="true" />
                <p className="text-sm leading-relaxed text-graphite-soft">
                  Astea sunt cererile <strong className="text-graphite">browserului ăstuia</strong>, de când ai
                  deschis fila. Jurnalul pe utilizatori, cu istoric, are nevoie de server &mdash;
                  e descris în <code className="rounded bg-graphite/8 px-1.5 py-0.5 text-[0.85em] text-graphite">BACKEND-MEDIA-SI-JURNAL.md</code>.
                  Corpurile cererilor nu se rețin niciodată: prin ele trec parole, IBAN-uri și tokenuri.
                </p>
              </div>

              {shown.length === 0 ? (
                <p className="adm-card p-8 text-center text-sm text-graphite-soft">
                  {logs.length === 0
                    ? 'Nicio cerere încă. Mergi prin celelalte secțiuni și revino.'
                    : 'Nicio problemă înregistrată. Bine.'}
                </p>
              ) : (
                <div className="adm-card adm-scroll">
                  <table className="adm-table">
                    <thead>
                      <tr>
                        <th>Ora</th>
                        <th>Metodă</th>
                        <th>Rută</th>
                        <th>Stare</th>
                        <th className="text-right">Durată</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...shown].reverse().map(entry => (
                        <tr key={entry.id}>
                          <td className="adm-num whitespace-nowrap text-xs">
                            {new Date(entry.at).toLocaleTimeString('ro-RO')}
                          </td>
                          <td className="font-mono text-xs font-bold text-graphite">{entry.method}</td>
                          <td className="font-mono text-xs">{entry.path}</td>
                          <td>
                            <span className="adm-state" data-tone={toneOf(entry)}>
                              {entry.offline ? 'n-a ajuns' : entry.status}
                            </span>
                            {entry.code && (
                              <span className="ml-2 font-mono text-[0.7rem] text-graphite-soft">{entry.code}</span>
                            )}
                          </td>
                          <td className="adm-num text-right text-xs">
                            {/* peste o secundă se vede din culoare, nu doar din cifră */}
                            <span className={entry.ms > 1000 ? 'font-bold text-super-red-dark' : ''}>
                              {entry.ms} ms
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          );
        })()}

        {/* ---------------- SETĂRI ---------------- */}
        {activeTab === 'SETTINGS' && (
          <section className="adm-card mx-auto mt-5 max-w-2xl p-6">
            <h2 className="font-heading text-lg text-graphite">Meseriile din listă</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-graphite-soft">
              Apar în filtrul de eroi și în fișa fiecăruia. Se țin în browserul ăsta, nu pe server.
            </p>

            <div className="mt-5 flex gap-2">
              <input
                className="adm-input flex-1"
                placeholder="Instalator gaz…"
                aria-label="Meserie nouă"
                value={newCatInput}
                onChange={e => setNewCatInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCategory(); } }}
              />
              <button type="button" onClick={addCategory} className="adm-btn adm-btn--main">Adaugă</button>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {categoryList.map(cat => (
                <span key={cat} className="inline-flex items-center gap-1.5 rounded-full bg-white/70 py-1.5 pl-3 pr-1.5 text-sm font-semibold text-graphite">
                  {cat}
                  <button
                    type="button"
                    onClick={() => removeCategory(cat)}
                    aria-label={`Scoate ${cat}`}
                    className="flex h-6 w-6 items-center justify-center rounded-full text-graphite-soft transition-colors hover:bg-super-red/12 hover:text-super-red"
                  >
                    <X size={12} weight="bold" />
                  </button>
                </span>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* ---------------- FIȘA EROULUI ---------------- */}
      {showModal && createPortal(
        <div className="adm adm-veil" role="dialog" aria-modal="true" aria-label="Fișa eroului" onClick={e => { if (e.target === e.currentTarget) setShowModal(false); }}>
          <div className="adm-sheet">
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-graphite/10 bg-[#f4f7fb]/95 px-5 py-3.5 backdrop-blur">
              <h2 className="truncate font-heading text-lg text-graphite">
                {modalMode === 'ADD' ? 'Erou nou' : formData.alias || 'Fișa eroului'}
              </h2>
              <div className="flex items-center gap-2">
                {modalMode === 'VIEW' && (
                  <button type="button" onClick={() => setModalMode('EDIT')} className="adm-btn adm-btn--dark">
                    <PencilSimple size={15} weight="bold" aria-hidden="true" />
                    Editează
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  aria-label="Închide"
                  className="flex h-9 w-9 items-center justify-center rounded-full text-graphite-soft transition-colors hover:bg-graphite/8 hover:text-graphite"
                >
                  <X size={17} weight="bold" />
                </button>
              </div>
            </div>

            <div className="p-5 sm:p-6">
              {/* poza și clipul */}
              <div className="flex flex-col gap-4 sm:flex-row">
                <div className="relative h-36 w-36 shrink-0 overflow-hidden rounded-2xl bg-cloud">
                  <img src={thumb(formData.avatarUrl || DEFAULT_AVATAR, 400, { square: true })} alt="" className="h-full w-full object-cover" />
                  {modalMode !== 'VIEW' && (
                    <label className="absolute inset-x-2 bottom-2 flex cursor-pointer items-center justify-center gap-1.5 rounded-full bg-graphite/75 py-1.5 text-xs font-bold text-white backdrop-blur transition-colors hover:bg-graphite">
                      <Camera size={14} weight="fill" aria-hidden="true" />
                      Schimbă
                      {/* aceeași poartă de decupaj ca pe partea de erou */}
                      <input type="file" accept="image/*" className="sr-only" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) setToCrop(f); }} />
                    </label>
                  )}
                </div>

                <div className="relative min-h-[9rem] flex-1 overflow-hidden rounded-2xl bg-graphite">
                  {formData.videoUrl ? (
                    <video src={formData.videoUrl} controls preload="metadata" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full min-h-[9rem] flex-col items-center justify-center gap-2 text-white/45">
                      <VideoCamera size={26} weight="duotone" aria-hidden="true" />
                      <span className="text-xs">Fără clip de prezentare</span>
                    </div>
                  )}
                  {modalMode !== 'VIEW' && (
                    <label className="absolute bottom-2 right-2 flex cursor-pointer items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-xs font-bold text-graphite transition-colors hover:bg-white">
                      <VideoCamera size={14} weight="fill" aria-hidden="true" />
                      {uploading ? 'Se încarcă…' : 'Schimbă clipul'}
                      <input type="file" accept="video/*" className="sr-only" onChange={e => e.target.files?.[0] && handleFileUpload(e.target.files[0], 'videoUrl')} />
                    </label>
                  )}
                </div>
              </div>

              {modalMode === 'VIEW' ? (
                <div className="mt-6 space-y-5">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <dl className="adm-card space-y-3 p-4">
                      <div><dt className="adm-label">Nume real</dt><dd className="text-sm text-graphite">{formData.realName || '—'}</dd></div>
                      <div><dt className="adm-label">Telefon</dt><dd className="adm-num text-sm text-graphite">{formData.phone || '—'}</dd></div>
                      <div><dt className="adm-label">Email</dt><dd className="break-all text-sm text-graphite">{formData.email || '—'}</dd></div>
                    </dl>
                    <dl className="adm-card space-y-3 p-4">
                      <div><dt className="adm-label">Meserie</dt><dd className="text-sm text-graphite">{formData.category}</dd></div>
                      <div><dt className="adm-label">Tarif</dt><dd className="adm-num text-sm text-graphite">{formData.hourlyRate} lei/oră</dd></div>
                      <div><dt className="adm-label">Trust factor</dt><dd className="adm-num text-sm text-graphite">{formData.trustFactor}/100</dd></div>
                    </dl>
                  </div>

                  <div className="adm-card p-4">
                    <p className="adm-label">Descriere</p>
                    <p className="text-sm leading-relaxed text-graphite">{formData.description || '—'}</p>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="adm-card p-4">
                      <p className="adm-label">Zone de acțiune</p>
                      <div className="pointer-events-none mt-2">
                        <RomaniaMap value={formData.actionAreas || []} className="h-auto w-full" />
                      </div>
                      <p className="mt-2 text-xs leading-relaxed text-graphite-soft">
                        {formData.actionAreas?.length ? formData.actionAreas.join(', ') : 'Niciun județ ales'}
                      </p>
                    </div>

                    <div className="adm-card overflow-hidden">
                      <p className="adm-label px-4 pt-4">Istoric misiuni</p>
                      {heroMissions.length === 0 ? (
                        <p className="p-4 text-sm text-graphite-soft">Nicio misiune.</p>
                      ) : (
                        <div className="sf-scroll max-h-[19rem] overflow-y-auto" data-fade="bottom">
                          <table className="adm-table !min-w-0">
                            <thead>
                              <tr><th>Data</th><th>Client</th><th>Stare</th><th className="text-right">Dovezi</th></tr>
                            </thead>
                            <tbody>
                              {heroMissions.map(m => (
                                <tr key={m.id}>
                                  <td className="adm-num whitespace-nowrap text-xs">{formatDateTime(m.date)}</td>
                                  <td className="text-xs">{m.clientName}</td>
                                  <td><State map={MISSION_STATE} value={m.status} /></td>
                                  <td className="text-right">
                                    {m.status === 'COMPLETED' && (
                                      <button type="button" onClick={() => setViewEvidence(m)} className="text-xs font-bold text-graphite underline decoration-super-red/40 underline-offset-2">
                                        Vezi
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSave} className="mt-6 space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label htmlFor="adm-alias" className="adm-label">Nume de erou</label>
                      <input id="adm-alias" required className="adm-input" value={formData.alias} onChange={e => setFormData({ ...formData, alias: e.target.value })} />
                    </div>
                    <div>
                      <label htmlFor="adm-cat" className="adm-label">Meserie</label>
                      {!isCustomCat ? (
                        <select
                          id="adm-cat"
                          className="adm-input"
                          value={formData.category}
                          onChange={e => { if (e.target.value === 'NEW') setIsCustomCat(true); else setFormData({ ...formData, category: e.target.value }); }}
                        >
                          {categoryList.map(c => <option key={c} value={c}>{c}</option>)}
                          <option value="NEW">+ Alta…</option>
                        </select>
                      ) : (
                        <div className="flex gap-2">
                          <input autoFocus className="adm-input" value={formCustomCat} onChange={e => setFormCustomCat(e.target.value)} />
                          <button type="button" onClick={() => setIsCustomCat(false)} className="adm-btn adm-btn--quiet" aria-label="Înapoi la listă">
                            <X size={14} weight="bold" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label htmlFor="adm-real" className="adm-label">Nume real</label>
                      <input id="adm-real" className="adm-input" value={formData.realName} onChange={e => setFormData({ ...formData, realName: e.target.value })} />
                    </div>
                    <div>
                      <label htmlFor="adm-rate" className="adm-label">Tarif (lei/oră)</label>
                      <input
                        id="adm-rate"
                        inputMode="numeric"
                        className="adm-input adm-num"
                        value={formData.hourlyRate}
                        onChange={e => setFormData({ ...formData, hourlyRate: e.target.value.replace(/[^\d]/g, '') })}
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label htmlFor="adm-phone" className="adm-label">Telefon</label>
                      <input id="adm-phone" className="adm-input adm-num" value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} />
                    </div>
                    <div>
                      <label htmlFor="adm-email" className="adm-label">Email</label>
                      <input id="adm-email" className="adm-input" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} />
                    </div>
                  </div>

                  <div className="adm-card grid gap-4 p-4 sm:grid-cols-2">
                    <div>
                      <label htmlFor="adm-username" className="adm-label">Utilizator de acces</label>
                      <input id="adm-username" className="adm-input" autoComplete="off" value={formData.username} onChange={e => setFormData({ ...formData, username: e.target.value })} />
                    </div>
                    <div>
                      <label htmlFor="adm-password" className="adm-label">Parolă nouă</label>
                      <input id="adm-password" type="password" className="adm-input" autoComplete="new-password" placeholder="lasă gol ca s-o păstrezi" value={formData.password} onChange={e => setFormData({ ...formData, password: e.target.value })} />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="adm-desc" className="adm-label">Descriere</label>
                    <textarea id="adm-desc" rows={3} className="adm-input" value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} />
                  </div>

                  <div className="adm-card flex items-center justify-between gap-4 p-4">
                    <div>
                      <p className="adm-label !mb-0">Trust factor</p>
                      <p className="mt-1 text-xs text-graphite-soft">Cântărește ordinea în care apar eroii.</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <button type="button" onClick={() => setFormData({ ...formData, trustFactor: Math.max(0, Number(formData.trustFactor) - 1) })} className="adm-btn adm-btn--quiet !min-h-9 !px-3" aria-label="Scade">
                        <Minus size={14} weight="bold" />
                      </button>
                      <span className="adm-num w-10 text-center font-heading text-2xl text-graphite">{formData.trustFactor}</span>
                      <button type="button" onClick={() => setFormData({ ...formData, trustFactor: Math.min(100, Number(formData.trustFactor) + 1) })} className="adm-btn adm-btn--quiet !min-h-9 !px-3" aria-label="Crește">
                        <Plus size={14} weight="bold" />
                      </button>
                    </div>
                  </div>

                  <div className="adm-card p-4">
                    <p className="adm-label">Zone de acțiune</p>
                    <select
                      className="adm-input"
                      aria-label="Adaugă județ"
                      value=""
                      onChange={e => { if (e.target.value) toggleArea(e.target.value); }}
                    >
                      <option value="">+ Adaugă județ din listă</option>
                      {ROMANIAN_COUNTIES.map(c => (
                        <option key={c} value={c} disabled={formData.actionAreas?.includes(c)}>{c}</option>
                      ))}
                    </select>

                    {formData.actionAreas?.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {formData.actionAreas.map((area: string) => (
                          <button key={area} type="button" onClick={() => toggleArea(area)} className="inline-flex items-center gap-1.5 rounded-full bg-white/70 py-1 pl-3 pr-2 text-xs font-bold text-graphite transition-colors hover:bg-super-red/10 hover:text-super-red-dark">
                            {area}
                            <X size={11} weight="bold" aria-hidden="true" />
                          </button>
                        ))}
                      </div>
                    )}

                    <div className="mx-auto mt-4 max-w-md">
                      <RomaniaMap value={formData.actionAreas || []} onToggle={toggleArea} className="h-auto w-full" />
                    </div>
                  </div>

                  <div className="flex gap-2 border-t border-graphite/10 pt-4">
                    <button type="submit" disabled={uploading} className="adm-btn adm-btn--main flex-1">
                      <FloppyDisk size={15} weight="fill" aria-hidden="true" />
                      {uploading ? 'Se încarcă…' : 'Salvează'}
                    </button>
                    {modalMode === 'EDIT' && (
                      <button type="button" onClick={handleDeleteHero} className="adm-btn adm-btn--danger">
                        <Trash size={15} weight="bold" aria-hidden="true" />
                        Șterge
                      </button>
                    )}
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}

      {toCrop && (
        <PhotoCropper
          file={toCrop}
          title="Așază poza eroului"
          onCancel={() => setToCrop(null)}
          onDone={cropped => { setToCrop(null); handleFileUpload(cropped, 'avatarUrl'); }}
        />
      )}

      {/* ---------------- DOVEZILE ---------------- */}
      {viewEvidence && createPortal(
        <div className="adm adm-veil" role="dialog" aria-modal="true" aria-label="Dovezile misiunii" onClick={e => { if (e.target === e.currentTarget) setViewEvidence(null); }}>
          <div className="adm-sheet !max-w-4xl">
            <div className="sticky top-0 z-10 flex flex-col gap-3 border-b border-graphite/10 bg-[#f4f7fb]/95 px-5 py-3.5 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <h2 className="truncate font-heading text-lg text-graphite">{viewEvidence.clientName}</h2>
                <p className="adm-num mt-0.5 text-xs text-graphite-soft">
                  #{viewEvidence.id.slice(0, 8)} · {formatDateTime(viewEvidence.date)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={handlePrintDossier} className="adm-btn adm-btn--dark">
                  <Printer size={15} weight="bold" aria-hidden="true" />
                  Printează dosarul
                </button>
                <button
                  type="button"
                  onClick={() => setViewEvidence(null)}
                  aria-label="Închide"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-graphite-soft transition-colors hover:bg-graphite/8 hover:text-graphite"
                >
                  <X size={17} weight="bold" />
                </button>
              </div>
            </div>

            <div className="grid gap-5 p-5 sm:grid-cols-2 sm:p-6">
              {([
                { label: 'Înainte', url: viewEvidence.photoBefore, file: 'inainte' },
                { label: 'După', url: viewEvidence.photoAfter, file: 'dupa' },
              ] as const).map(shot => (
                <div key={shot.label}>
                  <p className="adm-label">{shot.label}</p>
                  <div className="flex min-h-[14rem] items-center justify-center overflow-hidden rounded-2xl bg-graphite/90">
                    {shot.url ? (
                      <img src={shot.url} alt={shot.label} className="max-h-[26rem] w-full object-contain" />
                    ) : (
                      <span className="text-sm text-white/45">Lipsă</span>
                    )}
                  </div>
                  {shot.url && (
                    <button
                      type="button"
                      onClick={() => downloadImage(shot.url!, `${shot.file}-${viewEvidence.id.slice(0, 8)}.jpg`)}
                      className="adm-btn adm-btn--quiet mt-3 w-full"
                    >
                      <DownloadSimple size={15} weight="bold" aria-hidden="true" />
                      Descarcă originalul
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
};
