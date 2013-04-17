# Requirements

express = require 'express'
http = require 'http'
path = require 'path'
console = require 'console'

port = 3000
secret = 'asdfljhlaksdfjh'

app = express!

# Setup App
app.set 'port', port
app.set 'views', "#__dirname/views"
app.set 'view engine', 'jade'
app.use express.favicon!
app.use express.logger 'dev'
app.use express.cookieParser!
app.use express.cookieSession secret:secret
app.use express.bodyParser!
app.use express.methodOverride!
app.use app.router
app.use require('less-middleware') src: "#__dirname/public"
app.use express.static path.join __dirname, 'public'

# Develop mode
app.use express.errorHandler!

server = http.createServer app
app.io = require 'socket.io' .listen server
app.io.set 'transports', <[websocket htmlfile xhr-polling jsonp-polling flashsocket]>
app.io.set 'authorization', (require './socket-io-session' .cookieSession secret)

action = require './action'
action.register app

server.listen (app.get 'port'), ->
  console.log "Odysseus TRPG System listening on port #{app.get 'port'}"

rl = require 'readline' .createInterface do
  input: process.stdin
  output: process.stdout
.on 'SIGINT', ->
  rl.close!
  process.exit!

