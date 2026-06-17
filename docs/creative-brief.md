# Creative Brief — Benteen Screen On The Green (BSOTG)

> _"It Really Whips the Movie's Ass."_

---

## 1. Snapshot

**Benteen Screen On The Green** is an invite-only web app for a neighborhood outdoor
movie night. Friends and neighbors get an e-vite, RSVP in one click, suggest films, and
vote on what plays next — turning "what should we watch?" into the fun part instead of the
argument. Admins run the show: schedule screenings, curate the guest list, send the
invites, and lock in the winners.

|             |                                                   |
| ----------- | ------------------------------------------------- |
| **Product** | Group movie-night voting + e-vite app             |
| **Setting** | Outdoor screenings on the green at Benteen Park, Atlanta |
| **Model**   | Invite-only community (allowlist), admin-curated  |
| **Tagline** | It Really Whips the Movie's Ass.                  |
| **Platform**| Responsive web app (mobile-first)                 |

---

## 2. Background & Context

What started as friends dragging a projector and a bedsheet onto the lawn has a ritual
problem: coordinating _who's coming_, _what we're watching_, and _who's bringing the
chairs_. Group texts don't scale, polls get lost, and the movie pick becomes a popularity
contest with no memory.

BSOTG replaces the chaos with a small, purpose-built home base — part **Evite**, part
**movie poll**, part **potluck sign-up** — scoped to one tight-knit community rather than
the public internet.

---

## 3. The Opportunity

Make the night feel like an **event**, not a logistics thread.

- Turn the film pick into a shared, suspenseful vote with a "double feature" payoff.
- Make showing up frictionless (one-click RSVP straight from the email — no account needed
  to reply).
- Give the hosts a real command center so running it is 5 minutes, not an evening of texts.

---

## 4. Objectives

1. **Drive RSVPs & attendance** — beautiful, one-tap e-vites with live open/reply tracking.
2. **Make voting the centerpiece** — every guest suggests + votes; the winner is earned,
   visible, and announced.
3. **Reduce host overhead** — events, guest list, invites, moderation, and results in one
   admin panel.
4. **Keep it intimate & safe** — invite-only by design; the community stays the community.

---

## 5. Audience

**Primary — The Guests (neighbors & friends).** Casual, mobile-first, here for a good
summer evening. They want to know _when, where, what's playing, what to bring_ — and reply
in two taps. Not tech-savvy by assumption; the experience must be obvious.

**Secondary — The Hosts/Admins.** Power users who curate everything: the calendar, the
guest list, the invites, the winners. They need control and clarity, not a spreadsheet.

---

## 6. Brand Personality

Playful, communal, cinematic, and a little irreverent — grassroots backyard-cinema energy,
never film-snob.

- **Warm & neighborly** — this is _our_ night, you're invited _in_.
- **Cheeky** — the tagline riffs on the old Winamp slogan; the brand winks.
- **Nostalgic-cinematic** — marquee letters, drive-in glow, popcorn, string lights,
  projector beam.
- **Unfussy** — opinionated defaults, minimal taps, no jargon.

**Voice & tone:** Conversational and confident. Short lines. Movie-buff references welcome,
gatekeeping not. "Will you be there?" over "Please confirm your attendance."

---

## 7. The Core Experience

**For guests**

- **Get invited** → themed e-vite email (poster, date/time, location + map, host's note)
  with **Going / Maybe / Can't** buttons.
- **Browse the night** → poster-backed event header, weather peek, the bring-list.
- **Suggest & vote** → search TMDB, nominate a film, vote on everyone's picks; watch the
  leaderboard move in real time.
- **See the winners** → when voting locks, the **Double Feature 🍿** is revealed and
  announced.

**For hosts (Admin command center)**

- Event CRUD (calendar of screenings, rich descriptions, posters)
- Guest directory + invite lists (Evite-style: open/click/RSVP tracking, roll the list
  forward per event)
- **E-vite editor** — theme (Marquee / Neon / Classic), accent, poster & detail toggles,
  personal message, **live preview**
- Suggestion moderation, ban/unban, grant/revoke admin
- **Lock voting** → ends voting, reveals winners, auto-announces
- Per-person and per-event stats drill-downs

---

## 8. Visual Direction

- **Mood:** dark, cinematic, after-sundown. Black/near-black canvas, a single bold
  **accent** (green by default; red/amber alternates).
- **Type:** condensed, marquee-style display for titles (Bebas-Neue feel) over a clean,
  legible body sans.
- **Motifs:** movie poster as hero imagery, film-strip/marquee accents, popcorn, RSVP
  "tickets," trophy/double-feature moments.
- **Layout:** mobile-first, generous tap targets, poster-forward cards, real-time counters.
- **Email:** template-driven and client-safe (renders in Gmail/Apple Mail), poster banner +
  bold title + one-click RSVP, theming that degrades gracefully.

---

## 9. Messaging Guidelines

- Lead with the **vibe and the ask**: _"You're invited to movie night 🎬 — will you be
  there?"_
- Always answer **when / where / what / what-to-bring** fast.
- Celebrate outcomes: a winner is a _moment_ ("Voting's closed — tonight's Double Feature
  is…").
- Keep CTAs human: _"I'm going," "See the lineup & vote," "Pull from last event."_
- Never feel corporate, never gatekeep taste.

---

## 10. Guardrails & Constraints

- **Invite-only** is sacred — nobody's in who wasn't invited; the community boundary is the
  product.
- **Privacy & safety** — guest emails never leaked (BCC blasts), security enforced at the
  database layer, admin powers granted out-of-band.
- **Email reality** — no custom fonts/JS in email; design to the lowest common client and
  preview before sending.
- **One source of truth** — the in-app e-vite preview must match exactly what sends.
- **Mobile-first, real-time** — most guests are on a phone; votes/RSVPs update live.

---

## 11. Success Looks Like

- A guest can go from email → RSVP'd in **under 10 seconds**, no login.
- Every attendee **suggests or votes** at least once per event.
- A host can **schedule, invite, and send** a movie night in **a few minutes**.
- Invites that look good enough that people **screenshot and share** them.
- The "winner reveal" becomes a small **event people look forward to**.

---

## 12. Roadmap (Future Creative Surface)

- **Community forum** — between-screenings chatter and post-mortems.
- **Karma-weighted voting** — reward the regulars; fight ballot-stuffing.
- **Guest count** — "+2 guests I'm bringing" on RSVP, surfaced in host stats.
- **Multi-tenancy** — let _other_ neighborhoods run their own Screen On The Green.

---

_Brief reflects the product as built and in flight. North star: make the night feel like an
event — easy to join, fun to vote on, satisfying to win._
