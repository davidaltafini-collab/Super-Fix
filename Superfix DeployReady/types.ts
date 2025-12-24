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
    
    // Auth info
    username?: string;
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
    hero?: Hero;
}