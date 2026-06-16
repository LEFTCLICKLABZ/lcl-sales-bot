const { TwitterApi } = require("twitter-api-v2");
const fs = require("node:fs");

const SUPPORTED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/bmp",
  "image/png",
  "image/webp",
  "image/pjpeg",
  "image/tiff",
]);

function normalizeImageUrl(url) {
  if (!url) return "";
  if (url.startsWith("ipfs://")) {
    return `https://ipfs.io/ipfs/${url.slice("ipfs://".length)}`;
  }
  return url;
}

function cleanMimeType(contentType = "") {
  return contentType.split(";")[0].trim().toLowerCase();
}

function setEnvValue(contents, key, value) {
  if (!value) return contents;
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");

  if (pattern.test(contents)) {
    return contents.replace(pattern, line);
  }

  const separator = contents.endsWith("\n") || contents.length === 0 ? "" : "\n";
  return `${contents}${separator}${line}\n`;
}

function persistOAuth2Tokens(config, tokens) {
  if (!config.oauth2TokenFile || !tokens.accessToken) return;

  try {
    const current = fs.existsSync(config.oauth2TokenFile)
      ? fs.readFileSync(config.oauth2TokenFile, "utf8")
      : "";
    let next = setEnvValue(current, "X_OAUTH2_ACCESS_TOKEN", tokens.accessToken);
    next = setEnvValue(next, "X_OAUTH2_REFRESH_TOKEN", tokens.refreshToken);
    fs.writeFileSync(config.oauth2TokenFile, next, { mode: 0o600 });
  } catch (error) {
    console.warn(`OAuth 2 token refresh succeeded but could not persist tokens: ${error.message}`);
  }
}

function shouldRefreshOAuth2(error) {
  const code = Number(error?.code || error?.status || error?.data?.status || 0);
  const message = String(error?.message || "");
  return code === 401 || message.includes("Unauthorized");
}

function hasOAuth1Credentials(config) {
  return Boolean(config.apiKey && config.apiSecret && config.accessToken && config.accessSecret);
}

