import { Injectable, inject, signal } from '@angular/core';

import { SupabaseService } from './supabase.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly supabase = inject(SupabaseService);

  readonly email = signal<string | null>(null);
  readonly ready = signal(false);

  async init(): Promise<void> {
    const { data } = await this.supabase.client.auth.getSession();
    this.email.set(data.session?.user.email?.toLowerCase() ?? null);
    this.supabase.client.auth.onAuthStateChange((_event, session) => {
      this.email.set(session?.user.email?.toLowerCase() ?? null);
    });
    this.ready.set(true);
  }

  async signIn(email: string, password: string): Promise<void> {
    const { error } = await this.supabase.client.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error) {
      throw new Error(error.message);
    }
  }

  async requestMagicLink(email: string): Promise<void> {
    const { error } = await this.supabase.client.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        shouldCreateUser: false,
        emailRedirectTo: appRedirectUrl(),
      },
    });
    if (error) {
      throw new Error(error.message);
    }
  }

  async signOut(): Promise<void> {
    await this.supabase.client.auth.signOut();
  }

  async accessToken(): Promise<string | null> {
    const { data } = await this.supabase.client.auth.getSession();
    return data.session?.access_token ?? null;
  }
}

function appRedirectUrl(): string {
  const base = document.querySelector('base')?.href;
  if (base) {
    return base;
  }
  return `${window.location.origin}/`;
}
