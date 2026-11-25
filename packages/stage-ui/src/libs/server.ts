/**
 * PRIVACY: this fork has no AIRI cloud account or server. Every cloud feature (sign-in, chat sync, card sync, voice
 * packs, display models, Official Provider) builds its URLs from this constant, so it points at a closed port on this
 * PC (port 9 is the "discard" port, which nothing listens on). A call fails at once and nothing leaves the computer.
 * `VITE_SERVER_URL` is ignored on purpose.
 */
export const SERVER_URL = 'http://127.0.0.1:9'

/** PRIVACY: the AIRI Cloud origin (inbox and cloud fetches), blocked the same way. `VITE_CLOUD_URL` is ignored. */
export const CLOUD_URL = SERVER_URL
