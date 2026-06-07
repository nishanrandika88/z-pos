import { create } from "zustand";
import { loadCurrentProfile, signInWithPassword, signOut, type UserProfile } from "@/features/auth/auth.repository";

const demoProfile: UserProfile = {
  id: "demo-admin",
  fullName: "Demo Admin",
  email: "admin@z-pos.local",
  role: "ADMIN",
  active: true,
  branchId: "main",
  branchName: "Main Branch",
};

const demoCredentials = {
  email: "admin@z-pos.local",
  password: "Admin@123456",
};

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
    if (email.trim().toLowerCase() === demoCredentials.email && password === demoCredentials.password) {
      set({ profile: demoProfile, isHydrated: true });
      return;
    }

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
