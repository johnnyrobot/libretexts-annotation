# Use passage notes in LibreTexts

This guide covers the supplied integrated textbook interface. Your institution will provide the deployed textbook address and an admitted annotation account. Public textbook reading does not require an annotation account. Saving private highlights or joining a course discussion requires an admitted account.

## Open passage notes and sign in

1. Open the textbook page you want to read.
2. Select **Discuss this page**. The panel is titled **Passage notes**.
3. Enter your annotation account in **Username** and **Password**, then select **Sign in**.
4. Check **Signed in as** before you save or post. The annotation account form is inside Passage notes; the textbook's separate sign-in control is not this form.

Use the account supplied for this course. This release does not provide self-service account creation or a general course selector. It uses a configured private course audience.

## Choose the passage you mean

For pointer selection, drag across supported prose in the textbook. The selection actions offer **Highlight** and **Discuss**. The entry control also changes to **Discuss selected text**. Select an action, then check the **Selected passage** quote in the panel.

To change the target while the panel is open, select another supported quote in the textbook. The panel updates to that selection. Check the quote again before saving. Moving between passages retains their drafts within this open page. A pending operation must be reconciled before changing passages.

For a keyboard alternative:

1. Open **Passage notes**.
2. Expand **Choose a passage with the keyboard**.
3. Choose an item in **Choose a passage**.
4. Select **Use whole passage**, or enter text in **Exact quote (optional)**.
5. If the same text repeats, set **Quote occurrence** to the occurrence you mean, starting at 1.
6. Select **Use exact quote** and check the selected-passage preview.

The exact quote must occur in the chosen passage. Selection across unsupported content or changed source text is refused. Return to the original prose rather than assuming a translated, transformed, or mathematical rendering supplies an equivalent target.

## Keep a private highlight or note

1. Select the passage and choose **Highlight**. Alternatively, choose **My highlights** after checking the selected passage.
2. To add text, expand **Add a personal note or topics**.
3. Enter an optional **Personal note (optional)** and comma-separated **Topics (optional, comma separated)**.
4. Select **Save highlight**.
5. Wait for **Personal highlight saved. Only you can see it.**

The personal note limit is 4,000 characters. A note is optional. The panel says **Only you · your highlights and notes are private**. Course members do not receive this private note.

To revisit a saved item, return to its textbook page and open **My highlights**. Items appear under **Saved on this page**. Acknowledged saves persist after reload; unsaved drafts do not.

Use **Edit personal note** to revise the note or topics, then **Save changes**. **Delete my highlight** removes that personal record. Hiding highlights is the reversible display choice if you only want the marks out of the way.

## Ask the course about a passage

1. Select the quote and choose **Discuss**, or choose the panel's **Discuss** view.
2. Check **Course discussion · visible to admitted course members** and the selected passage.
3. Enter **Your question** under **Ask about this passage**.
4. Optionally expand **Add topics** and enter comma-separated topics.
5. Select **Post question**.
6. Wait for **Saved and acknowledged** before treating the post as saved.

Questions require text and allow up to 4,000 characters. **Discuss this highlight** opens the question composer on a saved personal passage. It does not copy the personal note into the question or publish automatically. Enter the text you intend the course to see, then post it deliberately.

To reply, find the question, enter **Your reply**, and select its **Post reply**. Replies require text and allow up to 4,000 characters. Use **Refresh discussion** to fetch current discussions and marks. The interface does not promise automatic live updates.

Each question starts a separate thread. Replies remain in their actual chronological order beneath that question. Indentation shows the reply relationship, not a person's rank or a new nested conversation.

## Revisit marks and handle overlaps

Use **Hide highlights** to hide on-page marks without deleting saved records. **Show highlights** restores their display.

Click a visible mark to open its annotation choices. When several records cover the same text, the panel says **Choose an overlapping annotation**. Use the visible audience, quote, and author to choose the intended record.

