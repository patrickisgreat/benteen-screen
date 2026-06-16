/** A potluck "bring list" item. `user_id` null = an open slot anyone can claim. */
export interface BringItem {
  id: string
  event_id: string
  label: string
  note: string | null
  user_id: string | null
  created_by: string | null
  bringer: { display_name: string | null } | null
}
