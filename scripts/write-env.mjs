import { writeFileSync } from 'node:fs';

const supabaseUrl = process.env.SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY ?? '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('SUPABASE_URL and SUPABASE_ANON_KEY must both be set.');
  process.exit(1);
}

const contents = `export const environment = {
  supabaseUrl: ${JSON.stringify(supabaseUrl)},
  supabaseAnonKey: ${JSON.stringify(supabaseAnonKey)},
};
`;

writeFileSync(new URL('../src/environments/environment.ts', import.meta.url), contents);
console.log('Wrote src/environments/environment.ts');
