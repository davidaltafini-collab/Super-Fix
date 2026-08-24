import React, { useEffect, useState } from 'react';
import { Eye, EyeSlash, Images, Star } from '@phosphor-icons/react';

import {
  getMyMissions, peekMyMissions,
  getMyPortfolio, peekMyPortfolio, retractPortfolioItem, publishPortfolioItem,
  getOriginDraft, peekOriginDraft,
  MyPortfolioItem,
} from '../services/dataService';
import { ServiceRequest } from '../types';
import { thumb } from '../lib/img';
import { useToast } from './Toast';

import './portfolio-manager.css';

/* ============================================================
   „Ce lucrări arăt lumea" — trăiește pe pagina Datele mele.

   Aici e locul lui, nu în „Cine e sub costum": acolo eroul scrie o poveste,
   aici își administrează datele. Sunt două treburi diferite.

   Fiecare lucrare finalizată e un card cu un singur buton, care spune exact
   ce se întâmplă: publică sau ascunde. Lucrările fără ambele poze nu pot fi
   publicate deloc (serverul cere before + after), așa că nu le arătăm un
   buton mort — le spunem de ce.
   ============================================================ */

export const PortfolioManager: React.FC = () => {
  const toast = useToast();

  const [missions, setMissions] = useState<ServiceRequest[]>(() => peekMyMissions() ?? []);
  const [portfolio, setPortfolio] = useState<MyPortfolioItem[]>(() => peekMyPortfolio() ?? []);
  const [proudMissionId, setProudMissionId] = useState<string | null>(
    () => peekOriginDraft()?.proudMissionId ?? null,
  );
  const [loading, setLoading] = useState(() => !peekMyMissions() || !peekMyPortfolio());
  const [busy, setBusy] = useState<string | null>(null);

  /* Cele trei surse sunt deduplicate în dataService, deci pagina nu plătește
     de două ori dacă altcineva le-a cerut deja. */
  useEffect(() => {
    let alive = true;
    (async () => {
      const [m, p, origin] = await Promise.all([getMyMissions(), getMyPortfolio(), getOriginDraft()]);
      if (!alive) return;
      setMissions(m);
      setPortfolio(p);
      setProudMissionId(origin?.proudMissionId ?? null);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  /* Doar lucrările terminate cu poză de final pot ajunge în portofoliu —
     aceleași reguli ca pe server, ca să nu promitem ce nu se poate. */
  const done = missions.filter(m => m.status === 'COMPLETED' && m.photoAfter);

  const itemFor = (missionId: string) => portfolio.find(p => p.missionId === missionId);
  const isVisible = (item?: MyPortfolioItem) =>
    item?.reviewStatus === 'APPROVED' || item?.reviewStatus === 'PENDING_REVIEW';

  const publish = async (mission: ServiceRequest) => {
    setBusy(mission.id);
    const result = await publishPortfolioItem(mission.id);
    setBusy(null);
    if (result.ok === false) { toast.error(result.reason); return; }
    setPortfolio(prev => {
      const rest = prev.filter(p => p.missionId !== mission.id);
      return [result.item, ...rest];
    });
    toast.success('Publicată. Apare acum pe profilul tău.');
  };

  const hide = async (item: MyPortfolioItem) => {
    setBusy(item.id);
    const ok = await retractPortfolioItem(item.id);
    setBusy(null);
    if (!ok) { toast.error('Nu s-a putut ascunde. Mai încearcă o dată.'); return; }
    setPortfolio(prev => prev.map(p => (p.id === item.id ? { ...p, reviewStatus: 'REMOVED' } : p)));
    toast.success('Ascunsă de pe profilul public.');
  };

  const shown = done.filter(m => isVisible(itemFor(m.id))).length;

  return (
    <section className="sf-glass rounded-[28px] p-6 sm:p-7">
      <h2 className="flex items-center gap-2 font-heading text-xl font-medium text-graphite">
        <Images size={22} weight="duotone" className="text-super-red" aria-hidden="true" />
        Ce lucrări arăt pe profil
      </h2>
      <p className="mt-2 text-sm text-graphite-soft">
        {loading
          ? 'Se încarcă lucrările tale…'
          : done.length === 0
            ? 'Deocamdată n-ai lucrări finalizate cu poză. Prima ta misiune terminată apare aici.'
            : `${shown} din ${done.length} lucrări se văd pe profilul tău public.`}
      </p>

      {!loading && done.length > 0 && (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
          {done.map(m => {
            const item = itemFor(m.id);
            const visible = isVisible(item);
            const canPublish = Boolean(m.photoBefore && m.photoAfter);
            const working = busy === m.id || (item && busy === item.id);
            const isProud = proudMissionId === m.id;

            return (
              <article key={m.id} className="pfm-card" data-on={visible}>
                <div className="pfm-card__shot">
                  <img
                    src={thumb(m.photoAfter || m.photoBefore, 480, { square: true })}
                    alt=""
                    loading="lazy"
                    decoding="async"
                  />
                  {isProud && (
                    <span className="pfm-card__proud">
                      <Star size={12} weight="fill" aria-hidden="true" />
                      Mândru
                    </span>
                  )}
                </div>

                <p className="pfm-card__title">{m.description?.slice(0, 60) || 'Lucrare'}</p>

                {visible && item ? (
                  <button
                    type="button"
                    onClick={() => hide(item)}
                    disabled={Boolean(working)}
                    className="pfm-card__btn"
                  >
                    <Eye size={14} weight="bold" aria-hidden="true" />
                    {working ? 'Se ascunde…' : 'Se vede — ascunde'}
                  </button>
                ) : canPublish ? (
                  <button
                    type="button"
                    onClick={() => publish(m)}
                    disabled={Boolean(working)}
                    className="pfm-card__btn"
                    data-off="true"
                  >
                    <EyeSlash size={14} weight="bold" aria-hidden="true" />
                    {working ? 'Se publică…' : 'Ascunsă — publică'}
                  </button>
                ) : (
                  <p className="pfm-card__note">
                    Lipsește poza de dinainte — n-o putem publica.
                  </p>
                )}

                {isProud && !visible && (
                  <p className="pfm-card__warn">
                    E lucrarea de care ești mândru, dar nu se vede nicăieri până n-o publici.
                  </p>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
};

export default PortfolioManager;
