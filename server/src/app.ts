import express from 'express'
import cors from 'cors'
import ordersRouter from './routes/orders.js'
import customersRouter from './routes/customers.js'
import analyticsRouter from './routes/analytics.js'

const corsOrigin = process.env.CORS_ORIGIN
if (!corsOrigin) {
  console.warn('[cors] CORS_ORIGIN not set — defaulting to http://localhost:5173; set it in production or browser requests will be blocked')
}

const app = express()
app.use(cors({ origin: corsOrigin ?? 'http://localhost:5173' }))
app.use(express.json())

app.get('/health', (_req, res) => res.json({ ok: true }))
app.use('/orders', ordersRouter)
app.use('/customers', customersRouter)
app.use('/analytics', analyticsRouter)

export default app
