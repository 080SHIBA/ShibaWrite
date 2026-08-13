# ShibaWrite Backend

Content-scoring and reward-signing backend for ShibaWrite. This is the
off-chain half of the system that pairs with `ShibaWrite.sol` and
`Marketplace.sol`.

## What this service does

1. **Authenticates writers** via Sign-In With Ethereum (SIWE) — no
   passwords, just a wallet signature.
2. **Scores submitted content** through two parallel checks:
   - `plagiarism.service.ts` — Winston AI (AI-generation + plagiarism)
   - `quality.service.ts` — Google Gemini (authenticity, depth, structure, relevance)
3. **Applies a decision tree** (`scoring.service.ts`) — auto-approve,
   auto-reject, or queue for human review.
4. **Signs EIP-712 reward claims** (`signing.service.ts`) that the
   frontend submits directly to `ShibaWrite.sol`'s `approvePost()`.
   The domain and typed struct here are hand-matched to the contract's
   `REWARD_TYPEHASH` — if you ever change one, change the other.

The blockchain never runs plagiarism checks or LLM calls itself — it
only ever verifies a signature that says "the backend's MINTER_ROLE
wallet approved this exact claim." This service is what produces
that signature.

## Stack

- Node.js + TypeScript
- Express
- PostgreSQL via Prisma
- ethers.js v6 (EIP-712 signing)
- siwe (wallet authentication)
- Google Gemini (quality scoring — free tier, no credit card)
- Winston AI (plagiarism / AI-detection — free 2,500 credits, no credit card)

## Why these two providers specifically (testing-stage friendly)

Both were chosen so you can run the full scoring pipeline through
your testing and investor-demo phase at zero cost:

- **Winston AI** gives every new developer account 2,500 free
  credits with no credit card required — get a key at
  [dev.gowinston.ai/register](https://dev.gowinston.ai/register).
- **Google Gemini**'s free tier is rate-limited rather than
  credit-metered, doesn't expire the way a one-time trial credit
  does, and needs no credit card either — get a key at
  [aistudio.google.com/apikey](https://aistudio.google.com/apikey).

Anthropic's API was the original pick for quality scoring, but it
only offers a one-time ~$5 trial credit rather than an ongoing free
tier, which runs out fast under real testing volume. `quality.service.ts`
is written so swapping providers later (back to Claude, or to GPT)
only touches that one file — the `QualityResult` interface it returns
stays identical, so nothing else in the pipeline needs to change.

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Copy the environment template and fill in real values
cp .env.example .env

# 3. Set up the database
npm run prisma:generate
npm run prisma:migrate

# 4. Start the dev server
npm run dev
```

The server starts on `http://localhost:4000` by default. On startup it
logs the minter wallet address it's signing with — cross-check this
against the `MINTER_ROLE` you granted in `ShibaWrite.sol`'s constructor.

## Environment variables

See `.env.example` for the full list with comments. The two that need
the most care:

- `MINTER_PRIVATE_KEY` — the wallet signing every reward claim. Must
  hold `MINTER_ROLE` on your deployed `ShibaWrite.sol`. Never commit
  this, never log it, never expose it in any API response.
- `CONTRACT_ADDRESS` / `CHAIN_ID` — must exactly match your deployed
  contract and network (Base Sepolia = 84532, Base Mainnet = 8453),
  or every signature this service produces will fail verification
  on-chain.
- `WINSTON_AI_API_KEY` — free at dev.gowinston.ai/register (2,500 free credits).
- `GEMINI_API_KEY` — free at aistudio.google.com/apikey (rate-limited, no card).

## API Reference

### Auth

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/auth/nonce` | none | Issues a one-time SIWE nonce |
| POST | `/api/auth/verify` | none | Verifies signed SIWE message, sets session cookie |
| POST | `/api/auth/logout` | none | Clears the session cookie |
| GET | `/api/auth/me` | session | Returns the current wallet address |

**Frontend SIWE flow:**
```
1. GET  /api/auth/nonce           → { nonce }
2. Build a SiweMessage with that nonce, ask MetaMask to sign it
3. POST /api/auth/verify { message, signature } → sets cookie, returns walletAddress
```

### Posts

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/posts/submit` | session | Submit content for scoring + reward signing |
| GET | `/api/posts/mine` | session | List the authenticated writer's post history |
| POST | `/api/posts/:postId/mark-claimed` | session | Mark a post's reward as claimed on-chain |

**Submit request body:**
```json
{
  "title": "How Base Layer 2 Actually Works",
  "content": "...(200-3500 words)...",
  "category": "TechnicalTutorial"
}
```
Valid `category` values: `ShortLifestyle`, `OpinionBlog`, `FictionNovel`,
`LongJournalism`, `TechnicalTutorial`, `AcademicResearch` — these map
directly to the `Category` enum indices in `ShibaWrite.sol`.

**Response when approved:**
```json
{
  "status": "APPROVED",
  "reason": "Combined score 82/100 met the auto-approve threshold",
  "claim": {
    "writer": "0x...",
    "postId": "0x...",
    "wordCount": 1024,
    "categoryId": 4,
    "qualityScore": 155,
    "nonce": "3",
    "expiry": 1735689600,
    "signature": "0x..."
  }
}
```
The frontend takes `claim` and calls `approvePost(...)` on
`ShibaWrite.sol` with these exact fields, in this order.

### Writers

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/writers/:address` | none | Public profile lookup |
| PATCH | `/api/writers/me` | session | Update your own display name / bio |

## Project structure

```
src/
├── config/         Environment validation + shared constants (mirrors ShibaWrite.sol)
├── db/             Prisma client singleton
├── middleware/     Auth (JWT) and centralized error handling
├── services/       SIWE, plagiarism, quality, scoring orchestration, EIP-712 signing
├── controllers/    Route handler logic
├── routes/         Express route definitions
├── types/          Shared TypeScript types
├── utils/          Logger
└── server.ts       App entry point
```

## Notes on production readiness

- Swap `express-rate-limit`'s in-memory store for a Redis store before
  running multiple server instances behind a load balancer.
- The `WINSTON_AI_API_KEY` integration in `plagiarism.service.ts` and
  the `GEMINI_API_KEY` integration in `quality.service.ts` are written
  against each provider's documented API shape as of this writing —
  verify the endpoint/response fields against their current docs
  before going live, third-party APIs do change. Both are free-tier
  friendly for testing, but before real launch volume, check current
  rate limits and pricing on each provider's site — Winston AI's free
  credits will eventually run out, and Gemini's free-tier rate limits
  are tightened periodically.
- Consider adding a `/api/posts/pending-review` admin-only endpoint
  plus a moderator dashboard once volume justifies it — right now
  `HUMAN_REVIEW` posts just sit in the database with that status.
