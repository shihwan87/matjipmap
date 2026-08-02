import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(url, anonKey);

export type Entry = {
  id: string;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  memo: string | null;
  catchtable_url: string | null;
  group_id: string | null;
  is_favorite: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type Group = {
  id: string;
  name: string;
};
