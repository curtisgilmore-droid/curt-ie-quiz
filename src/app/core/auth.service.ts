import { Injectable, inject, signal } from '@angular/core';

import { SupabaseService } from './supabase.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly supabase = inject(SupabaseService);

  readonly email = signal<string | null>(null);
  readonly ready = signal(false);

  async init(): Promise<void> {
    const { data } = await this.supabase.client.auth.getSession();
    this.email.set(data.session?.user.email ?? null);
    this.supabase.client.auth.onAuthStateChange((_event, session) => {
      this.email.set(session?.user.email ?? null);
    });
    this.ready.set(true);
  }

  async signIn(email: string, password: string): Promise<void> {
    const { error } = await this.supabase.client.auth.signInWithPassword({ email, password });
    if (error) {
      throw new Error(error.message);
    }
  }

  async signOut(): Promise<void> {
    await this.supabase.client.auth.signOut();
  }
}
