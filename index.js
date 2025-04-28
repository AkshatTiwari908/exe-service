const express =require('express')
const executionRoute = require('./routes/route.js')



const app = express()
app.use(express.json());



app.use('/execute',executionRoute )



app.get('/', (req, res) => {
  res.send('Execution service is up and running 🚀')
})


const PORT = process.env.PORT || 5001
app.listen(PORT, () => {
  console.log(` Execution Service running on port ${PORT}`)
})
