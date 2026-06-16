# NFT Sales X Bot

This bot listens for OpenSea `item_sold` events for LEFT CLICK LABZ collections and posts a sale announcement to X with the NFT image when OpenSea provides a supported image URL.

It does not use a normal X username/password. X auto-posting uses Developer API credentials for the bot account.

## Setup

```bash
cd /Users/mitchgach/Documents/Codex/2026-06-14/can-you-make-a-sales-bot/sales-bot
cp .env.example .env
npm install
npm run preview
npm start
```

Fill in `.env`:

```bash
OPENSEA_API_KEY=your_opensea_api_key
OPENSEA_COLLECTION_SLUGS=smithsnfts,noidsofficial,abstractors-abstract,megahoneybadgers,buumeeofficial
COLLECTION_LABELS="smithsnfts:SMITHS,noidsofficial:NOIDS,abstractors-abstract:ABSTRACTORS,megahoneybadgers:MEGA HONEY BADGERS,buumeeofficial:BUUMEE"
OPENSEA_POLL_ENABLED=true
OPENSEA_POLL_INTERVAL_MS=300000
OPENSEA_POLL_LOOKBACK_MS=600000
DRY_RUN=false

X_API_KEY=your_x_api_key
X_API_SECRET=your_x_api_secret
X_ACCESS_TOKEN=your_bot_user_access_token
X_ACCESS_SECRET=your_bot_user_access_secret
X_OAUTH2_CLIENT_ID=your_oauth2_client_id
X_OAUTH2_CLIENT_SECRET=your_oauth2_client_secret_required_for_oauth2_only
X_OAUTH2_ACCESS_TOKEN=your_oauth2_access_token
X_OAUTH2_REFRESH_TOKEN=your_oauth2_refresh_token
X_OAUTH2_TOKEN_FILE=.env
POST_IMAGES=true
REQUIRE_IMAGES=true
ENS_LOOKUP=true
ETH_RPC_URL=
ENS_TIMEOUT_MS=5000
USD_CONVERSION=true
ETH_USD_SOURCE_URL=https://api.coinbase.com/v2/prices/ETH-USD/spot
ETH_USD_TIMEOUT_MS=3000
ETH_USD_CACHE_MS=120000
```

For X, create an app in the X Developer Portal and generate OAuth 1.0a user-context keys with read/write access while logged in as the bot account. The bot prefers OAuth 1.0a for posting because those user tokens do not expire every two hours. OAuth 2.0 is still supported as a fallback, but OAuth2-only mode requires `tweet.read`, `tweet.write`, `users.read`, `offline.access`, an access token, a refresh token, and the full OAuth 2.0 client secret so refresh can continue after token expiry.

## Run live

The current local setup is configured with `DRY_RUN=false`, so a matching OpenSea sale posts to X.

For a foreground run:

```bash
npm start
```

To catch up historical sales:

```bash
npm run backfill -- --hours=12
```

For the always-on Mac LaunchAgent, the installed runtime lives at:

```text
/Users/mitchgach/Library/Application Support/LeftClickLabzSalesBot
```

LaunchAgent logs are written to:

```text
/Users/mitchgach/Library/Application Support/LeftClickLabzSalesBot/.state/bot.log
/Users/mitchgach/Library/Application Support/LeftClickLabzSalesBot/.state/bot.err.log
```

## Run in the cloud

This repo includes `render.yaml` for a Render background worker. A cloud worker keeps the bot running when your computer is off.

Render setup:

1. Push this folder to a GitHub repo.
2. Open Render's Blueprint flow for that repo.
3. Fill the secret environment variables marked `sync: false`.
4. Apply the Blueprint.

The Blueprint uses a `starter` background worker and a persistent disk at `/var/data`. Render's current Blueprint docs do not allow the `free` plan for background workers, so this is the smallest always-on worker plan.

The bot stores posted sale IDs in `.state/posted-sales.json` so reconnects do not repost the same sale.

If X rejects a post because credits are not available or the API is temporarily down, the sale stays in the same state file as a pending sale. The bot retries pending sales every minute with backoff and removes them only after X accepts the post.

## Tweet format

Tweets look like:

```text
THE LEGEND @buyer LEFT CLICKED!
SMITHS: Smith #123
Sold for 1.23 WETH ($4,000 USD)
From: leftclicklabz.eth -> 0x1234...abcd
Tx: 0xbeef...cafe
CLICK. COLLECT. CREATE CULTURE.
```

Tweet text intentionally omits OpenSea and Etherscan URLs so X bills the cheaper non-URL post tier. The NFT image is still uploaded as media.

## Notes

- The configured collection slugs are `smithsnfts`, `noidsofficial`, `abstractors-abstract`, `megahoneybadgers`, and `buumeeofficial`.
- OpenSea image URLs are uploaded to X when `POST_IMAGES=true`.
- When `REQUIRE_IMAGES=true`, a sale with an image URL stays queued for retry if X rejects the image upload instead of posting text-only.
- ENS reverse lookup is enabled with `ENS_LOOKUP=true`. Add a reliable Ethereum mainnet RPC URL to `ETH_RPC_URL` for production; if a wallet has no ENS name, the bot uses a shortened wallet address, never the full address.
- USD conversion is enabled with `USD_CONVERSION=true`. The bot uses a cached ETH/USD spot price for the USD amount; if the price lookup fails, it still posts the sale without the USD suffix.
- ETH and WETH sales are both treated as ETH-equivalent for sale filtering and USD conversion.
- OpenSea account profiles are checked for linked X/Twitter handles. If a buyer or seller has one connected publicly, the bot adds it next to that wallet in the tweet.
- If the buyer has a linked X/Twitter handle, the tweet opens with `THE LEGEND @handle LEFT CLICKED!`; otherwise it opens with `A LEGEND LEFT CLICKED!`.
- The bot posts only after a successful X API call when `DRY_RUN=false`.
- If X returns permission errors, regenerate OAuth 2.0 user tokens after enabling `tweet.write` and `offline.access`.
- If X returns `CreditsDepleted`, the bot is listening correctly but X is refusing paid write calls until the developer account/app has usable credits.
- The bot does not set any X Ads or paid-promotion flags. X controls any "Paid promotion" label separately from normal API posting.
