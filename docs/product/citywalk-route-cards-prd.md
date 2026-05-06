# Citywalk Route Cards PRD

## Goal

Help C-end young users generate themed, executable citywalk route cards for weekend and short city trips.

## Core User Problem

Users want a route that is attractive enough to share but concrete enough to actually follow.

## Market Reference

- Wanderlog validates an itinerary workspace pattern: itinerary, map view, collaboration, reservations, route optimization, and budgeting belong around the same trip object.
- Roadtrippers validates route-first editing: users add, remove, and optimize stops around a route instead of treating generation as a one-shot answer.
- TripIt validates the value of a single itinerary timeline: travel details become useful when the user can see where to be, when, and how to get there.

AI Trip should not copy these products wholesale. The near-term wedge is a lighter C-end personal travel route workbench: generate a real route, adjust it with simple requests, save the better version, then share it.

## MVP Scope

1. Create a trip from city, date range, preference chips, and natural-language notes.
2. Optionally import a lightweight place list or existing itinerary text.
3. Generate one best route plan from the user's description; do not ask users to pick route templates.
4. Use real POI candidates, AI route arrangement, public web evidence, and local fallback behavior where configured.
5. Review map, DAY tabs, timeline, selected-stop details, route reasons, confidence, evidence, risks, and pre-trip checklist.
6. Select map markers and timeline rows inside AI Trip without leaving the app.
7. Revise a generated route with quick actions, selected-stop actions, drag reorder, or a natural-language adjustment note.
8. Save generated route cards.
9. Reopen and delete saved route cards from "My Trips".
10. Open share pages and poster/story wrappers as secondary packaging.

## First Themes

1. Classic first-time route.
2. Easy citywalk.
3. Rain-friendly backup route.
4. Food-linked route.
5. Night-view half-day route.
6. Low-budget route.

## Non-Goals

- Native iOS app.
- Go backend.
- Community feed.
- Booking.
- Multi-user collaboration.
- Full drag-and-drop route editing.
