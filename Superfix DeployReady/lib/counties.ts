/* Județele României: codul (ca pe server, `actionAreas`) și numele. */
export const COUNTIES = [
  { code: 'B', name: 'București' }, { code: 'AB', name: 'Alba' }, { code: 'AR', name: 'Arad' }, { code: 'AG', name: 'Argeș' }, { code: 'BC', name: 'Bacău' },
  { code: 'BH', name: 'Bihor' }, { code: 'BN', name: 'Bistrița-Năsăud' }, { code: 'BT', name: 'Botoșani' }, { code: 'BR', name: 'Brăila' }, { code: 'BV', name: 'Brașov' },
  { code: 'BZ', name: 'Buzău' }, { code: 'CL', name: 'Călărași' }, { code: 'CS', name: 'Caraș-Severin' }, { code: 'CJ', name: 'Cluj' }, { code: 'CT', name: 'Constanța' },
  { code: 'CV', name: 'Covasna' }, { code: 'DB', name: 'Dâmbovița' }, { code: 'DJ', name: 'Dolj' }, { code: 'GL', name: 'Galați' }, { code: 'GR', name: 'Giurgiu' },
  { code: 'GJ', name: 'Gorj' }, { code: 'HR', name: 'Harghita' }, { code: 'HD', name: 'Hunedoara' }, { code: 'IL', name: 'Ialomița' }, { code: 'IS', name: 'Iași' },
  { code: 'IF', name: 'Ilfov' }, { code: 'MM', name: 'Maramureș' }, { code: 'MH', name: 'Mehedinți' }, { code: 'MS', name: 'Mureș' }, { code: 'NT', name: 'Neamț' },
  { code: 'OT', name: 'Olt' }, { code: 'PH', name: 'Prahova' }, { code: 'SM', name: 'Satu Mare' }, { code: 'SJ', name: 'Sălaj' }, { code: 'SB', name: 'Sibiu' },
  { code: 'SV', name: 'Suceava' }, { code: 'TR', name: 'Teleorman' }, { code: 'TM', name: 'Timiș' }, { code: 'TL', name: 'Tulcea' }, { code: 'VL', name: 'Vâlcea' },
  { code: 'VS', name: 'Vaslui' }, { code: 'VN', name: 'Vrancea' }
].sort((a, b) => a.name.localeCompare(b.name));

const BY_CODE = new Map(COUNTIES.map(county => [county.code, county.name]));

/** „IF” → „Ilfov”; un cod necunoscut rămâne cum e. */
export const getCountyName = (code: string) => BY_CODE.get(code) ?? code;
