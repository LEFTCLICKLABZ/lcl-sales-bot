const { buildTweet } = require("./tweetTemplate");

const sampleSale = {
  name: "Smith #123",
  collectionName: "SMITHS",
  amount: "1.2345",
  symbol: "ETH",
  usdDisplay: "$4,000",
  sellerDisplay: "leftclicklabz.eth",
  buyerDisplay: "0x1234...abcd",
  buyer: "0x1234567890abcdef1234567890abcdef1234abcd",
  seller: "0xabcdabcdabcdabcdabcdabcdabcdabcdabcd1234",
  buyerShort: "0x1234...abcd",
  sellerShort: "0xabcd...1234",
  buyerXHandle: "@legend",
  txShort: "0xbeef...cafe",
  txHash: "0xbeef00000000000000000000000000000000000000000000000000000000cafe",
  txUrl: "https://etherscan.io/tx/0xbeef00000000000000000000000000000000000000000000000000000000cafe",
  imageUrl: "https://example.com/nft.png",
  permalink: "https://opensea.io/assets/ethereum/0x0000000000000000000000000000000000000000/123",
};

console.log(buildTweet(sampleSale, { hashtags: [] }));
