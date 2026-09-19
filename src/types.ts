export interface ActorInput {
    mode?: 'search' | 'select';
    resumeText?: string;
    runId?: string;
    selectedJobNumbers?: number[];
    targetTitles?: string[];
    targetCompanies?: string[];
    excludedCompanies?: string[];
    hybridLocations?: string[];
    searchLocation?: string;
    maximumExperienceYears?: number;
    maxResultsPerWorkMode?: number;
    maxQualifiedJobs?: number;
    salaryTarget?: string;
    openAiModel?: string;
    stateStoreName?: string;
    applicationQueueStoreName?: string;
    sendEmail?: boolean;
    mockJobs?: RawJob[];
}

export interface RawJob {
    company?: string;
    company_url?: string;
    job_title?: string;
    job_url?: string;
    job_id?: string;
    location?: string;
    work_type?: string;
    salary?: string | null;
    posted_at?: string;
    applicant_count?: string | null;
    description?: string;
    apply_url?: string;
    is_easy_apply?: boolean;
}

export interface JobCandidate {
    id: string;
    company: string;
    title: string;
    url: string;
    applyUrl: string;
    companyUrl: string;
    location: string;
    workMode: string;
    salary: string;
    postedAt: string;
    applicants: string;
    description: string;
    easyApply: boolean;
}

export interface ScoredJob extends JobCandidate {
    matchScore: number;
    atsAlignment: number;
    whyMatch: string[];
    gaps: string[];
    rejectionReason: string;
    included: boolean;
    priority?: number;
    resumeFileName?: string;
}

export interface ResumeContent {
    name: string;
    contactLine: string;
    headline: string;
    summary: string;
    skills: string[];
    experience: {
        company: string;
        title: string;
        dates: string;
        location: string;
        bullets: string[];
    }[];
    education: {
        institution: string;
        degree: string;
        dates: string;
        details: string;
    }[];
    projects: {
        name: string;
        technologies: string;
        bullets: string[];
    }[];
    achievements: string[];
}

export interface SeenState {
    urls: Record<string, string>;
}

export type ApplicationStatus = 'WAITING_FOR_USER' | 'READY' | 'APPROVED' | 'SUBMITTED' | 'FAILED';

export interface ApplicationQueueJob extends ScoredJob {
    status: ApplicationStatus;
    resumeKey?: string;
    selectedAt?: string;
    approvedAt?: string;
    submittedAt?: string;
    failureReason?: string;
}

export interface ApplicationQueueRun {
    runId: string;
    createdAt: string;
    generationMode: 'openai' | 'fallback';
    status: 'WAITING_FOR_USER' | 'READY';
    jobs: ApplicationQueueJob[];
}

export interface ApplicationSelectionResult {
    runId: string;
    selectedAt: string;
    selectedJobNumbers: number[];
    selectedJobs: {
        priority: number;
        company: string;
        title: string;
        url: string;
        status: 'READY';
        resumeAvailable: boolean;
    }[];
}
