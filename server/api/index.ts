// Vercel serverless entry point.
// Vercel invokes this file as a Node.js function; it exports the Express app
// as the default handler. `app.listen()` is NOT called here — Vercel manages
// the HTTP server lifecycle.
import app from '../src/app.js'

export default app
