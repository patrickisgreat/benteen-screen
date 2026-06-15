import type { TmdbMovie } from '#shared/types/movie'

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: { id: string, email: string | null, display_name: string | null, avatar_url: string | null, is_admin: boolean, created_at: string }
        Insert: { id: string, email?: string | null, display_name?: string | null, avatar_url?: string | null, is_admin?: boolean, created_at?: string }
        Update: { id?: string, email?: string | null, display_name?: string | null, avatar_url?: string | null, is_admin?: boolean, created_at?: string }
        Relationships: []
      }
      events: {
        Row: { id: string, title: string, description: string, event_date: string, created_by: string | null, created_at: string }
        Insert: { id?: string, title: string, description?: string, event_date: string, created_by?: string | null, created_at?: string }
        Update: { id?: string, title?: string, description?: string, event_date?: string, created_by?: string | null, created_at?: string }
        Relationships: []
      }
      suggestions: {
        Row: { id: string, event_id: string, user_id: string, tmdb_movie: TmdbMovie, deleted: boolean, created_at: string }
        Insert: { id?: string, event_id: string, user_id: string, tmdb_movie: TmdbMovie, deleted?: boolean, created_at?: string }
        Update: { id?: string, event_id?: string, user_id?: string, tmdb_movie?: TmdbMovie, deleted?: boolean, created_at?: string }
        Relationships: []
      }
      votes: {
        Row: { suggestion_id: string, user_id: string, created_at: string }
        Insert: { suggestion_id: string, user_id: string, created_at?: string }
        Update: { suggestion_id?: string, user_id?: string, created_at?: string }
        Relationships: []
      }
    }
    Views: { [_ in never]: never }
    Functions: { [_ in never]: never }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}
