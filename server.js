const express = require('express')
const http = require('http')
const socketIo = require('socket.io')
const cors = require('cors')

const path = require('path')
const dotenv = require('dotenv').config({ path: './.env' })

const mysql = require('mysql2')

// Configuração de conexão com o banco de dados
const dbConfig = {
  host: 'db-mysql-nyc3-66943-do-user-2678382-0.c.db.ondigitalocean.com',
  user: 'doadmin',
  password: 'AVNS_niL2B31NkB22jCnOOZE',
  database: 'defaultdb',
  port: '25060'
}

// Cria a conexão com o banco de dados
const db = mysql.createConnection(dbConfig)

// Cria a tabela 'messages' no banco de dados (se ela não existir)
db.query(`
  CREATE TABLE IF NOT EXISTS users (
    id INT NOT NULL AUTO_INCREMENT,
    userid VARCHAR(255) NOT NULL,
    username VARCHAR(255) NOT NULL,
    avatar VARCHAR(255) NULL,
    admin TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
  )
`)

// Cria a tabela 'messages' no banco de dados (se ela não existir)
db.query(`
  CREATE TABLE IF NOT EXISTS messages (
    id INT NOT NULL AUTO_INCREMENT,
    userid VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
  )
`)

const app = express()

app.use(
  cors({
    origin: '*'
  })
)

const server = http.createServer(app)
const io = socketIo(server, {
  cors: {
    origin: '*'
  }
})

async function getLastMessages() {
  return new Promise((resolve, reject) => {
    db.query(
      'SELECT * FROM (SELECT messages.id, users.userid, users.username, users.avatar, users.admin, messages.message FROM messages LEFT JOIN users ON users.userid = messages.userid ORDER BY messages.id DESC LIMIT 50) AS tab ORDER BY 1 ASC',
      (err, results) => {
        if (err) {
          reject(err)
          return
        }
        return resolve(results)
      }
    )
  })
}

async function getUser(userid) {
  return new Promise((resolve, reject) => {
    db.query(
      'SELECT * FROM users WHERE userid = ?',
      [userid],
      (err, results) => {
        if (err) {
          reject(err)
          return
        }
        resolve(results)
      }
    )
  })
}

async function insertUser(userid, username, admin, avatar) {
  return new Promise((resolve, reject) => {
    db.query(
      'INSERT INTO users (userid, username, admin, avatar) VALUES (?, ?, ?, ?)',
      [userid, username, admin, avatar],
      (err, results) => {
        if (err) {
          reject(err)
          return
        }
        resolve(results)
      }
    )
  })
}

async function updateUser(userid, username, admin, avatar) {
  return new Promise((resolve, reject) => {
    db.query(
      'UPDATE users SET username = ?, admin = ?, avatar = ? WHERE userid = ?',
      [username, admin, avatar, userid],
      (err, results) => {
        if (err) {
          reject(err)
          return
        }
        resolve(results)
      }
    )
  })
}

async function insertMessage(userid, message) {
  return new Promise((resolve, reject) => {
    db.query(
      'INSERT INTO messages (userid, message) VALUES (?, ?)',
      [userid, message],
      (error, results) => {
        if (error) {
          reject(error)
          return
        }
        return resolve(results)
      }
    )
  })
}

io.on('connection', socket => {
  console.log('server v2.0.0')
  console.log('New user connected', socket.id)

  // Busca as últimas mensagens do banco de dados
  socket.on('loadMessages', async () => {
    try {
      const lasts = await getLastMessages()
      socket.emit('messagesLoaded', lasts)
    } catch (err) {
      console.error(err)
    }
  })

  // Quando o cliente envia uma mensagem
  socket.on('sendMessage', async message => {
    try {
      const existingUser = await getUser(message.userid)
      if (existingUser.length === 0) {
        await insertUser(
          message.userid,
          message.username,
          message.admin,
          message.avatar
        )
      } else {
        if (
          existingUser[0].username !== message.username ||
          existingUser[0].avatar !== message.avatar ||
          existingUser[0].admin !== message.admin
        ) {
          await updateUser(
            message.userid,
            message.username,
            message.admin,
            message.avatar
          )
        }
      }

      const msg = await insertMessage(message.userid, message.message)
      io.emit('message', {
        id: msg.insertId,
        userid: message.userid,
        username: message.username,
        message: message.message,
        admin: message.admin,
        avatar: message.avatar
      })
    } catch (err) {
      console.error(err)
    }
  })

  // Delete message
  socket.on('deleteMessage', async message => {
    try {
      db.query(
        'DELETE FROM messages WHERE id = ?',
        [message.id],
        (error, results) => {
          if (error) {
            console.log(error)
            return
          }
          io.emit('messageDeleted', {
            id: message.id
          })
        }
      )
    } catch (err) {
      console.error(err)
    }
  })

  socket.on('disconnect', () => {
    console.log('User disconnected', socket.id)
  })
})

const PORT = process.env.PORT

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})
