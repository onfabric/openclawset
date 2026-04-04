---

name: OpenTable Booking
description: Book restaurant tables in London on OpenTable.

---

# OpenTable Booking

Book restaurants on OpenTable using the browser agent.

## When to Use

- Any request to book or reserve a restaurant table on OpenTable.
- Always use **opentable.co.uk**. Other OpenTable domains must not be used.
- If the restaurant is not in London, respond to the user immediately saying that you can only book for restaurants in London.

Do **not** use for SevenRooms, Resy, Tock, TheFork, or other booking platforms.

## Booking Flow

### 1) Parse request

Extract from the user's message:

- Restaurant name (required).
- Date (required).
- Time (required).
- Party size (required).
- Location (London).
- Seating preference (default: standard).
- Special request (default: none).

Before starting the browser agent, make sure to request the missing information if this is not already clear from the conversation.

### 2) Run the browser agent

Call `browser_agent_run` with a detailed task description. The browser agent is autonomous — it navigates, clicks, fills forms, and handles the booking flow. Include all specifics in the task:

```
browser_agent_run(task="""
Book a restaurant table on OpenTable with these details:
- URL: https://www.opentable.co.uk/s?covers={party_size}&dateTime={date}T{time}&term={restaurant}+london
- Party size: {party_size}
- Date: {date}
- Time: {time} (pick nearest available if exact time unavailable)
- Seating: {seating_preference}
- Special request: {special_request_text}

Steps:
1. Navigate to the search URL above.
2. Find and click on the restaurant "{restaurant}" in the search results.
3. If the date/time/party-size widget doesn't match, adjust it and click "Find a Table".
4. If no restaurant is shown, try searching for similar names to the one provided. If you can't find any STOP and let the user know.
5. Select the time slot closest to {time}. The time slots may be hidden links — scroll down and look for clickable time options.
6. If asked to choose between booking types (Standard vs tasting menu), select Standard unless specified otherwise.
7. On the booking details page, verify pre-filled guest info. If missing, STOP and let the user know.
8. Accept the terms and conditions checkbox if present.
9. Click "Complete reservation" or "Confirm".
10. If 3DS payment verification appears, STOP and report it — do not try to complete it.
11. Report the confirmation details: restaurant name, date, time, party size, and confirmation code.

IMPORTANT:
- The browser is already logged in — do NOT attempt to log in.
- If you see a cookie banner, dismiss it first.
- If a time slot is not directly clickable, it may need JavaScript interaction — try scrolling to it.
- If no availability is shown, report "No availability" with the date/time tried.
- Special request: {special_request_text}
""")
```

### 3) Handle the result

**If the agent reports success:**

- Extract confirmation number, restaurant, date, time, party size.

**If the agent reports 3DS verification:**

- Message the user: "Your bank is requesting 3DS verification. Please approve the payment on your banking app/device."
- Wait for the user to confirm, then run a follow-up `browser_agent_run` to check if the page advanced to a confirmation.

**If the agent reports no availability:**

- Tell the user and suggest trying a different date/time.

**If the agent reports it is not logged in:**

- Call `browser_agent_stop` immediately.
- Tell the user the browser profile needs to be re-authenticated for OpenTable.

### 4) Clean up

Always call `browser_agent_stop` when done (success or failure) to stop the browser agent.

## Error Handling

| Situation | Action |
| --- | --- |
| No availability | Report to user, suggest alternative date/time |
| Not logged in / login wall | Stop session, tell user to re-authenticate browser profile |
| Agent timeout (&gt;5 min) | Stop session, report to user, suggest retrying |
| 3DS verification | Ask user to approve on their banking app |
| Bot detection / CAPTCHA | Agent may handle it; if not, report to user |
| Task failed | Report the agent's error output to the user |

## Security & Privacy

- Card details are never read, logged, or transmitted — they are pre-filled by OpenTable from the user's saved account.
- No environment variables or API keys are required.
- The browser profile is pre-authenticated — no credentials are entered at runtime.