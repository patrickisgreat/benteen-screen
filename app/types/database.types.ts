import type { TmdbMovie } from '#shared/types/movie'

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: { id: string, email: string | null, display_name: string | null, avatar_url: string | null, is_admin: boolean, blocked: boolean, created_at: string }
        Insert: { id: string, email?: string | null, display_name?: string | null, avatar_url?: string | null, is_admin?: boolean, blocked?: boolean, created_at?: string }
        Update: { id?: string, email?: string | null, display_name?: string | null, avatar_url?: string | null, is_admin?: boolean, blocked?: boolean, created_at?: string }
        Relationships: []
      }
      invites: {
        Row: { email: string, invited_by: string | null, display_name: string | null, created_at: string, accepted_at: string | null }
        Insert: { email: string, invited_by?: string | null, display_name?: string | null, created_at?: string, accepted_at?: string | null }
        Update: { email?: string, invited_by?: string | null, display_name?: string | null, created_at?: string, accepted_at?: string | null }
        Relationships: []
      }
      app_settings: {
        Row: { id: boolean, max_invites: number | null, updated_at: string }
        Insert: { id?: boolean, max_invites?: number | null, updated_at?: string }
        Update: { id?: boolean, max_invites?: number | null, updated_at?: string }
        Relationships: []
      }
      event_invites: {
        Row: { id: string, event_id: string, email: string, display_name: string | null, token: string, rsvp: string | null, rsvp_at: string | null, invited_by: string | null, resend_id: string | null, sent_at: string | null, delivered_at: string | null, opened_at: string | null, clicked_at: string | null, bounced_at: string | null, created_at: string }
        Insert: { id?: string, event_id: string, email: string, display_name?: string | null, token?: string, rsvp?: string | null, rsvp_at?: string | null, invited_by?: string | null, resend_id?: string | null, sent_at?: string | null, delivered_at?: string | null, opened_at?: string | null, clicked_at?: string | null, bounced_at?: string | null, created_at?: string }
        Update: { id?: string, event_id?: string, email?: string, display_name?: string | null, token?: string, rsvp?: string | null, rsvp_at?: string | null, invited_by?: string | null, resend_id?: string | null, sent_at?: string | null, delivered_at?: string | null, opened_at?: string | null, clicked_at?: string | null, bounced_at?: string | null, created_at?: string }
        Relationships: []
      }
      events: {
        Row: { id: string, title: string, description: string, event_date: string, start_time: string | null, location: string | null, location_url: string | null, poster_url: string | null, voting_locked_at: string | null, created_by: string | null, created_at: string }
        Insert: { id?: string, title: string, description?: string, event_date: string, start_time?: string | null, location?: string | null, location_url?: string | null, poster_url?: string | null, voting_locked_at?: string | null, created_by?: string | null, created_at?: string }
        Update: { id?: string, title?: string, description?: string, event_date?: string, start_time?: string | null, location?: string | null, location_url?: string | null, poster_url?: string | null, voting_locked_at?: string | null, created_by?: string | null, created_at?: string }
        Relationships: []
      }
      rsvps: {
        Row: { event_id: string, user_id: string, status: string, updated_at: string }
        Insert: { event_id: string, user_id?: string, status: string, updated_at?: string }
        Update: { event_id?: string, user_id?: string, status?: string, updated_at?: string }
        Relationships: []
      }
      bring_items: {
        Row: { id: string, event_id: string, label: string, note: string | null, user_id: string | null, created_by: string | null, created_at: string }
        Insert: { id?: string, event_id: string, label: string, note?: string | null, user_id?: string | null, created_by?: string | null, created_at?: string }
        Update: { id?: string, event_id?: string, label?: string, note?: string | null, user_id?: string | null, created_by?: string | null, created_at?: string }
        Relationships: []
      }
      suggestions: {
        Row: { id: string, event_id: string, user_id: string, tmdb_movie: TmdbMovie, deleted: boolean, created_at: string }
        Insert: { id?: string, event_id: string, user_id?: string, tmdb_movie: TmdbMovie, deleted?: boolean, created_at?: string }
        Update: { id?: string, event_id?: string, user_id?: string, tmdb_movie?: TmdbMovie, deleted?: boolean, created_at?: string }
        Relationships: []
      }
      votes: {
        Row: { suggestion_id: string, user_id: string, created_at: string }
        Insert: { suggestion_id: string, user_id?: string, created_at?: string }
        Update: { suggestion_id?: string, user_id?: string, created_at?: string }
        Relationships: []
      }
    }
    Views: { [_ in never]: never }
    Functions: {
      admin_set_admin: { Args: { target_id: string, value: boolean }, Returns: undefined }
      admin_set_blocked: { Args: { target_id: string, value: boolean }, Returns: undefined }
      is_allowed: { Args: Record<string, never>, Returns: boolean }
    }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}
