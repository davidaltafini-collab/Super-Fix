const env = import.meta.env;

export const LEGAL = {
  name: env.VITE_COMPANY_LEGAL_NAME || 'ALTMAR GROUP SRL',
  cui: env.VITE_COMPANY_CUI || '53181323',
  registration: env.VITE_COMPANY_REGISTRATION || 'J2025100368001',
  address: env.VITE_COMPANY_ADDRESS || 'Intrarea LEORDENI, Nr. 28-30, 077025',
  city: env.VITE_COMPANY_CITY || 'JUD. Ilfov, Oras Bragadiru',
  phone: env.VITE_COMPANY_PHONE || '0756 929 352',
  supportEmail: env.VITE_SUPPORT_EMAIL || 'contact@super-fix.ro',
};

export const legalIdentityParts = [
  LEGAL.cui ? `CUI/CIF: ${LEGAL.cui}` : '',
  LEGAL.registration ? `Nr. Registrul Comerțului: ${LEGAL.registration}` : '',
  LEGAL.address || LEGAL.city
    ? `Sediu social: ${[LEGAL.city, LEGAL.address].filter(Boolean).join(', ')}`
    : '',
].filter(Boolean);
