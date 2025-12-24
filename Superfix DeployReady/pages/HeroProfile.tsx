import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Hero, ServiceRequest } from '../types';
import { getHeroById, createServiceRequest, addReview } from '../services/dataService';
import { RomaniaMap } from '../components/RomaniaMap';
import { Helmet } from 'react-helmet-async';

export const HeroProfile: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  // === STATE DATE ===
  const [hero, setHero] = useState<Hero | null>(null);
  const [loading, setLoading] = useState(true);
  
  // === STATE FORMULAR CERERE ===
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ name: '', phone: '', email: '', desc: '' });
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // === STATE RECENZII ===
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [hasReviewed, setHasReviewed] = useState(false);
  const [reviewData, setReviewData] = useState({ clientName: '', rating: 5, comment: '' });

  // Calculare rating mediu din recenzii
  const averageRating = hero?.reviews && hero.reviews.length > 0 
    ? (hero.reviews.reduce((acc: number, rev: any) => acc + rev.rating, 0) / hero.reviews.length).toFixed(1)
    : 0;

  // Încărcare date erou
  const fetchData = async () => {
    if (!id) return;
    const data = await getHeroById(id);
    if (!data) {
      navigate('/heroes'); 
    } else {
      setHero(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
    if (id && localStorage.getItem(`superfix_review_${id}`)) {
        setHasReviewed(true);
    }
  }, [id, navigate]);

  // HANDLER: Trimitere Cerere Misiune (SOS)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hero) return;
    
    if (!termsAccepted) {
        alert("Te rugăm să accepți Termenii și Condițiile pentru a trimite solicitarea.");
        return;
    }

    setIsSubmitting(true);
    
    const request: ServiceRequest = {
      id: Date.now().toString(),
      heroId: hero.id,
      clientName: formData.name,
      clientEmail: formData.email,
      clientPhone: formData.phone,
      description: formData.desc,
      status: 'PENDING',
      date: new Date().toISOString()
    };

    await createServiceRequest(request);
    
    setIsSubmitting(false);
    setSubmitSuccess(true);
    
    setTimeout(() => {
      setShowForm(false);
      setSubmitSuccess(false);
      setFormData({ name: '', phone: '', email: '', desc: '' });
      setTermsAccepted(false);
    }, 4000);
  };

  // HANDLER: Trimitere Recenzie
  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hero || !id) return;
    
    const success = await addReview(hero.id, {
      clientName: reviewData.clientName,
      rating: reviewData.rating,
      comment: reviewData.comment
    });

    if (success) {
        setReviewData({ clientName: '', rating: 5, comment: '' });
        setShowReviewForm(false);
        setHasReviewed(true);
        localStorage.setItem(`superfix_review_${id}`, 'true');
        await fetchData();
    } else {
        alert("Eroare: Se pare că ai mai lăsat o recenzie recent sau a apărut o problemă.");
    }
  };

  if (loading) return <div className="p-10 text-center font-heading text-xl">Se încarcă datele eroului...</div>;
  if (!hero) return null;

  return (
    <div className="pb-20 bg-dots">
      {/* === SEO DYNAMIC META TAGS === */}
      <Helmet>
        <title>{`${hero.alias} - ${hero.category} Profesionist | Superfix`}</title>
        <meta name="description" content={`Contactează-l pe ${hero.alias} pentru servicii de ${hero.category}. Tarif: ${hero.hourlyRate} RON/h. Vezi recenzii și portofoliu video.`} />
        <meta property="og:title" content={`${hero.alias} - ${hero.category} | Superfix`} />
        <meta property="og:description" content={`Ai nevoie de un ${hero.category}? ${hero.alias} te poate ajuta! Vezi profilul complet.`} />
        <meta property="og:image" content={hero.avatarUrl || 'https://superfix.ro/og-default.jpg'} />
        
        {/* Structured Data pentru Google (Schema.org) */}
        <script type="application/ld+json">
            {JSON.stringify({
              "@context": "https://schema.org",
              "@type": "LocalBusiness",
              "name": hero.alias,
              "image": hero.avatarUrl,
              "priceRange": `${hero.hourlyRate} RON`,
              "description": hero.description,
              "address": {
                  "@type": "PostalAddress",
                  "addressCountry": "RO"
              }
            })}
        </script>
      </Helmet>

      {/* === HEADER HERO (Design Comic Book) === */}
      <div className="relative bg-super-blue text-white overflow-hidden border-b-4 border-black">
        <div className="absolute inset-0 opacity-20 bg-halftone"></div>
        <div className="container mx-auto px-4 py-12 relative z-10 animate-slide-up">
          <div className="flex flex-col md:flex-row items-center md:items-start gap-10">
             
             {/* Avatar cu Level Badge */}
             <div className="relative group">
                <div className="absolute -inset-2 bg-comic-yellow rotate-6 border-4 border-black"></div>
                <div className="w-56 h-56 md:w-72 md:h-72 flex-shrink-0 border-4 border-black bg-white relative z-10 overflow-hidden shadow-[8px_8px_0_#000]">
                    <img src={hero.avatarUrl || 'https://via.placeholder.com/300'} alt={hero.alias} className="w-full h-full object-cover" />
                </div>
                <div className="absolute -bottom-4 -right-4 bg-super-red text-white font-heading px-4 py-2 border-4 border-black rotate-12 z-20 shadow-[4px_4px_0_#000]">
                    LVL {Math.floor(hero.missionsCompleted / 10) + 1}
                </div>
             </div>
             
             {/* Info Text */}
             <div className="flex-grow text-center md:text-left pt-4">
               <span className="inline-block bg-comic-yellow text-black px-4 py-1 font-heading uppercase text-lg tracking-wider mb-3 border-2 border-black shadow-[4px_4px_0_#000]">
                 {hero.category}
               </span>
               <h1 className="font-heading text-5xl md:text-6xl mb-2 text-white drop-shadow-[4px_4px_0_#000]" style={{WebkitTextStroke: '1px black'}}>{hero.alias}</h1>
               <h2 className="text-xl md:text-2xl text-gray-300 font-comic mb-6 border-b-2 border-dashed border-gray-500 inline-block pb-1">
                   Identitate Secretă: {hero.realName || 'Necunoscută'}
               </h2>
               
               {/* Stats Badges - ACTUALIZATE */}
               <div className="flex flex-wrap justify-center md:justify-start gap-6 mb-6">
                 {/* FIX-O-METRU (Trust Factor) */}
                 <div className="bg-black/40 p-4 border-2 border-white/30 backdrop-blur-md rounded-lg text-center min-w-[120px]">
                   <div className="text-xs text-comic-yellow uppercase font-bold tracking-widest mb-1">Fix-o-Metru</div>
                   <div className="text-3xl font-heading text-white">{hero.trustFactor}%</div>
                   <div className="text-[10px] text-gray-300 mt-1">(Factor de încredere)</div>
                 </div>
                 
                 {/* MISIUNI */}
                 <div className="bg-black/40 p-4 border-2 border-white/30 backdrop-blur-md rounded-lg text-center min-w-[100px]">
                   <div className="text-xs text-comic-yellow uppercase font-bold tracking-widest mb-1">Misiuni</div>
                   <div className="text-3xl font-heading text-white">{hero.missionsCompleted}</div>
                 </div>
                 
                 {/* RATING RECENZII */}
                 <div className="bg-black/40 p-4 border-2 border-white/30 backdrop-blur-md rounded-lg text-center min-w-[100px]">
                   <div className="text-xs text-comic-yellow uppercase font-bold tracking-widest mb-1">Rating</div>
                   <div className="flex items-center justify-center gap-1">
                     <span className="text-3xl font-heading text-white">{averageRating}</span>
                     <span className="text-yellow-400 text-xl">★</span>
                   </div>
                   <div className="text-[10px] text-gray-300 mt-1">({hero.reviews?.length || 0} recenzii)</div>
                 </div>
                 
                 {/* TARIF */}
                 <div className="bg-white p-4 border-4 border-black text-center min-w-[120px] shadow-[4px_4px_0_#000]">
                   <div className="text-xs text-gray-500 uppercase font-bold tracking-widest mb-1">Tarif Orar</div>
                   <div className="text-3xl font-heading text-super-red">{hero.hourlyRate} <span className="text-sm text-black">RON/h</span></div>
                 </div>
               </div>
             </div>
          </div>
        </div>
      </div>

      {/* === CONTENT GRID === */}
      <div className="container mx-auto px-4 py-12 grid grid-cols-1 md:grid-cols-3 gap-8">
        
        {/* COLOANA STÂNGA: Detalii, Video (desktop), Hartă, Video (mobile), Recenzii */}
        <div className="md:col-span-2 space-y-10 animate-slide-up" style={{animationDelay: '0.2s'}}>
          
          {/* Descriere */}
          <section className="bg-white p-8 border-4 border-black shadow-[8px_8px_0_#000] relative">
            <div className="absolute -top-4 -left-4 bg-super-red text-white font-heading px-4 py-1 border-2 border-black rotate-2">
                DOSAR EROU
            </div>
            <p className="text-gray-800 text-xl font-comic leading-relaxed mt-2">
              {hero.description}
            </p>
          </section>

          {/* Video Section - DESKTOP - CU PROFILE CARD */}
          {hero.videoUrl && (
              <section className="hidden md:block bg-white p-6 border-4 border-black shadow-[8px_8px_0_#000] relative">
                <div className="absolute -top-4 -left-4 bg-super-red text-white font-heading px-3 py-1 border-2 border-black rotate-1 text-sm z-10">
                    VIDEO PREZENTARE
                </div>
                
                <div className="grid grid-cols-2 gap-6 items-start mt-2">
                    {/* Coloana Stânga - Video */}
                    <div className="flex justify-start">
                        <div className="border-4 border-black shadow-[8px_8px_0_#000] bg-black inline-block">
                            <video 
                                src={hero.videoUrl} 
                                controls 
                                className="w-full h-auto max-h-[500px] block" 
                                poster={hero.avatarUrl}
                            >
                                Browserul tău nu suportă video.
                            </video>
                        </div>
                    </div>

                    {/* Coloana Dreapta - Hero Profile Card */}
                    <div className="space-y-4">
                        {/* Super Powers */}
                        <div className="bg-comic-yellow border-4 border-black p-5 relative shadow-[6px_6px_0_#000]">
                            <div className="absolute -top-3 -left-3 bg-black text-white font-heading px-3 py-1 border-2 border-white text-xs rotate-3">
                                ⚡ DOSARUL EROULUI
                            </div>
                            <h3 className="font-heading text-2xl mb-3 mt-2 text-black">CE SUPERPUTERE ARE?</h3>
                            <p className="font-comic text-gray-800 leading-relaxed">
                                Specialist <strong>{hero.category}</strong>, cu {hero.missionsCompleted} misiuni finalizate. 
                                Fix-o-Metru de <strong>{hero.trustFactor}%</strong> confirmat de comunitatea Superfix!
                            </p>
                        </div>

                        {/* Quick Stats */}
                        <div className="grid grid-cols-2 gap-3">
                            <div className="bg-white border-4 border-black p-4 text-center shadow-[4px_4px_0_#000]">
                                <div className="text-3xl mb-1">🎯</div>
                                <div className="text-2xl font-heading text-super-red">{hero.missionsCompleted}</div>
                                <div className="text-xs font-bold text-gray-600 uppercase">Misiuni</div>
                            </div>
                            <div className="bg-white border-4 border-black p-4 text-center shadow-[4px_4px_0_#000]">
                                <div className="text-3xl mb-1">⭐</div>
                                <div className="text-2xl font-heading text-super-blue">{averageRating}</div>
                                <div className="text-xs font-bold text-gray-600 uppercase">Rating</div>
                            </div>
                        </div>

                        {/* Call to Action */}
                        <div className="bg-super-red border-4 border-black p-5 text-white shadow-[6px_6px_0_#000] relative">
                            <div className="absolute -top-2 -right-2 w-8 h-8 bg-comic-yellow border-2 border-black rounded-full flex items-center justify-center text-black font-heading text-lg rotate-12">
                                !
                            </div>
                            <h4 className="font-heading text-xl mb-2">GATA DE ACȚIUNE!</h4>
                            <p className="font-comic text-sm mb-3">
                                Urmărește video-ul ca să-l cunoști pe {hero.alias} și vezi cum își folosește superputerile pentru a rezolva problemele rapid!
                            </p>
                            <div className="flex items-center gap-2 text-sm">
                                <span className="bg-white text-black px-3 py-1 font-bold border-2 border-black">
                                    {hero.hourlyRate} RON/h
                                </span>
                                <span className="font-comic text-xs">Tarif estimativ pe ora</span>
                            </div>
                        </div>
                    </div>
                </div>
              </section>
          )}

          {/* --- ARIE DE ACOPERIRE (HARTA READ-ONLY) --- */}
          <section className="bg-white p-6 border-4 border-black shadow-[8px_8px_0_#000] relative">
             <div className="absolute -top-4 -left-4 bg-blue-600 text-white font-heading px-4 py-1 border-2 border-black -rotate-1">
                ARIE DE ACOPERIRE
             </div>
             <div className="mt-4">
                 <p className="font-comic text-gray-600 mb-4">
                    <strong>{hero.alias}</strong> este disponibil pentru intervenții în următoarele județe:
                 </p>
                 
                 {/* Container Hartă */}
                 <div className="w-full max-w-md mx-auto pointer-events-none opacity-90">
                     <RomaniaMap 
                        value={Array.isArray(hero.actionAreas) ? hero.actionAreas : []} 
                     />
                 </div>

                 {/* Legendă Text (Tag-uri) */}
                 <div className="mt-4 text-center">
                    {hero.actionAreas && hero.actionAreas.length > 0 ? (
                        <div className="flex flex-wrap justify-center gap-2">
                            {hero.actionAreas.map(code => (
                                <span key={code} className="bg-gray-100 border border-black px-2 py-1 text-xs font-bold font-mono shadow-sm">
                                    {code}
                                </span>
                            ))}
                        </div>
                    ) : (
                        <span className="text-gray-500 italic text-sm">Toată România (Contactează pentru detalii)</span>
                    )}
                 </div>
             </div>
          </section>

          {/* Video Section - MOBILE - SIMPLU CENTRAT */}
          {hero.videoUrl && (
              <section className="block md:hidden bg-white p-4 border-4 border-black shadow-[8px_8px_0_#000] relative">
                <div className="absolute -top-4 -left-4 bg-super-red text-white font-heading px-3 py-1 border-2 border-black rotate-1 text-sm z-10">
                    VIDEO PREZENTARE
                </div>
                <div className="w-full mt-2 flex justify-center">
                    <div className="border-4 border-black shadow-[8px_8px_0_#000] bg-black inline-block">
                        <video 
                            src={hero.videoUrl} 
                            controls 
                            className="w-full h-auto block" 
                            poster={hero.avatarUrl}
                        >
                            Browserul tău nu suportă video.
                        </video>
                    </div>
                </div>
              </section>
          )}

          {/* Secțiunea Recenzii */}
          <section>
             <div className="flex justify-between items-center mb-6 border-b-4 border-black pb-2">
                <h3 className="font-heading text-3xl text-black">JURNAL DE RECENZII</h3>
                
                {!hasReviewed && (
                    <button 
                        onClick={() => setShowReviewForm(!showReviewForm)}
                        className="bg-white border-2 border-black text-black font-bold px-4 py-2 hover:bg-black hover:text-white transition-colors uppercase tracking-wider shadow-[4px_4px_0_#000]"
                    >
                        {showReviewForm ? 'Inchide' : '+ Adaugă Recenzie'}
                    </button>
                )}
             </div>

             {/* Formular Recenzie */}
             {showReviewForm && !hasReviewed && (
               <div className="bg-comic-yellow p-6 border-4 border-black mb-8 animate-pop-in relative">
                 <div className="absolute -top-3 left-6 w-0 h-0 border-l-[10px] border-l-transparent border-r-[10px] border-r-transparent border-b-[10px] border-b-black"></div>
                 <h4 className="font-heading text-xl mb-4 text-black uppercase">SCRIE O RECENZIE</h4>
                 <form onSubmit={handleReviewSubmit} className="space-y-4">
                    <div className="bg-white border-2 border-black p-4">
                        <div className="mb-4">
                            <label className="block text-xs font-bold uppercase text-gray-500 mb-1">Numele tău</label>
                            <input 
                                required
                                type="text" 
                                value={reviewData.clientName}
                                onChange={e => setReviewData({...reviewData, clientName: e.target.value})}
                                className="w-full border-b-2 border-gray-300 focus:border-black outline-none py-1 font-comic"
                                placeholder="Ex: Popescu Ion"
                            />
                        </div>
                        <div className="mb-4">
                            <label className="block text-xs font-bold uppercase text-gray-500 mb-1">Nota (Stele)</label>
                            <div className="flex gap-2">
                                {[1, 2, 3, 4, 5].map(star => (
                                <button 
                                    key={star} 
                                    type="button"
                                    onClick={() => setReviewData({...reviewData, rating: star})}
                                    className={`text-3xl transition-transform hover:scale-125 focus:outline-none ${star <= reviewData.rating ? 'text-orange-500 stroke-black stroke-2' : 'text-gray-300'}`}
                                >
                                    ★
                                </button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-bold uppercase text-gray-500 mb-1">Comentariu</label>
                            <textarea 
                                required
                                rows={3}
                                value={reviewData.comment}
                                onChange={e => setReviewData({...reviewData, comment: e.target.value})}
                                className="w-full border-2 border-gray-200 focus:border-black rounded p-2 font-comic"
                                placeholder="Cum s-a descurcat eroul?"
                            ></textarea>
                        </div>
                    </div>
                    <button type="submit" className="w-full bg-black text-white font-heading py-3 text-lg hover:bg-gray-800 transition-colors">
                      PUBLICĂ RECENZIA
                    </button>
                 </form>
               </div>
             )}

             {/* Feedback Recenzie Adăugată */}
             {hasReviewed && (
                 <div className="mb-8 bg-green-100 border-4 border-green-600 p-4 text-center shadow-[4px_4px_0_#000]">
                     <h3 className="font-heading text-xl text-green-800">✅ MULȚUMIM PENTRU FEEDBACK!</h3>
                     <p className="font-comic text-green-700 text-sm">Opinia ta ajută comunitatea Superfix.</p>
                 </div>
             )}

             {/* Lista Recenzii */}
             <div className="space-y-6">
               {hero.reviews.length === 0 && !hasReviewed && (
                   <div className="bg-gray-100 p-8 border-2 border-dashed border-gray-300 text-center text-gray-500 font-comic">
                       Încă nu sunt recenzii. Fii tu primul care scrie una!
                   </div>
               )}
               {hero.reviews.map((review: any) => (
                 <div key={review.id} className="bg-white p-6 border-2 border-black shadow-[4px_4px_0_#000] relative">
                   <div className="absolute top-1/2 -left-3 w-4 h-4 bg-white border-l-2 border-b-2 border-black transform rotate-45"></div>
                   <div className="flex justify-between mb-2 border-b-2 border-gray-100 pb-2">
                      <span className="font-heading text-xl">{review.clientName}</span>
                      <span className="text-xs font-bold bg-gray-200 px-2 py-1 rounded">{new Date(review.date).toLocaleDateString()}</span>
                   </div>
                   <div className="flex text-orange-500 mb-2 text-lg">
                     {[...Array(5)].map((_, i) => (
                       <span key={i}>{i < review.rating ? '★' : '☆'}</span>
                     ))}
                   </div>
                   <p className="text-gray-700 font-comic italic">"{review.comment}"</p>
                 </div>
               ))}
             </div>
          </section>
        </div>

        {/* COLOANA DREAPTA: Contact */}
        <div className="md:col-span-1 animate-slide-up" style={{animationDelay: '0.4s'}}>
          <div className="md:sticky md:top-24 bg-white border-4 border-black shadow-[8px_8px_0_#000]">
            <div className="bg-super-red text-white font-heading text-center py-2 border-b-4 border-black">
                URGENȚĂ?
            </div>
            
            {/* CONTAINER CU SCROLL INTERN PE DESKTOP */}
            <div className="md:max-h-[calc(100vh-12rem)] md:overflow-y-auto p-6">
              <p className="text-center text-gray-600 font-comic mb-6">Ai o problemă care nu suportă amânare? Cheamă-l pe {hero.alias}!</p>
              
              <div className="space-y-4">
                 {/* Buton Telefon */}
                 <a href={`tel:${hero.phone}`} className="block w-full text-center bg-green-500 text-white font-heading text-xl py-4 border-4 border-black hover:bg-green-600 transition-all shadow-[4px_4px_0_#000] hover:translate-y-1 hover:shadow-none flex items-center justify-center gap-2 group">
                   <span className="text-2xl animate-pulse">📞</span>
                   SUNĂ ACUM
                 </a>
                 
                 <div className="text-center font-bold text-gray-400 my-2">- SAU -</div>

                 {/* Buton Mesaj */}
                 <button onClick={() => setShowForm(!showForm)} className="block w-full text-center bg-super-blue text-white font-heading text-xl py-4 border-4 border-black hover:bg-blue-900 transition-all shadow-[4px_4px_0_#000] hover:translate-y-1 hover:shadow-none">
                   TRIMITE MESAJ
                 </button>
              </div>

              {/* Formular Contact cu GDPR */}
              {showForm && (
                <div className="mt-6 pt-6 border-t-4 border-dashed border-gray-300 animate-slide-up">
                  {submitSuccess ? (
                    <div className="bg-green-100 border-4 border-green-500 text-green-700 px-4 py-4 relative font-bold font-comic" role="alert">
                      <strong className="font-heading text-xl block mb-1">BAM! SUCCES!</strong>
                      <span className="block">Semnalul a fost trimis. Eroul a primit coordonatele și o notificare pe email! 📧</span>
                    </div>
                  ) : (
                    <form onSubmit={handleSubmit} className="space-y-4">
                      <div>
                        <label className="block text-xs font-bold uppercase mb-1">Numele Tău</label>
                        <input required type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full border-2 border-black p-2 focus:bg-yellow-50 outline-none font-comic"/>
                      </div>
                      <div>
                        <label className="block text-xs font-bold uppercase mb-1">Telefon</label>
                        <input required type="tel" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} className="w-full border-2 border-black p-2 focus:bg-yellow-50 outline-none font-comic"/>
                      </div>
                      <div>
                        <label className="block text-xs font-bold uppercase mb-1">Email</label>
                        <input required type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full border-2 border-black p-2 focus:bg-yellow-50 outline-none font-comic"/>
                      </div>
                      <div>
                        <label className="block text-xs font-bold uppercase mb-1">Descriere Problemă</label>
                        <textarea required rows={3} value={formData.desc} onChange={e => setFormData({...formData, desc: e.target.value})} className="w-full border-2 border-black p-2 focus:bg-yellow-50 outline-none font-comic"></textarea>
                      </div>
                      
                      {/* ZONA GDPR */}
                      <div className="flex items-start gap-3 bg-yellow-50 p-3 border-2 border-dashed border-black">
                          <input 
                              type="checkbox" 
                              id="gdpr" 
                              checked={termsAccepted} 
                              onChange={e => setTermsAccepted(e.target.checked)}
                              className="mt-1 w-5 h-5 border-2 border-black accent-black cursor-pointer shrink-0"
                          />
                          <label htmlFor="gdpr" className="text-xs font-comic cursor-pointer leading-tight">
                              Sunt de acord cu <a href="/legal" target="_blank" className="underline font-bold hover:text-super-blue">Termenii și Condițiile</a> și sunt de acord ca datele mele să fie prelucrate pentru a fi contactat de erou.
                          </label>
                      </div>

                      <button type="submit" disabled={isSubmitting} className="w-full bg-super-red text-white font-heading text-lg py-3 border-4 border-black hover:bg-red-700 disabled:opacity-50 shadow-[2px_2px_0_#000] active:shadow-none active:translate-y-1 transition-all">
                        {isSubmitting ? 'SE TRIMITE...' : 'TRIMITE SOS'}
                      </button>
                    </form>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};