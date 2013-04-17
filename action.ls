fs = require \fs
console = require \console
_ = require \underscore

db =
  user: {}
  metadata: {}
  channel: {}
  active: {}

io = null

exports.register = (app) ->
  io := app.io

  app.get '/', (req, res) ->
    if req.session.auth is true
      res.render 'index', do
        title: '频道列表'
        session: req.session
        channel: db.channel
        active: db.active
    else
      res.redirect '/login'
  
  app.get '/login', (req, res) ->
    res.render 'login', title: '登录'

  app.post '/login', (req, res) ->
    username = req.body.username
    password = req.body.password
    if (username of db.user) and (db.user[username] == password)
      req.session.auth = true
      req.session.admin = username == 'admin'
      req.session.username = username
      res.redirect '/'
      return

    checkMysqlPassword username, password, (result) ->
      if result
        req.session.auth = true
        req.session.admin = false
        req.session.username = username
      res.redirect '/'

  app.get '/logout', (req, res) ->
    req.session = null
    res.redirect '/'

  app.get '/configure/:name', configureChannel
  app.post '/configure/:name', configureChannel
  app.get '/add', addChannel
  app.post '/add', addChannel
  app.get '/delete/:name', deleteChannel
  app.post '/delete/:name', deleteChannel

  app.get '/chat/:name', chat
  app.get '/logs/:name', logs
  
  loadDatabase <[metadata user]>
  loadChannels!

showMessage = (req, res, message) ->
  res.render 'message', do
    title: '消息提示'
    message: message
    session: req.session

updateLog = (name, socket, source, target, message) ->
  log = [Date.now(), source, target, message]
  socket.emit 'echo', [log]
  socket.broadcast.emit 'echo', [log]
  active = activeChannel name
  active.logs.push log
  fs.appendFile "#__dirname/db/channel/#name/logs.txt", (log.join '\t')+'\n', (err) ->
    if err then console.log err
    
checkChannelName = (req, res, name) ->
  if name == '' || /^[A-Za-z0-9\.\-\_]$/.test name
    showMessage req, res, '频道名不能为空，且只能使用a-z、0-9和符号_、-、.'
    return false
  return true

updateChannelMember = (channel, members) ->
  members = members.trim!.split ','
  member = {}
  for m in members
    m = m.trim!
    if m of channel.member
      member[m] = channel.member[m]
    else
      member[m] = 
        nickname: m
        color: '#000000'
  channel.member = member

updateActiveMember = (name, socket, username, join) ->
  active = activeChannel name
  if join
    if username not of active.member
      active.member[username] = 0
      socket.emit 'enter', username
      socket.broadcast.emit 'enter', username
    ++active.member[username]
  else
    if username of active.member
      --active.member[username]
      if active.member[username] == 0
        socket.broadcast.emit 'leave', username
        delete active.member[username]
  active.online = _ active.member .size!

activeChannel = (name) ->
  if name not of db.channel
    return null

  if name of db.active
    return db.active[name]

  channel = db.channel[name]

  active =
    online: 0
    member: {}
    chat: io.of "/chat/#name"
    logs: []
  
  db.active[name] = active

  active.chat.on 'connection', (socket) ->
    username = socket.handshake.session.username
    updateActiveMember name, socket, username, true
    if active.logs.length > 0
      socket.emit 'echo', active.logs
    
    socket.on 'disconnect', ->
      updateActiveMember name, socket, username, false
      if active.online == 0
        active.logs = []

    socket.on 'recolor', (data) ->
      username = data.username
      color = data.color
      channel.member[username].color = color
      saveChannel name
      socket.emit 'recolor', data
      socket.broadcast.emit 'recolor', data

    socket.on 'rename', (data) ->
      username = data.username
      nickname = data.nickname
      oldNickname = channel.member[username].nickname
      channel.member[username].nickname = nickname
      saveChannel name
      socket.emit 'rename', data
      socket.broadcast.emit 'rename', data

    socket.on 'broadcast', (data) ->
      updateLog name, socket, data.source, data.target, data.message
  
  active

chat = (req, res) ->
  if not req.session.auth
    res.redirect '/login'
    return

  username = req.session.username
  
  name = req.params.name
  if name not of db.channel
    showMessage req, res, '无此频道'
    return
  
  channel = db.channel[name]
  active = activeChannel name


  res.render 'chat', do
    title: channel.fullName
    name: name
    session: req.session
    channel: channel
    activeMember: active.member

logs = (req, res) ->
  if not req.session.auth
    res.redirect '/login'
    return
  
  name = req.params.name
  if name not of db.channel
    showMessage req, res, '无此频道'
    return
  
  channel = db.channel[name]
  
  if req.param('raw') == 'true'
    fs.readFile "#__dirname/db/channel/#name/logs.txt", (err, data) ->
      res.send(data)
  else
      res.render 'logs', do
        title: channel.fullName
        channel: channel
        session: req.session
        name: name