**Jump to passage** locates the saved quote in the reading. **Open discussion** opens the corresponding course thread. These controls also provide a list-based route when on-page marks are unavailable. If a jump cannot locate the passage, follow the message to return to the original source.

A **Stale source** message means the saved history is retained but the mark has not been moved to different text. Do not assume that an old annotation now belongs to a similar sentence in a newer revision.

## Find and export permitted annotations

1. Choose **Find & export**.
2. Enter a quote, note, reply text, or topic in **Search this page**.
3. Optionally enter the exact displayed name or username in **Author (optional)**. Capitals matter: `Morgan` matches, while `morgan` and `morg` do not.
4. Choose **Search audience**.
5. Select **Search annotations**.

The free-text **Search this page** box matches parts of words without regard to capitals. Search is limited to this textbook page and records you may access. **All permitted annotations** includes your private highlights and authorized course discussion. **Mine** includes your private highlights and course threads you authored or replied to. **Course discussion** excludes personal highlights. An empty result is not evidence that inaccessible records do not exist.

Select **Export JSON** to download `libretexts-annotations.json` using the current page and filter values. The download contains only permitted results with original source references. It uses W3C Web Annotation concepts and additional LibreTexts fields. There is no CSV export, import button, or verified round trip into Hypothesis, Recogito, or NB. A downloaded file can contain your private notes; choose where to keep or share it.

## Recover an uncertain save

If you see **Submission outcome unknown** or **Highlight outcome unknown**, keep the page open. Sign in with the original account if needed, then select **Check pending submission**. For a highlight, use **Check pending highlight**. Recovery checks the original request and uses the same request identity when a retry is needed. Do not create a second copy to test whether the first saved.

If the message says **Saved and acknowledged** but refresh failed, the save was acknowledged. Use **Refresh discussion** to retrieve it. The same distinction applies when a highlight is reported saved but the list cannot refresh.

Unsent question, reply, note, and topic drafts live in page memory. Closing and reopening the panel on that page can retain them. Reloading, leaving the page, or signing out can lose them. Explicit sign-out clears page drafts. Session expiry can preserve a draft for the same account in the still-open page; a different account does not inherit it. Pending-recovery information is also page memory. After a reload that loses it, inspect existing saved records before posting again.

When **Stay signed in** appears, select it to request a session extension. If extension fails, use the displayed message; do not assume the session was renewed.

## Read the visual cues

Personal on-page marks are yellow; course marks are pale blue. Author accents use a restrained palette beside visible names and initials. An author color can be shared by several people and does not identify a role, permission, unread state, or grade.

Names, audience text, reply indentation, dividers, and connectors convey structure without color. The selected-passage area identifies the composing target. The question action is filled, while reply actions are outlined. Disabled controls retain muted styling. Keyboard focus has a visible outline.

On desktop, the panel sits beside the reading. On narrow screens, it occupies the lower part of the page. Scroll within the panel to reach controls. **Close** or Escape closes the panel and returns focus to the prior control when possible.

The layout groups participation under continuous vertical rules: **Passage context**, **Ask about this passage** and **Conversations**. Account, view and refresh controls form a separate navigation/utility band. Reply messages and their composer are indented with connectors; they remain attached to the original question. Use these headings and positions as well as the colors.

Example images supplied with an engineering release must use synthetic discussions and match its source version; they are not evidence of a particular production host.

## Know the release limits

The integrated panel exposes questions and replies, not instructor resolve/reopen or moderation controls. You cannot currently delete a course question or reply. Deleting your own private highlight is a separate action; it does not remove a course discussion. Unread badges, presence, live notifications, and ADAPT assignments or assessed snapshots are separate roadmap work.

Keyboard, responsive layout, contrast, reflow, and noncolor behavior have bounded local checks. Actual VoiceOver was skipped by the owner. This release does not claim whole-site accessibility conformance. Listen and audio were not retested for this visual release.

For the rationale and origins, read [Design and sources](DESIGN-AND-SOURCES.md).