async function downloadImage(imageUrl, maxBytes) {
  const normalizedUrl = normalizeImageUrl(imageUrl);
  if (!normalizedUrl) return null;

  const response = await fetch(normalizedUrl, {
    headers: {
      Accept: "image/png,image/jpeg,image/webp,image/bmp,image/tiff",
      "User-Agent": "left-click-labz-sales-bot/0.1",
    },
  });

  if (!response.ok) {
    throw new Error(`Image fetch failed with ${response.status} for ${normalizedUrl}`);
  }

  const contentLength = Number(response.headers.get("content-length") || "0");
  if (contentLength > maxBytes) {
    throw new Error(`Image is too large: ${contentLength} bytes`);
  }

  const mimeType = cleanMimeType(response.headers.get("content-type") || "");
  if (!SUPPORTED_IMAGE_TYPES.has(mimeType)) {
    throw new Error(`Unsupported image type: ${mimeType || "unknown"}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > maxBytes) {
    throw new Error(`Image is too large: ${buffer.length} bytes`);
  }

  return { buffer, mimeType };
}

function createXPoster(config) {
  if (hasOAuth1Credentials(config)) return createOAuth1Poster(config);
  if (config.oauth2AccessToken) return createOAuth2Poster(config);

  throw new Error(
    "Missing X credentials: configure OAuth 1.0a user tokens or OAuth 2.0 access token",
  );
}

function createOAuth1Poster(config) {
  const client = new TwitterApi({
    appKey: config.apiKey,
    appSecret: config.apiSecret,
    accessToken: config.accessToken,
    accessSecret: config.accessSecret,
  });

  return {
    authMode: "oauth1",

    async post(text, options = {}) {
      let mediaId = null;
      let mediaError = null;

      if (config.postImages && options.imageUrl) {
        try {
          const image = await downloadImage(options.imageUrl, config.maxImageBytes);
          if (image) {
            mediaId = await client.v1.uploadMedia(image.buffer, {
              mimeType: image.mimeType,
              target: "tweet",
            });

            if (options.altText) {
              await client.v1.createMediaMetadata(mediaId, {
                alt_text: { text: options.altText.slice(0, 1000) },
              });
            }
          }
        } catch (error) {
          mediaError = error;
          if (config.requireImages) {
            throw new Error(`Image upload is required but failed: ${error.message}`);
          }
          console.warn(`Posting without image: ${error.message}`);
        }
      }

      let response;
      if (mediaId) {
        try {
          response = await client.v2.tweet({
            text,
            media: {
              media_ids: [String(mediaId)],
            },
          });
        } catch (error) {
          if (config.requireImages) throw error;
          mediaError = error;
          console.warn(`Posting without image after media tweet failed: ${error.message}`);
          response = await client.v2.tweet(text);
          mediaId = null;
        }
      } else {
        response = await client.v2.tweet(text);
      }

      return {
        data: {
          id: response.data ? response.data.id : response.id_str || String(response.id),
        },
        mediaUploaded: Boolean(mediaId),
        mediaError,
      };
    },
  };
}

function createOAuth2Poster(config) {
  let accessToken = config.oauth2AccessToken;
  let refreshToken = config.oauth2RefreshToken;
  let client = new TwitterApi(accessToken);
  const mediaClient =
    config.apiKey && config.apiSecret && config.accessToken && config.accessSecret
      ? new TwitterApi({
          appKey: config.apiKey,
          appSecret: config.apiSecret,
          accessToken: config.accessToken,
          accessSecret: config.accessSecret,
        })
      : null;

  const refreshClient = config.oauth2ClientId
    ? new TwitterApi({
        clientId: config.oauth2ClientId,
        clientSecret: config.oauth2ClientSecret || undefined,
      })
    : null;

  async function refreshAccessToken() {
    if (!refreshClient || !refreshToken) {
      throw new Error("OAuth 2 access token expired and no refresh token is configured");
    }
    if (!config.oauth2ClientSecret) {
      throw new Error(
        "OAuth 2 access token expired and X_OAUTH2_CLIENT_SECRET is missing; refresh requires the OAuth 2 client secret",
      );
    }

    const result = await refreshClient.refreshOAuth2Token(refreshToken);
    accessToken = result.accessToken;
    refreshToken = result.refreshToken || refreshToken;
    client = result.client || new TwitterApi(accessToken);
    persistOAuth2Tokens(config, {
      accessToken,
      refreshToken,
    });
  }

  async function withRefresh(action) {
    try {
      return await action(client);
    } catch (error) {
      if (!shouldRefreshOAuth2(error)) throw error;
      await refreshAccessToken();
      return action(client);
    }
  }

  async function uploadMedia(options) {
    if (!config.postImages || !options.imageUrl) return null;

    const image = await downloadImage(options.imageUrl, config.maxImageBytes);
    if (!image) return null;

    if (mediaClient) {
      const mediaId = await mediaClient.v1.uploadMedia(image.buffer, {
        mimeType: image.mimeType,
        target: "tweet",
      });

      if (options.altText) {
        await mediaClient.v1.createMediaMetadata(mediaId, {
          alt_text: { text: options.altText.slice(0, 1000) },
        });
      }

      return mediaId;
    }

    const mediaId = await withRefresh((activeClient) =>
      activeClient.v2.uploadMedia(image.buffer, {
        media_type: image.mimeType,
        media_category: "tweet_image",
      }),
    );

    if (options.altText) {
      await withRefresh((activeClient) =>
        activeClient.v2.createMediaMetadata(mediaId, {
          alt_text: { text: options.altText.slice(0, 1000) },
        }),
      );
    }

    return mediaId;
  }

  async function createTweet(text, mediaId = null) {
    if (!mediaId) {
      return withRefresh((activeClient) => activeClient.v2.tweet(text));
    }

    return withRefresh((activeClient) =>
      activeClient.v2.tweet({
        text,
        media: {
          media_ids: [String(mediaId)],
        },
      }),
    );
  }

  return {
    authMode: "oauth2",

    async post(text, options = {}) {
      let mediaId = null;
      let mediaError = null;

      if (config.postImages && options.imageUrl) {
        try {
          mediaId = await uploadMedia(options);
        } catch (error) {
          mediaError = error;
          if (config.requireImages) {
            throw new Error(`Image upload is required but failed: ${error.message}`);
          }
          console.warn(`Posting without image: ${error.message}`);
        }
      }

      let response;
      if (mediaId) {
        try {
          response = await createTweet(text, mediaId);
        } catch (error) {
          if (config.requireImages) throw error;
          mediaError = error;
          console.warn(`Posting without image after media tweet failed: ${error.message}`);
          response = await createTweet(text);
          mediaId = null;
        }
      } else {
        response = await createTweet(text);
      }

      return {
        data: {
          id: response.data.id,
        },
        mediaUploaded: Boolean(mediaId),
        mediaError,
      };
    },
  };
}

module.exports = {
  createXPoster,
  downloadImage,
  normalizeImageUrl,
  persistOAuth2Tokens,
};
