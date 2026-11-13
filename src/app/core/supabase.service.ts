import { Injectable } from '@angular/core';
import { SupabaseClient, createClient } from '@supabase/supabase-js';

import { environment } from '../../environments/environment';

export class SupabaseConfigError extends Error {
  constructor() {
    super('Supabase is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY and rebuild.');
    this.name = 'SupabaseConfigError';
  }
}

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  private clientInstance: SupabaseClient | null = null;

  get client(): SupabaseClient {
    if (this.clientInstance === null) {
      if (!environment.supabaseUrl || !environment.supabaseAnonKey) {
        throw new SupabaseConfigError();
      }
      this.clientInstance = createClient(environment.supabaseUrl, environment.supabaseAnonKey);
    }
    return this.clientInstance;
  }
}
