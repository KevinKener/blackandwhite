import express from 'express'
import cors from 'cors'
import ordersRouter from './routes/orders.js'
import customersRouter from './routes/customers.js'
import analyticsRouter from './routes/analytics.js'

const app = express()
const PORT = process.env.PORT ?? 3000

app.use(cors({ origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173' }))
app.use(express.json())

app.get('/health', (_req, res) => res.json({ ok: true }))

app.use('/orders', ordersRouter)
app.use('/customers', customersRouter)
app.use('/analytics', analyticsRouter)

app.listen(PORT, () => {
  console.log(`server running on port ${PORT}`)
})

export default app
