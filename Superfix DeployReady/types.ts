export enum JobCategory {
    ELECTRICIAN = 'Electrician',
    PLUMBER = 'Instalator',
    MECHANIC = 'Mecanic',
    CLEANER = 'Curățenie',
    PAINTER = 'Zugrav',
    CARPENTER = 'Tâmplar',
    LOCKSMITH = 'Lăcătuș',
    OTHER = 'Altele'
}

export interface Review {
    id: string;
    clientName: string;
    rating: number;
    comment: string;
    date: string | Date;
    heroId: string;
}

// Lucrare din portofoliu (poze înainte/după dintr-o misiune finalizată).
// Backendul o trimite doar pe profilul public al unui erou și doar dacă e APPROVED.
export interface PortfolioItem {
    id: string;
    title?: string | null;
    description?: string | null;
    category?: string | null;
    completedAt?: string | Date | null;
    missionId?: string | null;
    beforeUrl?: string | null;
    afterUrl?: string | null;
}

export interface Hero {
    id: string;
    alias: string;
    realName?: string;
    description: string;
    category: JobCategory | string; 
    hourlyRate: number;
    imageUrl?: string;
    phone?: string;
    email?: string;
    
    powers?: string;
    location?: string;
    
    // --- NEW FIELD ---
    actionAreas?: string[]; // Array de coduri de județ e.g. ["B", "IF"]
    // -----------------
    
    avatarUrl?: string;
    videoUrl?: string;
    trustFactor: number;
    missionsCompleted: number;
    reviews?: Review[];
    portfolio?: PortfolioItem[];
    
    // Auth info
    username?: string;

    /* === "CINE E SUB COSTUM" ===
       Toate opționale: pagina de origine se construiește din ce a completat
       eroul și sare peste ce lipsește. Un erou care răspunde la trei întrebări
       are deja o pagină decentă. */
    yearsActive?: number;      // de câți ani face meseria
    originStory?: string;      // Cum ai început?
    hardestMission?: string;   // Cea mai grea misiune
    neverDoes?: string;        // Ce nu faci niciodată la o lucrare
    favoriteTool?: string;     // Unealta fără de care nu pleci de acasă
    team?: string;             // Cu ce echipă ții
    petPeeve?: string;         // Ce te enervează la meseria asta
    arsenal?: string[];        // pozele cu unelte, dubă, atelier
    proudMissionId?: string;   // id-ul misiunii din portofoliu de care e mândru
}

export interface ServiceRequest {
    id: string;
    clientName: string;
    clientPhone: string;
    clientEmail?: string;
    description: string;
    
    status: 'PENDING' | 'ACCEPTED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'REJECTED';
    photoBefore?: string;
    photoAfter?: string;
    
    date: string | Date;
    heroId: string;
    clientNonce?: string;
    hero?: Hero;

    /* Pozele făcute de client când a cerut ajutorul: ce s-a stricat, înainte să
       vină cineva. Cel mult șase adrese Cloudinary. Se trimit la `POST /api/request`
       și vin înapoi la orice citire de cerere sau misiune, fără să le ceri.

       Nu se confundă cu `photoBefore` / `photoAfter`: alea sunt jurnalul eroului,
       făcute la fața locului, și pot ajunge în portofoliul public. Astea rămân
       între client, erou și administrator. */
    requestPhotos?: string[];

    /* Unde e lucrarea. Serverul le stochează pe toate trei și le întoarce în
       `GET /api/hero/my-missions`. Coordonatele pot lipsi (client care a scris
       doar adresa); atunci se geocodează la afișare — vezi useJobLocation. */
    address?: string | null;
    lat?: number | null;
    lng?: number | null;
}
