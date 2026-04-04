---

name: Amazon Purchase
description: Purchase a specific product on amazon.co.uk.

---

# Amazon Purchase

Purchase a specific, already-decided product on Amazon.co.uk using the browser agent.

## When to Use

- The user has identified a **specific product** they want to buy on Amazon.
- Always use **amazon.co.uk**. Other Amazon domains must not be used.
- The user is already authenticated, has a saved payment card and a delivery address.

Do **not** use to browse, compare, or explore products. Use `web_search` and `web_fetch` for research first, then use the browser only once the user has made a decision.

## Budget Rule

**Maximum order total: £30.** If the product (including any variants) exceeds £30, do not proceed.

## Purchase Flow

### 1) Parse request

Extract from the user's message:

- Product name or description (required).
- Maximum acceptable price (required — hard cap £30).
- Preferred variant: colour, size, edition, format, etc. (default: none).
- Quantity (default: 1).

Before starting the browser agent, make sure all required fields are present. If the product is ambiguous or has known variants (e.g. book formats, clothing sizes), ask the user which option they want.

### 2) Price check (optional but recommended)

Use `web_search` to quickly verify the product's approximate price on Amazon.co.uk before launching the browser. If the price clearly exceeds £30 or the user's stated max, inform them and ask whether to proceed.

### 3) Run the browser agent

Call `browser_agent_run` with a detailed task description. The browser agent is autonomous — it navigates, clicks, fills forms, and handles the purchase flow. Include all specifics in the task:

```
browser_agent_run(task="""
Purchase a product on Amazon.co.uk with these details:
- Search URL: https://www.amazon.co.uk/s?k={product_search_query}
- Product: {product_name}
- Preferred variant: {variant or "cheapest available"}
- Quantity: {quantity}
- Maximum price: £{max_price} (do NOT proceed if the price exceeds this)

Steps:
1. Navigate to the search URL above.
2. Find the correct product in the search results. Match by product name. If multiple similar results appear, pick the one that best matches the description.
3. Click through to the product page.
4. IMPORTANT — Check available options before adding to basket:
   - If there are variant selectors (format, colour, size, edition), review all options.
   - Select the preferred variant if specified, otherwise pick the cheapest option.
   - Verify the price. If it exceeds £{max_price}, STOP and report the price — do not add to basket.
5. Set quantity to {quantity} if not already correct.
6. Click "Add to Basket".
7. Navigate to the basket: https://www.amazon.co.uk/gp/cart/view.html
8. Verify the basket contains ONLY this product at the correct variant and quantity.
   - If there are other items in the basket, delete them first.
   - Verify the subtotal is within budget (£{max_price}).
9. Click "Proceed to checkout".
10. On the checkout page(s), handle whatever Amazon shows:
    - Delivery address: verify it looks correct, click "Use this address" or equivalent.
    - Payment method: verify a card is shown (do NOT enter card details). Click "Continue" or equivalent.
    - Delivery speed: select the cheapest/free option.
    - "Place your order": click it to complete.
11. After each step, verify the page advanced. If stuck on the same page after 3 attempts, STOP and report.
12. Report the confirmation: order number, product name, price paid.

IMPORTANT:
- The browser is already logged in — do NOT attempt to log in.
- If you see a cookie banner, dismiss it first.
- If Amazon requests OTP/verification, STOP and report it — the user will provide the code.
- If CAPTCHA or bot detection appears, STOP and report it.
- If the product is unavailable or out of stock, STOP and report it.
- Card details are pre-saved — never enter payment information.
""")
```

### 4) Handle the result

**If the agent reports success:**

- Extract order number, product name, variant, price paid.
- Report to the user.

**If the agent reports price exceeds budget:**

- Tell the user the actual price and ask whether to proceed or cancel.
- If they confirm, re-run with an updated max_price (still hard-capped at £30).

**If the agent reports OTP/verification required:**

- Ask the user for the code.
- Run a follow-up `browser_agent_run` to enter the code and continue checkout.

**If the agent reports unavailable/out of stock:**

- Tell the user and suggest alternatives if the agent found any.

**If the agent reports it is not logged in:**

- Call `browser_agent_stop` immediately.
- Tell the user the browser profile needs to be re-authenticated for Amazon.

### 5) Clean up

Always call `browser_agent_stop` when done (success or failure) to stop the browser agent.

## Error Handling

| Situation | Action |
| --- | --- |
| Product not found | Report to user, suggest refining the search |
| Out of stock | Report to user, mention if Kindle/alternative format available |
| Price exceeds max_price or £30 cap | Stop, report price, ask user to confirm or cancel |
| Not logged in / login wall | Stop session, tell user to re-authenticate browser profile |
| Agent timeout (>5 min) | Stop session, report to user, suggest retrying |
| OTP / 2FA verification | Ask user for the code |
| 3DS payment verification | Ask user to approve on their banking app |
| Bot detection / CAPTCHA | Report to user |
| Multiple variants unclear | Stop, list options, ask user to choose |

## Security & Privacy

- Card details are never read, logged, or transmitted — they are pre-filled by Amazon from the user's saved account.
- No environment variables or API keys are required.
- The browser profile is pre-authenticated — no credentials are entered at runtime.
- The delivery address has already been provided.
