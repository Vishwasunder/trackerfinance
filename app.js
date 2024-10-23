const express = require('express')
const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const path = require('path')
const app = express()
app.use(express.json())

let db = null

const dbPath = path.join(__dirname, 'personaltransactions.db')

const initialiseDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    })
    app.listen(3000, () => {
      console.log('server is running at http://localhost:3000')
    })
  } catch (e) {
    console.log(`DB Error: ${e.message}`)
    process.exit(1)
  }
}
initialiseDBAndServer()

//authenticate TOken Function
const authenticateToken = (request, response, next) => {
  let jwtToken
  const authHeader = request.headers['authorization']
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(' ')[1]
  }
  if (jwtToken === undefined) {
    response.status(401)
    response.send('Invalid JWT Token')
  } else {
    jwt.verify(jwtToken, 'secretkey123', async (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        request.username = payload.username
        next()
      }
    })
  }
}

app.post('/users/', async (request, response) => {
  const {username, password} = request.body
  const hashedPassword = await bcrypt.hash(request.body.password, 10)
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`
  const dbUser = await db.get(selectUserQuery)
  if (dbUser === undefined) {
    const createUserQuery = `
      INSERT INTO 
        user (username, password) 
      VALUES 
        (
          '${username}', 
          '${hashedPassword}'
        )`
    const dbResponse = await db.run(createUserQuery)
    const newUserId = dbResponse.lastID
    response.send(`Created new user with ${newUserId}`)
  } else {
    response.status = 400
    response.send('User already exists')
  }
})

app.post('/login/', async (request, response) => {
  const {username, password} = request.body
  const selectUser = `
    SELECT * FROM user WHERE username = '${username}';`
  const dbUser = await db.get(selectUser)
  if (dbUser === undefined) {
    response.status(400)
    response.send('Invalid user')
  } else {
    const isPwCorrect = await bcrypt.compare(password, dbUser.password)
    if (isPwCorrect === true) {
      const payload = {username: username}
      const jwtToken = jwt.sign(payload, 'secretkey123')
      // console.log(payload)
      response.send({jwtToken})
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  }
})

//Adds a new transaction

app.post('/transactions/', authenticateToken, async (request, response) => {
  const {type, category, amount, date, description, user_id} = request.body
  const addtransQuery = `
    INSERT INTO transactions (type, category, date, description, amount, user_id)
    VALUES
      ('${type}',
      '${category}',
      '${date}',
      '${description}',
      ${amount},
      ${user_id});`
  await db.run(addtransQuery)
  response.send('transaction Successfully Added')
})

// Retrieves all transactions.
app.get('/transactions/', authenticateToken, async (request, response) => {
  const gettransQuery = `
    SELECT
      *
    FROM
      transactions
    ;`
  const transArray = await db.all(gettransQuery)
  // console.log(transArray)
  response.send(transArray)
})

//Retrieves a transaction by ID.
app.get(
  '/transactions/:transactionId/',
  authenticateToken,
  async (request, response) => {
    const {transactionId} = request.params
    const gettransInfo = `
    SELECT
      *
    FROM
      transactions
    WHERE
      id = ${transactionId};`
    const transdetails = await db.get(gettransInfo)
    response.send(transdetails)
  },
)

//Updates a transaction by ID
app.put(
  '/transactions/:transactionId/',
  authenticateToken,
  async (request, response) => {
    const {transactionId} = request.params
    const {type, category, amount, date, description, user_id} = request.body
    const updatetransInfo = `UPDATE transactions
    SET type = '${type}', category = '${category}', date = '${date}', description = '${description}', amount = ${amount}, user_id = ${user_id}
    WHERE id = ${transactionId};`
    const updateddetails = await db.run(updatetransInfo)
    // console.log("okkk")
    response.send('transaction updated successfully')
  },
)

//Deletes a transaction by ID.

app.delete(
  '/transactions/:transactionId/',
  authenticateToken,
  async (request, response) => {
    const {transactionId} = request.params

    const transDeleteQuery = `
    DELETE FROM
      transactions
    WHERE
      id = ${transactionId};`
    await db.run(transDeleteQuery)
    console.log('deleted')
    response.send('transaction Removed')
  },
)

// summary

app.get('/summary', authenticateToken, async (req, res) => {
  try {
    const sql = `SELECT 
                    (SELECT SUM(amount) FROM transactions WHERE type = 'income') AS total_income,
                    (SELECT SUM(amount) FROM transactions WHERE type = 'expense') AS total_expenses`
    const row = await db.get(sql)

    const balance = (row.total_income || 0) - (row.total_expenses || 0)

    // Respond with the results
    res.json({
      total_income: row.total_income,
      total_expenses: row.total_expenses,
      balance,
    })
  } catch (err) {
    // Handle errors
    res.status(500).json({error: err.message})
  }
})
