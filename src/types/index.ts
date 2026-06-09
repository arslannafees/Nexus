export type UserRole = 'entrepreneur' | 'investor';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatarUrl: string;
  bio: string;
  location?: string;
  isOnline?: boolean;
  createdAt: string;
}

export interface Entrepreneur extends User {
  role: 'entrepreneur';
  startupName: string;
  pitchSummary: string;
  fundingNeeded: string;
  industry: string;
  foundedYear: number;
  teamSize: number;
  startupHistory?: string[];
}

export interface Investor extends User {
  role: 'investor';
  investmentInterests: string[];
  investmentStage: string[];
  portfolioCompanies: string[];
  totalInvestments: number;
  minimumInvestment: string;
  maximumInvestment: string;
  investmentHistory?: string[];
  preferences?: string[];
}

export type AppUser = Entrepreneur | Investor;

export interface ProfileUpdatePayload extends Partial<User> {
  startupName?: string;
  pitchSummary?: string;
  fundingNeeded?: string;
  industry?: string;
  foundedYear?: number;
  teamSize?: number;
  startupHistory?: string[];
  investmentInterests?: string[];
  investmentStage?: string[];
  portfolioCompanies?: string[];
  totalInvestments?: number;
  minimumInvestment?: string;
  maximumInvestment?: string;
  investmentHistory?: string[];
  preferences?: string[];
}

export interface AuthSession {
  token: string;
  user: AppUser;
}

export interface Message {
  id: string;
  senderId: string;
  receiverId: string;
  content: string;
  timestamp: string;
  isRead: boolean;
}

export interface ChatConversation {
  id: string;
  participants: string[];
  lastMessage?: Message;
  updatedAt: string;
  otherUser?: AppUser;
}

export interface MeetingParticipant {
  id: string;
  name: string;
  avatarUrl?: string;
  role?: UserRole;
}

export interface Meeting {
  id: string;
  organizerId: string;
  participantId: string;
  title: string;
  agenda: string;
  startsAt: string;
  endsAt: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: string;
  updatedAt: string;
  organizer?: MeetingParticipant;
  participant?: MeetingParticipant;
}

export interface MeetingCreatePayload {
  participantId: string;
  title: string;
  agenda?: string;
  startsAt: string;
  endsAt: string;
}

export interface CollaborationRequest {
  id: string;
  investorId: string;
  entrepreneurId: string;
  message: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: string;
}

export type DocumentStatus = 'active' | 'archived' | 'pending_signature';

export interface Document {
  id: string;
  name: string;
  type: string;
  mimeType: string;
  size: string;
  version: number;
  status: DocumentStatus;
  lastModified: string;
  createdAt: string;
  shared: boolean;
  url: string;
  storagePath: string;
  ownerId: string;
  ownerName?: string;
}

export interface DocumentSignature {
  id: string;
  documentId: string;
  signerId: string;
  signerName: string;
  signatureUrl: string;
  signatureType: 'drawn' | 'typed';
  signedAt: string;
}

export interface AuthContextType {
  user: AppUser | null;
  login: (email: string, password: string, role: UserRole) => Promise<void>;
  register: (name: string, email: string, password: string, role: UserRole) => Promise<void>;
  logout: () => void;
  forgotPassword: (email: string) => Promise<void>;
  resetPassword: (token: string, newPassword: string) => Promise<void>;
  updateProfile: (userId: string, updates: ProfileUpdatePayload) => Promise<void>;
  isAuthenticated: boolean;
  isLoading: boolean;
}