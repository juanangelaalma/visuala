# Video chat opening and immediate replies

## Goal

After a user continues from video setup into the workspace, the AI asks the first question before the user types. Sending typed answers or clicking any answer option immediately shows a user bubble; an assistant reply appears when the API responds. Options disappear as soon as an answer is submitted.

## Backend opening

Add an authenticated, owner-scoped `POST /video-projects/:projectId/messages/opening` endpoint. Its application use case reads the project and existing messages. If there is already a transcript, return it without generating another question. Otherwise run the existing interviewer with a transient instruction to begin (never saved as a user message) and null draft, validate that it produced a usable question and controls, and persist the assistant message. Use a stable opening message ID derived from the project's UUID so concurrent opening requests cannot create two opening messages; on the expected unique-key conflict, read and return the existing transcript. Recheck the transcript after generation before persisting, so an already-started interview takes priority. Do not save an empty draft or advance the project to interviewing until the first user reply. If generation fails, return a safe error and allow retry without writing a partial opening.

Keep the generated question and control data in `video_messages`; the normal message listing and subsequent interviewer turn will then see the same first question after reload. Existing projects with messages do not receive a second opener. Do not modify the in-progress interviewer or conversation changes already present in the working tree.

## Frontend interaction

The workspace requests the opening only when the initial loaded transcript is empty and the project can still be interviewed. Show a loading state and retryable error in chat during opening; do not invite the user to type first. Use the returned persisted message to render the first assistant bubble and any options. Prevent stale opening responses after navigation or unmount.

For outgoing replies, retain the existing workspace while waiting. Optimistically add a temporary user message at submission time, clear the composer, and hide controls immediately. Disable repeat submissions while pending. After a successful API response, replace the temporary message with the persisted user message and append the assistant reply, then refresh the other workspace panels without blanking the chat. On failure, remove the temporary bubble, restore the draft or selection, reveal the options again, and show a safe retryable error. On later reloads, server messages are authoritative and must not duplicate optimistic entries.

Clicking an option submits its label directly for both single- and multi-select questions, as requested. A multi-select click therefore represents one answer for that turn, not an accumulated selection. The free-text composer remains available for a custom answer.

## Validation

Add backend tests for empty, existing, concurrent, and failed opening requests, including owner scoping. Add frontend tests for the initial AI question, immediate bubble and option removal, reply reconciliation, and failed submission recovery. Run the focused backend and frontend Vitest suites, package lint/type checks, and update graphify after code changes.
