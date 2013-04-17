(function(){
  var fs, console, _, db, io, showMessage, updateLog, checkChannelName, updateChannelMember, updateActiveMember, activeChannel, chat, logs, configureChannel, addChannel, deleteChannel, crypto, md5, mysql, iconv, checkMysqlPassword, loadChannels, loadChannel, saveChannel, loadDatabase;
  fs = require('fs');
  console = require('console');
  _ = require('underscore');
  db = {
    user: {},
    metadata: {},
    channel: {},
    active: {}
  };
  io = null;
  exports.register = function(app){
    io = app.io;
    app.get('/', function(req, res){
      if (req.session.auth === true) {
        return res.render('index', {
          title: '频道列表',
          session: req.session,
          channel: db.channel,
          active: db.active
        });
      } else {
        return res.redirect('/login');
      }
    });
    app.get('/login', function(req, res){
      return res.render('login', {
        title: '登录'
      });
    });
    app.post('/login', function(req, res){
      var username, password;
      username = req.body.username;
      password = req.body.password;
      if (username in db.user && db.user[username] === password) {
        req.session.auth = true;
        req.session.admin = username === 'admin';
        req.session.username = username;
        res.redirect('/');
        return;
      }
      return checkMysqlPassword(username, password, function(result){
        if (result) {
          req.session.auth = true;
          req.session.admin = false;
          req.session.username = username;
        }
        return res.redirect('/');
      });
    });
    app.get('/logout', function(req, res){
      req.session = null;
      return res.redirect('/');
    });
    app.get('/configure/:name', configureChannel);
    app.post('/configure/:name', configureChannel);
    app.get('/add', addChannel);
    app.post('/add', addChannel);
    app.get('/delete/:name', deleteChannel);
    app.post('/delete/:name', deleteChannel);
    app.get('/chat/:name', chat);
    app.get('/logs/:name', logs);
    loadDatabase(['metadata', 'user']);
    return loadChannels();
  };
  showMessage = function(req, res, message){
    return res.render('message', {
      title: '消息提示',
      message: message,
      session: req.session
    });
  };
  updateLog = function(name, socket, source, target, message){
    var log, active;
    log = [Date.now(), source, target, message];
    socket.emit('echo', [log]);
    socket.broadcast.emit('echo', [log]);
    active = activeChannel(name);
    active.logs.push(log);
    return fs.appendFile(__dirname + "/db/channel/" + name + "/logs.txt", log.join('\t') + '\n', function(err){
      if (err) {
        return console.log(err);
      }
    });
  };
  checkChannelName = function(req, res, name){
    if (name === '' || /^[A-Za-z0-9\.\-\_]$/.test(name)) {
      showMessage(req, res, '频道名不能为空，且只能使用a-z、0-9和符号_、-、.');
      return false;
    }
    return true;
  };
  updateChannelMember = function(channel, members){
    var member, i$, len$, m;
    members = members.trim().split(',');
    member = {};
    for (i$ = 0, len$ = members.length; i$ < len$; ++i$) {
      m = members[i$];
      m = m.trim();
      if (m in channel.member) {
        member[m] = channel.member[m];
      } else {
        member[m] = {
          nickname: m,
          color: '#000000'
        };
      }
    }
    return channel.member = member;
  };
  updateActiveMember = function(name, socket, username, join){
    var active;
    active = activeChannel(name);
    if (join) {
      if (!(username in active.member)) {
        active.member[username] = 0;
        socket.emit('enter', username);
        socket.broadcast.emit('enter', username);
      }
      ++active.member[username];
    } else {
      if (username in active.member) {
        --active.member[username];
        if (active.member[username] === 0) {
          socket.broadcast.emit('leave', username);
          delete active.member[username];
        }
      }
    }
    return active.online = _(active.member).size();
  };
  activeChannel = function(name){
    var channel, active;
    if (!(name in db.channel)) {
      return null;
    }
    if (name in db.active) {
      return db.active[name];
    }
    channel = db.channel[name];
    active = {
      online: 0,
      member: {},
      chat: io.of("/chat/" + name),
      logs: []
    };
    db.active[name] = active;
    active.chat.on('connection', function(socket){
      var username;
      username = socket.handshake.session.username;
      updateActiveMember(name, socket, username, true);
      if (active.logs.length > 0) {
        socket.emit('echo', active.logs);
      }
      socket.on('disconnect', function(){
        updateActiveMember(name, socket, username, false);
        if (active.online === 0) {
          return active.logs = [];
        }
      });
      socket.on('recolor', function(data){
        var username, color;
        username = data.username;
        color = data.color;
        channel.member[username].color = color;
        saveChannel(name);
        socket.emit('recolor', data);
        return socket.broadcast.emit('recolor', data);
      });
      socket.on('rename', function(data){
        var username, nickname, oldNickname;
        username = data.username;
        nickname = data.nickname;
        oldNickname = channel.member[username].nickname;
        channel.member[username].nickname = nickname;
        saveChannel(name);
        socket.emit('rename', data);
        return socket.broadcast.emit('rename', data);
      });
      return socket.on('broadcast', function(data){
        return updateLog(name, socket, data.source, data.target, data.message);
      });
    });
    return active;
  };
  chat = function(req, res){
    var username, name, channel, active;
    if (!req.session.auth) {
      res.redirect('/login');
      return;
    }
    username = req.session.username;
    name = req.params.name;
    if (!(name in db.channel)) {
      showMessage(req, res, '无此频道');
      return;
    }
    channel = db.channel[name];
    active = activeChannel(name);
    return res.render('chat', {
      title: channel.fullName,
      name: name,
      session: req.session,
      channel: channel,
      activeMember: active.member
    });
  };
  logs = function(req, res){
    var name, channel;
    if (!req.session.auth) {
      res.redirect('/login');
      return;
    }
    name = req.params.name;
    if (!(name in db.channel)) {
      showMessage(req, res, '无此频道');
      return;
    }
    channel = db.channel[name];
    if (req.param('raw') === 'true') {
      return fs.readFile(__dirname + "/db/channel/" + name + "/logs.txt", function(err, data){
        return res.send(data);
      });
    } else {
      return res.render('logs', {
        title: channel.fullName,
        channel: channel,
        session: req.session,
        name: name
      });
    }
  };
  configureChannel = function(req, res){
    var username, name, channel;
    if (!req.session.auth) {
      res.redirect('/login');
      return;
    }
    username = req.session.username;
    name = req.params.name;
    if (!(name in db.channel)) {
      showMessage(req, res, '无此频道');
      return;
    }
    channel = db.channel[name];
    if (!req.session.admin && channel.master !== username) {
      showMessage(req, res, '你无权配置此频道');
    }
    if (req.route.method === 'get') {
      return res.render('configureChannel', {
        title: '配置频道',
        isNew: false,
        session: req.session,
        name: name,
        channel: channel,
        members: _(channel.member).keys().join(',')
      });
    } else if (req.route.method === 'post') {
      if (!checkChannelName(req, res, req.body.name)) {
        return;
      }
      updateChannelMember(channel, req.body.members);
      channel.fullName = req.body.fullName;
      channel.announcement = req.body.announcement;
      channel.master = req.body.master;
      channel.lastActiveDate = Date.now().valueOf();
      if (req.body.name !== name) {
        db.channel[req.body.name] = channel;
        delete db.channel[name];
        fs.renameSync(__dirname + "/db/channel/" + name, __dirname + "/db/channel/" + req.body.name);
      }
      return saveChannel(req.body.name, function(){
        return res.redirect('/');
      });
    }
  };
  addChannel = function(req, res){
    var username, channel, name;
    if (!req.session.auth) {
      res.redirect('/login');
      return;
    }
    username = req.session.username;
    if (!req.session.admin) {
      showMessage(req, res, '你无权新建频道');
    }
    channel = {
      fullName: '',
      announcement: '',
      master: username,
      member: {},
      lastActiveDate: Date.now().valueOf()
    };
    channel.member[username] = {
      nickname: username,
      color: '#000000'
    };
    if (req.route.method === 'get') {
      return res.render('configureChannel', {
        title: '新建频道',
        isNew: true,
        session: req.session,
        name: '',
        channel: channel,
        members: username
      });
    } else if (req.route.method === 'post') {
      name = req.body.name;
      if (!checkChannelName(req, res, req.body.name)) {
        return;
      }
      if (fs.existsSync(__dirname + "/db/channel/" + name) || fs.existsSync(__dirname + "/db/archives/" + name)) {
        showMessage(req, res, '该频道名已被占用');
        return false;
      }
      updateChannelMember(channel, req.body.members);
      channel.fullName = req.body.fullName;
      channel.announcement = req.body.announcement;
      channel.master = req.body.master;
      db.channel[req.body.name] = channel;
      fs.mkdirSync(__dirname + "/db/channel/" + req.body.name);
      return saveChannel(req.body.name, function(){
        return res.redirect('/');
      });
    }
  };
  deleteChannel = function(req, res){
    var username, name, channel;
    if (!req.session.auth) {
      res.redirect('/login');
      return;
    }
    username = req.session.username;
    name = req.params.name;
    if (!(name in db.channel)) {
      showMessage(req, res, '无此频道');
      return;
    }
    channel = db.channel[name];
    if (!req.session.admin && channel.master !== username) {
      showMessage(req, res, '你无权删除此频道');
    }
    if (req.route.method === 'get') {
      return res.render('deleteChannel', {
        title: '删除频道',
        session: req.session,
        name: name,
        channel: channel
      });
    } else if (req.route.method === 'post') {
      delete db.channel[name];
      if (name in db.active) {
        delete db.active[name];
      }
      fs.rename(__dirname + "/db/channel/" + name, __dirname + "/db/archives/" + name);
      return res.redirect('/');
    }
  };
  crypto = require('crypto');
  md5 = function(s){
    return crypto.createHash('md5').update(s).digest('hex');
  };
  mysql = require('mysql');
  iconv = require('iconv-lite');
  checkMysqlPassword = function(username, password, callback){
    var usernameBuffer, conn;
    usernameBuffer = iconv.encode(username, 'GBK');
    conn = mysql.createConnection(db.metadata.mysql);
    return conn.connect(function(err){
      if (err) {
        console.log(err);
        return callback(false);
      } else {
        return conn.query("SELECT salt, password from " + db.metadata.usertable + " where username = ?", usernameBuffer, function(err, rows){
          var passwordHash;
          conn.end();
          if (rows && rows.length > 0) {
            passwordHash = md5(md5(password) + rows[0].salt);
            if (passwordHash === rows[0].password) {
              callback(true);
              return;
            }
          }
          return callback(false);
        });
      }
    });
  };
  loadChannels = function(callback){
    var i$, ref$, len$, name;
    callback == null && (callback = function(){});
    db.channel = {};
    for (i$ = 0, len$ = (ref$ = fs.readdirSync(__dirname + "/db/channel")).length; i$ < len$; ++i$) {
      name = ref$[i$];
      loadChannel(name);
    }
    callback();
  };
  loadChannel = function(name, callback){
    callback == null && (callback = function(){});
    return fs.readFile(__dirname + "/db/channel/" + name + "/metadata.json", function(err, data){
      if (!err) {
        db.channel[name] = JSON.parse(data);
        console.log("Load channel " + name + " done.");
      }
      return callback();
    });
  };
  saveChannel = function(name, callback){
    callback == null && (callback = function(){});
    if (!(name in db.channel)) {
      console.log("No such channel to save: " + name);
      return;
    }
    return fs.writeFile(__dirname + "/db/channel/" + name + "/metadata.json", JSON.stringify(db.channel[name], null, '  '), function(err){
      if (err) {
        console.log(err);
        console.log("Save channel " + name + " failed.");
      } else {
        console.log("Save channel " + name + " done.");
      }
      return callback();
    });
  };
  loadDatabase = function(fields, callback){
    var load, i$, len$, field;
    callback == null && (callback = function(){});
    load = function(field){
      return fs.readFile(__dirname + "/db/" + field + ".json", function(err, data){
        if (err) {
          return console.log("Load db/" + field + ".json failed.");
        } else {
          db[field] = JSON.parse(data);
          return console.log("Load db/" + field + ".json done.");
        }
      });
    };
    for (i$ = 0, len$ = fields.length; i$ < len$; ++i$) {
      field = fields[i$];
      load(field);
    }
    return callback();
  };
}).call(this);