configureChannel = (req, res) ->
  if not req.session.auth
    res.redirect '/login'
    return

  username = req.session.username
  
  name = req.params.name
  if name not of db.channel
    showMessage req, res, '无此频道'
    return
  
  channel = db.channel[name]

  if !req.session.admin and channel.master != username
    showMessage req, res, '你无权配置此频道'

  if req.route.method == 'get'
    res.render 'configureChannel', do
      title: '配置频道'
      isNew: false
      session: req.session
      name: name
      channel: channel
      members: _ channel.member .keys! .join ','
  else if req.route.method == 'post'
    if !checkChannelName(req, res, req.body.name)
      return
    updateChannelMember channel, req.body.members
    channel.fullName = req.body.fullName
    channel.announcement = req.body.announcement
    channel.master = req.body.master
    channel.lastActiveDate = Date.now!.valueOf!
    if req.body.name != name
      db.channel[req.body.name] = channel
      delete db.channel[name]
      fs.renameSync "#__dirname/db/channel/#name", "#__dirname/db/channel/#{req.body.name}"
    saveChannel req.body.name, -> res.redirect('/')

addChannel = (req, res) ->
  if not req.session.auth
    res.redirect '/login'
    return

  username = req.session.username
  
  if !req.session.admin
    showMessage req, res, '你无权新建频道'

  channel = 
    fullName: ''
    announcement: ''
    master: username
    member: {}
    lastActiveDate: Date.now!.valueOf!

  channel.member[username] = 
    nickname: username
    color: '#000000'

  if req.route.method == 'get'
    res.render 'configureChannel', do
      title: '新建频道'
      isNew: true
      session: req.session
      name: ''
      channel: channel
      members: username
  else if req.route.method == 'post'
    name = req.body.name
    if !checkChannelName(req, res, req.body.name)
      return

    if fs.existsSync("#__dirname/db/channel/#name") || fs.existsSync("#__dirname/db/archives/#name")
      showMessage req, res, '该频道名已被占用'
      return false
    
    updateChannelMember channel, req.body.members
    channel.fullName = req.body.fullName
    channel.announcement = req.body.announcement
    channel.master = req.body.master
    db.channel[req.body.name] = channel
    fs.mkdirSync "#__dirname/db/channel/#{req.body.name}"
    saveChannel req.body.name, -> res.redirect '/'

deleteChannel = (req, res) ->
  if not req.session.auth
    res.redirect '/login'
    return

  username = req.session.username
  
  name = req.params.name
  if name not of db.channel
    showMessage req, res, '无此频道'
    return
  
  channel = db.channel[name]

  if !req.session.admin and channel.master != username
    showMessage req, res, '你无权删除此频道'

  if req.route.method == 'get'
    res.render 'deleteChannel', do
      title: '删除频道'
      session: req.session
      name: name
      channel: channel
  else if req.route.method == 'post'
    delete db.channel[name]
    if name of db.active
      delete db.active[name]
    fs.rename "#__dirname/db/channel/#name", "#__dirname/db/archives/#name"
    res.redirect '/'


crypto = require \crypto
md5 = (s) -> crypto.createHash 'md5' .update(s) .digest 'hex'

mysql = require \mysql
iconv = require \iconv-lite
checkMysqlPassword = (username, password, callback) ->
  usernameBuffer = iconv.encode username, 'GBK'
  conn = mysql.createConnection db.metadata.mysql
  conn.connect (err) ->
    if err
      console.log err
      callback false
    else
      (err, rows) <- conn.query "SELECT salt, password from #{db.metadata.usertable} where username = ?", usernameBuffer
      conn.end!
      if rows and rows.length > 0
        passwordHash = md5 (md5 password)+rows[0].salt
        if passwordHash == rows[0].password
          callback true
          return
      callback false

loadChannels = !(callback = ->) ->
  db.channel = {}
  for name in fs.readdirSync "#__dirname/db/channel"
    loadChannel name
  callback!

loadChannel = (name, callback = ->) ->
  fs.readFile "#__dirname/db/channel/#name/metadata.json", (err, data) ->
    if !err
      db.channel[name] = JSON.parse data
      console.log "Load channel #name done."
    callback!

saveChannel = (name, callback = ->) ->
  if name not of db.channel
    console.log "No such channel to save: #name"
    return
 
  fs.writeFile "#__dirname/db/channel/#name/metadata.json", \
               (JSON.stringify db.channel[name], null, '  '), \
               (err)->
    if err
      console.log err
      console.log "Save channel #name failed."
    else
      console.log "Save channel #name done."
    callback!

loadDatabase = (fields, callback = ->) ->
  load = (field) ->
    fs.readFile "#__dirname/db/#field.json", (err, data) ->
      if err
        console.log "Load db/#field.json failed."
      else
        db[field] = JSON.parse(data)
        console.log "Load db/#field.json done."

  for field in fields
    load field
  callback!
