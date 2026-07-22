import React, { useEffect, useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { JobCategory } from '../types';
import { API_URL } from '../config/api';

type GrowthCodeType = 'REFERRAL' | 'RECRUITER';

const normalizeGrowthCode = (value: string) =>
    value.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');

export const RegisterHero: React.FC = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    // State-uri
    const [formData, setFormData] = useState({
        name: '',
        phone: '',
        email: '',
        message: '', // Câmp nou pentru mesaj
        category: Object.values(JobCategory)[0] as string // Inițializăm cu prima categorie
    });
    
    const [isCustomCategory, setIsCustomCategory] = useState(false); // Flag pentru input custom
    const [loading, setLoading] = useState(false);
    const [growthCode, setGrowthCode] = useState('');
    const [detectedCode, setDetectedCode] = useState('');
    const [detectedType, setDetectedType] = useState<GrowthCodeType | null>(null);
    const [codeError, setCodeError] = useState('');

    useEffect(() => {
        const referralCode = normalizeGrowthCode(searchParams.get('ref') || '');
        const recruiterCode = normalizeGrowthCode(searchParams.get('recruiter') || '');

        if (referralCode && recruiterCode) {
            setGrowthCode('');
            setDetectedCode('');
            setDetectedType(null);
            setCodeError('Linkul conține două coduri. Introdu mai jos un singur cod.');
            return;
        }

        const code = referralCode || recruiterCode;
        setGrowthCode(code);
        setDetectedCode(code);
        setDetectedType(referralCode ? 'REFERRAL' : recruiterCode ? 'RECRUITER' : null);
        setCodeError('');
    }, [searchParams]);

    const resolveGrowthCode = async (code: string): Promise<GrowthCodeType> => {
        const response = await fetch(`${API_URL}/growth/code/${encodeURIComponent(code)}`);
        const data = await response.json().catch(() => ({}));

        if (!response.ok || !data.valid || !['REFERRAL', 'RECRUITER'].includes(data.type)) {
            throw new Error(data.message || 'Codul introdus nu este valid sau nu mai este activ.');
        }

        return data.type as GrowthCodeType;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setCodeError('');

        try {
            const normalizedCode = normalizeGrowthCode(growthCode);
            const codePayload: { referralCode?: string; recruiterCode?: string } = {};

            if (normalizedCode) {
                try {
                    const codeType = await resolveGrowthCode(normalizedCode);
                    if (codeType === 'REFERRAL') codePayload.referralCode = normalizedCode;
                    if (codeType === 'RECRUITER') codePayload.recruiterCode = normalizedCode;
                } catch (error) {
                    const message = error instanceof Error ? error.message : 'Codul nu a putut fi verificat.';
                    setCodeError(message);
                    return;
                }
            }

            const res = await fetch(`${API_URL}/apply-hero`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...formData, ...codePayload })
            });
            const data = await res.json();

            if (res.ok) {
                alert("📩 DOSAR ÎNREGISTRAT! Verifică-ți emailul pentru confirmare.");
                navigate('/');
            } else {
                alert("Eroare: " + (data.message || data.error || "Ceva nu a mers bine."));
            }
        } catch (err) {
            alert("Eroare de conexiune cu sediul central.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#f0f0f0] bg-[url('https://www.transparenttextures.com/patterns/notebook.png')] p-4 md:p-8 flex justify-center items-center">
            <div className="max-w-xl w-full bg-white border-4 border-black shadow-[10px_10px_0_#000] relative p-8 md:p-12 rotate-1">
                
                {/* Stampila CONFIDENTIAL */}
                <div className="absolute top-4 right-4 border-4 border-red-600 text-red-600 font-black text-xl px-4 py-1 transform rotate-12 opacity-80 pointer-events-none">
                    CONFIDENTIAL
                </div>

                <div className="text-center mb-10">
                    <h1 className="font-heading text-4xl md:text-5xl uppercase mb-2">APLICAȚIE EROU</h1>
                    <p className="font-comic text-gray-600">Completează datele pentru a fi contactat.</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6 font-comic">
                    
                    {/* SECTIUNE DATE PERSONALE */}
                    <div className="bg-yellow-50 p-4 border-2 border-dashed border-black relative">
                        <div className="absolute -top-3 -left-3 bg-black text-white px-2 font-bold text-xs">DATE CANDIDAT</div>
                        
                        <div className="mb-4">
                            <label className="block font-bold text-sm uppercase mb-1">Nume Complet</label>
                            <input required type="text" className="w-full border-2 border-black p-2 focus:bg-white transition-colors" placeholder="ex: Popescu Ion" 
                                value={formData.name}
                                onChange={e => setFormData({...formData, name: e.target.value})} />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block font-bold text-sm uppercase mb-1">Telefon</label>
                                <input required type="tel" className="w-full border-2 border-black p-2 focus:bg-white transition-colors" placeholder="07xx..." 
                                    value={formData.phone}
                                    onChange={e => setFormData({...formData, phone: e.target.value})} />
                            </div>
                            <div>
                                <label className="block font-bold text-sm uppercase mb-1">Email</label>
                                <input required type="email" className="w-full border-2 border-black p-2 focus:bg-white transition-colors" placeholder="email@..." 
                                    value={formData.email}
                                    onChange={e => setFormData({...formData, email: e.target.value})} />
                            </div>
                        </div>
                    </div>

                    {/* UN SINGUR COD DE INVITAȚIE SAU RECRUITER */}
                    <div className="bg-green-50 p-4 border-2 border-dashed border-black relative mt-6">
                        <div className="absolute -top-3 -left-3 bg-black text-white px-2 font-bold text-xs">COD OPȚIONAL</div>

                        {detectedCode && (
                            <div className="mb-4 border-2 border-black bg-white p-3" role="status">
                                <p className="text-xs font-bold uppercase text-gray-600">Cod detectat din link</p>
                                <p className="mt-1 font-mono text-lg font-black break-all">{detectedCode}</p>
                                <p className="mt-1 text-xs text-gray-600">
                                    {detectedType === 'REFERRAL' ? 'Invitație de la un erou' : 'Cod de recruiter'}
                                </p>
                            </div>
                        )}

                        <label htmlFor="growth-code" className="block font-bold text-sm uppercase mb-1">
                            Cod de invitație sau recruiter
                        </label>
                        <input
                            id="growth-code"
                            type="text"
                            maxLength={80}
                            autoCapitalize="characters"
                            autoComplete="off"
                            className="w-full border-2 border-black p-2 bg-white font-mono uppercase focus:bg-yellow-50 focus:outline-none focus:ring-4 focus:ring-comic-yellow/50"
                            placeholder="Ex: ERO-... sau REC-..."
                            value={growthCode}
                            onChange={event => {
                                setGrowthCode(event.target.value.toUpperCase());
                                setCodeError('');
                            }}
                            aria-describedby="growth-code-help growth-code-error"
                            aria-invalid={Boolean(codeError)}
                        />
                        <p id="growth-code-help" className="mt-2 text-xs text-gray-600">
                            Poți folosi un singur cod. Dacă ai ajuns dintr-un link, câmpul este completat automat.
                        </p>
                        {codeError && (
                            <p id="growth-code-error" className="mt-2 border-l-4 border-red-600 pl-2 text-sm font-bold text-red-700" role="alert">
                                {codeError}
                            </p>
                        )}
                    </div>

                    {/* SECTIUNE ABILITATI & MESAJ */}
                    <div className="bg-blue-50 p-4 border-2 border-dashed border-black relative mt-6">
                        <div className="absolute -top-3 -left-3 bg-black text-white px-2 font-bold text-xs">ABILITĂȚI & MOTIVAȚIE</div>
                        
                        {/* SELECTOR SPECIALIZARE CU OPTIUNE CUSTOM */}
                        <div className="mb-4">
                            <label className="block font-bold text-sm uppercase mb-1">Specializare</label>
                            
                            {!isCustomCategory ? (
                                <select 
                                    className="w-full border-2 border-black p-2 bg-white cursor-pointer hover:bg-gray-50 focus:bg-yellow-100 transition-colors"
                                    value={Object.values(JobCategory).includes(formData.category as JobCategory) ? formData.category : 'NEW'}
                                    onChange={e => {
                                        if (e.target.value === 'NEW') {
                                            setIsCustomCategory(true);
                                            setFormData({...formData, category: ''}); // Resetăm pentru input manual
                                        } else {
                                            setFormData({...formData, category: e.target.value});
                                        }
                                    }}
                                >
                                    {Object.values(JobCategory).map(cat => <option key={cat} value={cat}>{cat}</option>)}
                                    <option value="NEW" className="font-bold text-red-600">✍️ Alta (Scrie tu...)</option>
                                </select>
                            ) : (
                                <div className="flex gap-2 animate-fade-in">
                                    <input 
                                        autoFocus
                                        type="text" 
                                        required 
                                        placeholder="Ex: Expert Panouri Solare..." 
                                        className="w-full border-2 border-black p-2 bg-yellow-100 font-bold"
                                        value={formData.category}
                                        onChange={e => setFormData({...formData, category: e.target.value})}
                                    />
                                    <button 
                                        type="button" 
                                        onClick={() => {
                                            setIsCustomCategory(false);
                                            setFormData({...formData, category: Object.values(JobCategory)[0]});
                                        }}
                                        className="bg-red-500 text-white px-3 border-2 border-black hover:bg-red-600 font-bold"
                                        title="Înapoi la listă"
                                    >
                                        ✕
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* INPUT MESAJ (NOU) */}
                        <div>
                            <label className="block font-bold text-sm uppercase mb-1">De ce vrei să fii erou? (Mesaj)</label>
                            <textarea 
                                rows={3}
                                className="w-full border-2 border-black p-2 focus:bg-white transition-colors"
                                placeholder="Scrie un mesaj scurt pentru Cartierul General..."
                                value={formData.message}
                                onChange={e => setFormData({...formData, message: e.target.value})}
                            />
                        </div>
                    </div>

                    <button disabled={loading} type="submit" className="w-full bg-super-red text-white font-heading text-2xl py-4 border-4 border-black shadow-[6px_6px_0_#000] hover:translate-x-1 hover:translate-y-1 hover:shadow-none transition-all mt-8 active:bg-red-700">
                        {loading ? 'SE TRIMITE...' : 'TRIMITE DOSARUL'}
                    </button>

                    <div className="text-center mt-4">
                        <Link to="/" className="text-blue-700 font-bold underline hover:text-blue-900 text-sm">
                            ← Înapoi la Portal
                        </Link>
                    </div>

                </form>
            </div>
        </div>
    );
};
