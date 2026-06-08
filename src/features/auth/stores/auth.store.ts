import { create } from "zustand";
import { loadCurrentProfile, signInWithPassword, signOut, type UserProfile } from "@/features/auth/auth.repository";

interface AuthState {
  profile: UserProfile | null;
  isHydrated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  hydrate: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  profile: null,
  isHydrated: false,
  async login(email, password) {
    await signInWithPassword(email, password);
    const profile = await loadCurrentProfile();
    set({ profile, isHydrated: true });
  },
  async logout() {
    await signOut();
    set({ profile: null, isHydrated: true });
  },
  async hydrate() {
    try {
      const profile = await loadCurrentProfile();
      set({ profile, isHydrated: true });
    } catch {
      set({ profile: null, isHydrated: true });
    }
  },
}));
