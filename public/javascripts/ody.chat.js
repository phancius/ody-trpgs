var commands = [
  [/^\s*\/help\s*$/, function() {
    systemLog('简明帮助：')
    for (var i = 0; i < commands.length; i++) {
      systemLog(commands[i][2])
    }
  }, '/help                - 打印本帮助'],

  [/^\s*\/who\s*$/, function() {
    var c = _(_(activeMember).keys()).map(function(u) { return nicknameWithUsername(u) })
    systemLog('当前用户为：'+c.join(', '))
  }, '/who                 - 查看当前用户'],

  [/^\s*\/nick\s+(\S+)$/, function(match, sock) {
    sock.emit('rename', {username: username, nickname: match[1]})
    sock.emit('broadcast', {
      source: username, target: '#', 
      message:wrapMessage('改名为 '+match[1], 'action', nicknameWithUsername(username))})
  }, '/nick [新昵称]         - 修改昵称'],
  
  [/^\s*\/color\s+(\S+)$/, function(match, sock) {
    sock.emit('recolor', {username: username, color: match[1]})
    sock.emit('broadcast', {
      source: username, target: '#', 
      message:wrapMessage('将文本颜色修改为 '+match[1], 'action', nicknameWithUsername(username))})
  }, '/color [CSS颜色]       - 修改当前用户文本颜色'],
  
  [/^\s*\/msg\s+(\S+)\s+(\S.+)$/, function(match, sock) {
    sock.emit('broadcast', {source: username, target: match[1],
      message: wrapMessage('悄悄对 ' + nickname(match[1]) + ' 说：'+match[2], 'action')})
  }, '/msg [对方ID] [消息]     - 私聊'],
  
  [/^\s*\/me\s+(\S.+)$/, function(match, sock) {
    sock.emit('broadcast', {source: username, target: '#',
      message: wrapMessage(match[1], 'action')})
  }, '/me [动作]             - 做动作'],
  
  [/^\s*[\/\.][rR]\s+(?:(\d+)\#)?(\d+)[dD](\d+)[khKH](\d+)$/, function(match, sock) {
    match[1] = match[1] > 0 ? match[1] : 1
    match[2] = match[2] > 0 ? match[2] : 1
    match[3] = match[3] > 0 ? match[3] : 6
    match[4] = match[4] > 0 && match[4] <= match[2] ? match[4] : match[2]
    for (var j = 0;  j < match[1]; j++) {
      var s = [], m = ''
      for (var i = 0; i < match[2]; i++) {
        s.push(Math.ceil(Math.random()*match[3]))
      }
      var ss = _(s).sortBy(function(a) { return -a })
      var v = 0
      for (var i = 0; i < match[4]; i++) {
        v += ss[i]
      }
      m = '投掷 '+ match[2] + 'd' + match[3] + 'h' + match[4] + ' = (' + s.join(',') + ') = ' + v 
      sock.emit('broadcast', {source: username, target: '#',
        message: wrapMessage(m, 'action')})
    }
  }, '/r [k]#[x]d[y]k[z]        - 投掷k轮，每轮投x次y面骰，取最高z次相加'],
  
  [/^\s*[\/\.][rR]\s+(\d+)?d(\d+)?((?:[+-\\*]\d+)*)(?:\s+(\S+))?$/, function(match, sock) {
    console.log(match)
    match[1] = match[1] > 0 ? match[1] : 1
    match[2] = match[2] > 0 ? match[2] : 20
    match[3] = match[3] || ''
    var s = [], m = ''
    for (var i = 0; i < match[1]; i++)
      s.push(Math.ceil(Math.random()*match[2]))
    if (match[4])
      m = '进行 '+match[4]+' 鉴定：'
    else
      m = '投掷 '
    s = s.join('+')+match[3]
    m = m + match[1]+'d'+match[2]+match[3]+' = '+s+' = '+eval(s)
    sock.emit('broadcast', {source: username, target: '#',
      message: wrapMessage(m, 'action')})
  }, '/r [x]d[y]+[z] [说明]        - 掷x次y面骰相加，并加上修正z'],
  
  
  [/^\s*(\S.+)$/, function(match, sock) {
    sock.emit('broadcast', {source: username, target: '#',
      message: wrapMessage(match[1])})
  }, '普通文字直接输入']

]

var nickname = function(username) {
  var r = username
  if (username in channel.member) {
    r = channel.member[username].nickname
  }
  return r
}

var nicknameWithUsername = function(username) {
  var r = username
  if (username in channel.member) {
    var nickname = channel.member[username].nickname
    if (nickname !== username)
      r = nickname + ' (' + username + ')'
  }
  return r
}

var systemLog = function(m) {
  $('#logs').appendLog([Date.now(), '#system', '#', wrapMessage(m, null, '系统')], username, channel)
}

var parseInput = function(m, sock) {
  if (m.length === 0) return null
  for (var i = 0; i < commands.length; i++) {
    var match = m.match(commands[i][0])
    if (match) {
      commands[i][1](match, sock)
      return
    }
  }
}

function wrapMessage(message, type, nickname) {
  if (!nickname)
    nickname = channel.member[username].nickname
  if (type === 'action') {
    return '* ' + nickname + ' ' + message
  } else {
    return '  <' + nickname + '> ' + message
  }
}

var memberTemplate = _('<li><a href="#"><i class="icon-user"></i><span><%= u %></span></a></li>').template()

var refreshMemberList = function() {
  var list = $('#member-list')
  list.empty()
  var m = _(_(activeMember).keys()).sortBy(function(a) { return a })
  for (var i = 0; i < m.length; i++) {
    (function() {
      var u = m[i]
      if (!(u in channel.member) || u === username) return
      $(memberTemplate({u: nicknameWithUsername(u)})).click(function() {
        $('#inputText').val('/msg ' + u + ' ').focusEnd()
      }).appendTo(list)
    })()
  }
}

$(function() {

  var socket = io.connect(chatPath)
  socket.on('echo', function(logs) {
    _(logs).each(function(log) { $('#logs').appendLog(log, username, channel) })
  })

  socket.on('recolor', function(data) {
    if (data.username in channel.member) {
      channel.member[data.username].color = data.color
    }
  })

  socket.on('rename', function(data) {
    if (data.username in channel.member) {
      channel.member[data.username].nickname = data.nickname
      refreshMemberList()
    }
  })

  socket.on('enter', function(username) {
    systemLog(nicknameWithUsername(username)+' 进入了本频道。')
    if (!(username in activeMember)) {
      activeMember[username] = 0
    }
    ++activeMember[username]
    refreshMemberList()
  })

  socket.on('leave', function(username) {
    systemLog(nicknameWithUsername(username)+' 离开了本频道。')
    if (!(username in activeMember)) {
      console.log('error')
    }
    --activeMember[username]
    if (activeMember[username] === 0)
      delete activeMember[username]
    refreshMemberList()
  })
  
  $('#inputForm').submit(function(e) {
    return false
  })

  $('#inputText').keypress(function(e) {
    if ( e.which == 13 ) {
      var message = $('#inputText').val()
      parseInput(message, socket)
      $('#inputText').val('')
    }
  })
  
  $('#ody-map-input-btn').click(function(e) {
    var nickname = channel.member[username].nickname
    console.log(nickname)
    var q = $('#ody-map-input-textarea').val().split('\n')
    _(q).each(function(m) {
      socket.emit('broadcast', {source: username, target: '#', message: wrapMessage(m)})
    })
    $('#ody-map-input').modal('hide')
    return false
  })

  refreshMemberList()
  
})

