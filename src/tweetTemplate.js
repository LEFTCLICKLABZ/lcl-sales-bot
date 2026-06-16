const MAX_TWEET_LENGTH = 280;

function compactLines(lines) {
  return lines.filter(Boolean).join("\n");
}

function estimatedTweetLength(text) {
  return text.length;
}

function fitsTweet(text) {
  return estimatedTweetLength(text) <= MAX_TWEET_LENGTH;
}

function walletWithHandle(wallet, handle) {
  if (!wallet) return handle || "";
  return handle ? `${wallet} (${handle})` : wallet;
}

function priceWithUsd(sale) {
  const cryptoPrice = `${sale.amount} ${sale.symbol}`;
  return sale.usdDisplay ? `${cryptoPrice} (${sale.usdDisplay} USD)` : cryptoPrice;
}

function saleTitle(sale) {
  return sale.buyerXHandle
    ? `THE LEGEND ${sale.buyerXHandle} LEFT CLICKED!`
    : "A LEGEND LEFT CLICKED!";
}

function buildTweet(sale, options) {
  const title = saleTitle(sale);
  const collectionName = sale.collectionName || "NFT";
  const price = priceWithUsd(sale);
  const hashtags = options.hashtags.join(" ");
  const fromWallet = walletWithHandle(
    sale.sellerDisplay || sale.sellerShort || sale.seller,
    sale.sellerXHandle,
  );
  const toWallet = walletWithHandle(
    sale.buyerDisplay || sale.buyerShort || sale.buyer,
    sale.buyerXHandle,
  );
  const walletFlow = fromWallet && toWallet
    ? `From: ${fromWallet} -> ${toWallet}`
    : "";
  const details = compactLines([
    title,
    `${collectionName}: ${sale.name}`,
    `Sold for ${price}`,
    walletFlow,
    "",
    "CLICK. COLLECT. CREATE CULTURE.",
    hashtags,
  ]);

  if (fitsTweet(details)) return details;

  const shorterName = sale.name.length > 56 ? `${sale.name.slice(0, 53)}...` : sale.name;
  const fallback = compactLines([
    title,
    `${collectionName}: ${shorterName}`,
    `Sold for ${price}`,
    walletFlow,
    "CLICK. COLLECT. CREATE CULTURE.",
    hashtags,
  ]);

  if (fitsTweet(fallback)) return fallback;

  const minimal = compactLines([
    title,
    `${shorterName} sold for ${price}`,
    walletFlow,
    hashtags,
  ]);
  return minimal;
}

module.exports = {
  buildTweet,
  priceWithUsd,
  saleTitle,
};
