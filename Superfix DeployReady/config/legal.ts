const env = import.meta.env;

export const LEGAL = {
  name: env.VITE_COMPANY_LEGAL_NAME || 'Operatorul platformei Superfix',
  cui: env.VITE_COMPANY_CUI || '',
  registration: env.VITE_COMPANY_REGISTRATION || '',
  address: env.VITE_COMPANY_ADDRESS || '',
  city: env.VITE_COMPANY_CITY || '',
  supportEmail: env.VITE_SUPPORT_EMAIL || 'suport@superfix.ro',
};

export const legalIdentityParts = [
  LEGAL.address,
  LEGAL.city,
  LEGAL.cui ? `CUI ${LEGAL.cui}` : '',
  LEGAL.registration,
].filter(Boolean);
