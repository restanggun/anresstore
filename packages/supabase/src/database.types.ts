// Bootstrap schema belum memiliki tabel aplikasi. Ganti menggunakan npm run db:types
// setelah migrasi skema domain dibuat dan database lokal dijalankan.
export type Database = {
  public: {
    Tables: Record<never, never>;
    Views: Record<never, never>;
    Functions: Record<never, never>;
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};
